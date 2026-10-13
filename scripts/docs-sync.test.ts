// scripts/docs-sync.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou de non-divergence des documents de référence (`.md` → `.html`).
//
// Contexte : les documents de référence existent en Markdown ET en HTML, et ils
// avaient divergé — deux copies du même contenu, aucune règle qui les tienne
// ensemble. Depuis, le `.html` est PRODUIT depuis le `.md`
// (`docs/outils/md-to-html.mjs`) et `docs/outils/verifier-docs.mjs` compare la
// page régénérée à celle du disque.
//
// Ce test existe parce que ce contrôle-là n'était appelable qu'à la main : une
// divergence arrivait donc sans bruit tant que personne ne pensait à lancer le
// script. Elle fait maintenant échouer `npm test`.
//
// ⚠️ La comparaison n'est PAS réécrite ici : le test importe `auditerDocs()`.
// Un second exemplaire du même contrôle finirait par diverger de l'original —
// exactement le défaut qu'on cherche à empêcher.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAIRES_LANGUES,
  auditerDocs,
  ecartsDeLangue,
  jetonsInvariants,
  nombreDeSections,
} from '../docs/outils/verifier-docs.mjs';

/** Doit rester d'accord avec la signature du générateur, côté vérificateur. */
const MINIMUM_ATTENDU = 5;

/** Doit rester au même niveau que `PAIRES_LANGUES` dans le vérificateur. */
const PAIRES_LANGUES_ATTENDUES = 1;

test('documents : la liste des paires de langues n’a pas été vidée', () => {
  // Même piège que pour les pages HTML : un contrôle de parité auquel on ne
  // donne aucune paire à comparer est « au vert » sans avoir rien lu. Baisser
  // ce minimum doit être une décision visible, pas un effet de bord.
  assert.ok(
    PAIRES_LANGUES.length >= PAIRES_LANGUES_ATTENDUES,
    `seulement ${PAIRES_LANGUES.length} couple(s) déclaré(s), ` +
      `${PAIRES_LANGUES_ATTENDUES} attendu(s) — la liste PAIRES_LANGUES a-t-elle été vidée ?`
  );
});

test('documents : les paires .md/.html de référence sont bien détectées', () => {
  const { trouvees } = auditerDocs();
  // Sans cette borne, le test passerait « au vert » le jour où la signature du
  // générateur change et où plus aucune page n'est reconnue : zéro écart
  // trouvé parce que zéro page examinée. Un contrôle qui ne mesure rien ne
  // doit pas ressembler à un contrôle qui valide.
  assert.ok(
    trouvees.length >= MINIMUM_ATTENDU,
    `seulement ${trouvees.length} page(s) générée(s) détectée(s), ${MINIMUM_ATTENDU} attendues — ` +
      'la signature « par outils/md-to-html.mjs » a-t-elle changé, ou une page a-t-elle été écrite à la main ?'
  );
});

test('documents : chaque .html généré correspond octet à octet à son .md', () => {
  const { ecarts } = auditerDocs();
  assert.deepEqual(
    ecarts.map((e) => `${e.md} → ${e.html}`),
    [],
    'un .md a été modifié sans régénérer son .html, ou le .html a été retouché à la main — ' +
      'régénérer : node docs/outils/md-to-html.mjs <source.md> <sortie.html> <lang> "<titre>"'
  );
});

test('documents : aucune page générée ne laisse du Markdown brut', () => {
  const { residus } = auditerDocs();
  assert.deepEqual(
    residus.map((r) => `${r.md} → ${r.html} : ${r.reste.join(', ')}`),
    [],
    'la source utilise une construction que le générateur ne sait pas rendre — ' +
      'corriger la source ou étendre docs/outils/md-to-html.mjs'
  );
});

// ─── Les trois trous de couverture comblés le 08/10 ────────────────────
// Avant, le contrôle ne regardait que les .md ayant DÉJÀ un .html signé.
// Une page manquante, une page écrite à la main et une page orpheline
// passaient donc inaperçues. Chacune a maintenant son test — un garde-fou
// dont on ne vérifie pas chaque issue ne protège que celle qu'on a en tête.

test('documents : chaque source déclarée a bien sa page HTML', () => {
  const { manquantes } = auditerDocs();
  assert.deepEqual(
    manquantes,
    [],
    'document(s) de référence sans page HTML — générer : ' +
      'node docs/outils/md-to-html.mjs <source.md> <source.html> <fr|en> "<titre>"'
  );
});

test('documents : aucune page de référence écrite à la main', () => {
  const { nonGeneres } = auditerDocs();
  assert.deepEqual(
    nonGeneres,
    [],
    'page(s) HTML sans la signature du générateur : une page écrite à la main ne sera ' +
      'jamais régénérée, donc elle divergera de sa source'
  );
});

test('documents : aucune page HTML générée ne survit à sa source', () => {
  const { orphelines } = auditerDocs();
  assert.deepEqual(
    orphelines,
    [],
    'page(s) HTML signée(s) dont le .md n’existe plus — restaurer la source ou supprimer la page'
  );
});

