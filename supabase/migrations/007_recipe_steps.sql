-- Phase 3: recipe instructions (steps)
-- Run this in the Supabase SQL editor.

-- 1. Recipe steps.
--    Ingredient quantities inside `text` are wrapped in [[value]] placeholders
--    so the UI can scale them to the current serving size at render time.
--    e.g. "Ajoutez [[6]] œufs et [[200]]g de chocolat"
--    Thermomix parameters (times, speeds, temperatures) are NEVER wrapped:
--    "Mixez 6 minutes/vitesse 3" stays literal.
CREATE TABLE IF NOT EXISTS recipe_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recipe_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can access steps"
  ON recipe_steps FOR ALL
  USING (
    recipe_id IN (
      SELECT r.id FROM recipes r
      JOIN household_members hm ON hm.household_id = r.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

-- Fast lookup of steps for a recipe, already ordered.
CREATE INDEX IF NOT EXISTS recipe_steps_recipe_id_step_number_idx
  ON recipe_steps (recipe_id, step_number);

-- 2. Cooking time on the recipe (preparation time already exists).
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cook_time_minutes INTEGER;
