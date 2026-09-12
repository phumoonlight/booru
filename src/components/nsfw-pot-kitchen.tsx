/**
 * The room the pot stands in: a shelf of jars, a rail of pans, the counter, the burner
 * and its flames.
 *
 * None of it reacts to the setting, which is why it is here and not in `Pot` — every
 * piece of this is furniture, drawn once and never told whether the broth is spiced.
 */
export function Kitchen() {
  return (
    <>
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
    </>
  )
}
