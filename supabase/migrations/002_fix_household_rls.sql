-- Correction des politiques RLS pour la création de foyer (onboarding)
--
-- Problème : un nouvel utilisateur ne peut pas créer de foyer car :
--   1. La table households n'a pas de politique INSERT
--   2. household_members bloque l'ajout initial car l'utilisateur n'est pas encore membre
--
-- Solution : autoriser tout utilisateur authentifié à créer un foyer et à s'y ajouter.

-- Tout utilisateur authentifié peut créer un foyer
CREATE POLICY "Utilisateurs authentifiés peuvent créer un foyer"
  ON households FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Un utilisateur peut s'ajouter lui-même à un foyer (onboarding initial)
-- La contrainte user_id = auth.uid() empêche d'ajouter d'autres utilisateurs
CREATE POLICY "Utilisateurs peuvent s'ajouter à un foyer"
  ON household_members FOR INSERT
  WITH CHECK (user_id = auth.uid());
