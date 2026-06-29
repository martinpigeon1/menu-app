-- Paintings catalogue, seeded from the Met Museum public API.
-- See seed-paintings.mjs at the project root. Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS paintings (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  year INTEGER NOT NULL,
  movement TEXT NOT NULL,
  movement_fr TEXT NOT NULL,
  department TEXT,
  medium TEXT,
  culture TEXT,
  image_url TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Allows the seed script to re-run via upsert without creating duplicates.
  CONSTRAINT unique_source_painting UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS paintings_movement_fr_idx ON paintings (movement_fr);
CREATE INDEX IF NOT EXISTS paintings_year_idx ON paintings (year);

ALTER TABLE paintings ENABLE ROW LEVEL SECURITY;

-- Public catalogue: anyone may read. Writes go through the service-role key
-- (seed script), which bypasses RLS.
CREATE POLICY "Public read" ON paintings
  FOR SELECT USING (true);
