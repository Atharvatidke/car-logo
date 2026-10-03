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
 * Build the turn plan from an explicit selection.
 *
 * The selection is ordered easy -> hard first, then dealt into turns of
 * `turnSize`. Ordering before dealing is what keeps a turn from mixing a household
 * name with an obscure one. Within a turn the cards are shuffled so the hardest one
 * is not always in the same slot.
 */
export function planFromSelection(
  selected: Brand[],
  turnSize = TURN_SIZE,
  rng: () => number = Math.random,
): Turn[] {
  const ordered = selected
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty || a.brand.localeCompare(b.brand))
  const turns: Turn[] = []
  for (let i = 0; i < ordered.length; i += turnSize) {
    turns.push(shuffle(ordered.slice(i, i + turnSize), rng))
  }
  return turns
}

/** Every brand, dealt easy -> hard. */
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