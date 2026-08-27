/**
 * Shared `blurDataURL` for every remote image: a 4×4 PNG of the surface colour.
 * Posts carry no per-image blur hash (nothing in the schema stores one), so a flat
 * placeholder is what keeps the grid from flashing white while thumbs load.
 */
export const BLUR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQI12MQk1KCIwbiOACEtAUhL5JZBwAAAABJRU5ErkJggg=='
