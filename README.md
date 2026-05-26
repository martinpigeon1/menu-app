# Menu App

Application de gestion de menus familiaux. Enregistrez vos recettes, notez-les, filtrez-les et importez-les depuis un fichier TSV.

## Prérequis

- Node.js 18+
- Compte [Supabase](https://supabase.com)
- Compte [Vercel](https://vercel.com) (pour le déploiement)

## Installation locale

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd menu-app

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local et renseigner les valeurs Supabase

# 4. Lancer le serveur de développement
npm run dev
```

L'application sera disponible sur [http://localhost:3000](http://localhost:3000).

## Configuration Supabase

1. Créer un nouveau projet sur [supabase.com](https://supabase.com)
2. Dans **SQL Editor**, exécuter le contenu de `supabase/migrations/001_initial_schema.sql`
3. Dans **Authentication > Providers**, vérifier que l'authentification par email est activée
4. Dans **Project Settings > API**, copier :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Déploiement sur Vercel

1. Connecter le dépôt GitHub à Vercel
2. Ajouter les trois variables d'environnement dans les paramètres du projet
3. Déployer (Vercel détecte automatiquement Next.js)

## Import de recettes (TSV)

Le bouton **Importer TSV** accepte un fichier `.tsv` avec des colonnes séparées par des tabulations.

En-têtes reconnus (noms flexibles) :

| En-tête TSV | Champ |
|---|---|
| `Nom` ou `name` | Nom de la recette (obligatoire) |
| `Type` ou `type` | Type : Plat, Salade, Soupe, Entrée, Accompagnement, Dessert |
| `Source` ou `source` | Source : livre, site, autre |
| `URL` ou `source_url` | URL de la recette en ligne |
| `Livre` ou `source_book` | Titre du livre |
| `Page` ou `source_page` | Numéro de page |
| `Note` ou `rating` | Note de 0 à 5 |
| `Temps` ou `prep_time_minutes` | Temps de préparation en minutes |
| `Notes` | Remarques libres |

Exemple de fichier TSV :

```
Nom	Type	Source	Note	Temps
Ratatouille	Plat	autre	4	45
Tarte aux pommes	Dessert	livre	5	60
Salade niçoise	Salade	site	3	20
```

## Structure du projet

```
menu-app/
├── src/
│   ├── app/
│   │   ├── (auth)/          # Pages login et signup
│   │   ├── (app)/           # Pages protégées (recettes)
│   │   │   ├── page.tsx     # Liste des recettes
│   │   │   └── recettes/
│   │   │       ├── nouvelle/   # Formulaire d'ajout
│   │   │       └── [id]/       # Détail / édition
│   │   └── api/
│   │       └── recipes/import/ # API import TSV
│   ├── components/ui/       # Composants réutilisables
│   ├── lib/supabase/        # Clients Supabase (browser, server, middleware)
│   └── types/               # Types TypeScript
├── public/
│   ├── manifest.json        # Configuration PWA
│   └── icons/               # Icônes de l'application
└── supabase/
    └── migrations/          # Schéma SQL
```

## PWA (Progressive Web App)

L'application peut être installée sur mobile. Remplacer les fichiers dans `public/icons/` par de vraies icônes PNG :
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

Outil recommandé : [realfavicongenerator.net](https://realfavicongenerator.net)
