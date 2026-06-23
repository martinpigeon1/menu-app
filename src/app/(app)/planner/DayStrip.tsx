'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fromDateString, toDateString } from '@/lib/weeks'

const FR_WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const FR_MONTHS_CAP = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
const CELL_H = 64 // px — fixed height keeps scroll math deterministic

function dowOf(d: Date) { return (d.getDay() + 6) % 7 }
function addStr(s: string, n: number) {
  const d = fromDateString(s)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}
function buildRange(center: string, before: number, after: number): string[] {
  const out: string[] = []
  for (let i = -before; i <= after; i++) out.push(addStr(center, i))
  return out
}
function monthOf(s: string): string {
  const d = fromDateString(s)
  return `${FR_MONTHS_CAP[d.getMonth()]} ${d.getFullYear()}`
}

interface DayStripProps {
  selectedDate: string
  todayStr: string
  mealDates: Set<string>
  onSelect: (date: string) => void
}

export default function DayStrip({ selectedDate, todayStr, mealDates, onSelect }: DayStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dates, setDates] = useState<string[]>(() => buildRange(todayStr, 10, 45))
  const [monthLabel, setMonthLabel] = useState(() => monthOf(todayStr))
  const pendingPrepend = useRef(0)
  const busy = useRef(false)

  // Initial scroll: position today near the top (one day above visible).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = dates.indexOf(todayStr)
    el.scrollTop = Math.max(0, (idx - 1) * CELL_H)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preserve viewport when days are prepended at the top.
  useLayoutEffect(() => {
    if (pendingPrepend.current > 0 && scrollRef.current) {
      scrollRef.current.scrollTop += pendingPrepend.current * CELL_H
      pendingPrepend.current = 0
    }
    busy.current = false
  }, [dates])

  // Keep the selected day in view (rebuild the window if it scrolled out of range).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = dates.indexOf(selectedDate)
    if (idx === -1) {
      const newDates = buildRange(selectedDate, 10, 45)
      setDates(newDates)
      requestAnimationFrame(() => {
        const el2 = scrollRef.current
        if (!el2) return
        el2.scrollTop = Math.max(0, (newDates.indexOf(selectedDate) - 1) * CELL_H)
      })
      return
    }
    const top = idx * CELL_H
    if (top < el.scrollTop || top + CELL_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - CELL_H)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const topIdx = Math.min(dates.length - 1, Math.max(0, Math.round(el.scrollTop / CELL_H)))
    const topDate = dates[topIdx]
    if (topDate) setMonthLabel(monthOf(topDate))

    if (busy.current) return
    if (el.scrollTop < CELL_H * 3) {
      busy.current = true
      const first = dates[0]
      const prepend: string[] = []
      for (let i = 14; i >= 1; i--) prepend.push(addStr(first, -i))
      pendingPrepend.current += prepend.length
      setDates((prev) => [...prepend, ...prev])
    } else if (el.scrollTop + el.clientHeight > el.scrollHeight - CELL_H * 3) {
      busy.current = true
      const last = dates[dates.length - 1]
      const append: string[] = []
      for (let i = 1; i <= 14; i++) append.push(addStr(last, i))
      setDates((prev) => [...prev, ...append])
    }
  }

  return (
    <div className="h-full w-[68px] shrink-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-500 text-center py-1.5 leading-tight">
        {monthLabel}
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto no-scrollbar">
        {dates.map((d) => {
          const dt = fromDateString(d)
          const isSel = d === selectedDate
          const isToday = d === todayStr
          const hasMeal = mealDates.has(d)
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              style={{ height: CELL_H }}
              className={`w-full flex flex-col items-center justify-center gap-0.5 border-b border-gray-50 transition-colors ${
                isSel ? 'bg-green-600' : 'hover:bg-gray-50'
              } ${isToday && !isSel ? 'ring-1 ring-green-400 ring-inset' : ''}`}
            >
              <span className={`text-[10px] font-medium ${isSel ? 'text-green-100' : 'text-gray-400'}`}>{FR_WD[dowOf(dt)]}</span>
              <span className={`text-base font-semibold ${isSel ? 'text-white' : isToday ? 'text-green-600' : 'text-gray-800'}`}>{dt.getDate()}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${hasMeal ? (isSel ? 'bg-white' : 'bg-green-500') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
