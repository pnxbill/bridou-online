/**
 * Provocações — the reaction wheel.
 *
 * Trash talk is the actual product of a card game between friends, and voice
 * chat only covers the players who turned it on. A fixed, curated set (rather
 * than free text) keeps it fast to fire mid-trick and impossible to abuse.
 */

export interface EmoteDef {
  id: string
  icon: string
  /** Shown in the wheel and read out in the toast. */
  label: string
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'suave', icon: '😏', label: 'Tá suave' },
  { id: 'vai-bailar', icon: '🫵', label: 'Vai bailar' },
  { id: 'palmas', icon: '👏', label: 'Palmas' },
  { id: 'palhaco', icon: '🤡', label: 'Palhaço' },
  { id: 'chorando', icon: '😭', label: 'Chorei' },
  { id: 'pensando', icon: '🤔', label: 'Pensa aí' },
  { id: 'fogo', icon: '🔥', label: 'Pegando fogo' },
  { id: 'reza', icon: '🙏', label: 'Rezando' },
] as const

export const EMOTES_BY_ID: ReadonlyMap<string, EmoteDef> = new Map(EMOTES.map((e) => [e.id, e]))

export const isEmoteId = (id: string): boolean => EMOTES_BY_ID.has(id)

/** Per-player rate limit, enforced server-side so nobody can spam the table. */
export const EMOTE_COOLDOWN_MS = 2000
