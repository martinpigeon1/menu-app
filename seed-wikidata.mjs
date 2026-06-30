/**
 * seed-wikidata.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Complète la table `paintings` de Supabase à partir de Wikidata, en
 * utilisant des requêtes SPARQL structurées plutôt qu'une recherche par
 * mot-clé.
 *
 * POURQUOI WIKIDATA EST DIFFÉRENT (et meilleur sur ce point précis) :
 * Le Met et l'ARTIC n'ont pas de champ "mouvement artistique" fiable —
 * on devait deviner via une recherche textuelle + une fenêtre d'années
 * plausible, ce qui génère du bruit. Wikidata a une propriété DÉDIÉE :
 *   P135 = "mouvement" (movement)
 * On peut donc interroger très précisément : "donne-moi toutes les
 * peintures dont P135 = Cubisme (Q39427)". Beaucoup plus fiable.
 *
 * Propriétés Wikidata utilisées :
 *   P31  = instance of (filtré sur Q3305213 = "peinture")
 *   P135 = mouvement artistique
 *   P170 = créateur / artiste
 *   P571 = date de création (inception)
 *   P18  = image (nom de fichier Wikimedia Commons)
 *
 * IMPORTANT - images via Wikimedia Commons :
 * P18 renvoie un NOM DE FICHIER Commons (ex: "Mona Lisa.jpg"), pas une
 * URL. Il faut le transformer en URL Special:FilePath, qui redirige
 * vers le fichier réel sur upload.wikimedia.org. Format utilisé ici :
 *   https://commons.wikimedia.org/wiki/Special:FilePath/<nom_fichier>?width=900
 *
 * USAGE (dans Claude Code Web) :
 *   NODE_USE_ENV_PROXY=1 node seed-wikidata.mjs
 *
 * Variables d'environnement requises (mêmes que les scripts précédents) :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Étiquette de bonne conduite : l'endpoint SPARQL public de Wikidata
 * (query.wikidata.org) demande un user-agent identifiable et un rythme
 * de requêtes raisonnable -> délai de 1000ms entre les appels.
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

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "ArtQuizPaintingSeedScript/1.0 (educational hobby project)";

// QID Wikidata = "instance of" painting
const PAINTING_QID = "Q3305213";

// Mouvement -> QID Wikidata + libellé français.
// Ces QID correspondent aux pages Wikidata de chaque mouvement pictural ;
// à vérifier/ajuster si un mouvement renvoie 0 résultat (le QID peut
// pointer vers un concept trop large ou trop étroit).
const MOVEMENTS = [
  { qid: "Q42934", fr: "Cubisme" },
  { qid: "Q39427", fr: "Surréalisme" },
  { qid: "Q177725", fr: "Expressionnisme abstrait" },
  { qid: "Q134147", fr: "Pop Art" },
  { qid: "Q166593", fr: "Fauvisme" },
  { qid: "Q80113", fr: "Expressionnisme" },
  { qid: "Q34636", fr: "Art Nouveau" },
  { qid: "Q200034", fr: "Pointillisme" },
  { qid: "Q131221", fr: "Futurisme" },
  { qid: "Q207445", fr: "De Stijl" },
  { qid: "Q40415", fr: "Impressionnisme" },
  { qid: "Q166713", fr: "Post-impressionnisme" },
  { qid: "Q37068", fr: "Romantisme" },
  { qid: "Q10857409", fr: "Réalisme" },
  { qid: "Q164800", fr: "Symbolisme" },
  { qid: "Q281108", fr: "Naïf" },
  { qid: "Q173782", fr: "Art déco" },
  { qid: "Q191970", fr: "Suprématisme" },
  { qid: "Q207103", fr: "Constructivisme" },
  { qid: "Q273506", fr: "École de Paris" },
];

const DELAY_MS = 1000;
const LIMIT_PER_MOVEMENT = 100;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function buildQuery(movementQid) {
  return `
    SELECT ?item ?itemLabel ?creatorLabel ?inception ?image WHERE {
      ?item wdt:P31 wd:${PAINTING_QID}.
      ?item wdt:P135 wd:${movementQid}.
      ?item wdt:P571 ?inception.
      ?item wdt:P18 ?image.
      OPTIONAL { ?item wdt:P170 ?creator. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    }
    LIMIT ${LIMIT_PER_MOVEMENT}
  `;
}

async function runSparql(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) {
    throw new Error(`SPARQL échoué: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.results.bindings;
}

// Extrait le nom de fichier Commons depuis l'URL renvoyée par P18
// (Wikidata renvoie une URL Special:FilePath complète, pas juste un nom)
function buildCommonsImageUrl(imageUrl) {
  if (!imageUrl) return null;
  // L'URL Wikidata est déjà de la forme :
  // http://commons.wikimedia.org/wiki/Special:FilePath/Nom%20du%20fichier.jpg
  // On force https et on ajoute une largeur raisonnable pour le jeu.
  const httpsUrl = imageUrl.replace(/^http:/, "https:");
  return httpsUrl.includes("?") ? `${httpsUrl}&width=900` : `${httpsUrl}?width=900`;
}

function extractYear(inceptionStr) {
  if (!inceptionStr) return null;
  const match = inceptionStr.match(/^(-?\d{1,4})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (isNaN(year) || year <= 0) return null; // exclut avant J.-C. pour simplifier
  return year;
}

async function run() {
  const seen = new Set();
  const rows = [];

  for (const movement of MOVEMENTS) {
    console.log(`\n🎨 Requête SPARQL : ${movement.fr} (Q${movement.qid.slice(1)})`);
    await sleep(DELAY_MS);

    let bindings;
    try {
      bindings = await runSparql(buildQuery(movement.qid));
    } catch (err) {
      console.warn(`  ⚠️  Échec requête : ${err.message}`);
      continue;
    }
    console.log(`  → ${bindings.length} résultats bruts`);

    let kept = 0;
    for (const b of bindings) {
      const itemUri = b.item?.value;
      if (!itemUri) continue;
      const wikidataId = itemUri.split("/").pop(); // ex: "Q12418"

      const dedupeKey = `wikidata-${wikidataId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const title = b.itemLabel?.value?.trim();
      if (!title) continue;
      // Quand l'item n'a pas de label fr/en, le service wikibase:label
      // retombe sur le QID lui-même (ex: "Q11953956") -> titre inexploitable
      // pour un quiz, on rejette ces lignes à la source.
      if (/^Q[0-9]+$/.test(title)) continue;

      const year = extractYear(b.inception?.value);
      if (!year) continue;

      const imageUrl = buildCommonsImageUrl(b.image?.value);
      if (!imageUrl) continue;

      const artist = b.creatorLabel?.value?.trim() || "Artiste inconnu";

      rows.push({
        title,
        artist,
        year,
        movement: movement.fr.toLowerCase(),
        movement_fr: movement.fr,
        department: null,
        medium: null,
        culture: null,
        image_url: imageUrl,
        source: "wikidata",
        source_id: wikidataId,
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

  console.log(`\n🎉 Terminé. ${inserted} lignes envoyées à Supabase depuis Wikidata.`);
}

run().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
