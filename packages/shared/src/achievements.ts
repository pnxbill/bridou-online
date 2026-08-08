/**
 * Conquistas — the achievement catalog.
 *
 * Metadata lives here (shared) so the web app can render a locked/unlocked
 * grid without a round trip, while the *rules* that award them live server-side
 * in `apps/server/src/application/achievements.ts`. Adding an achievement means
 * an entry here plus a rule there; the id is the contract between the two.
 *
 * Design rules for this catalog, learned the hard way:
 *  - few and rare beats many and grindy — every entry should be worth saying out loud
 *  - the table sees the unlock live, so the name has to land in one line
 *  - anti-achievements are a feature: bailar is funny, and being *known* for it is funnier
 */

export type AchievementTier = 'bronze' | 'prata' | 'ouro' | 'lenda'

/**
 * When the rule can be decided:
 *  - `round` — at `round-ended`, so it can be announced mid-game
 *  - `game`  — at `game-ended`, from the finished game alone
 *  - `career`— at `game-ended`, but needs the player's lifetime totals
 */
export type AchievementScope = 'round' | 'game' | 'career'

export interface AchievementDef {
  id: string
  name: string
  /** One line, second person, Portuguese — shown under the name. */
  description: string
  icon: string
  tier: AchievementTier
  scope: AchievementScope
  /** Worn with pride, but it's a roast. Rendered in a different colour. */
  roast?: boolean
  /** Hidden from the catalog until unlocked — the fun of stumbling into it. */
  secret?: boolean
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ── round-scoped: announced live at the table ──────────────────────────────
  {
    id: 'profeta',
    name: 'Profeta',
    description: 'Apostou 7 e fez 7 na rodada de sete cartas.',
    icon: '🔮',
    tier: 'lenda',
    scope: 'round',
  },
  {
    id: 'cego-sortudo',
    name: 'Cego Sortudo',
    description: 'Acertou a aposta na rodada cega, sem ver a própria carta.',
    icon: '🕶️',
    tier: 'ouro',
    scope: 'round',
  },
  {
    id: 'varrida',
    name: 'Varrida',
    description: 'Fez todas as vazas de uma rodada de quatro cartas ou mais.',
    icon: '🧹',
    tier: 'ouro',
    scope: 'round',
  },
  {
    id: 'kamikaze',
    name: 'Kamikaze',
    description: 'Apostou cinco ou mais e acertou na mosca.',
    icon: '☄️',
    tier: 'ouro',
    scope: 'round',
  },
  {
    id: 'trunfo-magro',
    name: 'Trunfo Magro',
    description: 'Venceu uma vaza com um trunfo de valor cinco ou menos.',
    icon: '🗡️',
    tier: 'prata',
    scope: 'round',
  },
  {
    id: 'mao-de-ferro',
    name: 'Mão de Ferro',
    description: 'Acertou três apostas seguidas.',
    icon: '✊',
    tier: 'prata',
    scope: 'round',
  },
  {
    id: 'sequencia-limpa',
    name: 'Sequência Limpa',
    description: 'Acertou cinco apostas seguidas.',
    icon: '🎯',
    tier: 'ouro',
    scope: 'round',
  },
  {
    id: 'so-observando',
    name: 'Só Observando',
    description: 'Apostou zero e não fez nenhuma vaza numa rodada de cinco cartas ou mais.',
    icon: '🙈',
    tier: 'prata',
    scope: 'round',
  },
  {
    id: 'pe-frio',
    name: 'Pé Frio',
    description: 'Bailou três rodadas seguidas.',
    icon: '🥶',
    tier: 'bronze',
    scope: 'round',
    roast: true,
  },
  {
    id: 'bailador-nato',
    name: 'Bailador Nato',
    description: 'Bailou quatro rodadas seguidas. Um talento.',
    icon: '💃',
    tier: 'prata',
    scope: 'round',
    roast: true,
  },
  {
    id: 'puxa-tres-e-passa',
    name: 'Puxa Três e Passa',
    description: 'Acertou a aposta segurando o baseado exatamente três vazas.',
    icon: '🚬',
    tier: 'prata',
    scope: 'round',
  },
  {
    id: 'cachimbo',
    name: 'Cachimbo',
    description: 'Bailou depois de segurar o baseado a rodada inteira. Não vira cachimbo.',
    icon: '🪈',
    tier: 'bronze',
    scope: 'round',
    roast: true,
  },

