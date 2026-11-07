import type { ArtistImage } from '../../../shared/api'
import { ImageViewer } from './image-viewer'
import { artistImageUrl } from './artist-thumbs'
import { useDrawnBox } from './drawn-box'

/** How tall an example is drawn. One height and a width from the ratio, the way a shelf's
 *  grid lays out — an example is looked at for its composition, and a square crop is the
 *  one thing guaranteed to cut that off. Big enough to judge a style by. */
const ROW_HEIGHT = 256

/** A panorama is cropped to 2:1 rather than given a card as wide as the list. */
const MAX_RATIO = 2

/** One example, drawn from the stored full size (cached on disk by main), loaded lazily so a
 *  long list draws its names at once and fills the pictures in behind them. */
export function ArtistThumb({
  image,
  onOpen,
  onRemove,
}: {
  image: ArtistImage
  onOpen: () => void
  /** Drawn as a ✕ in the corner when given — the editor's, not the list's. */
  onRemove?: () => void
}) {
  const ratio = Math.min(MAX_RATIO, image.width / Math.max(1, image.height))
  const [box, drawn] = useDrawnBox<HTMLButtonElement>()

  return (
    <div className="relative shrink-0" style={{ height: ROW_HEIGHT, width: ROW_HEIGHT * ratio }}>
      <button
        ref={box}
        type="button"
        onClick={onOpen}
        title="View full size"
        className="grid h-full w-full place-items-center overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-hover"
      >
        {drawn && (
          <img
            src={artistImageUrl(image.file_name, image.file_ext, drawn)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove this example"
          aria-label="Remove this example"
          className="absolute right-0 top-0 bg-background/80 px-1 text-xs hover:bg-background"
        >
          <span aria-hidden>✕</span>
        </button>
      )}
    </div>
  )
}

/** One example, full size — the shared viewer, pointed at the artist prefix. */
export function ArtistImageViewer({ image, onClose }: { image: ArtistImage; onClose: () => void }) {
  return (
    <ImageViewer
      src={artistImageUrl(image.file_name, image.file_ext)}
      width={image.width}
      height={image.height}
      label="Example image"
      onClose={onClose}
    />
  )
}
