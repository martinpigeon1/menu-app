import { Suspense } from 'react'
import Link from 'next/link'
import PlannerClient from './PlannerClient'

export default function PlannerPage() {
  return (
    <>
      <Suspense fallback={<div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>}>
        <PlannerClient />
      </Suspense>

      {/* Chef FAB — bottom-right, above the bottom nav */}
      <Link
        href="/chef"
        className="fixed bottom-20 right-4 z-30 flex items-center gap-2 bg-green-600 text-white rounded-full shadow-lg pl-3.5 pr-4 py-3 hover:bg-green-700 transition-colors"
      >
        <span className="text-lg leading-none">💬</span>
        <span className="text-sm font-semibold">Chef</span>
      </Link>
    </>
  )
}
