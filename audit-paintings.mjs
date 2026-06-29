/**
 * audit-paintings.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Script de DIAGNOSTIC uniquement — ne modifie rien dans la base.
 * Donne deux choses :
 *
 * 1. RÉPARTITION : nombre d'œuvres par mouvement_fr (+ par source),
 *    triée du plus grand au plus petit, pour repérer les mouvements
 *    trop riches (à plafonner) ou trop pauvres (à enrichir ou fusionner).
 *
 * 2. ÉCHANTILLON DE CONTRÔLE : pour chaque mouvement, tire 5 œuvres au
 *    hasard (titre + artiste + année + source) à vérifier manuellement.
 *    L'objectif n'est pas l'exhaustivité mais un signal rapide :
 *    si sur 5 œuvres tirées une saute aux yeux comme mal classée,
 *    ça vaut le coup d'auditer ce mouvement plus en profondeur.
 *
 * USAGE (Claude Code Web) :
 *   NODE_USE_ENV_PROXY=1 node audit-paintings.mjs
 * ─────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Variables manquantes (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const SAMPLE_SIZE = 5;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function run() {
  // 1. Récupère TOUTES les lignes (titre, artiste, année, mouvement, source)
  //    Pour 1283 lignes c'est largement gérable en une seule requête.
  const { data, error } = await supabase
    .from("paintings")
    .select("title, artist, year, movement_fr, source");

  if (error) {
    console.error("❌ Erreur de lecture Supabase:", error.message);
    process.exit(1);
  }

  console.log(`📦 ${data.length} œuvres au total dans la table.\n`);

  // 2. Groupe par mouvement
  const byMovement = {};
  for (const row of data) {
    const key = row.movement_fr || "(non classé)";
    if (!byMovement[key]) byMovement[key] = [];
    byMovement[key].push(row);
  }

  const movements = Object.keys(byMovement).sort(
    (a, b) => byMovement[b].length - byMovement[a].length
  );

  // 3. Affiche la répartition globale
  console.log("═══════════════════════════════════════════════");
  console.log("RÉPARTITION PAR MOUVEMENT");
  console.log("═══════════════════════════════════════════════");
  console.log(`Nombre total de mouvements distincts : ${movements.length}\n`);

  for (const m of movements) {
    const rows = byMovement[m];
    const sources = {};
    for (const r of rows) {
      sources[r.source] = (sources[r.source] || 0) + 1;
    }
    const sourceStr = Object.entries(sources)
      .map(([s, n]) => `${s}:${n}`)
      .join(", ");
    console.log(`${String(rows.length).padStart(4)} — ${m}  (${sourceStr})`);
  }

  // 4. Échantillon de contrôle par mouvement
  console.log("\n═══════════════════════════════════════════════");
  console.log(`ÉCHANTILLON DE CONTRÔLE (${SAMPLE_SIZE} œuvres au hasard / mouvement)`);
  console.log("═══════════════════════════════════════════════");

  for (const m of movements) {
    const sample = shuffle(byMovement[m]).slice(0, SAMPLE_SIZE);
    console.log(`\n🎨 ${m} (${byMovement[m].length} œuvres au total)`);
    for (const s of sample) {
      console.log(`   • "${s.title}" — ${s.artist} (${s.year}) [${s.source}]`);
    }
  }

  console.log("\n✅ Audit terminé. Aucune donnée modifiée.");
}

run().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
