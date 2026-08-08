/**
 * O baseado — the blunt that goes around the table.
 *
 * ## Why it exists
 *
 * Bridou is a game about being *exact*: you call how many tricks you'll take
 * and the scoreboard only pays you for landing on the number. That makes it a
 * game of quiet, private confidence — everyone at the table knows by the third
 * trick whether they're cruising or drowning, and nothing on screen ever says
 * so. The baseado is that feeling made visible and made expensive.
 *
 * Holding it is a **side bet on your own bet**. Every trick that resolves while
 * it's in your hands is a `tragada`, and at the end of the round each tragada
 * pays +1 if you hit your bet and costs 1 if you bailou. So keeping it says
 * "eu tô tranquilo" out loud, and passing it says the opposite — which is why
 * a blunt suddenly changing hands mid-round is the best tell in the game.
 *
 * ## And why holding it too long is bad
 *
 * The etiquette of the roda is the mechanic: *puxa três e passa*. Past the
 * third tragada the barato is over but the burn isn't — every extra one starts
 * taking a point back, so on a made bet the curve peaks at three and comes
 * down (1:+1, 2:+2, 3:+3, 4:+2, 5:+1, 6:0, 7:-1). Nursing it through a whole
 * seven-trick round leaves you worse off than never having touched it. Não
 * vira cachimbo.
 */

/** Tragadas that still pay. Past this the burn takes points back instead. */
export const BASEADO_FREE_TRAGADAS = 3

/** Per-game rate limit on passing, enforced server-side (see GameService). */
export const BASEADO_PASS_COOLDOWN_MS = 700

/**
 * What a round's tragadas are worth to one player, given whether they landed
 * their bet. The engine scores with this and the UI explains the number with
 * it, so the rule exists exactly once.
 */
export const baseadoPoints = (tragadas: number, madeBet: boolean): number => {
  if (tragadas <= 0) return 0
  if (!madeBet) return -tragadas
  const paid = Math.min(tragadas, BASEADO_FREE_TRAGADAS)
  const burned = Math.max(0, tragadas - BASEADO_FREE_TRAGADAS)
  return paid - burned
}

/** Hogging it — the table gets told, and the points start going the wrong way. */
export const isCachimbo = (tragadas: number): boolean => tragadas > BASEADO_FREE_TRAGADAS
