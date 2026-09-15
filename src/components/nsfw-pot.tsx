'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NSFW_COOKIE, NSFW_COOKIE_MAX_AGE, NSFW_COOKIE_VALUE } from '@/lib/nsfw'
import { RATING_COLOR } from '@common/search'
import { useSpice } from './nsfw-pot-spice'
import { Kitchen } from './nsfw-pot-kitchen'
import { Pot } from './nsfw-pot-pot'

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
/** How long Yes is held. The `pot-heat` ramp in `globals.css` runs for the same time. */
const HOLD_MS = 2000

export function NsfwPot({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [asking, setAsking] = useState(false)
  const [swap, setSwap] = useState<'out' | 'in' | null>(null)
  const [sinking, setSinking] = useState(false)
  const [info, setInfo] = useState(false)
  const [holding, setHolding] = useState(false)
  const hold = useRef<number | null>(null)

  const {
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
  } = useSpice({
    frozen: on || asking || swap !== null,
    onDropped: () => setAsking(true),
  })

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

  // The spring is the hook's to cancel; this timer is the panel's, and a pending one would
  // fire `dropIn` into a component that is no longer on screen.
  useEffect(() => endHold, [])

  const startHold = () => {
    if (hold.current !== null) return
    setHolding(true)
    hold.current = window.setTimeout(() => {
      hold.current = null
      setHolding(false)
      dropIn()
    }, HOLD_MS)
  }

  const set = (next: boolean) => {
    endHold()
    setOn(next)
    setAsking(false)
    setSinking(false)
    rest()
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

  return (
    <div className="flex flex-col gap-3">
      {/* The room is drawn in layers that each fill the panel, and the pot in a box of
          its own standing on the counter. One SVG cannot do both: a viewBox wide enough
          to reach the edges of a 640px panel draws the pot at thumbnail size on a phone,
          and one sized for the pot letterboxes the room. So the wall is a CSS tile, the
          counter is a strip, and only the pot keeps an aspect ratio. `bottom-7` below is
          the counter's own `h-7` — the pot stands on it, so the two move together. */}
      <div className="pot-wall relative h-56 select-none overflow-hidden rounded-lg border border-border">
        <Kitchen />
        <Pot on={on} swap={swap} mouth={mouth} />

        {!on && !swap && (
          <button
            ref={spice}
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={release}
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
                  release()
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
          <span className={`font-semibold ${RATING_COLOR.r}`}>R-18</span> collections now
          appear everywhere the site lists images. The choice is a cookie in this browser and
          nothing else: there is no account to attach it to, so it is a preference rather than a
          check on who you are.
        </p>
      )}
    </div>
  )
}
