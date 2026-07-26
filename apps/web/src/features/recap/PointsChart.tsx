'use client'

import type { PlayerInfo, RecapRoundPoint } from '@bridou/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './PointsChart.module.css'

interface Props {
  players: PlayerInfo[]
  progression: RecapRoundPoint[]
  colors: Record<string, string>
}

/**
 * Geometry in viewBox units. Narrow screens get a squarer box so the chart
 * doesn't collapse into a 150px-tall smear on a phone — this is a mobile-first
 * app and the lines have to stay separable in portrait.
 */
const SHAPE = {
  wide: { w: 640, h: 260, pad: { top: 16, right: 64, bottom: 28, left: 36 } },
  narrow: { w: 380, h: 300, pad: { top: 14, right: 52, bottom: 26, left: 30 } },
} as const

const stepFor = (span: number) => (span > 120 ? 40 : span > 60 ? 20 : 10)

/**
 * Rounds the domain out to whole tick steps.
 *
 * The baseline stays at 0 unless someone is genuinely underwater: cumulative
 * scores start near zero and a single early bailada (-1) shouldn't cost a whole
 * empty tick band under the lines.
 */
const niceDomain = (min: number, max: number): [number, number] => {
  const step = stepFor(Math.max(10, max - Math.min(0, min)))
  const lo = min < -5 ? Math.floor(min / step) * step : 0
  return [lo, Math.ceil(max / step) * step]
}

/** Minimum vertical gap between end-of-line labels, in viewBox units. */
const LABEL_GAP = 13

/**
 * Nudges end labels apart so near-identical finishes stay readable.
 * Without this, two players who end one point apart print on top of each other.
 */
const spreadLabels = (
  entries: Array<{ id: string; y: number }>,
  bottom: number,
): Record<string, number> => {
  const sorted = [...entries].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const current = sorted[i]!
    if (current.y - prev.y < LABEL_GAP) current.y = prev.y + LABEL_GAP
  }
  // If pushing down overflowed the plot, walk the whole stack back up.
  const overflow = (sorted.at(-1)?.y ?? 0) - bottom
  if (overflow > 0) for (const entry of sorted) entry.y -= overflow
  return Object.fromEntries(sorted.map((e) => [e.id, e.y]))
}

/** True while the viewport is phone-width. */
const useNarrow = (): boolean => {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 560px)')
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return narrow
}

/**
 * The turning-point graph: cumulative points per player across the rounds.
 *
 * A line chart because the job is change-over-time and the story is the lead
 * changes — which is exactly what a table of final totals throws away. One
 * y-axis, always (two scales would be a lie about a shared scoreboard).
 */
