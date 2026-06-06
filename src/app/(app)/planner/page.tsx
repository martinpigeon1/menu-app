import { Suspense } from 'react'
import PlannerClient from './PlannerClient'

export default function PlannerPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>}>
      <PlannerClient />
    </Suspense>
  )
}
