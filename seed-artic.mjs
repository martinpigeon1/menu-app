/**
 * seed-artic.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Complète la table `paintings` de Supabase avec des œuvres de
 * l'Art Institute of Chicago (https://api.artic.edu).
 *
 * Pourquoi une deuxième source : le Met (seed-paintings.mjs) couvre très
 * bien l'art ancien (Renaissance, Baroque, Âge d'or néerlandais) mais a
 * peu d'œuvres modernes en domaine public avec une date resserrée.
 * L'ARTIC a une meilleure couverture sur le Cubisme, l'Expressionnisme
 * abstrait, le Pop Art, le Surréalisme, etc.
 *
 * USAGE (dans Claude Code Web) :
 *   NODE_USE_ENV_PROXY=1 node seed-artic.mjs
 *
 * Variables d'environnement requises (mêmes que seed-paintings.mjs) :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Particularités de l'API ARTIC vs Met :
 *  - Pas de clé API nécessaire
 *  - Limite de scraping demandée par ARTIC : 1 requête/seconde MAX
 *    (voir https://api.artic.edu/docs/) -> on respecte un délai de 1100ms
 *  - Les images ne sont pas une URL directe : il faut construire l'URL
 *    IIIF à partir de `image_id` + `config.iiif_url`
 *  - Le champ `date_start`/`date_end` est plus fiable que `date_display`
 *    (texte libre type "early 17th century")
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

const ARTIC_BASE = "https://api.artic.edu/api/v1";
const FIELDS = [
  "id",
  "title",
  "artist_display",
  "date_start",
  "date_end",
  "date_display",
  "style_title",
  "classification_titles",
  "department_title",
  "medium_display",
  "is_public_domain",
  "image_id",
].join(",");

// Mouvements ciblés en priorité : ceux qui étaient à 0 ou faibles après
// le passage du Met. On garde aussi quelques mouvements anciens pour
// renforcer la diversité (artistes différents du Met).
const MOVEMENTS = [
  { query: "cubism", fr: "Cubisme", yearMin: 1905, yearMax: 1925 },
  { query: "surrealism", fr: "Surréalisme", yearMin: 1920, yearMax: 1950 },
  { query: "abstract expressionism", fr: "Expressionnisme abstrait", yearMin: 1940, yearMax: 1965 },
  { query: "pop art", fr: "Pop Art", yearMin: 1955, yearMax: 1975 },
  { query: "fauvism", fr: "Fauvisme", yearMin: 1904, yearMax: 1910 },
  { query: "expressionism", fr: "Expressionnisme", yearMin: 1900, yearMax: 1940 },
  { query: "art nouveau", fr: "Art Nouveau", yearMin: 1890, yearMax: 1910 },
  { query: "pointillism", fr: "Pointillisme", yearMin: 1884, yearMax: 1900 },
  { query: "minimalism", fr: "Minimalisme", yearMin: 1960, yearMax: 1980 },
  { query: "futurism", fr: "Futurisme", yearMin: 1909, yearMax: 1925 },
  { query: "de stijl", fr: "De Stijl", yearMin: 1917, yearMax: 1935 },
  { query: "ashcan school", fr: "Ashcan School", yearMin: 1900, yearMax: 1920 },
  { query: "impressionism", fr: "Impressionnisme", yearMin: 1860, yearMax: 1900 },
  { query: "post-impressionism", fr: "Post-impressionnisme", yearMin: 1880, yearMax: 1910 },
  { query: "romanticism", fr: "Romantisme", yearMin: 1780, yearMax: 1850 },
  { query: "realism", fr: "Réalisme", yearMin: 1840, yearMax: 1880 },
];

const DELAY_MS = 1100; // ARTIC demande max 1 req/s -> marge de sécurité
const MAX_PER_MOVEMENT = 60;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function extractYear(art) {
  const begin = art.date_start;
  const end = art.date_end;
  if (typeof begin !== "number" || typeof end !== "number") return null;
  if (begin <= 0 || end <= 0) return null;
  if (end - begin > 40) return null;
  return Math.round((begin + end) / 2);
}

function buildImageUrl(imageId, iiifBaseUrl) {
  if (!imageId) return null;
  // Format standard IIIF de l'ARTIC, résolution raisonnable pour le jeu
  return `${iiifBaseUrl}/${imageId}/full/843,/0/default.jpg`;
}

async function fetchConfig() {
  // Le endpoint racine expose config.iiif_url, nécessaire pour
  // construire les URLs d'images.
  const res = await fetch(`${ARTIC_BASE}/artworks?limit=1`);
  if (!res.ok) throw new Error(`Impossible de récupérer la config ARTIC: ${res.status}`);
  const data = await res.json();
  return data.config.iiif_url;
}

async function searchMovement(query) {
  const url = `${ARTIC_BASE}/artworks/search?q=${encodeURIComponent(
    query
  )}&query[term][is_public_domain]=true&fields=${FIELDS}&limit=${MAX_PER_MOVEMENT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Recherche échouée pour "${query}": ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

async function run() {
  console.log("🔧 Récupération de la config IIIF...");
  const iiifUrl = await fetchConfig();
  console.log(`  → ${iiifUrl}`);

  const seen = new Set();
  const rows = [];

  for (const movement of MOVEMENTS) {
    console.log(`\n🎨 Recherche : ${movement.fr} ("${movement.query}")`);
    await sleep(DELAY_MS);

    let artworks;
    try {
      artworks = await searchMovement(movement.query);
    } catch (err) {
      console.warn(`  ⚠️  Échec recherche : ${err.message}`);
      continue;
    }
    console.log(`  → ${artworks.length} résultats bruts`);

    let kept = 0;
    for (const art of artworks) {
      const dedupeKey = `artic-${art.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (!art.is_public_domain) continue;
      if (!art.image_id) continue; // pas d'image exploitable
      if (!art.title || art.title.trim() === "") continue;

      const year = extractYear(art);
      if (!year) continue;
      if (year < movement.yearMin - 10 || year > movement.yearMax + 10) continue;

      const imageUrl = buildImageUrl(art.image_id, iiifUrl);
      if (!imageUrl) continue;

      const artist =
        art.artist_display && art.artist_display.trim() !== ""
          ? art.artist_display.split("\n")[0].trim() // 1ère ligne = nom principal
          : "Artiste inconnu";

      rows.push({
        title: art.title.trim(),
        artist,
        year,
        movement: movement.query,
        movement_fr: movement.fr,
        department: art.department_title || null,
        medium: art.medium_display || null,
        culture: null,
        image_url: imageUrl,
        source: "artic",
        source_id: String(art.id),
      });
      kept++;
    }
    console.log(`  ✅ ${kept} œuvres retenues pour ${movement.fr}`);
  }

  console.log(`\n📦 Total avant insertion : ${rows.length} œuvres`);

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("paintings")
      .upsert(batch, { onConflict: "source,source_id" });
    if (error) {
      console.error(`  ❌ Erreur insertion lot ${i / BATCH + 1}:`, error.message);
      continue;
    }
    inserted += batch.length;
    console.log(`  💾 Lot ${i / BATCH + 1} inséré (${batch.length} lignes)`);
  }

  console.log(`\n🎉 Terminé. ${inserted} lignes envoyées à Supabase depuis ARTIC.`);
}

run().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
