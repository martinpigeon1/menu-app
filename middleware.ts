// Middleware Next.js : protection des routes et rafraîchissement des sessions Supabase
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const { pathname } = request.nextUrl

  // Routes publiques (pas besoin d'authentification)
  // /peintures : jeu « Devine le mouvement », ouvert à tous (catalogue en lecture publique).
  const publicRoutes = ['/login', '/signup', '/peintures']
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  // Rediriger vers /login si l'utilisateur n'est pas connecté et la route est protégée
  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Rediriger vers / si l'utilisateur est déjà connecté et tente d'accéder aux pages auth.
  // (On ne redirige PAS depuis /peintures : le jeu reste accessible une fois connecté.)
  const authRoutes = ['/login', '/signup']
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))
  if (user && isAuthRoute) {
    const homeUrl = new URL('/', request.url)
    return NextResponse.redirect(homeUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Exclure les fichiers statiques et les routes API internes Next.js
     * Appliquer le middleware sur toutes les autres routes
     */
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
