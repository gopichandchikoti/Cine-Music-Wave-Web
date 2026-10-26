import { useEffect, useState } from 'react'

export type Rgb = { r: number; g: number; b: number }

const SIZE = 24
const cache = new Map<string, Rgb | null>()

/** The colour that stands out most in a picture (saturated and not too dark), for tinting the backdrop of the full-screen player. */
function dominant(image: HTMLImageElement): Rgb | null {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, SIZE, SIZE)
  const { data } = context.getImageData(0, 0, SIZE, SIZE)
  let r = 0,
    g = 0,
    b = 0,
    total = 0
  for (let offset = 0; offset < data.length; offset += 4) {
    const [red, green, blue, alpha] = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]
    if (alpha < 200) continue
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const saturation = max === 0 ? 0 : (max - min) / max
    const weight = 0.15 + saturation * 2 + (max > 40 ? 0.4 : 0)
    r += red * weight
    g += green * weight
    b += blue * weight
    total += weight
  }
  return total > 0 ? { r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total) } : null
}

/** Null until the picture has loaded (or when it cannot be read); the colour is remembered per picture. */
export function useDominantColor(url: string | null): Rgb | null {
  const [found, setFound] = useState<{ url: string; color: Rgb | null } | null>(null)
  useEffect(() => {
    if (!url || cache.has(url)) return
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      let color: Rgb | null = null
      try {
        color = dominant(image)
      } catch {
        /* a picture the page may not read */
      }
      cache.set(url, color)
      if (!cancelled) setFound({ url, color })
    }
    image.onerror = () => {
      cache.set(url, null)
      if (!cancelled) setFound({ url, color: null })
    }
    image.src = url
    return () => {
      cancelled = true
    }
  }, [url])
  if (!url) return null
  return cache.has(url) ? (cache.get(url) ?? null) : found?.url === url ? found.color : null
}
