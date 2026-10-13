#!/usr/bin/env node
// scripts/helius-key-audit.mjs
// ═══════════════════════════════════════════════════════════════════
// AUDIT LOCAL D'UNE CLÉ D'API HELIUS — identifier laquelle révoquer, et
// savoir si elle répond encore, sans jamais la publier.
//
// ── Pourquoi ce script existe à côté de l'audit d'historique ─────────
// `history-secret-scan.mjs` répond à « y a-t-il des valeurs de forme
// secrète dans l'historique ? » et rend un rapport PARTAGEABLE : ni valeur,
// ni préfixe. C'est le bon outil pour un dépôt, et c'est un mauvais outil
// pour l'opération d'à côté : **révoquer la bonne clé**.
//
// Pour révoquer, il faut corréler la valeur trouvée avec ce qu'affiche le
// tableau de bord du fournisseur — où les clés apparaissent tronquées. D'où
// deux modes, et deux seulement, qui touchent au secret :
//
//   --indice     affiche les 8 PREMIERS caractères de chaque valeur. C'est
//                un moyen de RECONNAISSANCE, jamais un justificatif : 8
//                caractères sur 36 ne permettent pas d'appeler l'API. Le
//                préfixe va sur le terminal de l'opérateur, jamais dans un
//                fichier, jamais dans un rapport.
//   --chercher   cherche les MÊMES valeurs ailleurs sur le disque (autres
//                produits, autres clones) et n'affiche que des CHEMINS.
//
// ── Ce que le script ne fait jamais ─────────────────────────────────
//   · écrire une valeur sur disque ;
//   · l'afficher entière, même en `--indice` ;
//   · la mettre dans une URL de journal : les erreurs réseau sont
//     expurgées avant d'être imprimées (voir `expurger`).
//
// Usage :
//   node scripts/helius-key-audit.mjs                    → inventaire masqué
//   node scripts/helius-key-audit.mjs --indice           → + 8 premiers car.
//   node scripts/helius-key-audit.mjs --chercher ~/projets
//   node scripts/helius-key-audit.mjs --sonde            → la clé répond-elle ?
//   node scripts/helius-key-audit.mjs --json
//
// Codes de sortie :
//   0 — inventaire fait, aucune clé identifiée
//   1 — au moins une clé identifiée (il y a donc une décision à prendre)
//   2 — inventaire impossible, ou sonde non concluante
// ═══════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { empreinte } from './secret-rules.mjs';
import { listeBlobs, lireBlobs, loterParTaille, parseFlux } from './history-secret-scan.mjs';

/** Longueur de l'indice de reconnaissance. 8 sur 36, c'est ~22 bits : de
 *  quoi reconnaître une clé dans une liste, pas de quoi s'en servir. */
export const TAILLE_INDICE = 8;

/** Hôtes Helius. Le nom du paramètre (`api-key`) est celui de leur API. */
export const HOTES_HELIUS = ['helius-rpc.com', 'helius.dev', 'mainnet.helius-rpc.com', 'devnet.helius-rpc.com'];

/**
 * Extrait les valeurs d'API Helius d'un texte. Fonction PURE, testable.
 *
 * Deux formes rencontrées réellement, et une seule règle ne les couvre pas :
 *   · `…/v1/?api-key=<uuid>` — la forme du `.env` historique de ce dépôt ;
 *   · `HELIUS_API_KEY=<uuid>` — la forme d'une variable nommée.
 * La première vient de `URL_CREDENTIAL`, la seconde de `NOM_SENSIBLE` —
 * mais ici on ne signale pas, on extrait : on veut la VALEUR.
 *
 * @returns {{valeur: string, forme: string}[]}
 */
