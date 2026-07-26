/**
 * Categorical series colours for charts, in fixed slot order.
 *
 * These are the dark-mode steps of the reference categorical palette, validated
 * as a 7-slot set against this app's own surface (--bg #0f172a): lightness band,
 * chroma floor, adjacent CVD separation (worst ΔE 8.4), normal-vision floor
 * (worst ΔE 19.3) and ≥3:1 contrast all pass. Bridou is dark-only, so there is
 * no light column to keep in step.
 *
 * Rules that come with them:
 *  - assign in fixed order, never cycled — a table caps at MAX_PLAYERS (7),
 *    which is exactly the validated set, so there is no 8th case to handle
 *  - colour follows the player, never their rank, so a re-sort never repaints
 */
export const SERIES_COLORS = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
] as const

/**
 * Stable id → colour map. Built from a fixed player order (seat order), so the
 * same person keeps the same colour across the chart, the legend and the table.
 */
export const colorsByPlayer = (playerIds: string[]): Record<string, string> =>
  Object.fromEntries(
    playerIds.map((id, i) => [id, SERIES_COLORS[i % SERIES_COLORS.length]!]),
  )
