-- Migration initiale : schéma de base pour l'application menu-app

-- Table des foyers (households)
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Membres des foyers (lien entre auth.users et households)
CREATE TABLE household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  PRIMARY KEY (household_id, user_id)
);

-- Recettes
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT CHECK (source IN ('livre', 'site', 'autre')),
  source_url TEXT,
  source_book TEXT,
  source_page INTEGER,
  type TEXT NOT NULL CHECK (type IN ('Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert')),
  rating SMALLINT CHECK (rating >= 0 AND rating <= 5),
  prep_time_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Activation de la sécurité au niveau des lignes (RLS)
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Politiques pour household_members
CREATE POLICY "Membres peuvent voir leur household"
  ON household_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin peut gérer les membres"
  ON household_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = household_members.household_id
        AND hm.user_id = auth.uid()
        AND hm.role = 'admin'
    )
  );

-- Politiques pour households
CREATE POLICY "Membres peuvent voir leur household"
  ON households FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = households.id
        AND hm.user_id = auth.uid()
    )
  );

-- Politiques pour recipes
CREATE POLICY "Membres peuvent voir les recettes de leur household"
  ON recipes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Membres peuvent ajouter des recettes"
  ON recipes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Membres peuvent modifier les recettes"
  ON recipes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Membres peuvent supprimer les recettes"
  ON recipes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM household_members hm
      WHERE hm.household_id = recipes.household_id
        AND hm.user_id = auth.uid()
    )
  );
