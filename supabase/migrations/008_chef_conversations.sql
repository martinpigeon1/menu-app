-- Phase 5: Chef AI meal-planning assistant
-- Run this in the Supabase SQL editor.

-- One conversation per household per week. Messages are stored as a JSONB
-- array of { role, content, timestamp, suggested_recipe_ids? }.
CREATE TABLE IF NOT EXISTS chef_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, week_start)
);

ALTER TABLE chef_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can access their conversations"
  ON chef_conversations FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = auth.uid()
  ));
