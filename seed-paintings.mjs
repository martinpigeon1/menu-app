/**
 * seed-paintings.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Peuple la table `paintings` de Supabase à partir de l'API publique
 * du Metropolitan Museum of Art (https://metmuseum.github.io/).
 *
 * USAGE (dans Claude Code Web, terminal du projet) :
 *   1. npm install @supabase/supabase-js
 *   2. Renseigner les variables d'environnement (voir bas de fichier)
 *   3. node seed-paintings.mjs
 *
 * Le script :
 *  - interroge l'API du Met PAR MOUVEMENT (recherche par mot-clé),
 *    car le Met n'a pas de champ "movement" fiable et structuré
 *  - récupère les objectIDs candidats, puis le détail de chacun
 *  - filtre : doit avoir une image, une date exploitable (année unique
 *    ou plage resserrée), et être classifié "Paintings"
 *  - normalise la date -> année unique (milieu de plage si intervalle)
 *  - normalise le mouvement -> libellé français
 *  - insère par lots de 50 dans Supabase, en évitant les doublons
 *    (basé sur source + source_id)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

// ── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "❌ Variables manquantes. Définis SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY avant de lancer le script."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";

// Mouvement (clé recherche Met) -> libellé français + bornes d'années
// plausibles pour valider les résultats (filtre anti-bruit).
const MOVEMENTS = [
  { query: "impressionist", fr: "Impressionnisme", yearMin: 1860, yearMax: 1900 },
  { query: "post-impressionist", fr: "Post-impressionnisme", yearMin: 1880, yearMax: 1910 },
  { query: "baroque", fr: "Baroque", yearMin: 1580, yearMax: 1730 },
  { query: "renaissance", fr: "Renaissance", yearMin: 1400, yearMax: 1600 },
  { query: "romanticism", fr: "Romantisme", yearMin: 1780, yearMax: 1850 },
  { query: "realism", fr: "Réalisme", yearMin: 1840, yearMax: 1880 },
  { query: "neoclassical", fr: "Néoclassicisme", yearMin: 1750, yearMax: 1830 },
  { query: "rococo", fr: "Rococo", yearMin: 1700, yearMax: 1780 },
  { query: "cubist", fr: "Cubisme", yearMin: 1905, yearMax: 1925 },
  { query: "surrealist", fr: "Surréalisme", yearMin: 1920, yearMax: 1950 },
  { query: "expressionist", fr: "Expressionnisme", yearMin: 1900, yearMax: 1940 },
  { query: "fauvism", fr: "Fauvisme", yearMin: 1904, yearMax: 1910 },
  { query: "abstract expressionist", fr: "Expressionnisme abstrait", yearMin: 1940, yearMax: 1965 },
  { query: "pop art", fr: "Pop Art", yearMin: 1955, yearMax: 1975 },
  { query: "dutch golden age", fr: "Âge d'or néerlandais", yearMin: 1580, yearMax: 1700 },
  { query: "gothic", fr: "Gothique", yearMin: 1200, yearMax: 1420 },
  { query: "mannerist", fr: "Maniérisme", yearMin: 1520, yearMax: 1590 },
  { query: "ukiyo-e", fr: "Ukiyo-e", yearMin: 1650, yearMax: 1900 },
  { query: "pointillist", fr: "Pointillisme", yearMin: 1884, yearMax: 1900 },
  { query: "art nouveau", fr: "Art Nouveau", yearMin: 1890, yearMax: 1910 },
];

const DELAY_MS = 150; // pour ne pas surcharger l'API publique du Met
const MAX_PER_MOVEMENT = 80; // plafond d'objets DÉTAILLÉS interrogés par mouvement

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Extrait une année unique exploitable depuis les champs de date du Met.
// Le Met fournit objectBeginDate / objectEndDate (entiers) qui sont plus
// fiables que la chaîne libre objectDate.
function extractYear(obj) {
  const begin = obj.objectBeginDate;
  const end = obj.objectEndDate;
  if (typeof begin !== "number" || typeof end !== "number") return null;
  if (begin <= 0 || end <= 0) return null; // exclut "avant J.-C." pour simplifier
  // Si la plage est trop large (> 40 ans), la donnée est trop vague
  // pour un jeu qui demande une décennie précise -> on rejette.
  if (end - begin > 40) return null;
  return Math.round((begin + end) / 2);
}

async function fetchSearchIds(query) {
  const url = `${MET_BASE}/search?q=${encodeURIComponent(
    query
  )}&hasImages=true&medium=Paintings`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed for "${query}": ${res.status}`);
  const data = await res.json();
  return data.objectIDs || [];
}

async function fetchObject(id) {
  const res = await fetch(`${MET_BASE}/objects/${id}`);
  if (!res.ok) return null;
  return res.json();
}

async function run() {
  const seen = new Set(); // dédoublonnage cross-mouvement par objectID
  const rows = [];

  for (const movement of MOVEMENTS) {
    console.log(`\n🎨 Recherche : ${movement.fr} ("${movement.query}")`);
    let ids;
    try {
      ids = await fetchSearchIds(movement.query);
    } catch (err) {
      console.warn(`  ⚠️  Échec recherche : ${err.message}`);
      continue;
    }
    console.log(`  → ${ids.length} résultats bruts, on en détaille jusqu'à ${MAX_PER_MOVEMENT}`);

    let kept = 0;
    for (const id of ids.slice(0, MAX_PER_MOVEMENT)) {
      if (seen.has(id)) continue;
      seen.add(id);

      await sleep(DELAY_MS);
      let obj;
      try {
        obj = await fetchObject(id);
      } catch {
        continue;
      }
      if (!obj) continue;

      // Filtres qualité
      if (!obj.primaryImage) continue;
      if (!obj.isPublicDomain) continue;
      if (!obj.title || obj.title.trim() === "") continue;

      const year = extractYear(obj);
      if (!year) continue;
      if (year < movement.yearMin - 10 || year > movement.yearMax + 10) continue; // anti-bruit

      const artist =
        obj.artistDisplayName && obj.artistDisplayName.trim() !== ""
          ? obj.artistDisplayName.trim()
          : "Artiste inconnu";

      rows.push({
        title: obj.title.trim(),
        artist,
        year,
        movement: movement.query,
        movement_fr: movement.fr,
        department: obj.department || null,
        medium: obj.medium || null,
        culture: obj.culture || null,
        image_url: obj.primaryImage,
        source: "met",
        source_id: String(obj.objectID),
      });
      kept++;
    }
    console.log(`  ✅ ${kept} œuvres retenues pour ${movement.fr}`);
  }

  console.log(`\n📦 Total avant insertion : ${rows.length} œuvres`);

  // Insertion par lots de 50, upsert sur (source, source_id) pour
  // pouvoir relancer le script sans dupliquer.
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from("paintings")
      .upsert(batch, { onConflict: "source,source_id", count: "exact" });
    if (error) {
      console.error(`  ❌ Erreur insertion lot ${i / BATCH + 1}:`, error.message);
      continue;
    }
    inserted += batch.length;
    console.log(`  💾 Lot ${i / BATCH + 1} inséré (${batch.length} lignes)`);
  }

  console.log(`\n🎉 Terminé. ${inserted} lignes envoyées à Supabase.`);
}

run().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
