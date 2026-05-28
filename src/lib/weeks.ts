// 0=Mon in our model; JS getDay() 0=Sun 1=Mon...6=Sat

export function getMondayOf(date: Date = new Date()): Date {
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
