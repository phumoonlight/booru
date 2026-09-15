import { createInterface } from 'node:readline/promises'
import { CopyObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import postgres from 'postgres'

/**
 * Turns posts into collection posts: the row moves onto a shelf, its tags are dropped and
 * both stored objects move to the collections prefix.
 *
 *   npm run posts:to-collection -- --collection <id> [--board generative] <start> [end]
 *
 * `start` and `end` are post ids, both included; `start` alone is that one post.
 *
 * **One way.** A collection post has nowhere to keep a tag, so the tags are gone once this
 * runs — turning one back is tagging it again from nothing. That is why it lists every post
 * and how many tags each loses, names the board it is connected to, and asks.
 *
 * **A script, not a button in the desktop app**, because it is rare and has no undo: a
 * screen would be a control drawn on every post editor for a job done a handful of times.
 *
 * **Plain `.mjs`, so it cannot import `@common/*`** — that is a tsconfig mapping over
 * TypeScript sources with no build step. The table names and prefixes below mirror
 * `@common/board` and `@common/collections`, and must move with them.
 *
 * It connects as `booru_app`, the desktop's role, rather than `booru_owner`: this is a
 * change to the board's contents, which is what that role is for, and it cannot drop a
 * table on a typo.
 */

const BOARD = {
  post: {
    posts: 'posts',
    postTags: 'post_tags',
    tagCount: 'post_count',
    postPrefix: 'posts',
    thumbPrefix: 'thumbs',
  },
  generative: {
    posts: 'generative_posts',
    postTags: 'generative_post_tags',
    tagCount: 'generative_post_count',
    postPrefix: 'generative/posts',
    thumbPrefix: 'generative/thumbs',
  },
}
const COLLECTION = {
  collections: 'collections',
  posts: 'collection_posts',
  postPrefix: 'collections/posts',
  thumbPrefix: 'collections/thumbs',
}

function readArgs(argv) {
  const args = { board: 'post', collection: null, range: [], yes: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--yes' || arg === '-y') args.yes = true
    else if (arg === '--board') args.board = argv[++i]
    else if (arg === '--collection') args.collection = Number(argv[++i])
    else args.range.push(Number(arg))
  }
  return args
}

const args = readArgs(process.argv.slice(2))
const usage =
  'Usage: npm run posts:to-collection -- --collection <id> [--board post|generative] <start> [end]'
const isId = (n) => Number.isInteger(n) && n > 0
if (!BOARD[args.board]) fail(`--board must be post or generative, not ${args.board}.\n${usage}`)
if (!isId(args.collection)) fail(`--collection <id> is required.\n${usage}`)
if (args.range.length < 1 || args.range.length > 2 || !args.range.every(isId)) {
  fail(`Name a post id, or a range of them as <start> <end>, in whole numbers.\n${usage}`)
}
// One id alone is a range of one.
const [start, end = start] = args.range
if (start > end) fail(`The range runs ${start} to ${end} — start comes first.\n${usage}`)

const env = process.env
const REQUIRED = ['DATABASE_URL_APP', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const missing = [...REQUIRED, 'R2_BUCKET'].filter((key) => !env[key]?.trim())
if (missing.length > 0) fail(`Not set: ${missing.join(', ')}.`)

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** Asks, and answers false for anything but yes — the same bargain `migrate.mjs` makes,
 *  including refusing to read EOF from a pipe as agreement. */
async function confirm(question) {
  if (args.yes) return true
  if (!process.stdin.isTTY) {
    console.error('Not a terminal — re-run with --yes to convert without confirming.')
    return false
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  } finally {
    rl.close()
  }
}

const board = BOARD[args.board]
const bucket = env.R2_BUCKET.trim()
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim(),
  },
})

/**
 * R2 has no rename, so a move is a copy and, later, a delete. The copy keeps the object's
 * `Content-Type` and its year-long `immutable` `Cache-Control` — the default metadata
 * directive is COPY — and copies the stored bytes rather than re-encoding them, which would
 * be a second lossy pass over an image that has already had one.
 */
async function copy(from, to) {
  // URL-encoded per segment, so the slashes between them stay slashes.
  const source = from.split('/').map(encodeURIComponent).join('/')
  await s3.send(
    new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: `${bucket}/${source}` })
  )
}

