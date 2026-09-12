'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The spring that carries the spice home: stiff, and damped just short of the point
 * where it stops overshooting. A drag that ends in a CSS `transition` glides back like
 * a panel; a thrown chilli should carry past its shelf and come back to it.
 */
const STIFFNESS = 190
const DAMPING = 13

/** Under a pixel and nearly still is the spring arguing with itself, so it stops there */
const AT_REST = 0.4

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

/**
 * The chilli's whole behaviour: where it is, what it does when thrown, and whether it
 * landed over the pot.
 *
 * A hook rather than part of the panel because none of it is about the setting. It is a
 * spring integrated every frame against refs the render may not read, and the panel's own
 * job — a cookie, a question and a picture — has nothing to say about any of it. What
 * crosses the line is one answer: it was let go over the mouth, or it was not.
 */
export function useSpice({
  frozen,
  onDropped,
}: {
  /** Nothing may be dragged while the pot is already spiced, while the question is up, or
   *  while a pot is being swapped. */
  frozen: boolean
  /** Let go over the mouth — the panel asks the question, the spice stays where it is. */
  onDropped: () => void
}) {
  const [held, setHeld] = useState(false)

  /**
   * Where the spice is, as an offset from the shelf it lives on. State because it is
   * drawn, and a ref because the spring integrates it every frame and must never read
   * back a render that has not committed yet.
   */
  const [pos, setPos] = useState({ x: 0, y: 0, tilt: 0 })
  const at = useRef({ x: 0, y: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const frame = useRef<number | null>(null)
  const clock = useRef(0)

  const mouth = useRef<SVGRectElement>(null)
  const spice = useRef<HTMLButtonElement>(null)
  const from = useRef<{ x: number; y: number } | null>(null)

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }

  useEffect(() => stop, [])

  // The tilt is carried in the same state as the position because it is derived from
  // the throw — a value only the pointer and the spring know, and a ref is not something
  // a render may read.
  const move = (x: number, y: number, tilt: number) => {
    at.current = { x, y }
    setPos({ x, y, tilt })
  }

  /**
   * A damped spring toward the shelf, stepped by the frame's own elapsed time rather
   * than a fixed 1/60 — a dropped frame should cost smoothness and never distance. The
   * step is capped at 1/30s so a backgrounded tab does not resume with one enormous
   * integration that flings the chilli off the counter.
   */
  const settle = () => {
    stop()
    clock.current = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - clock.current) / 1000, 1 / 30)
      clock.current = now

      const p = at.current
      const v = velocity.current
      v.x += (-STIFFNESS * p.x - DAMPING * v.x) * dt
      v.y += (-STIFFNESS * p.y - DAMPING * v.y) * dt
      p.x += v.x * dt
      p.y += v.y * dt

      if (Math.hypot(p.x, p.y) < AT_REST && Math.hypot(v.x, v.y) < 8) {
        velocity.current = { x: 0, y: 0 }
        frame.current = null
        move(0, 0, 0)
        return
      }
      // Swinging like something on a string: the further from home, the more it leans
      setPos({ x: p.x, y: p.y, tilt: clamp(p.x * 0.12, 20) })
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }

  /**
   * Back on the shelf at once, with no spring and no memory of the throw — what a cookie
   * being written or a pot being swapped leaves behind. The velocity is cleared *here*
   * rather than by the panel, because a ref a hook constructed is the hook's to modify.
   */
  const rest = () => {
    stop()
    velocity.current = { x: 0, y: 0 }
    setHeld(false)
    move(0, 0, 0)
  }

  /** Let go without an answer — a cancelled pointer, or No. The spring takes it home. */
  const release = () => {
    setHeld(false)
    settle()
  }

  const overMouth = (x: number, y: number) => {
    const box = mouth.current?.getBoundingClientRect()
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  }

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (frozen) return
    stop()
    from.current = { x: event.clientX - at.current.x, y: event.clientY - at.current.y }
    velocity.current = { x: 0, y: 0 }
    clock.current = performance.now()
    event.currentTarget.setPointerCapture(event.pointerId)
    setHeld(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = from.current
    if (!start || !held) return

    const now = performance.now()
    const next = { x: event.clientX - start.x, y: event.clientY - start.y }
    // The throw. Travel over the time it took is the velocity the spring is handed on
    // release, which is what makes a flick and a careful placement land differently.
    const dt = Math.max((now - clock.current) / 1000, 1 / 240)
    velocity.current = { x: (next.x - at.current.x) / dt, y: (next.y - at.current.y) / dt }
    clock.current = now
    move(next.x, next.y, clamp(velocity.current.x * 0.03, 24))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = from.current
    from.current = null
    if (!start || !held) return
    setHeld(false)

    if (overMouth(event.clientX, event.clientY)) {
      // Left hanging where it was dropped, held up by nothing but the question
      onDropped()
      return
    }
    settle()
  }

  return {
    pos,
    held,
    at,
    mouth,
    spice,
    stop,
    move,
    rest,
    release,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
