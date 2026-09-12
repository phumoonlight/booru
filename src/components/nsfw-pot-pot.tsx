import type { RefObject } from 'react'

/**
 * The pot itself, and everything in it that says what the setting is: the steam, the
 * water, the foam and the bubbles all read off `on`.
 *
 * The mouth is a rect drawn nowhere and measured in page coordinates — a box inside the
 * picture rather than over it, because the pot is centred and scaled by the panel's width
 * and a percentage could not follow it.
 */
export function Pot({
  on,
  swap,
  mouth,
}: {
  on: boolean
  /** A pot going off the side, or a new one coming down. Transitions are cut while either
   *  is running: a pot that is *being replaced* must not also be seen changing colour. */
  swap: 'out' | 'in' | null
  mouth: RefObject<SVGRectElement | null>
}) {
  const water = on ? '#b32433' : '#2f5d8a'
  const foam = on ? '#e06a72' : '#7fb3dd'
  const inside = 'M46 66 L154 66 L146 128 Q145 134 139 134 L61 134 Q55 134 54 128 Z'

  // The wrapper is what `bottom-7` sizes. An absolutely positioned SVG with no height of
  // its own takes its *intrinsic* one from the viewBox and ignores `bottom` outright —
  // which drew the pot at panel width and pushed all of it but the rim below the counter.
  // Inside a box, `h-full` is unambiguous.
  return (
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
        <rect ref={mouth} x="34" y="46" width="132" height="46" fill="none" pointerEvents="none" />
      </svg>
    </div>
  )
}
