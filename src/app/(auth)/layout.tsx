// Layout centré pour les pages d'authentification
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / titre de l'application */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-600">Menu App</h1>
          <p className="text-gray-500 mt-1 text-sm">Gestion de menus familiaux</p>
        </div>
        {children}
      </div>
    </div>
  )
}
