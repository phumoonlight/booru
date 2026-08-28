import type { NextConfig } from 'next'
import { MAX_FILE_SIZE } from './src/lib/upload-limits'

// Storage images come from the Supabase project host; derive it from the env var
// so no hostname is hardcoded.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? URL.parse(process.env.NEXT_PUBLIC_SUPABASE_URL)?.hostname
  : undefined

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Uploads post the image itself to a server action, and the framework rejects
      // an oversized body before the action can turn it into a per-file error. The
      // default is 1MB, which every real image clears. Headroom over MAX_FILE_SIZE
      // covers the multipart boundaries, part headers and the tag/rating/source
      // fields that ride along with the bytes.
      bodySizeLimit: MAX_FILE_SIZE + 256 * 1024,
    },
  },
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
