'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NSFW_COOKIE, NSFW_COOKIE_MAX_AGE, NSFW_COOKIE_VALUE } from '@/lib/nsfw'
import { RATING_COLOR } from '@common/search'

/**
 * The one setting the site has, drawn as a pot on the boil.
 *
 * A checkbox states the setting; this states what the setting *does*. The water is the
 * gallery — plain until the spice goes in, red once it has — so the answer is on screen
 * as a picture and not only as a sentence under one. It is still a cookie and still a
 * preference: the drag is the gesture, the confirmation is the decision, and nothing is
 * written until that is answered.
 *
 * The drag is the flourish and never the only way in: the spice is a real `<button>`, so
 * a press — by mouse, by Enter, by a screen reader — asks the same question a drop does.
 * A pointer that never left where it went down is treated as that press.
 *
 * `router.refresh()` after the write is what makes the change visible: the listing is an
 * RSC that read the cookie, so nothing else on screen changes until the server renders
 * again.
 */
/**
 * The spring that carries the spice home: stiff, and damped just short of the point
 * where it stops overshooting. A drag that ends in a CSS `transition` glides back like
 * a panel; a thrown chilli should carry past its shelf and come back to it.
 */
const STIFFNESS = 190
const DAMPING = 13

/** Under a pixel and nearly still is the spring arguing with itself, so it stops there */
const AT_REST = 0.4

/** How long Yes is held. The `pot-heat` ramp in `globals.css` runs for the same time. */
const HOLD_MS = 2000

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

