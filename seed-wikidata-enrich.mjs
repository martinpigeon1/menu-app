/**
 * seed-wikidata-enrich.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Seed CIBLÉ pour renforcer les mouvements sous-représentés repérés lors
 * de l'audit (Pop Art, Expressionnisme abstrait, Rococo, Surréalisme,
 * Baroque, Gothique, De Stijl, Futurisme, Renaissance).
 *
 * LEÇON DE L'INCIDENT PRÉCÉDENT :
 * Le premier seed-wikidata.mjs utilisait des QID écrits de mémoire, dont
 * plusieurs étaient faux (ex: QID "Surréalisme" pointait en fait vers
 * "Emma Watson"). Comme un QID invalide ne plante pas la requête — il
 * renvoie juste d'autres résultats — l'erreur est passée inaperçue
 * jusqu'à l'audit manuel.
 *
 * CORRECTION DE PROCESSUS dans ce script : une étape de VÉRIFICATION
 * tourne AVANT toute insertion. Pour chaque QID candidat, le script
 * interroge Wikidata pour récupérer le LABEL réel associé à ce QID et
 * l'affiche. Le script s'arrête et demande confirmation explicite si un
 * label ne correspond pas au mouvement attendu, AU LIEU d'insérer en
 * silence.
 *
 * USAGE (Claude Code Web) :
 *   Étape 1 (vérification seule, n'écrit rien) :
 *     NODE_USE_ENV_PROXY=1 node seed-wikidata-enrich.mjs --verify-only
 *
 *   Étape 2 (une fois les QID confirmés corrects) :
 *     NODE_USE_ENV_PROXY=1 node seed-wikidata-enrich.mjs
 *
 * Variables d'environnement requises : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VERIFY_ONLY = process.argv.includes("--verify-only");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Variables manquantes (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "ArtQuizPaintingSeedScript/1.1 (educational hobby project)";
const PAINTING_QID = "Q3305213";

// QID candidats pour les mouvements sous-représentés.
// expectedLabelContains : mot-clé attendu dans le label FR/EN du QID,
// utilisé pour l'auto-vérification (pas une garantie à 100%, mais un
// filet de sécurité qui aurait attrapé l'incident précédent).
const MOVEMENTS = [
  { qid: "Q134147", fr: "Pop Art", expectedLabelContains: ["pop art"] },
  { qid: "Q177725", fr: "Expressionnisme abstrait", expectedLabelContains: ["abstract expressionism", "expressionnisme abstrait"] },
  { qid: "Q122960", fr: "Rococo", expectedLabelContains: ["rococo"] },
  { qid: "Q39427", fr: "Surréalisme", expectedLabelContains: ["surrealis"] },
  { qid: "Q808561", fr: "Baroque", expectedLabelContains: ["baroque"] },
  { qid: "Q46825", fr: "Gothique", expectedLabelContains: ["gothic"] },
  { qid: "Q207445", fr: "De Stijl", expectedLabelContains: ["de stijl", "neoplastic"] },
  { qid: "Q131221", fr: "Futurisme", expectedLabelContains: ["futuris"] },
  { qid: "Q1474884", fr: "Renaissance", expectedLabelContains: ["renaissance"] },
];

const DELAY_MS = 1000;
const LIMIT_PER_MOVEMENT = 100;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Récupère le label FR/EN officiel d'un QID, pour vérifier qu'il
// correspond bien au mouvement attendu avant de l'utiliser.
async function fetchQidLabel(qid) {
  const query = `
    SELECT ?label WHERE {
      wd:${qid} rdfs:label ?label.
      FILTER(LANG(?label) IN ("fr", "en"))
    }
  `;
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`Échec vérification label pour ${qid}: ${res.status}`);
  const data = await res.json();
  return data.results.bindings.map((b) => b.label.value.toLowerCase());
}

async function verifyAllQids() {
  console.log("🔍 VÉRIFICATION DES QID (aucune écriture en base)\n");
  let allOk = true;

  for (const m of MOVEMENTS) {
    await sleep(DELAY_MS);
    let labels;
    try {
      labels = await fetchQidLabel(m.qid);
    } catch (err) {
      console.log(`❌ ${m.fr} (${m.qid}) — erreur de requête: ${err.message}`);
      allOk = false;
      continue;
    }

    const matches = m.expectedLabelContains.some((expected) =>
      labels.some((label) => label.includes(expected))
    );

    if (matches) {
      console.log(`✅ ${m.fr} (${m.qid}) → labels trouvés: ${labels.join(" / ")}`);
    } else {
      console.log(
        `⚠️  ${m.fr} (${m.qid}) → labels trouvés: ${labels.join(" / ")} — NE CORRESPOND PAS au mot-clé attendu !`
      );
      allOk = false;
    }
  }

  console.log("\n" + "═".repeat(50));
  if (allOk) {
    console.log("✅ Tous les QID sont vérifiés et corrects. Tu peux lancer sans --verify-only.");
  } else {
    console.log("❌ Au moins un QID est suspect. NE PAS lancer le seed avant correction.");
    console.log("   Cherche le bon QID sur https://www.wikidata.org en tapant le nom du mouvement.");
  }
  return allOk;
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
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`SPARQL échoué: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.results.bindings;
}

function buildCommonsImageUrl(imageUrl) {
  if (!imageUrl) return null;
  const httpsUrl = imageUrl.replace(/^http:/, "https:");
  return httpsUrl.includes("?") ? `${httpsUrl}&width=900` : `${httpsUrl}?width=900`;
}

function extractYear(inceptionStr) {
  if (!inceptionStr) return null;
  const match = inceptionStr.match(/^(-?\d{1,4})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (isNaN(year) || year <= 0) return null;
  return year;
}

// Filtre anti-titre-QID, leçon de l'incident précédent (53 lignes
// "Q11953956" insérées car le label n'existait pas en fr/en).
function isUsableTitle(title) {
  if (!title) return false;
  if (/^Q\d+$/.test(title.trim())) return false;
  return true;
}

async function runSeed() {
  const seen = new Set();
  const rows = [];

  for (const movement of MOVEMENTS) {
    console.log(`\n🎨 Enrichissement : ${movement.fr} (${movement.qid})`);
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
      const wikidataId = itemUri.split("/").pop();

      const dedupeKey = `wikidata-${wikidataId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const title = b.itemLabel?.value?.trim();
      if (!isUsableTitle(title)) continue; // filtre anti-QID-en-titre

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

  console.log(`\n🎉 Terminé. ${inserted} lignes envoyées à Supabase.`);
}

async function main() {
  const ok = await verifyAllQids();
  if (VERIFY_ONLY) {
    console.log("\n(Mode --verify-only : aucune insertion effectuée.)");
    return;
  }
  if (!ok) {
    console.log("\n🛑 Insertion annulée : corrige les QID suspects ci-dessus avant de relancer.");
    process.exit(1);
  }
  console.log("\n▶️  Lancement de l'insertion...\n");
  await runSeed();
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
