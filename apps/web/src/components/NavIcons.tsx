/**
 * The bar's glyphs. Hand-drawn on a 24px grid, `currentColor` only, so the
 * active/inactive states are pure color — same approach as the sound icons in
 * `features/settings/SettingsSections`. No icon dependency for five shapes.
 */

import type { NavIconName } from './navigation'

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Início — a roof over the door you came in through. */
const HomeIcon = () => (
  <>
    <path d="M4 10.5 12 4l8 6.5" {...stroke} />
    <path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" {...stroke} />
    <path d="M10 20v-5h4v5" {...stroke} />
  </>
)

/* Mesas — the felt oval from above with four seats around it. The seats sit on
   the diagonals on purpose: stacked above and below the oval they close into an
   eye, which is all anyone could see at this size. */
const MesasIcon = () => (
  <>
    <ellipse cx="12" cy="12" rx="8" ry="4.6" {...stroke} />
    <circle cx="5" cy="5.8" r="1.5" fill="currentColor" />
    <circle cx="19" cy="5.8" r="1.5" fill="currentColor" />
    <circle cx="5" cy="18.2" r="1.5" fill="currentColor" />
    <circle cx="19" cy="18.2" r="1.5" fill="currentColor" />
  </>
)

/* Diária — a calendar with today filled in. A single card with a sun was the
   thematic drawing and read as neither at 22px; "one per day" is the part that
   has to land, and the label carries the cards. */
const DiariaIcon = () => (
  <>
    <rect x="4" y="5.5" width="16" height="15" rx="2.5" {...stroke} />
    <path d="M4 10.2h16" {...stroke} />
    <path d="M8.5 3.5V7M15.5 3.5V7" {...stroke} />
    <circle cx="12" cy="15.2" r="2.1" fill="currentColor" />
  </>
)

/** Ranking — the cup, because the crown already means champion elsewhere. */
const RankingIcon = () => (
  <>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" {...stroke} />
    <path d="M7 5.5H4.8V7a3.2 3.2 0 0 0 2.6 3.1" {...stroke} />
    <path d="M17 5.5h2.2V7a3.2 3.2 0 0 1-2.6 3.1" {...stroke} />
    <path d="M12 14v3.5M8.5 20h7" {...stroke} />
  </>
)

const ICONS: Record<NavIconName, () => React.ReactElement> = {
  home: HomeIcon,
  mesas: MesasIcon,
  diaria: DiariaIcon,
  ranking: RankingIcon,
}

export function NavIcon({ name, size = 22 }: { name: NavIconName; size?: number }) {
  const Glyph = ICONS[name]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <Glyph />
    </svg>
  )
}

/** The fallback face on the "Você" slot before you sign in. */
export const PersonIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" {...stroke} />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...stroke} />
  </svg>
)

/** Conquistas — a medal, for the one destination that lives in the sheet. */
export const MedalIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="15" r="5.5" {...stroke} />
    <path d="M8.5 10.2 6 3.5h12l-2.5 6.7" {...stroke} />
    <path d="m12 12.7.9 1.9 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 14.9l2-.3.9-1.9Z" {...stroke} />
  </svg>
)
