// Quantity scaling shared by ingredients and step placeholders.
//
// Step text stores quantities as [[N]] placeholders where N is the BASE
// quantity (for the recipe's default_servings). The UI scales them to the
// currently selected serving size at render time.

/**
 * Scale a base quantity from `defaultServings` to `selectedServings`.
 *
 * Rounding rules (see Phase 3 spec):
 *  - quantities > 1  → nearest 0.5
 *  - quantities < 1  → nearest 0.25
 *  - never return 0  → minimum 1
 */
export function scaleValue(
  base: number,
  selectedServings: number,
  defaultServings: number
): number {
  if (!defaultServings || defaultServings <= 0) return base
  const raw = (base * selectedServings) / defaultServings

  const rounded = raw > 1 ? Math.round(raw * 2) / 2 : Math.round(raw * 4) / 4

  // Never show 0 — at least one of anything.
  return rounded <= 0 ? 1 : rounded
}

/** Format a (possibly fractional) quantity without a trailing `.0`. */
export function formatScaled(n: number): string {
  // toString already drops trailing zeros: 3 → "3", 1.5 → "1.5", 0.25 → "0.25"
  return n.toString()
}

// Splits a step's text into literal segments and [[N]] placeholder tokens.
const PLACEHOLDER_RE = /(\[\[[^\]]+\]\])/g

export interface StepSegment {
  text: string
  isQuantity: boolean
}

/**
 * Parse step text into segments, scaling each [[N]] placeholder to the
 * selected serving size. Segments flagged `isQuantity` are the scaled values
 * so the UI can emphasise them.
 */
export function parseStepText(
  text: string,
  selectedServings: number,
  defaultServings: number
): StepSegment[] {
  return text.split(PLACEHOLDER_RE).map((part) => {
    const match = part.match(/^\[\[([^\]]+)\]\]$/)
    if (match) {
      const base = parseFloat(match[1].replace(',', '.'))
      if (!Number.isNaN(base)) {
        return {
          text: formatScaled(scaleValue(base, selectedServings, defaultServings)),
          isQuantity: true,
        }
      }
    }
    return { text: part, isQuantity: false }
  })
}
