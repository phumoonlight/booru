import { countCollectionPosts } from '@/lib/data/collections'

// Reads nothing from the request, so without this the build could prerender one count
// and serve it for ever.
export const dynamic = 'force-dynamic'

/**
 * The landing page's image count, `null` while the site is closed. Asked from the browser
 * so the page itself touches no database and can be served static.
 */
export async function GET() {
  return Response.json(await countCollectionPosts())
}