export function PointsChart({ players, progression, colors }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const narrow = useNarrow()
  const shape = narrow ? SHAPE.narrow : SHAPE.wide

  const { domain, points, ticks, labelY } = useMemo(() => {
    const { w, h, pad } = shape
    const plotW = w - pad.left - pad.right
    const plotH = h - pad.top - pad.bottom

    const values = progression.flatMap((p) => Object.values(p.totals))
    const [lo, hi] = niceDomain(Math.min(0, ...values), Math.max(10, ...values))
    const x = (i: number) =>
      pad.left + (progression.length > 1 ? (i / (progression.length - 1)) * plotW : plotW / 2)
    const y = (value: number) => pad.top + plotH - ((value - lo) / (hi - lo)) * plotH

    const step = stepFor(hi - lo)
    const tickValues: number[] = []
    for (let v = lo; v <= hi; v += step) tickValues.push(v)

    const series = players.map((player) => ({
      player,
      color: colors[player.id] ?? '#94a3b8',
      coords: progression.map((round, i) => ({
        x: x(i),
        y: y(round.totals[player.id] ?? 0),
        value: round.totals[player.id] ?? 0,
        roundNumber: round.roundNumber,
      })),
    }))

    return {
      domain: [lo, hi] as const,
      ticks: tickValues.map((value) => ({ value, y: y(value) })),
      points: series,
      labelY: spreadLabels(
        series.flatMap((s) => {
          const end = s.coords.at(-1)
          return end ? [{ id: s.player.id, y: end.y }] : []
        }),
        pad.top + plotH,
      ),
    }
  }, [players, progression, colors, shape])

  if (!progression.length) return null

  const { w, h, pad } = shape
  const plotW = w - pad.left - pad.right
  const plotH = h - pad.top - pad.bottom
  const hoverX = hover !== null ? points[0]?.coords[hover]?.x : undefined
  // ≤4 series get direct labels at the line end; more would collide.
  const directLabels = players.length <= 4
  // On a phone, labelling every round crushes the axis into unreadable mush.
  const labelEvery = narrow ? 3 : 2

  const onMove = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const ratio = ((clientX - rect.left) / rect.width) * w
    const index = Math.round(((ratio - pad.left) / plotW) * (progression.length - 1))
    setHover(Math.max(0, Math.min(progression.length - 1, index)))
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.title}>A virada</h2>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
        >
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {showTable ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.caption}>Pontos acumulados por rodada</caption>
            <thead>
              <tr>
                <th scope="col">Rodada</th>
                {players.map((p) => (
                  <th key={p.id} scope="col">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {progression.map((round) => (
                <tr key={round.roundNumber}>
                  <th scope="row">{round.roundNumber}</th>
                  {players.map((p) => (
                    <td key={p.id}>{round.totals[p.id] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className={styles.svg}
          role="img"
          aria-label={`Pontos acumulados ao longo de ${progression.length} rodadas`}
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          {/* recessive grid — present, never competing with the data */}
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={tick.y}
                y2={tick.y}
                className={styles.grid}
              />
              <text x={pad.left - 8} y={tick.y + 4} className={styles.axisLabel} textAnchor="end">
                {tick.value}
              </text>
            </g>
          ))}

          {progression.map((round, i) => {
            if (i % labelEvery !== 0 && i !== progression.length - 1) return null
            return (
              <text
                key={round.roundNumber}
                x={points[0]?.coords[i]?.x ?? 0}
                y={h - 8}
                className={styles.axisLabel}
                textAnchor="middle"
              >
                {round.roundNumber}
              </text>
            )
          })}

          {hoverX !== undefined && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={pad.top}
              y2={pad.top + plotH}
              className={styles.crosshair}
            />
          )}

          {points.map(({ player, color, coords }) => (
            <g key={player.id}>
              <path
                d={coords.map((c, i) => `${i ? 'L' : 'M'}${c.x},${c.y}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {hover !== null && coords[hover] && (
                <circle
                  cx={coords[hover]!.x}
                  cy={coords[hover]!.y}
                  r={5}
                  fill={color}
                  // 2px surface ring keeps overlapping markers separable
                  stroke="var(--bg)"
                  strokeWidth={2}
                />
              )}
              {directLabels && coords.at(-1) && (
                <>
                  {/* leader line, so a nudged label still points at its own end */}
                  <line
                    x1={coords.at(-1)!.x}
                    y1={coords.at(-1)!.y}
                    x2={coords.at(-1)!.x + 6}
                    y2={labelY[player.id] ?? coords.at(-1)!.y}
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <text
                    x={coords.at(-1)!.x + 9}
                    y={(labelY[player.id] ?? coords.at(-1)!.y) + 4}
                    className={styles.seriesLabel}
                  >
                    {player.name.split(' ')[0]}
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      )}

      {/* Legend is always present for ≥2 series — identity never rests on colour alone. */}
      <ul className={styles.legend}>
        {players.map((player) => (
          <li key={player.id} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: colors[player.id] }}
              aria-hidden
            />
            {player.name}
            {hover !== null && (
              <strong className={styles.legendValue}>
                {progression[hover]?.totals[player.id] ?? 0}
              </strong>
            )}
          </li>
        ))}
      </ul>

      <p className={styles.hoverNote}>
        {hover !== null
          ? `Rodada ${progression[hover]?.roundNumber} · escala ${domain[0]}–${domain[1]}`
          : 'Toque no gráfico para ver o placar de cada rodada.'}
      </p>
    </div>
  )
}
