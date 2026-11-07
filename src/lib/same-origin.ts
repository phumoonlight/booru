/**
 * Whether a POST came from a page on this site. A server action got this check from the
 * framework — Next compares `Origin` with the host before running one — and a route
 * handler gets nothing, so without it any page on the web could count views here or keep
 * dropping a closed board's ten-minute hold with a plain cross-site form.
 *
 * Browsers send `Origin` on every POST, same-origin ones included, so a missing header is
 * refused rather than trusted.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host'))
    ?.split(',')[0]
    .trim()
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
