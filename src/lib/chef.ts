// Shared helpers for the Chef assistant API routes.

const FR_MONTHS_FULL = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const FR_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/** Monday of the current week (UTC), minus `weeksAgo` weeks, as YYYY-MM-DD. */
export function mondayOf(weeksAgo = 0): string {
  const d = new Date()
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff - 7 * weeksAgo)
  return d.toISOString().split('T')[0]
}

export function dayLabel(dayOfWeek: number | null): string {
  if (dayOfWeek === null || dayOfWeek === undefined) return ''
  return FR_DAYS[dayOfWeek] ?? ''
}

export function currentMonthFr(): string {
  return FR_MONTHS_FULL[new Date().getMonth()]
}

export function currentSeasonFr(): string {
  const m = new Date().getMonth() // 0=Jan
  if (m >= 2 && m <= 4) return 'Printemps'
  if (m >= 5 && m <= 7) return 'Été'
  if (m >= 8 && m <= 10) return 'Automne'
  return 'Hiver'
}
