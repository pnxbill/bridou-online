'use client'

import { useEffect } from 'react'

/**
 * iOS hands a standalone launch a layout viewport that is short by the status
 * bar inset. The web view itself covers the screen — its canvas paints the
 * full height — but the page is laid out in the shorter box, so `100dvh` and
 * anything pinned to `bottom: 0` stop one inset above the bottom edge and the
 * nav bar floats over a strip of bare canvas. Measured on an iPhone 16 Pro:
 * 812pt of layout inside an 874pt screen. iOS only re-measures once you
 * scroll, which is the "it snaps into place if I scroll" part.
 *
 * Two goes at it, cheapest first:
 *
 *  1. WebKit's legacy `height=device-height` viewport descriptor, which pins
 *     the viewport to the screen — where the re-measure lands anyway. Other
 *     engines ignore it, and a browser tab never reaches this code.
 *  2. Failing that, the scroll itself. The page is exactly as tall as the
 *     short viewport, so `scrollTo` has nothing to move until we hand it the
 *     missing strip as scrollable room; then it scrolls, and hands it back.
 *
 * Both are gated on a gap that is real and inset-sized, so a viewport that
 * already fills the screen is left alone, and the retry stops the moment the
 * gap closes (or after three goes, rather than fighting the OS forever).
 */

/** the largest gap a safe-area inset can account for — beyond that it isn't this bug */
const MAX_GAP = 120

/** how much screen the layout viewport is leaving unused */
const screenGap = () => window.screen.height - window.innerHeight

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true

export function StandaloneViewport() {
  useEffect(() => {
    if (!isStandalone()) return

    const root = document.documentElement
    let frame = 0
    let timer = 0
    let attempts = 0

    const nudge = () => {
      const gap = screenGap()
      if (gap <= 0 || gap > MAX_GAP || attempts >= 3) return
      attempts += 1

      const previousMinHeight = root.style.minHeight
      root.style.minHeight = `calc(100% + ${gap + 1}px)`
      window.scrollTo(0, gap + 1)

      // hold the scroll for a beat: it's the scroll settling, not the pixel
      // offset, that makes iOS re-measure
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          window.scrollTo(0, 0)
          root.style.minHeight = previousMinHeight
          timer = window.setTimeout(nudge, 150)
        })
      })
    }

    const correct = () => {
      const gap = screenGap()
      if (gap <= 0 || gap > MAX_GAP) return

      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
      if (meta && !meta.content.includes('height=device-height')) {
        meta.content = `${meta.content}, height=device-height`
      }

      attempts = 0
      // a viewport change is applied asynchronously — let it land before
      // measuring for the scroll fallback, so a working descriptor means the
      // nudge finds no gap and never runs
      frame = requestAnimationFrame(nudge)
    }

    correct()
    // a resumed app gets the short viewport again, and never a first paint
    window.addEventListener('pageshow', correct)

    return () => {
      window.removeEventListener('pageshow', correct)
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [])

  return null
}
