export interface Box {
  top: number
  left: number
  bottom: number
  right: number
}

export interface Size {
  width: number
  height: number
}

export interface PlacementOptions {
  /** Distance between the selection and the popover. */
  gap?: number
  /** Minimum distance from the viewport edges. */
  margin?: number
  prefer?: 'below' | 'above'
  /** Horizontal point to centre on (e.g. the end of the selection); defaults to the anchor's centre. */
  centerX?: number
}

export interface Placement {
  top: number
  left: number
  side: 'above' | 'below'
  /** Height available on the chosen side; the popover scrolls if its content is taller. */
  maxHeight: number
}

const MIN_HEIGHT = 60

/**
 * Position a popover next to an anchor (the selection) without covering it and
 * without leaving the viewport: try the preferred side, flip if it doesn't fit,
 * fall back to whichever side has more room (shrinking via maxHeight), and slide
 * horizontally so the whole box stays on screen near the edges.
 */
export function computePlacement(anchor: Box, size: Size, viewport: Size, options: PlacementOptions = {}): Placement {
  const gap = options.gap ?? 8
  const margin = options.margin ?? 8
  const prefer = options.prefer ?? 'below'

  const spaceBelow = viewport.height - anchor.bottom - gap - margin
  const spaceAbove = anchor.top - gap - margin
  const fits = (side: 'above' | 'below') => size.height <= (side === 'below' ? spaceBelow : spaceAbove)
  const other = prefer === 'below' ? 'above' : 'below'

  let side: 'above' | 'below'
  if (fits(prefer)) side = prefer
  else if (fits(other)) side = other
  else side = spaceBelow >= spaceAbove ? 'below' : 'above'

  const available = side === 'below' ? spaceBelow : spaceAbove
  const maxHeight = Math.max(MIN_HEIGHT, Math.floor(available))
  const height = Math.min(size.height, maxHeight)

  let top = side === 'below' ? anchor.bottom + gap : anchor.top - gap - height
  // Anchor partly off-screen (scrolled, or a huge selection): keep the box inside the viewport.
  top = clamp(top, margin, Math.max(margin, viewport.height - margin - height))

  const width = Math.min(size.width, viewport.width - margin * 2)
  const center = options.centerX ?? (anchor.left + anchor.right) / 2
  const left = clamp(center - width / 2, margin, Math.max(margin, viewport.width - margin - width))

  return { top: Math.round(top), left: Math.round(left), side, maxHeight }
}

/** Position for the small "translate" button shown in icon mode: just past the pointer, kept on screen. */
export function computeIconPosition(point: { x: number; y: number }, size: number, viewport: Size, margin = 8): { top: number; left: number } {
  const offset = 10
  let left = point.x + offset
  let top = point.y + offset
  if (left + size + margin > viewport.width) left = point.x - offset - size
  if (top + size + margin > viewport.height) top = point.y - offset - size
  return {
    left: Math.round(clamp(left, margin, viewport.width - margin - size)),
    top: Math.round(clamp(top, margin, viewport.height - margin - size)),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
