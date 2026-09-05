import type { NextConfig } from 'next'

// Storage images come from the Supabase project host; derive it from the env var
// so no hostname is hardcoded.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? URL.parse(process.env.NEXT_PUBLIC_SUPABASE_URL)?.hostname
  : undefined

// No `serverActions.bodySizeLimit`. It was raised for the upload action, which posted
// the image itself; the site takes no uploads any more and its one remaining action
// sends a post id, so the framework's 1MB default is generous.
const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: 'https',
            hostname: supabaseHost,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
}

export default nextConfig
