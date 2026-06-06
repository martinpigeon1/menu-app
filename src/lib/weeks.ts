// 0=Mon in our model; JS getDay() 0=Sun 1=Mon...6=Sat

// The household is in Amsterdam. We anchor every "today / current week"
// computation to this timezone so results are identical whether the code runs
// in the browser (local time) or on the server (UTC on Vercel).
export const APP_TZ = 'Europe/Amsterdam'

// "Today" as a Date whose local Y/M/D matches the civil date in Amsterdam.
// Week math below only ever reads the local civil parts (getDay/getDate/…),
// which are correct for a date built from civil parts in any runtime timezone.
export function amsterdamToday(): Date {
  // 'en-CA' formats as YYYY-MM-DD.
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date())
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

export function getMondayOf(date: Date = amsterdamToday()): Date {
  const d = new Date(date)
  const jsDay = d.getDay() // 0=Sun
  const diff = jsDay === 0 ? -6 : 1 - jsDay
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addWeeks(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n * 7)
  return d
}

// Index du jour de la semaine dans notre modèle (0=Lun … 6=Dim) pour une date donnée.
export function currentDayIndex(date: Date = amsterdamToday()): number {
  const jsDay = date.getDay() // 0=Dim
  return jsDay === 0 ? 6 : jsDay - 1
}

// Un jour est « passé » s'il est strictement avant aujourd'hui dans la semaine en cours
// (aujourd'hui et les jours à venir ne le sont pas).
export function isDayInPast(dayIndex: number): boolean {
  return dayIndex < currentDayIndex()
}

// Lundi sur lequel le planning doit s'ouvrir par défaut. Le dimanche, la semaine
// est essentiellement terminée : on bascule automatiquement sur la semaine prochaine.
export function defaultPlannerMonday(): Date {
  return currentDayIndex() === 6 ? addWeeks(getMondayOf(), 1) : getMondayOf()
}

export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

const FR_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function formatWeekRange(monday: Date): string {
  const sunday = addWeeks(monday, 1)
  sunday.setDate(sunday.getDate() - 1)
  const start = `${monday.getDate()} ${FR_MONTHS[monday.getMonth()]}`
  const end = `${sunday.getDate()} ${FR_MONTHS[sunday.getMonth()]}`
  return `${start} – ${end}`
}

export function dayLabel(dayOfWeek: number): string {
  return FR_DAYS[dayOfWeek] ?? '?'
}
