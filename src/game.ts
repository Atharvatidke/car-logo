import type { Brand } from './brands'

export type { Brand }

export const TURN_SIZE = 5

/** Fisher-Yates, non-mutating. */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type Turn = Brand[]

/**
 * Build the turn plan from the player's selection, preserving the order they were
 * picked in.
 *
 * Selection order IS the play order: brand 1 in the picker is card 1 of turn 1, and
 * so on. Nothing is re-sorted or shuffled, so a host can deliberately build a run
 * that starts easy and ramps up (the picker is pre-ordered easy -> hard, so simply
 * tapping down the list does the right thing).
 *
 * Cards are dealt into consecutive turns of `turnSize`.
 */
export function planFromSelection(
  selected: Brand[],
  turnSize = TURN_SIZE,
  // kept for API compatibility; selection order is authoritative and never shuffled
  _rng?: () => number,
): Turn[] {
  const turns: Turn[] = []
  for (let i = 0; i < selected.length; i += turnSize) {
    turns.push(selected.slice(i, i + turnSize))
  }
  return turns
}

/** Every brand, in picker order (already sorted easy -> hard). */
export function planAll(brands: Brand[], turnSize = TURN_SIZE): Turn[] {
  return planFromSelection(brands, turnSize)
}

/**
 * Suggest a next turn from what is still unplayed, preferring the easiest
 * remaining brands so the run keeps climbing rather than jumping around.
 */
export function suggestTurn(remaining: Brand[], turnSize = TURN_SIZE): Brand[] {
  return remaining
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty || a.brand.localeCompare(b.brand))
    .slice(0, turnSize)
}