export function NsfwPot({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [asking, setAsking] = useState(false)
  const [swap, setSwap] = useState<'out' | 'in' | null>(null)
  const [held, setHeld] = useState(false)
  const [sinking, setSinking] = useState(false)
  const [info, setInfo] = useState(false)
  const [holding, setHolding] = useState(false)

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

  const hold = useRef<number | null>(null)

  const mouth = useRef<SVGRectElement>(null)
  const spice = useRef<HTMLButtonElement>(null)
  const from = useRef<{ x: number; y: number } | null>(null)

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }

  /**
   * The other half of the confirmation: Yes is held down, not pressed. Pouring a chilli
   * into the pot is the one thing on this page that changes what the site shows, and a
   * button that does it on a stray click is a button you can lean on by accident. Two
   * seconds is long enough that it cannot be one — `HOLD_MS` and the `pot-heat` keyframe
   * are the same two seconds, so the words arriving red is the moment it fires.
   */
  const endHold = () => {
    if (hold.current !== null) clearTimeout(hold.current)
    hold.current = null
    setHolding(false)
  }

  const startHold = () => {
    if (hold.current !== null) return
    setHolding(true)
    hold.current = window.setTimeout(() => {
      hold.current = null
      setHolding(false)
      dropIn()
    }, HOLD_MS)
  }

  useEffect(
    () => () => {
      stop()
      endHold()
    },
    []
  )

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

  const set = (next: boolean) => {
    stop()
    endHold()
    setOn(next)
    setAsking(false)
    setHeld(false)
    setSinking(false)
    velocity.current = { x: 0, y: 0 }
    move(0, 0, 0)
    document.cookie = next
      ? `${NSFW_COOKIE}=${NSFW_COOKIE_VALUE}; path=/; max-age=${NSFW_COOKIE_MAX_AGE}; samesite=lax`
      : `${NSFW_COOKIE}=; path=/; max-age=0; samesite=lax`
    router.refresh()
  }

  /**
   * Yes, asked with the chilli hanging over the pot: it falls the rest of the way in and
   * the water is already turning by the time it lands. The fall is a transition and not
   * the spring — this one has somewhere to be.
   */
  const dropIn = () => {
    stop()
    const box = spice.current?.getBoundingClientRect()
    const target = mouth.current?.getBoundingClientRect()
    if (box && target) {
      move(
        at.current.x + (target.left + target.width / 2 - (box.left + box.width / 2)),
        at.current.y + (target.top + target.height / 2 - (box.top + box.height / 2)),
        0
      )
    }
    setSinking(true)
    window.setTimeout(() => set(true), 360)
  }

  /**
   * A fresh pot. Taking the spice back out is not a thing a kitchen does — what is in the
   * broth is in it — so the spiced one goes off the side and a plain one comes down onto
   * the burner. The cookie is written in the gap between the two, where nothing on
   * screen is claiming to be either.
   */
  const newPot = () => {
    if (swap) return
    setInfo(false)
    setSwap('out')
    window.setTimeout(() => {
      set(false)
      setSwap('in')
      window.setTimeout(() => setSwap(null), 520)
    }, 340)
  }

  const overMouth = (x: number, y: number) => {
    const box = mouth.current?.getBoundingClientRect()
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  }

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (on || asking || swap) return
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
      setAsking(true)
      return
    }
    settle()
  }

  const water = on ? '#b32433' : '#2f5d8a'
  const foam = on ? '#e06a72' : '#7fb3dd'
  const inside = 'M46 66 L154 66 L146 128 Q145 134 139 134 L61 134 Q55 134 54 128 Z'

  return (
    <div className="flex flex-col gap-3">
      {/* The room is drawn in layers that each fill the panel, and the pot in a box of
          its own standing on the counter. One SVG cannot do both: a viewBox wide enough
          to reach the edges of a 640px panel draws the pot at thumbnail size on a phone,
          and one sized for the pot letterboxes the room. So the wall is a CSS tile, the
          counter is a strip, and only the pot keeps an aspect ratio. `bottom-7` below is
          the counter's own `h-7` — the pot stands on it, so the two move together. */}
      <div className="pot-wall relative h-56 select-none overflow-hidden rounded-lg border border-border">
        {/* A shelf of jars on one wall and a rail of pans on the other, pinned to the
            panel's edges rather than to the pot, so a wider panel is a wider room */}
        <svg viewBox="0 0 70 30" className="absolute left-3 top-6 w-[70px]" aria-hidden="true">
          <g fill="#2b3341">
            <rect x="6" y="8" width="13" height="16" rx="2" />
            <rect x="26" y="13" width="11" height="11" rx="2" />
          </g>
          <g fill="#3a4353">
            <rect x="5" y="5" width="15" height="4" rx="1.5" />
            <rect x="25" y="10" width="13" height="4" rx="1.5" />
            <rect x="0" y="24" width="50" height="3" rx="1.5" />
          </g>
        </svg>

        <svg viewBox="0 0 70 30" className="absolute right-3 top-5 w-[70px]" aria-hidden="true">
          <g stroke="#3a4353" strokeWidth="2.5" fill="none" strokeLinecap="round">
            <path d="M8 4 H68" />
            <path d="M24 4 v10" />
            <path d="M46 4 v8" />
          </g>
          <g fill="#2b3341">
            <ellipse cx="24" cy="18" rx="6" ry="4.5" />
            <ellipse cx="46" cy="17" rx="7.5" ry="5.5" />
          </g>
        </svg>

        {/* The counter, full width because a kitchen does not end where the pot does */}
        <div className="absolute inset-x-0 bottom-0 h-7 border-t-2 border-[#39424f] bg-[#232a36]" />

        <div className="absolute inset-x-0 top-0 bottom-7">
          <svg
            viewBox="0 0 200 136"
            preserveAspectRatio="xMidYMax meet"
            className="h-full w-full"
            aria-hidden="true"
          >
            {/* The burner ring, in the pot's own coordinates so it is exactly as wide as
                the base that stands on it */}
            <ellipse cx="100" cy="133" rx="52" ry="3" fill="#171c25" />

            {/* Flames licking past where the base sits — the only moving thing in the
                room, because a pot that is boiling has to be sitting on something */}
            <g className="pot-flame">
              <path d="M54 134 q-9 -6 -4 -14 q4 6 6 2 q3 6 -2 12 Z" fill="#f59e0b" />
              <path
                d="M146 134 q9 -6 4 -14 q-4 6 -6 2 q-3 6 2 12 Z"
                fill="#f59e0b"
                style={{ animationDelay: '0.6s' }}
              />
              <path
                d="M62 135 q-5 -4 -2 -9 q2 4 4 1 q2 4 -1 8 Z"
                fill="#fbbf24"
                style={{ animationDelay: '1.1s' }}
              />
              <path
                d="M138 135 q5 -4 2 -9 q-2 4 -4 1 q-2 4 1 8 Z"
                fill="#fbbf24"
                style={{ animationDelay: '0.3s' }}
              />
            </g>
          </svg>
        </div>

        {/* The wrapper is what `bottom-7` sizes. An absolutely positioned SVG with no
            height of its own takes its *intrinsic* one from the viewBox and ignores
            `bottom` outright — which drew the pot at panel width and pushed all of it
            but the rim below the counter. Inside a box, `h-full` is unambiguous. */}
        <div className={`absolute inset-x-0 top-0 bottom-7${swap ? ` pot-${swap}` : ''}`}>
          <svg
            viewBox="0 0 200 136"
            preserveAspectRatio="xMidYMax meet"
            className="h-full w-full"
            aria-hidden="true"
          >
            <defs>
              {/* The water is a plain rectangle cut to the pot, so its surface can sit
                  anywhere without the pot's shape having to be drawn twice. */}
              <clipPath id="pot-inside">
                <path d={inside} />
              </clipPath>
            </defs>

            <g
              className="pot-steam"
              stroke={on ? '#e0888c' : '#7f8ea3'}
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              style={{ transition: swap ? 'none' : 'stroke 900ms ease' }}
            >
              <path d="M78 48 q7 -11 0 -21 q-7 -10 0 -19" style={{ animationDelay: '0s' }} />
              <path d="M100 44 q7 -11 0 -21 q-7 -10 0 -19" style={{ animationDelay: '0.8s' }} />
              <path d="M122 48 q7 -11 0 -21 q-7 -10 0 -19" style={{ animationDelay: '1.5s' }} />
            </g>

            {/* Handles first, so they read as behind the body rather than stuck on it */}
            <g fill="none" stroke="#454e5f" strokeWidth="7" strokeLinecap="round">
              <path d="M44 76 q-16 8 -3 23" />
              <path d="M156 76 q16 8 3 23" />
            </g>

            <path d={inside} fill="#333c4b" />

            <g clipPath="url(#pot-inside)">
              <rect
                x="40"
                y="80"
                width="120"
                height="60"
                fill={water}
                style={{ transition: swap ? 'none' : 'fill 900ms ease' }}
              />
              <rect
                x="40"
                y="78"
                width="120"
                height="4"
                fill={foam}
                style={{ transition: swap ? 'none' : 'fill 900ms ease' }}
              />
              <g fill={foam} style={{ transition: swap ? 'none' : 'fill 900ms ease' }}>
                <circle className="pot-bubble" cx="72" cy="126" r="3" />
                <circle
                  className="pot-bubble"
                  cx="98"
                  cy="130"
                  r="4"
                  style={{ animationDelay: '0.9s' }}
                />
                <circle
                  className="pot-bubble"
                  cx="122"
                  cy="127"
                  r="3"
                  style={{ animationDelay: '1.6s' }}
                />
                <circle
                  className="pot-bubble"
                  cx="86"
                  cy="132"
                  r="2"
                  style={{ animationDelay: '2.3s' }}
                />
              </g>
            </g>

            {/* The rim last, so the water never laps over it */}
            <rect x="38" y="58" width="124" height="12" rx="6" fill="#59647a" />

            {/* The drop target, drawn nowhere but measured in page coordinates. A rect
                inside the picture rather than a box over it, because the pot is centred
                and scaled by the panel's width and a percentage could not follow it. */}
            <rect
              ref={mouth}
              x="34"
              y="46"
              width="132"
              height="46"
              fill="none"
              pointerEvents="none"
            />
          </svg>
        </div>

        {!on && !swap && (
          <button
            ref={spice}
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              setHeld(false)
              settle()
            }}
            onClick={(event) => {
              // Enter or Space on a focused button, which reports no pointer behind the
              // click. A mouse click is a drag that went nowhere and means nothing here.
              if (event.detail === 0) setAsking(true)
            }}
            aria-label="Add the spice to the pot"
            className="absolute bottom-3 right-4 touch-none px-2 py-1 text-3xl"
            style={{
              // Tilt from where it is being pulled while held, and from how far it is
              // from home while it springs back — a chilli on a string, either way.
              transform: `translate(${pos.x}px, ${pos.y}px) rotate(${pos.tilt}deg) scale(${
                sinking ? 0.35 : held ? 1.15 : 1
              })`,
              transition: sinking
                ? 'transform 360ms cubic-bezier(.5,0,.85,.6), opacity 360ms ease-in'
                : undefined,
              opacity: sinking ? 0 : 1,
              cursor: held ? 'grabbing' : 'grab',
            }}
          >
            {/* The idle rock is on the glyph, not the button, so it cannot fight the
                spring for the same `transform` */}
            <span aria-hidden="true" className={held || sinking ? undefined : 'pot-spice'}>
              🌶️
            </span>
          </button>
        )}

        {asking && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-4 text-center">
            <p className="text-sm">
              Do you want to add{' '}
              <span className={`font-semibold ${RATING_COLOR.r}`}>
                <span aria-hidden="true">🌶️</span> spice
              </span>{' '}
              to the pot?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onPointerDown={startHold}
                onPointerUp={endHold}
                onPointerLeave={endHold}
                onPointerCancel={endHold}
                onKeyDown={(event) => {
                  // A held key repeats; the first press is the one that starts the clock
                  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) startHold()
                }}
                onKeyUp={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') endHold()
                }}
                className={`min-h-11 touch-none rounded-md px-5 text-sm${holding ? ' pot-hold' : ''}`}
              >
                {/* The words heat up as they are held, which is the timer: two seconds
                    with nothing happening is a button that looks broken, and a bar
                    would be a second thing to read while the first one is red. */}
                <span className={holding ? 'pot-heat' : undefined}>Yes, sure!</span>
              </button>
              {/* No wears the accent and sits where a thumb lands: the answer that
                  changes nothing is the one a stray press should find, and the one that
                  changes the board is held down rather than dressed up. */}
              <button
                type="button"
                onClick={() => {
                  setAsking(false)
                  settle()
                }}
                className="min-h-11 rounded-md bg-accent px-5 text-sm font-semibold text-background"
              >
                No
              </button>
            </div>
          </div>
        )}
      </div>

      {/* The line the whole panel exists to say, and the one control that undoes it —
          both under the picture rather than in it, because the scene is the state and a
          button standing in it reads as part of the furniture. The line says nothing
          about ratings itself: the water already did, and what the setting actually
          changes is a press away for anyone who wants it spelled out. A status, so the
          change reaches a reader who cannot see the colour turn. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <p className="flex items-center gap-1.5 text-sm" role="status">
          <span aria-hidden="true" className="text-base">
            {on ? '🌶️' : '🥣'}
          </span>
          {on ? (
            <span className={`font-semibold tracking-wide ${RATING_COLOR.r}`}>
              The broth is{' '}
              <button
                type="button"
                onClick={() => setInfo(!info)}
                aria-expanded={info}
                className="underline decoration-dotted underline-offset-4"
              >
                spiced
              </button>
              .
            </span>
          ) : (
            <span className={`font-semibold tracking-wide ${RATING_COLOR.g}`}>
              The broth is plain.
            </span>
          )}
        </p>

        {on && !asking && (
          <button
            type="button"
            onClick={newPot}
            className="flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <span aria-hidden="true">🍲</span> New pot
          </button>
        )}
      </div>

      {on && info && (
        <p className="rounded-lg border border-[#7a2530] bg-surface p-3 text-xs leading-relaxed text-muted">
          <span className={`font-semibold ${RATING_COLOR.r}`}>R-18</span> posts now appear
          everywhere the site lists posts — the gallery, a search, a tag. The choice is a cookie in
          this browser and nothing else: there is no account to attach it to, so it is a preference
          rather than a check on who you are, and a post has always been reachable by its own URL
          either way.
        </p>
      )}
    </div>
  )
}
