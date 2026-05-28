import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from './LogoutButton'
import BottomNav from '@/components/ui/BottomNav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Redirection si l'utilisateur n'est pas connecté
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold text-green-600">Menu App</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:block truncate max-w-[150px]">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {children}
      </main>

      <BottomNav />
    </div>
  )
}