  // ── game-scoped: decided when the last round lands ─────────────────────────
  {
    id: 'sem-susto',
    name: 'Sem Susto',
    description: 'Acertou a aposta nas treze rodadas de uma partida.',
    icon: '🏅',
    tier: 'lenda',
    scope: 'game',
  },
  {
    id: 'invicto',
    name: 'Invicto',
    description: 'Terminou uma partida inteira sem bailar uma vez.',
    icon: '🛡️',
    tier: 'ouro',
    scope: 'game',
  },
  {
    id: 'a-virada',
    name: 'A Virada',
    description: 'Estava em último no placar da rodada 7 e terminou campeão.',
    icon: '🔄',
    tier: 'ouro',
    scope: 'game',
  },
  {
    id: 'fotochegada',
    name: 'Foto-chegada',
    description: 'Venceu a partida por um único ponto de diferença.',
    icon: '📸',
    tier: 'ouro',
    scope: 'game',
  },
  {
    id: 'carrasco',
    name: 'Carrasco',
    description: 'Venceu com trinta pontos ou mais de vantagem sobre o segundo.',
    icon: '🔨',
    tier: 'ouro',
    scope: 'game',
  },
  {
    id: 'mesa-cheia',
    name: 'Mesa Cheia',
    description: 'Jogou uma partida com sete jogadores na mesa.',
    icon: '🪑',
    tier: 'prata',
    scope: 'game',
  },
  {
    id: 'cagao',
    name: 'Cagão',
    description: 'Apostou zero em seis ou mais rodadas da mesma partida.',
    icon: '🥚',
    tier: 'bronze',
    scope: 'game',
    roast: true,
  },
  {
    id: 'lanterna',
    name: 'Lanterna',
    description: 'Terminou uma partida em último lugar.',
    icon: '🔦',
    tier: 'bronze',
    scope: 'game',
    roast: true,
  },
  {
    id: 'coruja',
    name: 'Coruja',
    description: 'Terminou uma partida depois das duas da manhã.',
    icon: '🦉',
    tier: 'bronze',
    scope: 'game',
    secret: true,
  },
  {
    id: 'madrugador',
    name: 'Madrugador',
    description: 'Terminou uma partida antes das oito da manhã.',
    icon: '🌅',
    tier: 'bronze',
    scope: 'game',
    secret: true,
  },

  // ── career-scoped: needs lifetime totals ───────────────────────────────────
  {
    id: 'estreante',
    name: 'Estreante',
    description: 'Jogou sua primeira partida completa.',
    icon: '🌱',
    tier: 'bronze',
    scope: 'career',
  },
  {
    id: 'campeao',
    name: 'Campeão',
    description: 'Venceu sua primeira partida.',
    icon: '👑',
    tier: 'bronze',
    scope: 'career',
  },
  {
    id: 'bicampeao',
    name: 'Bicampeão',
    description: 'Venceu duas partidas seguidas.',
    icon: '🥈',
    tier: 'prata',
    scope: 'career',
  },
  {
    id: 'tricampeao',
    name: 'Tricampeão',
    description: 'Venceu três partidas seguidas.',
    icon: '🥇',
    tier: 'ouro',
    scope: 'career',
  },
  {
    id: 'veterano',
    name: 'Veterano',
    description: 'Jogou vinte e cinco partidas.',
    icon: '🎖️',
    tier: 'prata',
    scope: 'career',
  },
  {
    id: 'lenda-da-mesa',
    name: 'Lenda da Mesa',
    description: 'Jogou cem partidas.',
    icon: '🏛️',
    tier: 'lenda',
    scope: 'career',
  },
  {
    id: 'anfitriao',
    name: 'Anfitrião',
    description: 'Abriu vinte e cinco mesas. Alguém tem que chamar o pessoal.',
    icon: '🎩',
    tier: 'ouro',
    scope: 'career',
  },
  {
    id: 'nemesis',
    name: 'Nêmesis',
    description: 'Ficou à frente do mesmo adversário em cinco partidas seguidas.',
    icon: '😈',
    tier: 'ouro',
    scope: 'career',
  },
  {
    id: 'colecionador',
    name: 'Colecionador',
    description: 'Desbloqueou quinze conquistas.',
    icon: '💎',
    tier: 'ouro',
    scope: 'career',
  },
] as const

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
)

export const achievementById = (id: string): AchievementDef | undefined =>
  ACHIEVEMENTS_BY_ID.get(id)

/** Ordering used everywhere a list of tiers is shown (rarest last). */
export const TIER_ORDER: Record<AchievementTier, number> = {
  bronze: 0,
  prata: 1,
  ouro: 2,
  lenda: 3,
}

/** One player's unlocked conquista, as stored and as sent to clients. */
export interface UnlockedAchievement {
  achievementId: string
  unlockedAt: string
  /** The game it was earned in — lets the profile link back to the resenha. */
  gameId: string | null
}