test('documents : aucune source déclarée n’est périmée', () => {
  const { sourcesAbsentes } = auditerDocs();
  assert.deepEqual(
    sourcesAbsentes,
    [],
    'PAGES_ATTENDUES cite un document qui n’existe pas (ou plus) — mettre la liste à jour'
  );
});

// ─── Le quatrième trou : deux langues, un seul document ───────────────
// Un document de référence existe en anglais ET en français (la fiche
// d'incident). Les contrôles ci-dessus n'ont rien à en dire : les deux .md sont
// valides et aucun n'a de page HTML. Sans ce qui suit, la traduction pouvait
// perdre une empreinte, une URL ou une commande sans que rien ne le signale —
// et c'est exactement le genre d'écart qui fait qu'une fiche d'incident cesse
// d'être une preuve pour devenir un récit.

test('documents : chaque paire de langues déclarée existe des deux côtés', () => {
  const { languesDesynchronisees } = auditerDocs();
  const introuvables = languesDesynchronisees.filter((p) =>
    p.ecarts.includes('une des deux versions est introuvable')
  );
  assert.deepEqual(
    introuvables.map((p) => `${p.source} ⇄ ${p.traduction}`),
    [],
    'une moitié d’un couple déclaré manque — traduire le document, ou retirer la paire'
  );
});

test('documents : les deux langues d’un même document portent les mêmes faits', () => {
  const { languesDesynchronisees } = auditerDocs();
  assert.deepEqual(
    languesDesynchronisees.flatMap((p) => p.ecarts.map((e) => `${p.source} : ${e}`)),
    [],
    'la source et sa traduction ont divergé — corriger la TRADUCTION, jamais l’original : ' +
      'faire taire ce contrôle en retirant un fait de la version anglaise détruirait la preuve'
  );
});

test('documents : le détecteur de parité SAIT échouer (sinon il ne vérifie rien)', () => {
  const source = [
    '## 1. Une section',
    '',
    'Fingerprint `e27f2e115ee5`, servie depuis `https://exemple.test/assets/index.js`.',
    '',
    '```bash',
    'npm run check:prod',
    '```',
    '',
    '## 2. Une autre section',
    '',
    'Rien à ajouter.',
  ].join('\n');

  // Traduction exacte : aucun écart. C'est la borne basse du contrôle — sans
  // elle, un détecteur qui renvoie toujours `[]` passerait pour bon.
  const traduction = [
    '## 1. Une section',
    '',
    'Empreinte `e27f2e115ee5`, servie depuis `https://exemple.test/assets/index.js`.',
    '',
    '```bash',
    'npm run check:prod',
    '```',
    '',
    '## 2. Une autre section',
    '',
    'Rien à ajouter.',
  ].join('\n');
  assert.deepEqual(ecartsDeLangue(source, traduction), []);

  // Empreinte perdue en route : c'est LE cas de cette fiche d'incident.
  const sansEmpreinte = traduction.replace('`e27f2e115ee5`', '`une empreinte`');
  assert.ok(
    ecartsDeLangue(source, sansEmpreinte).some((e) => e.includes('e27f2e115ee5')),
    'une empreinte disparue de la traduction doit être signalée, en la nommant'
  );

  // Commande renommée : la traduction enverrait lire un contrôle qui n'existe pas.
  const commandeRenommee = traduction.replace('check:prod', 'check:production');
  assert.ok(
    ecartsDeLangue(source, commandeRenommee).some((e) => e.includes('commandes')),
    'une commande renommée dans la traduction doit être signalée'
  );

  // Section supprimée : ce n'est plus une traduction, c'est un résumé.
  const sectionPerdue = traduction.split('## 2. Une autre section')[0];
  assert.ok(
    ecartsDeLangue(source, sectionPerdue).some((e) => e.includes('sections')),
    'une section perdue dans la traduction doit être signalée'
  );

  // Et la réciproque : un fait ajouté côté traduction ne passe pas non plus.
  const inventee = traduction.replace('check:prod', 'check:prod` puis `npm run check:secret');
  assert.ok(
    ecartsDeLangue(source, inventee).some((e) => e.includes('absentes de la source')),
    'un fait inventé par la traduction doit être signalé — sinon une traduction peut fabriquer des preuves'
  );
});

test('documents : la prose ne fabrique pas de faux jetons (mots français en a–f)', () => {
  // « face », « décade », « effacée » sont faits uniquement de caractères
  // hexadécimaux. Les chercher dans le texte ferait échouer le contrôle sur du
  // français correct, et un contrôle bruyant finit désactivé.
  const j = jetonsInvariants('La clé a été effacée, la décade est finie, de face.');
  assert.deepEqual(j.empreintes, [], 'de la prose française a été prise pour une empreinte');
  assert.deepEqual(j.commandes, [], 'de la prose française a été prise pour une commande');
});

test('documents : la charpente se compte en sections de niveau 2', () => {
  assert.equal(nombreDeSections('# Titre\n\n## A\ntexte\n\n### sous-titre\n\n## B'), 2);
});
