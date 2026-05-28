'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  const isCourses = pathname.startsWith('/planner/shopping-list')
  const isPlanner = pathname.startsWith('/planner') && !isCourses
  const isRecettes = !isPlanner && !isCourses

  const cls = (active: boolean) =>
    `flex flex-col items-center gap-0.5 px-5 py-2 text-xs font-medium transition-colors ${
      active ? 'text-green-600' : 'text-gray-400'
    }`

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 flex justify-around pb-safe">
      <Link href="/" className={cls(isRecettes)}>
        <span className="text-xl">🍽</span>
        Recettes
      </Link>
      <Link href="/planner" className={cls(isPlanner)}>
        <span className="text-xl">📅</span>
        Planner
      </Link>
      <Link href="/planner/shopping-list" className={cls(isCourses)}>
        <span className="text-xl">🛒</span>
        Courses
      </Link>
    </nav>
  )
}