export function candidatsHelius(texte) {
  const trouvees = [];
  const ajouter = (valeur, forme) => {
    if (typeof valeur !== 'string' || valeur.length < 16) return;
    if (!trouvees.some((t) => t.valeur === valeur)) trouvees.push({ valeur, forme });
  };

  const chaine = String(texte);

  // (1) paramètre d'URL, sur une ligne qui mentionne Helius OU un hôte connu.
  for (const ligne of chaine.split('\n')) {
    const heliusSuspect =
      /helius/i.test(ligne) || HOTES_HELIUS.some((hote) => ligne.includes(hote));
    if (!heliusSuspect) continue;

    const url = /[?&](?:api[-_]?key|apikey|key)=([A-Za-z0-9_\-.]{16,})/gi;
    let m;
    while ((m = url.exec(ligne)) !== null) ajouter(m[1], 'paramètre d’URL');

    const affectation = /([A-Za-z_][A-Za-z0-9_]{0,64})\s*[:=]\s*["'`]?([A-Za-z0-9_\-.]{16,})["'`]?/g;
    while ((m = affectation.exec(ligne)) !== null) {
      if (/helius|api[-_]?key/i.test(m[1])) ajouter(m[2], 'affectation nommée');
    }
  }

  return trouvees;
}

/** Indice de reconnaissance : les N premiers caractères. Rend `null` si la
 *  valeur est trop courte — mieux vaut pas d'indice qu'un indice qui serait
 *  la valeur entière. */
export function indice(valeur, taille = TAILLE_INDICE) {
  if (typeof valeur !== 'string') return null;
  if (valeur.length <= taille) return null;
  return valeur.slice(0, taille);
}

/**
 * Retire toute trace d'une valeur d'un message destiné à l'affichage.
 * Utile aux erreurs réseau : une URL refusée peut se retrouver recopiée
 * dans le message d'erreur, clé comprise.
 */
export function expurger(texte, valeurs) {
  let sortie = String(texte);
  for (const v of valeurs) {
    if (!v) continue;
    sortie = sortie.split(v).join('***');
    const court = v.slice(0, TAILLE_INDICE);
    if (court.length === TAILLE_INDICE) sortie = sortie.split(court).join('***');
  }
  return sortie.replace(/([?&](?:api[-_]?key|apikey|key)=)[^&\s"']+/gi, '$1***');
}

/**
 * Inventaire dans l'HISTORIQUE git : TOUS les blobs, quelle que soit leur
 * taille, par lots dont la taille cumulée reste bornée.
 *
 * ⚠️ Deux corrections apprises à l'usage, le 09/10 :
 *   · une première version plafonnait les blobs à 8 Mio ET le total à
 *     512 Mio. Elle a rendu « aucune clé trouvée » alors que la clé était
 *     bel et bien dans l'historique — le budget s'était épuisé avant
 *     d'atteindre les blobs qui la portent. Silence total, réponse fausse :
 *     exactement le défaut que le mode profond corrige de l'autre côté ;
 *   · borner par NOMBRE de blobs (40) ne borne pas la mémoire : 40 blobs de
 *     8 Mio, c'est 320 Mio, et 40 blobs de 46 Mio en seraient 1,8 Gio.
 *     D'où `loterParTaille`, partagé avec l'audit profond.
 *
 * Le budget reste, mais il DIT quand il a coupé (`tronque`), et l'appelant en
 * fait un code de sortie 2 : ne pas avoir fini n'est pas un feu vert.
 *
 * @returns {Promise<{cles: {valeur: string, forme: string, ou: string}[],
 *   tronque: boolean, octetsLus: number, blobs: number, examines: number}>}
 */
export async function clesDansHistorique({ cwd, budget = 2 * 1024 * 1024 * 1024 }) {
  const { entrees } = listeBlobs({ cwd });
  const blobs = entrees.filter((e) => e.type === 'blob' && e.taille > 0);
  const trouvees = new Map();
  let restant = budget;
  let octetsLus = 0;
  let examines = 0;
  let tronque = false;

  for (const lot of loterParTaille(blobs)) {
    if (restant <= 0) {
      tronque = true;
      break;
    }
    const flux = await lireBlobs({ cwd, oids: lot.map((e) => e.oid) });
    const contenus = new Map(parseFlux(flux).map((o) => [o.oid, o.contenu]));
    for (const entree of lot) {
      const contenu = contenus.get(entree.oid);
      if (!contenu) continue;
      const aLire = Math.min(contenu.length, Math.max(0, restant));
      restant -= aLire;
      octetsLus += aLire;
      examines += 1;
      if (aLire < contenu.length) tronque = true;
      for (const { valeur, forme } of candidatsHelius(contenu.toString('utf8'))) {
        const cle = empreinte(valeur);
        if (!trouvees.has(cle)) trouvees.set(cle, { valeur, forme, ou: [] });
        const emplacement = `${entree.chemin || '(sans chemin)'} (${entree.oid.slice(0, 7)})`;
        const entreeTrouvee = trouvees.get(cle);
        if (!entreeTrouvee.ou.includes(emplacement)) entreeTrouvee.ou.push(emplacement);
      }
      if (restant <= 0) {
        tronque = true;
        break;
      }
    }
  }

  return { cles: [...trouvees.values()], tronque, octetsLus, blobs: blobs.length, examines };
}

const DOSSIERS_IGNORES = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.next', 'graphify-out']);

/**
 * Cherche les valeurs données dans un arbre de fichiers, et ne rend que des
 * CHEMINS. Comparaison OCTET À OCTET sur la valeur entière : un préfixe
 * commun ne suffit pas, deux clés peuvent commencer pareil.
 */
export function chercherSurDisque(racine, valeurs, { profondeurMax = 6 } = {}) {
  const resultats = [];
  const parcourir = (dossier, profondeur) => {
    if (profondeur > profondeurMax) return;
    let entrees;
    try {
      entrees = readdirSync(dossier, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      if (DOSSIERS_IGNORES.has(e.name)) continue;
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) {
        parcourir(chemin, profondeur + 1);
        continue;
      }
      let brut;
      try {
        if (statSync(chemin).size > 4 * 1024 * 1024) continue;
        brut = readFileSync(chemin);
      } catch {
        continue;
      }
      const texte = brut.toString('utf8');
      for (const { valeur, empreinte: emp } of valeurs) {
        if (texte.includes(valeur)) {
          resultats.push({ empreinte: emp, chemin: relative(racine, chemin) || e.name });
        }
      }
    }
  };
  parcourir(racine, 0);
  return resultats;
}

/**
 * Sonde `getHealth` sur l'API Helius. Ne rend JAMAIS la clé, et expurge les
 * messages d'erreur : une URL refusée peut être recopiée dans l'erreur.
 * @returns {Promise<{vivante: boolean|null, http: number|null, detail: string}>}
 *   `vivante: null` = non concluant (réseau, délai) — surtout pas « morte ».
 */
export async function sonderCle(valeur, { url = 'https://mainnet.helius-rpc.com', fetchImpl = globalThis.fetch, delai = 8000 } = {}) {
  if (typeof fetchImpl !== 'function') {
    return { vivante: null, http: null, detail: 'fetch indisponible dans ce runtime' };
  }
  try {
    const reponse = await fetchImpl(`${url}/?api-key=${encodeURIComponent(valeur)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(delai),
    });
    const corps = await reponse.text();
    const detail = expurger(corps.slice(0, 200), [valeur]).replace(/\s+/g, ' ').trim();
    // 200 + « ok » = la clé est acceptée. Un 401/403 = refusée. Autre chose
    // (429, 5xx) ne dit rien de la validité de la clé : non concluant.
    if (reponse.status === 200 && /"result"\s*:\s*"ok"/.test(corps)) return { vivante: true, http: 200, detail };
    if (reponse.status === 200) return { vivante: null, http: 200, detail };
    if (reponse.status === 401 || reponse.status === 403) return { vivante: false, http: reponse.status, detail };
    return { vivante: null, http: reponse.status, detail };
  } catch (e) {
    return { vivante: null, http: null, detail: expurger(String(e?.message ?? e), [valeur]).split('\n')[0] };
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const valeur = (nom, defaut) => {
    const i = args.indexOf(nom);
    return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
  };
  const cwd = valeur('--racine', process.cwd());
  const avecIndice = args.includes('--indice');
  const json = args.includes('--json');
  const chercherDans = valeur('--chercher', null);
  const sonde = args.includes('--sonde');

  if (!existsSync(cwd)) {
    console.error(`✗ Racine inexistante : ${cwd}`);
    return 2;
  }

  return clesDansHistorique({ cwd })
    .then(async (inventaireBrut) => {
      const { cles, tronque, octetsLus, blobs, examines } = inventaireBrut;
      const contexte = { blobs, examines, octetsLus, tronque };
      if (cles.length === 0) {
        if (json) console.log(JSON.stringify({ ...contexte, cles: [] }, null, 2));
        else if (tronque) {
          console.error('✗ Inventaire INCOMPLET : le budget a été épuisé avant la fin.');
          console.error('  « Aucune clé » ne veut donc rien dire ici. Relancer avec --budget plus haut.');
          return 2;
        } else console.log('✓ Aucune clé d’API Helius trouvée dans l’historique examiné.');
        return 0;
      }

      const inventaire = [];
      for (const c of cles) {
        const ligne = {
          empreinte: empreinte(c.valeur),
          longueur: c.valeur.length,
          forme: c.forme,
          ou: c.ou,
          ...(avecIndice ? { indice: indice(c.valeur) } : {}),
        };
        if (sonde) ligne.sonde = await sonderCle(c.valeur);
        inventaire.push(ligne);
      }

      // ── Cherche ailleurs sur le disque, si demandé ──
      if (chercherDans) {
        if (!existsSync(chercherDans)) {
          console.error(`✗ --chercher : dossier inexistant : ${chercherDans}`);
          return 2;
        }
        const valeurs = cles.map((c, i) => ({ valeur: c.valeur, empreinte: inventaire[i].empreinte }));
        const trouves = chercherSurDisque(chercherDans, valeurs);
        for (const t of trouves) {
          const ligne = inventaire.find((l) => l.empreinte === t.empreinte);
          if (!ligne) continue;
          if (!ligne.ailleurs) ligne.ailleurs = [];
          if (!ligne.ailleurs.includes(t.chemin)) ligne.ailleurs.push(t.chemin);
        }
      }

      if (json) {
        console.log(JSON.stringify({ ...contexte, cles: inventaire }, null, 2));
      } else {
        console.log('\n── Clés d’API Helius dans l’historique ──────────────');
        console.log(`  dépôt : ${cwd}`);
        console.log(`  blobs lus : ${examines}/${blobs} · ${(octetsLus / 1048576).toFixed(1)} Mio` + (tronque ? ' · INCOMPLET' : ''));
        console.log(`  trouvées : ${inventaire.length}\n`);
        for (const l of inventaire) {
          console.log(`  · empreinte ${l.empreinte}, ${l.longueur} car., ${l.forme}`);
          if (l.indice) console.log(`    indice de reconnaissance : ${l.indice}…  (8 car., pas une clé utilisable)`);
          for (const ou of l.ou.slice(0, 6)) console.log(`    vu dans : ${ou}`);
          if (l.ou.length > 6) console.log(`    … et ${l.ou.length - 6} autre(s) emplacement(s)`);
          if (l.ailleurs?.length) {
            console.log('    PRÉSENTE AILLEURS sur le disque :');
            for (const chemin of l.ailleurs.slice(0, 12)) console.log(`      ${chemin}`);
            if (l.ailleurs.length > 12) console.log(`      … et ${l.ailleurs.length - 12} autre(s)`);
          }
          if (l.sonde) {
            const verdict = l.sonde.vivante === true ? 'RÉPOND ENCORE (à révoquer)' : l.sonde.vivante === false ? 'refusée' : 'non concluant';
            console.log(`    sonde getHealth : ${verdict} [HTTP ${l.sonde.http ?? '—'}] ${l.sonde.detail}`);
          }
        }
        console.log('\n  → Révoquer côté Helius, poser la nouvelle valeur hors dépôt');
        console.log('    (.env.local, ignoré), puis purger l’historique.');
        console.log('    Voir docs/NOAH-PURGE-VAPID-2026-10-09.md § 2 bis.');
      }

      // La sonde non concluante est un résultat en soi : ne pas conclure
      // n'est pas conclure « morte ».
      if (sonde && inventaire.some((l) => l.sonde && l.sonde.vivante === null)) return 2;
      return 1;
    })
    .catch((e) => {
      console.error(`✗ Inventaire impossible : ${String(e?.message ?? e).split('\n')[0]}`);
      return 2;
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
