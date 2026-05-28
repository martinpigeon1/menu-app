-- Correction de la récursion infinie dans les politiques RLS
--
-- Cause : les politiques sur household_members et households requêtaient
-- household_members directement, déclenchant leurs propres politiques en boucle.
--
-- Solution : une fonction SECURITY DEFINER qui lit household_members en
-- bypassant le RLS (exécutée en tant que propriétaire de la fonction, pas
-- en tant qu'utilisateur courant). Toutes les politiques utilisent ensuite
-- cette fonction au lieu de sous-requêtes directes.

-- ─────────────────────────────────────────────────────────────
-- 1. FONCTIONS SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────

-- Retourne les household_ids de l'utilisateur courant, sans passer par le RLS
CREATE OR REPLACE FUNCTION get_user_household_ids()
  RETURNS SETOF UUID
  LANGUAGE SQL
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = auth.uid();
$$;

-- Vérifie si l'utilisateur courant est admin d'un foyer donné
CREATE OR REPLACE FUNCTION is_household_admin(p_household_id UUID)
  RETURNS BOOLEAN
  LANGUAGE SQL
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. SUPPRESSION DES ANCIENNES POLITIQUES (migrations 001 + 002)
-- ─────────────────────────────────────────────────────────────

-- household_members
DROP POLICY IF EXISTS "Membres peuvent voir leur household"               ON household_members;
DROP POLICY IF EXISTS "Admin peut gérer les membres"                      ON household_members;
DROP POLICY IF EXISTS "Utilisateurs peuvent s'ajouter à un foyer"         ON household_members;

-- households
DROP POLICY IF EXISTS "Membres peuvent voir leur household"               ON households;
DROP POLICY IF EXISTS "Utilisateurs authentifiés peuvent créer un foyer"  ON households;

-- recipes
DROP POLICY IF EXISTS "Membres peuvent voir les recettes de leur household" ON recipes;
DROP POLICY IF EXISTS "Membres peuvent ajouter des recettes"               ON recipes;
DROP POLICY IF EXISTS "Membres peuvent modifier les recettes"              ON recipes;
DROP POLICY IF EXISTS "Membres peuvent supprimer les recettes"             ON recipes;

-- ─────────────────────────────────────────────────────────────
-- 3. NOUVELLES POLITIQUES (utilisent les fonctions SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

-- household_members
-- SELECT : un membre voit tous les membres de ses foyers
CREATE POLICY "Membres peuvent voir les membres de leur foyer"
  ON household_members FOR SELECT
  USING (household_id = ANY(get_user_household_ids()));

-- INSERT : un utilisateur peut s'ajouter lui-même (onboarding)
--          un admin peut ajouter d'autres utilisateurs
CREATE POLICY "Utilisateurs peuvent s'ajouter à un foyer"
  ON household_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_household_admin(household_id)
  );

-- UPDATE / DELETE : réservé aux admins
CREATE POLICY "Admin peut modifier les membres"
  ON household_members FOR UPDATE
  USING (is_household_admin(household_id));

CREATE POLICY "Admin peut supprimer des membres"
  ON household_members FOR DELETE
  USING (is_household_admin(household_id));

-- households
-- INSERT : tout utilisateur authentifié peut créer un foyer
CREATE POLICY "Utilisateurs authentifiés peuvent créer un foyer"
  ON households FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT : un membre voit son foyer
CREATE POLICY "Membres peuvent voir leur foyer"
  ON households FOR SELECT
  USING (id = ANY(get_user_household_ids()));

-- UPDATE : réservé aux admins
CREATE POLICY "Admin peut modifier le foyer"
  ON households FOR UPDATE
  USING (is_household_admin(id));

-- recipes
CREATE POLICY "Membres peuvent voir les recettes"
  ON recipes FOR SELECT
  USING (household_id = ANY(get_user_household_ids()));

CREATE POLICY "Membres peuvent ajouter des recettes"
  ON recipes FOR INSERT
  WITH CHECK (household_id = ANY(get_user_household_ids()));

CREATE POLICY "Membres peuvent modifier les recettes"
  ON recipes FOR UPDATE
  USING (household_id = ANY(get_user_household_ids()));

CREATE POLICY "Membres peuvent supprimer les recettes"
  ON recipes FOR DELETE
  USING (household_id = ANY(get_user_household_ids()));
