'use client'

/**
 * Dev-only viewport probe. iOS is the only place the app's idea of "the
 * viewport" and the screen disagree, and the disagreement is invisible from
 * here — so this page prints every number the layout depends on, live, plus
 * two rails pinned to the very top and bottom of the viewport. If a rail
 * doesn't touch the screen edge, the layout viewport is smaller than the web
 * view and `gap` says by how much.
 *
 * Outside the (main) group on purpose: no header, no nav, nothing between the
 * measurements and the screen edges.
 */
import { useEffect, useState } from 'react'

type Row = { label: string; value: string }

/** reads a length that only CSS can resolve (viewport units, safe-area insets) */
function probe(el: HTMLElement, value: string): number {
  el.style.height = value
  return Math.round(el.getBoundingClientRect().height * 10) / 10
}

function measure(): Row[] {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(el)

  const units = ['100dvh', '100svh', '100lvh', '100vh'].map((u) => `${u} ${probe(el, u)}`)
  const insets = (['top', 'right', 'bottom', 'left'] as const).map(
    (side) => `${side} ${probe(el, `env(safe-area-inset-${side}, 0px)`)}`,
  )

  el.remove()

  const vv = window.visualViewport
  const gap = window.screen.height - window.innerHeight

  return [
    { label: 'gap (screen − inner)', value: `${gap}` },
    { label: 'screen', value: `${window.screen.width} × ${window.screen.height}` },
    { label: 'inner', value: `${window.innerWidth} × ${window.innerHeight}` },
    { label: 'client', value: `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}` },
    { label: 'document height', value: `${document.documentElement.scrollHeight}` },
    { label: 'visualViewport', value: vv ? `${Math.round(vv.height)} @ top ${Math.round(vv.offsetTop)}, scale ${vv.scale}` : '—' },
    { label: 'viewport units', value: units.join('  ') },
    { label: 'safe-area insets', value: insets.join('  ') },
    { label: 'scrollY', value: `${Math.round(window.scrollY)}` },
    { label: 'dpr', value: `${window.devicePixelRatio}` },
    { label: 'standalone', value: String(window.matchMedia('(display-mode: standalone)').matches) },
    { label: 'navigator.standalone', value: String((window.navigator as Navigator & { standalone?: boolean }).standalone ?? '—') },
    { label: 'viewport meta', value: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content ?? '—' },
  ]
}

export default function ViewportProbePage() {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    const update = () => setRows(measure())
    update()

    const events: [EventTarget, string][] = [
      [window, 'resize'],
      [window, 'scroll'],
      [window, 'orientationchange'],
      [window, 'pageshow'],
    ]
    if (window.visualViewport) {
      events.push([window.visualViewport, 'resize'], [window.visualViewport, 'scroll'])
    }
    for (const [target, event] of events) target.addEventListener(event, update)
    const timer = window.setInterval(update, 500)

    return () => {
      for (const [target, event] of events) target.removeEventListener(event, update)
      window.clearInterval(timer)
    }
  }, [])

  return (
    <main style={screen}>
      <div style={{ ...rail, top: 0 }}>topo do viewport</div>
      <div style={{ ...rail, bottom: 0 }}>base do viewport</div>

      <h1 style={title}>viewport</h1>
      <dl style={list}>
        {rows.map((row) => (
          <div key={row.label} style={item}>
            <dt style={key}>{row.label}</dt>
            <dd style={val}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p style={hint}>
        As faixas douradas estão presas ao topo e à base do viewport. Se sobrar tela depois delas,
        o viewport é menor que a janela — <b>gap</b> diz de quanto. Role e veja se muda.
      </p>
    </main>
  )
}

const screen: React.CSSProperties = {
  position: 'relative',
  minHeight: '100dvh',
  padding: '48px 14px 60px',
  background: 'radial-gradient(120% 90% at 50% 0%, #16213c 0%, #0b1120 55%, #070b16 100%)',
  color: '#e2e8f0',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
}

const rail: React.CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(251, 191, 36, 0.85)',
  color: '#0b1120',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  zIndex: 10,
}

const title: React.CSSProperties = { fontSize: 15, color: '#fbbf24', margin: '4px 0 10px' }
const list: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const item: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 }
const key: React.CSSProperties = { color: '#94a3b8', fontSize: 10, letterSpacing: '0.06em' }
const val: React.CSSProperties = { margin: 0, wordBreak: 'break-word' }
const hint: React.CSSProperties = { color: '#94a3b8', marginTop: 14, lineHeight: 1.5 }
