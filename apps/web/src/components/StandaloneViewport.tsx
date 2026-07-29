'use client'

import { useEffect } from 'react'

/**
 * iOS hands a standalone launch a layout viewport that is short by the status
 * bar inset. The web view itself covers the screen — its canvas paints the
 * full height — but the page is laid out in the shorter box, so `100dvh` and
 * anything pinned to `bottom: 0` stop one inset above the bottom edge and the
 * bar floats over a strip of bare canvas. Scrolling is what makes iOS
 * re-measure, which is the "it snaps into place once I scroll" part.
 *
 * WebKit's legacy `height=device-height` viewport descriptor pins the viewport
 * to the screen, which is where the re-measure lands anyway. It's applied only
 * when the gap is real and inset-sized (never on a viewport that already fills
 * the screen, never on a gap big enough to be something else), and never
 * removed — taking it back off would restore the short viewport and oscillate.
 * Engines other than WebKit ignore the descriptor, and a browser tab never
 * gets here at all.
 */
export function StandaloneViewport() {
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!standalone) return

    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!meta || meta.content.includes('height=device-height')) return

    // portrait only, and only the sliver an inset can account for
    const gap = window.screen.height - window.innerHeight
    if (gap <= 0 || gap > 120) return

    meta.content = `${meta.content}, height=device-height`
  }, [])

  return null
}
