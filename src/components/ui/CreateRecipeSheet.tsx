'use client'

import { useRouter } from 'next/navigation'

interface CreateRecipeSheetProps {
  onClose: () => void
  onPickTsv: () => void
}

type Option = {
  icon: string
  label: string
  desc: string
} & ({ href: string } | { action: () => void })

export default function CreateRecipeSheet({ onClose, onPickTsv }: CreateRecipeSheetProps) {
  const router = useRouter()

  const options: Option[] = [
    {
      icon: '📷',
      label: 'Depuis une photo',
      desc: 'Extraction automatique de toute la recette',
      href: '/recettes/creer?mode=photo',
    },
    {
      icon: '🔗',
      label: 'Depuis une URL',
      desc: 'Yummix, Claire au Matcha, Cookidoo…',
      href: '/recettes/creer?mode=url',
    },
    {
      icon: '📋',
      label: 'Depuis un fichier TSV',
      desc: 'Importer une liste de recettes',
      action: () => { onClose(); onPickTsv() },
    },
    {
      icon: '✏️',
      label: 'Manuellement',
      desc: 'Saisir les champs un par un',
      href: '/recettes/nouvelle',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Nouvelle recette</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => ('href' in opt ? router.push(opt.href) : opt.action())}
            className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-2xl">{opt.icon}</span>
            <div>
              <p className="font-medium text-gray-800 text-sm">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
