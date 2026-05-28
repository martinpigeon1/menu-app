-- Ajout de la colonne author pour stocker le champ "Auteur" du TSV
-- indépendamment de source_book (qui peut être un titre de livre ou une URL non-http)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS author TEXT;
