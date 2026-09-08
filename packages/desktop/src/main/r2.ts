import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { ObjectStore } from '@common/storage'
import { loadConfig, type AppConfig } from './config'

/**
 * Where the images go: one Cloudflare R2 bucket, spoken to over S3.
 *
 * This is the whole implementation of `ObjectStore` — the two-method interface
 * `@common/upload/pipeline` takes rather than building a client of its own. Nothing else
 * implements it, because nothing else writes: the website reads images by URL and has no
 * credential for this bucket at all.
 *
 * R2 is S3-compatible, so the official SDK works against it unchanged given `region:
 * 'auto'` and the account's endpoint. The alternative was signing requests by hand to
 * avoid the dependency, which is a lot of AWS V4 for the two calls below.
 */

let client: S3Client | null = null
let builtFor: AppConfig | null = null

function bucketClient(config: AppConfig): S3Client {
  if (!client || builtFor !== config) {
    client = new S3Client({
      // R2 has one region and calls it this. A real region name is rejected.
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    })
    builtFor = config
  }
  return client
}

/** The bucket, or null if this bundle was built without one. */
export function boardStore(): ObjectStore | null {
  const config = loadConfig()
  if (!config) return null

  const s3 = bucketClient(config)
  return {
    async put(path, bytes, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.r2.bucket,
          Key: path,
          Body: bytes,
          ContentType: contentType,
          // A year, immutable, and it costs nothing to be sure of: the file name is the
          // md5 of the bytes, so a URL that resolves at all resolves to one image for
          // ever. This is the header that lets Cloudflare's own cache sit in front of the
          // bucket and never ask it twice.
          CacheControl: 'public, max-age=31536000, immutable',
        })
      )
    },

    async remove(path) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: path }))
    },
  }
}
