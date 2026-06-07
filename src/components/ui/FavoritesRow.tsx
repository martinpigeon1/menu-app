'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Recipe } from '@/types/database'
import AddToPlannerSheet from './AddToPlannerSheet'

export default function FavoritesRow({ favorites }: { favorites: Recipe[] }) {
  const [plannerRecipe, setPlannerRecipe] = useState<Recipe | null>(null)
  const [toast, setToast] = useState(false)

  return (
    <>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
        {favorites.map((r) => (
          <div
            key={r.id}
            className="flex-shrink-0 w-[140px] bg-white border border-gray-200 rounded-xl p-3 flex flex-col"
          >
            <Link href={`/recettes/${r.id}`} className="flex-1 min-w-0 group">
              <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug group-hover:text-green-700 transition-colors">
                {r.name}
              </p>
              <div className="flex items-center gap-0.5 mt-1 text-xs">
                <span className="text-amber-400">★</span>
                <span className="text-gray-600">{r.rating}</span>
              </div>
              {r.author && <p className="text-[11px] text-gray-400 truncate mt-0.5">{r.author}</p>}
            </Link>
            <button
              onClick={() => setPlannerRecipe(r)}
              title="Ajouter au planning"
              className="mt-2 self-start text-sm w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            >
              📅
            </button>
          </div>
        ))}
      </div>

      {plannerRecipe && (
        <AddToPlannerSheet
          recipe={plannerRecipe}
          onClose={() => setPlannerRecipe(null)}
          onAdded={() => {
            setPlannerRecipe(null)
            setToast(true)
            setTimeout(() => setToast(false), 2500)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            ✅ Ajouté au planning
          </div>
        </div>
      )}
    </>
  )
}
