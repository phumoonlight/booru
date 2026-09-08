import type { NextConfig } from 'next'

// No `images.remotePatterns`. It listed the Supabase storage host so the optimizer would
// accept those URLs — but both the grid thumb and the detail image are `unoptimized`, so
// nothing has gone through the optimizer for some time and the allow-list was guarding a
// door nobody uses. Moving to R2 is what made that visible rather than what caused it.
//
// No `serverActions.bodySizeLimit` either. It was raised for the upload action, which
// posted the image itself; the site takes no uploads any more and its one remaining
// action sends a post id, so the framework's 1MB default is generous.
const nextConfig: NextConfig = {}

export default nextConfig
