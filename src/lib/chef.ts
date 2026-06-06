// Shared helpers for the Chef assistant API routes.
// All "current week / month / season" values are anchored to Amsterdam.

import { amsterdamToday, getMondayOf, addWeeks, toDateString } from '@/lib/weeks'

const FR_MONTHS_FULL = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const FR_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/** Monday of the current Amsterdam week, minus `weeksAgo` weeks, as YYYY-MM-DD. */
export function mondayOf(weeksAgo = 0): string {
  return toDateString(addWeeks(getMondayOf(), -weeksAgo))
}

export function dayLabel(dayOfWeek: number | null): string {
  if (dayOfWeek === null || dayOfWeek === undefined) return ''
  return FR_DAYS[dayOfWeek] ?? ''
}

export function currentMonthFr(): string {
  return FR_MONTHS_FULL[amsterdamToday().getMonth()]
}

export function currentSeasonFr(): string {
  const m = amsterdamToday().getMonth() // 0=Jan
  if (m >= 2 && m <= 4) return 'Printemps'
  if (m >= 5 && m <= 7) return 'Été'
  if (m >= 8 && m <= 10) return 'Automne'
  return 'Hiver'
}
