import { Suspense } from 'react'
import Link from 'next/link'
import PlannerClient from './PlannerClient'

export default function PlannerPage() {
  return (
    <>
      <Suspense fallback={<div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>}>
        <PlannerClient />
      </Suspense>

      {/* Chef FAB — centered pill, above the "liste de courses" bar and the nav */}
      <Link
        href="/chef"
        className="fixed bottom-32 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-green-600 text-white rounded-full shadow-lg py-3 px-6 text-sm font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
      >
        <span className="text-lg leading-none">💬</span>
        Chef · Votre assistant menu
      </Link>
    </>
  )
}