async function remove(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

/**
 * What will happen, read before anything does: every post in the range, what it loses, and
 * every reason one cannot go.
 *
 * **An id with no post is skipped, not refused** — a range crosses the gaps deleted posts
 * leave, and those are not mistakes. An image already on a shelf does stop the whole run,
 * since converting the rest of a range around it would leave the range half done for a
 * reason worth looking at first.
 */
async function plan(sql) {
  const [shelf] = await sql`
    select id, name from ${sql(COLLECTION.collections)} where id = ${args.collection}`
  if (!shelf) fail(`No collection ${args.collection}.`)

  const rows = await sql`
    select p.id, p.file_name, p.file_ext, c.name as shelved_in,
           (select count(*)::int from ${sql(board.postTags)} pt where pt.post_id = p.id) as tags
      from ${sql(board.posts)} p
      left join ${sql(COLLECTION.posts)} cp on cp.file_name = p.file_name
      left join ${sql(COLLECTION.collections)} c on c.id = cp.collection_id
     where p.id between ${start} and ${end}
     order by p.id`

  if (rows.length === 0) fail(`No ${args.board} posts between ${start} and ${end}.`)

  // `collection_posts.file_name` is unique across every shelf, so the insert would refuse
  // these anyway — this is that refusal with the shelf's name on it.
  const problems = rows
    .filter((row) => row.shelved_in)
    .map((row) => `  ${row.id}: this image is already in ${row.shelved_in}`)
  if (problems.length > 0) fail(`Nothing converted:\n${problems.join('\n')}`)

  return { shelf, posts: rows }
}

/**
 * One post. Objects are copied first, the row moves second, the old objects go last — so
 * whatever fails, no row ever points at nothing. A failed copy stops before the database is
 * touched; a failed transaction leaves copies at the new keys, which are exactly the bytes
 * an upload of that image to a shelf would write there, so they are harmless and a re-run
 * overwrites them with themselves.
 */
async function convert(sql, post) {
  const from = {
    image: `${board.postPrefix}/${post.file_name}.${post.file_ext}`,
    thumb: `${board.thumbPrefix}/${post.file_name}.avif`,
  }
  const to = {
    image: `${COLLECTION.postPrefix}/${post.file_name}.${post.file_ext}`,
    thumb: `${COLLECTION.thumbPrefix}/${post.file_name}.avif`,
  }

  await Promise.all([copy(from.image, to.image), copy(from.thumb, to.thumb)])

  const newId = await sql.begin(async (tx) => {
    // One statement: the links are read, the post deleted (cascading its links) and the
    // collection row inserted from what was deleted. Every part sees the same snapshot, so
    // the links are still there to read — the trick `deletePostRow` relies on — and
    // `view_count` is carried exactly, where a read then an insert would lose a view the
    // website counted in between. `created_at` is kept: when the image arrived is a fact
    // about the image. The new id is still the highest, so it opens its shelf as the cover.
    const [moved] = await tx`
      with links as (select tag_id from ${tx(board.postTags)} where post_id = ${post.id}),
           gone as (delete from ${tx(board.posts)} where id = ${post.id} returning *),
           made as (
             insert into ${tx(COLLECTION.posts)}
               (collection_id, file_name, file_ext, file_size, width, height, rating, source_url,
                view_count, created_at)
             select ${args.collection}, file_name, file_ext, file_size, width, height, rating,
                    source_url, view_count, created_at
               from gone
             returning id)
      select (select id from made) as id, array(select tag_id from links) as tag_ids`
    if (!moved?.id) throw new Error(`Post ${post.id} vanished before it could be moved.`)

    // The recount `syncTagPostCounts` runs, inside the transaction rather than after it:
    // there is no post write here that has already landed and must not be undone by a
    // failed count, so the count may as well be part of the same change.
    if (moved.tag_ids.length > 0) {
      await tx`
        update tags t
           set ${tx(board.tagCount)} =
               (select count(*) from ${tx(board.postTags)} pt where pt.tag_id = t.id)
         where t.id = any(${moved.tag_ids})`
    }
    await tx`
      update ${tx(COLLECTION.collections)} set updated_at = now() where id = ${args.collection}`
    return moved.id
  })

  // The row has moved, so a failure here is two orphaned objects rather than a failed
  // conversion — logged, not thrown, as `removePost` does. Cloudflare's edge may keep
  // serving the old URL for a while regardless: the objects were written `immutable`.
  const leftovers = []
  await Promise.all(
    [from.image, from.thumb].map((key) => remove(key).catch(() => leftovers.push(key)))
  )
  return { newId, leftovers }
}

const sql = postgres(env.DATABASE_URL_APP.trim(), { max: 1 })
try {
  const { shelf, posts } = await plan(sql)

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  console.log(`${plural(posts.length, `${args.board} post`)} → ${shelf.name} (#${shelf.id}):`)
  for (const post of posts) console.log(`  ${post.id}  drops ${plural(post.tags, 'tag')}`)
  // The host and database off the parsed options, never the URL — it carries a password.
  console.log(`  → ${sql.options.database} on ${sql.options.host.join(', ')}`)
  console.log('Tags cannot be put back.')

  if (!(await confirm('Convert?'))) {
    console.log('Nothing converted.')
  } else {
    for (const post of posts) {
      try {
        const { newId, leftovers } = await convert(sql, post)
        console.log(`moved    ${post.id} → collection post ${newId}`)
        for (const key of leftovers) console.error(`         could not delete ${key}`)
      } catch (error) {
        // Stop at the first failure: whatever broke one post is likely to break the next,
        // and the posts already converted are listed above it.
        console.error(`failed   ${post.id}: ${error instanceof Error ? error.message : error}`)
        process.exitCode = 1
        break
      }
    }
    // The desktop app keeps copies of both, and neither knows this ran.
    console.log("Press 🔄 on the desktop app's Browse and Tags screens.")
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await sql.end()
}
