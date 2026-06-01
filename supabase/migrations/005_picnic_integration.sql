-- Phase 4: Picnic integration
-- Run this in the Supabase SQL editor.

-- 1. Picnic credentials per household.
--    We store the auth key returned by Picnic after login — NEVER the password.
--    The `email` column is kept only to display which account is connected.
CREATE TABLE IF NOT EXISTS picnic_credentials (
  household_id UUID PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  email TEXT,
  auth_key TEXT NOT NULL, -- stored after first login, not the password
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE picnic_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household admins can manage picnic credentials"
  ON picnic_credentials FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));

-- 2. Ingredient -> Picnic product mapping (remembered choices).
CREATE TABLE IF NOT EXISTS picnic_ingredient_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_name TEXT NOT NULL, -- normalized lowercase, e.g. "courgette"
  picnic_product_id TEXT NOT NULL,
  picnic_product_name TEXT NOT NULL,
  picnic_product_image_url TEXT,
  remembered BOOLEAN DEFAULT false, -- if true, skip review next time
  last_used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, ingredient_name)
);

ALTER TABLE picnic_ingredient_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can manage mappings"
  ON picnic_ingredient_mappings FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));
