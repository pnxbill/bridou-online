/**
 * Where you can go, in one place — read by the bottom bar (`AppNav`) and by the
 * menu sheet on the screens that have no bar (`UserMenu`).
 *
 * Ordered by how often you'd want it, thumb-first: your mesas carry the season,
 * the daily hand is the reason to open the app alone, and the ranking is the
 * shop window. Conquistas is deliberately *not* here — it's your own shelf, so
 * it sits under your name in the sheet instead of taking a fifth slot.
 *
 * Every destination shows signed-out too: `/mesas`, `/diaria` and `/conquistas`
 * each render their own "Entrar com Google" gate, so a tap lands on a page that
 * sells the feature instead of on a tab that isn't there.
 */

export type NavIconName = 'home' | 'mesas' | 'diaria' | 'ranking'

export interface NavItem {
  href: string
  label: string
  icon: NavIconName
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Início', icon: 'home' },
  { href: '/mesas', label: 'Mesas', icon: 'mesas' },
  { href: '/diaria', label: 'Diária', icon: 'diaria' },
  { href: '/ranking', label: 'Ranking', icon: 'ranking' },
]

/** Your shelf. Lives in the sheet, under your name. */
export const CONQUISTAS = { href: '/conquistas', label: 'Conquistas' }

/**
 * Which tab lights up. A tab owns its subtree — `/mesas/ABC` is still Mesas —
 * but only on a path boundary, so `/mesa/ABC` (the ephemeral lobby, singular)
 * lights nothing. Neither does `/resenha/x` or `/conquistas`: not every screen
 * belongs to a tab, and lying about it is worse than an unlit bar.
 */
export const isActiveTab = (pathname: string, href: string): boolean => {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
