import { Suspense } from 'react'
import Link from 'next/link'
import PlannerClient from './PlannerClient'

export default function PlannerPage() {
  return (
    <>
      <Suspense fallback={<div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>}>
        <PlannerClient />
      </Suspense>

      {/* Chef FAB — small round button, bottom-right above the nav */}
      <Link
        href="/chef"
        aria-label="Chef"
        title="Chef"
        className="fixed bottom-20 right-4 z-30 w-12 h-12 flex items-center justify-center bg-green-600 text-white text-xl rounded-full shadow-lg hover:bg-green-700 transition-colors"
      >
        💬
      </Link>
    </>
  )
}
