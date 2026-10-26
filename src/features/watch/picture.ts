// How the picture is placed on the screen. The default fits the real picture (black bars removed) as large as it can be without
// cutting anything off. The other modes crop the picture to a cinema ratio, or fill the screen and trim what does not fit.

/** A rectangle as fractions (0 to 1) of the full video frame. */
export type FrameRect = { x: number; y: number; w: number; h: number }
export type Size = { width: number; height: number }
/** Pixels to trim from each side of the video element. Only crop presets use it: what is cut must not show. */
export type Trim = { top: number; right: number; bottom: number; left: number }
export type PictureLayout = { left: number; top: number; width: number; height: number; trim: Trim | null }

export type PictureId =
  | 'auto'
  | 'frame'
  | 'fill'
  | 'crop-1.33'
  | 'crop-1.43'
  | 'crop-1.78'
  | 'crop-1.85'
  | 'crop-1.9'
  | 'crop-2.39'

export type PicturePreset = {
  id: PictureId
  /** For a crop preset, the width-to-height ratio the picture is cut to. */
  ratio: number | null
}

export const PICTURE_PRESETS: readonly PicturePreset[] = [
  { id: 'auto', ratio: null },
  { id: 'frame', ratio: null },
  { id: 'fill', ratio: null },
  { id: 'crop-1.33', ratio: 4 / 3 },
  { id: 'crop-1.78', ratio: 16 / 9 },
  { id: 'crop-1.85', ratio: 1.85 },
  { id: 'crop-1.9', ratio: 1.9 },
  { id: 'crop-2.39', ratio: 2.39 },
  { id: 'crop-1.43', ratio: 1.43 },
]

const FULL: FrameRect = { x: 0, y: 0, w: 1, h: 1 }

export const isPictureId = (value: unknown): value is PictureId => PICTURE_PRESETS.some((preset) => preset.id === value)

/** The next mode in the list, wrapping around: the shortcut for trying each view in turn. */
export const nextPicture = (current: PictureId): PictureId => {
  const index = PICTURE_PRESETS.findIndex((preset) => preset.id === current)
  return PICTURE_PRESETS[(index + 1) % PICTURE_PRESETS.length].id
}

/** The centred part of `base` (in video pixels) that has exactly the requested width-to-height ratio. */
function cropToRatio(base: FrameRect, video: Size, ratio: number): FrameRect {
  const baseWidth = base.w * video.width
  const baseHeight = base.h * video.height
  if (baseWidth / baseHeight > ratio) {
    const width = (baseHeight * ratio) / video.width
    return { x: base.x + (base.w - width) / 2, y: base.y, w: width, h: base.h }
  }
  const height = baseWidth / ratio / video.height
  return { x: base.x, y: base.y + (base.h - height) / 2, w: base.w, h: height }
}

/**
 * Where to put the video element so the chosen part of the picture is centred on the screen. The element is the full frame,
 * scaled and shifted; the screen clips whatever falls outside it. `content` is the picture inside any baked-in black bars.
 */
export function layoutPicture(id: PictureId, screen: Size, video: Size, content: FrameRect | null): PictureLayout {
  if (screen.width <= 0 || screen.height <= 0 || video.width <= 0 || video.height <= 0)
    return { left: 0, top: 0, width: Math.max(screen.width, 0), height: Math.max(screen.height, 0), trim: null }
  const preset = PICTURE_PRESETS.find((candidate) => candidate.id === id) ?? PICTURE_PRESETS[0]
  const picture = content ?? FULL
  const region = id === 'frame' ? FULL : preset.ratio !== null ? cropToRatio(picture, video, preset.ratio) : picture
  const regionWidth = region.w * video.width
  const regionHeight = region.h * video.height
  const fitScale = Math.min(screen.width / regionWidth, screen.height / regionHeight)
  const fillScale = Math.max(screen.width / regionWidth, screen.height / regionHeight)
  const scale = id === 'fill' ? fillScale : fitScale
  const width = video.width * scale
  const height = video.height * scale
  return {
    width,
    height,
    left: screen.width / 2 - (region.x + region.w / 2) * width,
    top: screen.height / 2 - (region.y + region.h / 2) * height,
    // A crop preset hides everything outside its region, so the part of the frame beside it shows as bars rather than picture.
    trim:
      preset.ratio === null
        ? null
        : {
            top: region.y * height,
            right: (1 - region.x - region.w) * width,
            bottom: (1 - region.y - region.h) * height,
            left: region.x * width,
          },
  }
}
