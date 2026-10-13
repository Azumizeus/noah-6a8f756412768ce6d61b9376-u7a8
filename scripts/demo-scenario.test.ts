// scripts/demo-scenario.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du rejeu scripté (lib/demoScenario.ts, pages/premium/PremiumDemo.tsx).
//
// Ce que la démo raconte doit être VRAI même si elle n'envoie rien :
//   - l'ordre des instructions est celui du programme ;
//   - le partage est 2 % / 98 % avec la troncature entière PAR MEMBRE du
//     programme (cf. distributeWithReceipt dans anchor.ts) — un rejeu qui
//     afficherait des montants ronds « plausibles » ferait dire au projet
//     autre chose que ce qu'il fait ;
//   - le rejeu est REPRODUCTIBLE : adresses et signatures identiques d'une
//     prise à l'autre, sinon deux enregistrements de la vidéo montreraient
//     des signatures différentes pour la même étape ;
//   - il ne dépend d'AUCUN accès réseau : un rejeu qui interroge le RPC
//     tomberait en panne exactement le jour où on en a besoin.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRAIS_BPS,
  TOTAL_BPS,
  adresseFactice,
  construireScenarioDemo,
  etapeDemo,
  nombreEtapes,
  repartirVault,
  signatureFactice,
  type ParticipantDemo,
} from '../src/lib/demoScenario.ts';
import { frDemo } from '../src/lib/i18n/fr.demo.ts';
import { enDemo } from '../src/lib/i18n/en.demo.ts';
import {
  CADRAGE_PX,
  DELAI_MS_DEFAUT,
  DELAI_MS_MAX,
  DELAI_MS_MIN,
  ECHELLE_CADRAGE_MIN,
  PARAM_TOURNAGE,
  echelleCadrage,
  hashAvecDelaiEtape,
  hashAvecModeTournage,
  lireDelaiEtape,
  lireModeTournage,
  modeTournageActif,
  oublierModeTournage,
  setModeTournage,
  subscribeModeTournage,
} from '../src/lib/tournage.ts';
// ⚠️ Le résolveur RÉEL (lib/i18n/translations.ts) n'est PAS importable ici :
// il référence ses dictionnaires sans extension (`./fr`), que le resolver ESM
// de node ne suit pas — même contrainte que lib/pitchParse.ts, isolé pour
// cette raison. On rejoue donc la règle d'interpolation telle qu'elle est
// écrite là-bas (`/\{\{(\w+)\}\}/g` remplacé si le paramètre existe, laissé
// tel quel sinon), et le test de source ci-dessous vérifie que le composant
// fournit bien ses paramètres. Les deux maillons se couvrent l'un l'autre.
function interpoler(gabarit: string, params: Record<string, string | number>): string {
  return gabarit.replace(/\{\{(\w+)\}\}/g, (m, nom: string) => (nom in params ? String(params[nom]) : m));
}

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// ─── 1. Ordre et contenu des instructions ─────────────────────────────

test('le rejeu suit l\'ordre du programme : create → add_member → approve → finalize → fund → distribute', () => {
  const scenario = construireScenarioDemo();
  assert.deepEqual(
    scenario.etapes.map((e) => e.id),
    ['create', 'add_member', 'add_member', 'approve', 'approve', 'finalize', 'fund', 'distribute']
  );
  assert.deepEqual(
    scenario.etapes.map((e) => e.instruction),
    ['create_project', 'add_member', 'add_member', 'approve', 'approve', 'finalize', 'fund', 'distribute']
  );
});

test('seul le créateur finalise, et seuls les membres approuvent', () => {
  const scenario = construireScenarioDemo();
  const createur = scenario.participants.find((p) => p.createur);
  assert.ok(createur, 'le scénario doit désigner un créateur');

  const finalize = scenario.etapes.filter((e) => e.id === 'finalize');
  assert.equal(finalize.length, 1);
  assert.equal(finalize[0].signataire, createur.pseudo);

  const approbations = scenario.etapes.filter((e) => e.id === 'approve');
  assert.deepEqual(
    approbations.map((e) => e.signataire),
    scenario.participants.filter((p) => !p.createur).map((p) => p.pseudo)
  );
});

test('le vault se remplit au fund et se vide à la distribution', () => {
  const scenario = construireScenarioDemo({ montantFinanceSol: 12 });
  const fund = scenario.etapes.find((e) => e.id === 'fund');
  const distribute = scenario.etapes.find((e) => e.id === 'distribute');
  assert.equal(fund?.deltaVaultSol, 12);
  assert.equal(distribute?.deltaVaultSol, -12);

  // Un solde par étape, et le dernier vaut exactement 0 : laisser des SOL
  // dans le vault après une distribution décrirait un autre programme.
  assert.equal(scenario.soldesVaultSol.length, scenario.etapes.length);
  assert.equal(scenario.soldesVaultSol[scenario.soldesVaultSol.length - 1], 0);
  assert.equal(scenario.soldesVaultSol[scenario.etapes.findIndex((e) => e.id === 'fund')], 12);
});

test('la quote-part du créateur est publiée dès la création', () => {
  const scenario = construireScenarioDemo();
  assert.equal(scenario.etapes[0].id, 'create');
  assert.equal(scenario.etapes[0].params.shares, '50%');
});

// ─── 2. Déterminisme ──────────────────────────────────────────────────

test('deux constructions donnent exactement le même scénario', () => {
  assert.deepEqual(construireScenarioDemo(), construireScenarioDemo());
});

test('adresses et signatures sont déterministes, et différentes d\'une graine à l\'autre', () => {
  assert.equal(adresseFactice('a'), adresseFactice('a'));
  assert.notEqual(adresseFactice('a'), adresseFactice('b'));
  assert.equal(signatureFactice('a'), signatureFactice('a'));
  assert.notEqual(signatureFactice('a'), signatureFactice('b'));
});

test('les identifiants fictifs ont la taille et l\'alphabet d\'une adresse / signature Solana', () => {
  const scenario = construireScenarioDemo();
  for (const p of scenario.participants) {
    assert.equal(p.wallet.length, 44);
    assert.ok([...p.wallet].every((c) => BASE58.includes(c)), `caractère hors base58 : ${p.wallet}`);
  }
  assert.equal(scenario.pda.length, 44);
  assert.equal(scenario.protocolWallet.length, 44);

  const signatures = scenario.etapes.map((e) => e.signature);
  for (const s of signatures) {
    assert.equal(s.length, 88);
    assert.ok([...s].every((c) => BASE58.includes(c)), `caractère hors base58 : ${s}`);
  }
  // Deux étapes ne doivent jamais porter la même signature : à l'écran, ça
  // se lit comme un bug de rejeu.
  assert.equal(new Set(signatures).size, signatures.length);
});

// ─── 3. Partage 2 % / 98 %, avec la troncature du programme ───────────

test('12 SOL sur trois membres : 0,24 de frais, 11,76 répartis au prorata', () => {
  const scenario = construireScenarioDemo({ montantFinanceSol: 12 });
  assert.equal(scenario.fraisProtocoleSol, 0.24);
  assert.equal(scenario.netMembresSol, 11.76);
  assert.deepEqual(
    scenario.paiements.map((p) => [p.pseudo, p.amountSol]),
    [
      ['Ada', 5.88],
      ['Kwame', 3.528],
      ['Sofia', 2.352],
    ]
  );
});

test('les frais sont 2 % et la somme des sorties ne dépasse jamais le vault', () => {
  for (const montant of [0.5, 1, 3.7, 12, 100.123456789]) {
    const scenario = construireScenarioDemo({ montantFinanceSol: montant });
    const brut = Math.round(montant * 1e9);
    assert.equal(scenario.fraisProtocoleSol, Math.floor((brut * FRAIS_BPS) / TOTAL_BPS) / 1e9);
    const sorti = Math.round(
      (scenario.netMembresSol + scenario.fraisProtocoleSol) * 1e9
    );
    assert.ok(sorti <= brut, `${sorti} > ${brut} : le rejeu paie plus qu'il n'a reçu`);
  }
});

test('la troncature est faite PAR MEMBRE, jamais sur le total', () => {
  // Cas construit : 123 lamports, deux parts égales. Chaque part est
  // tronquée séparément (40 lamports), donc le total distribué est
  // INFÉRIEUR au net — exactement comme sur la chaîne, où la poussière
  // reste dans le vault.
  const participants: ParticipantDemo[] = [
    { pseudo: 'A', role: 'x', shareBps: 3333, wallet: adresseFactice('A') },
    { pseudo: 'B', role: 'y', shareBps: 3334, wallet: adresseFactice('B') },
  ];
  const partage = repartirVault(0.000000123, participants);
  assert.equal(partage.fraisProtocoleSol, 2e-9); // floor(123 * 2 %) = 2 lamports
  assert.equal(partage.netMembresSol, 121e-9);
  assert.deepEqual(
    partage.paiements.map((p) => p.amountSol),
    [40e-9, 40e-9]
  );
  const total = partage.paiements.reduce((s, p) => s + p.amountSol, 0);
  assert.ok(total < partage.netMembresSol, 'le reste doit rester dans le vault, pas être inventé');
});

test('somme des parts au-delà de 100 % signalée par la règle elle-même', () => {
  // Le module ne « corrige » pas des bps incohérents : il applique la même
  // division que le programme. On documente le comportement plutôt que de
  // prétendre qu'il valide — c'est le programme qui refuse (MemberShareBps).
  const participants: ParticipantDemo[] = [
    { pseudo: 'A', role: 'x', shareBps: 6000, wallet: adresseFactice('A') },
    { pseudo: 'B', role: 'y', shareBps: 6000, wallet: adresseFactice('B') },
  ];
  const partage = repartirVault(1, participants);
  const total = partage.paiements.reduce((s, p) => s + p.amountSol, 0);
  assert.ok(total > partage.netMembresSol, 'le rejeu ne masque pas des parts incohérentes');
});

// ─── 4. Le rejeu n'ouvre aucune porte au réseau ───────────────────────

test('le module de scénario n\'importe RIEN (ni chaîne, ni React)', () => {
  const source = lire('src/lib/demoScenario.ts');
  const imports = [...source.matchAll(/^\s*import\s/gm)];
  assert.equal(imports.length, 0, 'lib/demoScenario.ts doit rester sans dépendance');
});

test('la page de démo n\'utilise aucun hook de chaîne (sinon elle ne serait pas hors ligne)', () => {
  // Commentaires retirés avant l'analyse : le fichier en contient qui CITENT
  // ces hooks pour expliquer qu'il ne les utilise pas.
  const page = lire('src/pages/premium/PremiumDemo.tsx').replace(/\/\/[^\n]*/g, '');
  for (const interdit of ['useProjects', 'useConnection', 'useWallet', 'useAnchorProgram']) {
    assert.ok(!page.includes(interdit), `PremiumDemo.tsx ne doit pas appeler ${interdit}`);
  }
  assert.ok(page.includes('construireScenarioDemo'), 'la page doit bien rejouer le scénario');
});

test('la page annonce qu\'il s\'agit d\'un rejeu sans transaction', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  assert.ok(page.includes('demo.banner') || page.includes('demo.subtitle'));
});

test('les boutons de la page portent une variante de premium.css', () => {
  // `.p-btn` seul n'a NI fond NI bordure : il n'est que la base des variantes
  // `primary` et `ghost`. Vue à l'écran le 11/10/2026, cette erreur donne un
  // bouton qui ressemble à du texte nu — invisible dans un test qui ne lit
  // que les libellés.
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  const classes = [...page.matchAll(/className="(p-btn[^"]*)"/g)].map((m) => m[1]);
  assert.ok(classes.length >= 3, 'la page doit exposer ses trois commandes de rejeu');
  for (const classe of classes) {
    assert.match(classe, /^p-btn (primary|ghost)$/, `variante manquante : ${classe}`);
  }
});

test('la barre de progression utilise l\'enfant <i> attendu par .p-track', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  // .p-track i porte le dégradé ; un <div> interne ne serait jamais stylé.
  assert.match(page, /className="p-track"[^>]*>\s*<i /, 'p-track doit contenir <i style={{ width }} />');
});

// ─── 5. i18n : les étapes et leurs paramètres correspondent ───────────

type Dict = { [k: string]: string | Dict };
const etapesFr = frDemo.step as Dict;
const etapesEn = enDemo.step as Dict;

test('chaque étape du scénario possède un libellé FR et EN', () => {
  for (const etape of construireScenarioDemo().etapes) {
    assert.equal(typeof etapesFr[etape.id], 'string', `libellé FR manquant : demo.step.${etape.id}`);
    assert.equal(typeof etapesEn[etape.id], 'string', `libellé EN manquant : demo.step.${etape.id}`);
  }
});

test('les paramètres fournis par le scénario apparaissent dans le libellé (les deux langues)', () => {
  const scenario = construireScenarioDemo();
  for (const etape of scenario.etapes) {
    const gabaritFr = etapesFr[etape.id] as string;
    const gabaritEn = etapesEn[etape.id] as string;
    for (const cle of Object.keys(etape.params)) {
      assert.ok(
        gabaritFr.includes(`{{${cle}}}`),
        `paramètre « ${cle} » absent du libellé FR de ${etape.id}`
      );
      assert.ok(
        gabaritEn.includes(`{{${cle}}}`),
        `paramètre « ${cle} » absent du libellé EN de ${etape.id}`
      );
    }
    // Et l'inverse : un gabarit qui attend une valeur non fournie
    // s'afficherait avec son {{placeholder}} visible à l'écran.
    for (const [, nom] of gabaritFr.matchAll(/\{\{(\w+)\}\}/g)) {
      assert.ok(nom in etape.params, `libellé FR de ${etape.id} attend {{${nom}}}, non fourni`);
    }
  }
});

test('les libellés de la répartition et leurs paramètres concordent aussi', () => {
  const gabarit = frDemo.payoutLine as string;
  for (const cle of ['pseudo', 'shares', 'amount']) {
    assert.ok(gabarit.includes(`{{${cle}}}`), `payoutLine FR sans {{${cle}}}`);
  }
  const enGabarit = enDemo.payoutLine as string;
  for (const cle of ['pseudo', 'shares', 'amount']) {
    assert.ok(enGabarit.includes(`{{${cle}}}`), `payoutLine EN sans {{${cle}}}`);
  }
});

test('les libellés d\'étapes passés au traducteur ne gardent AUCUN placeholder', () => {
  // Test de bout en bout du chemin de libellé : dictionnaire RÉEL + résolveur
  // RÉEL + paramètres RÉELS du scénario. C'est ce qui manquait le 11/10/2026,
  // où la chronologie affichait « Création du pacte « {{titre}} » » — le
  // composant appelait t() sans les paramètres, et rien ne le détectait
  // puisque les gabarits, eux, étaient corrects.
  const scenario = construireScenarioDemo();
  const dictionnaires = { fr: etapesFr, en: etapesEn } as const;
  for (const langue of ['fr', 'en'] as const) {
    for (const etape of scenario.etapes) {
      const gabarit = dictionnaires[langue][etape.id] as string;
      const rendu = interpoler(gabarit, etape.params);
      assert.ok(!rendu.includes('{{'), `${langue}/${etape.id} garde un placeholder : ${rendu}`);
    }
  }
  const premier = interpoler(etapesFr.create as string, scenario.etapes[0].params);
  assert.ok(premier.includes(scenario.title), 'le titre du scénario doit apparaître dans le libellé');
});

test('la page transmet bien les paramètres de l\'étape au traducteur', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  assert.match(
    page,
    /t\(`demo\.step\.\$\{[^}]+\}`\s*,\s*[A-Za-z]+\.params\)/,
    'PremiumDemo.tsx doit appeler t(`demo.step.…`, etape.params)'
  );
});

test('les dictionnaires demo FR et EN portent exactement les mêmes clés', () => {
  const cles = (dict: Dict) => Object.keys(dict).sort();
  assert.deepEqual(cles(enDemo), cles(frDemo));
  assert.deepEqual(cles(etapesEn), cles(etapesFr));
});

// ─── 6. Accès par index : le rejeu s'arrête, il ne boucle pas ─────────

test('etapeDemo rend null au-delà de la dernière étape', () => {
  const scenario = construireScenarioDemo();
  assert.equal(nombreEtapes(scenario), scenario.etapes.length);
  assert.ok(etapeDemo(scenario, scenario.etapes.length - 1));
  assert.equal(etapeDemo(scenario, scenario.etapes.length), null);
  assert.equal(etapeDemo(scenario, -1), null);
});

// ─── 7. Mode tournage (#/demo?tournage=1) ────────────────────────────
//
// Ce que le mode doit faire, et ne pas faire : rendre la prise vidéo
// possible sans toucher la souris (rejeu automatique + bandeau de santé
// masqué), sans jamais s'activer tout seul — un mode tournage par défaut
// masquerait un incident RPC réel, soit exactement ce que le bandeau a été
// écrit pour empêcher.

test('le paramètre tournage est reconnu, et seulement quand il est explicite', () => {
  for (const hash of [
    '#/demo?tournage=1',
    '#/demo?tournage',
    '#/demo?tournage=true',
    '#/demo?tournage=ON',
    '#/demo?tournage=oui',
  ]) {
    assert.equal(lireModeTournage(hash), true, `devrait être vrai : ${hash}`);
  }
  for (const hash of [
    '#/demo',
    '#/demo?mine=1',
    '#/demo?tournage=0',
    '#/demo?tournage=false',
    '#/demo?tournage=peut-etre',
    // Sans `?`, il n'y a pas de chaîne de requête : `tournage=1` collé à une
    // route n'en est pas une (c'est un paramètre de requête seulement dans
    // une URL). On refuse plutôt que de deviner — un mode tournage allumé
    // par une route biscornue masquerait une panne RPC pour de vrai.
    'tournage=1',
    '#tournage=1',
    '',
  ]) {
    assert.equal(lireModeTournage(hash), false, `devrait être faux : ${hash}`);
  }
});

test('le mode tournage s\'écrit dans le hash SANS écraser les autres paramètres', () => {
  assert.equal(hashAvecModeTournage('#/demo', true), `#/demo?${PARAM_TOURNAGE}=1`);
  assert.equal(hashAvecModeTournage('#/demo', false), '#/demo');
  // Un autre paramètre (ici ?mine=1, utilisé ailleurs dans l'app) survit.
  const avec = hashAvecModeTournage('#/demo?mine=1', true);
  assert.ok(avec.includes('mine=1'), `paramètre perdu : ${avec}`);
  assert.equal(lireModeTournage(avec), true);
  assert.equal(hashAvecModeTournage(avec, false), '#/demo?mine=1');
  // Aller-retour : aucun résidu.
  assert.equal(hashAvecModeTournage(hashAvecModeTournage('#/demo', true), false), '#/demo');
});

test('le store notifie une seule fois par changement, et se désabonne', () => {
  oublierModeTournage();
  const vus: boolean[] = [];
  const stop = subscribeModeTournage((v) => vus.push(v));

  setModeTournage(true);
  setModeTournage(true); // même valeur : aucune notification supplémentaire
  setModeTournage(false);
  assert.deepEqual(vus, [true, false]);
  assert.equal(modeTournageActif(), false);

  stop();
  setModeTournage(true);
  assert.deepEqual(vus, [true, false], 'un abonné désabonné ne doit plus être appelé');
  oublierModeTournage();
});

test('la page de démo se lance seule quand le mode est actif', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx').replace(/\/\/[^\n]*/g, '');
  assert.ok(page.includes('useModeTournage'), 'la page doit lire le mode tournage');
  // ⚠️ Plusieurs effets réagissent au mode depuis le 12/10 (le cadrage en a
  // un). On les examine TOUS : ce qui compte est qu'il en existe un — et un
  // seul — qui remet l'étape à 1 puis lance la lecture. Ne regarder que le
  // premier laisserait passer une page qui mesure son cadrage sans jamais
  // démarrer le rejeu.
  const effets = [...page.matchAll(/useEffect\(\(\) => \{[\s\S]{0,600}?\}, \[tournage\]\)/g)];
  assert.ok(effets.length >= 1, 'la page doit réagir au changement de mode dans un effet');
  const relance = effets.filter((e) => /setLecture\(true\)/.test(e[0]));
  assert.equal(relance.length, 1, 'un effet — et un seul — doit lancer la lecture en mode tournage');
  assert.ok(/setVisibles\(1\)/.test(relance[0][0]), 'le mode actif doit repartir de l\'étape 1');
});

test('le hook n\'écrit pas dans le store PENDANT le rendu', () => {
  // L'initialiseur de useState s'exécute pendant le rendu : y appeler
  // setModeTournage notifie les abonnés déjà montés, donc un setState sur un
  // AUTRE composant pendant le rendu. Constaté en console le 12/10/2026
  // (« Cannot update a component (RpcHealthBanner) while rendering a
  // different component (PremiumDemo) ») — invisible dans les tests, visible
  // au premier chargement de la page.
  const hook = lire('src/hooks/useModeTournage.ts').replace(/\/\/[^\n]*/g, '');
  const init = hook.match(/useState<boolean>\(\(\) =>[\s\S]*?\);/);
  assert.ok(init, 'le hook doit amorcer son état depuis le hash');
  assert.ok(
    !init[0].includes('setModeTournage'),
    `écriture dans le store pendant le rendu : ${init[0].trim()}`
  );
  assert.match(
    hook,
    /useEffect\(\(\) => \{[\s\S]{0,220}?setModeTournage\(actif\)/,
    'l\'alignement du store doit se faire dans un effet, après le rendu'
  );
});

test('la page expose la bascule, et l\'annonce quand le mode est actif', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  assert.ok(page.includes('basculerTournage'), 'la page doit pouvoir basculer le mode');
  // État visible : sans ce rappel, personne ne comprend pourquoi le bandeau
  // de santé a disparu pendant une prise.
  assert.ok(page.includes('demo.tournageOn'), 'le mode actif doit être annoncé à l\'écran');
});

test('les libellés du mode tournage existent dans les deux langues', () => {
  for (const cle of ['tournage', 'tournageOff', 'tournageOn', 'tournageHint']) {
    assert.equal(typeof frDemo[cle], 'string', `clé FR manquante : demo.${cle}`);
    assert.equal(typeof enDemo[cle], 'string', `clé EN manquante : demo.${cle}`);
  }
});

// ─── 8. Rythme du rejeu (`?pas=`, en secondes) ──────────────────────
//
// Le réglage vit dans l'URL : deux prises du même lien doivent être
// identiques, et une valeur refusée doit retomber sur le défaut — jamais
// sur un rythme deviné, qui changerait la durée de la vidéo sans le dire.

test('lireDelaiEtape : secondes, point OU virgule, bornes respectées', () => {
  assert.equal(lireDelaiEtape('#/demo?pas=3'), 3000);
  assert.equal(lireDelaiEtape('#/demo?pas=2.4'), 2400);
  assert.equal(lireDelaiEtape('#/demo?pas=2,4'), 2400, 'la virgule est ce qu’on tape avec un clavier français');
  assert.equal(lireDelaiEtape('#/demo?pas=1'), 1000);
  assert.equal(lireDelaiEtape(`#/demo?pas=${DELAI_MS_MAX / 1000}`), DELAI_MS_MAX);
  assert.equal(lireDelaiEtape(`#/demo?pas=${DELAI_MS_MIN / 1000}`), DELAI_MS_MIN);
});

test('lireDelaiEtape : absent, vide, illisible ou hors bornes → la durée par défaut', () => {
  for (const hash of [
    '#/demo',
    '#/demo?tournage=1',
    '#/demo?pas=',
    '#/demo?pas=abc',
    '#/demo?pas=0',
    '#/demo?pas=-2',
    '#/demo?pas=999', // 999 s : bien au-delà du plafond (la prise durerait 2 h)
    '#/demo?pas=0.1', // 100 ms : on ne lit plus l'étape à l'écran
  ]) {
    assert.equal(lireDelaiEtape(hash), DELAI_MS_DEFAUT, `devrait retomber sur le défaut : ${hash}`);
  }
});

test('hashAvecDelaiEtape : écrit en secondes, sans zéro inutile, sans perdre le reste', () => {
  assert.equal(hashAvecDelaiEtape('#/demo', 2400), '#/demo?pas=2.4');
  assert.equal(hashAvecDelaiEtape('#/demo?tournage=1', 3500), '#/demo?tournage=1&pas=3.5');
  assert.equal(hashAvecDelaiEtape('#/demo?tournage=1&pas=1.6', 3000), '#/demo?tournage=1&pas=3');
  assert.ok(hashAvecDelaiEtape('#/demo?mine=1', 1600).includes('mine=1'), 'paramètre perdu');
});

test('le rythme écrit dans l’URL se relit à l’identique (aller-retour)', () => {
  for (const ms of [DELAI_MS_MIN, 1600, DELAI_MS_DEFAUT, 3500, DELAI_MS_MAX]) {
    assert.equal(lireDelaiEtape(hashAvecDelaiEtape('#/demo', ms)), ms, `perdu : ${ms} ms`);
  }
});

// ─── 9. Cadrage 1000 px (mode tournage) ─────────────────────────────
//
// Objectif mesuré le 12/10 : la répartition nominative doit être visible
// SANS DÉFILER, y compris sur un portable (fenêtre moins haute que le
// cadre). Le cadre garde sa taille logique ; c'est le rendu qui s'adapte.

test('echelleCadrage : le cadre tient dans la fenêtre, plafonné à 1', () => {
  assert.equal(echelleCadrage(1400), 1, 'une fenêtre plus haute que le cadre ne l’agrandit pas');
  assert.ok(Math.abs(echelleCadrage(1000) - 0.992) < 1e-9, `mesuré : ${echelleCadrage(1000)}`);
  // Une fenêtre 16:9 à 1280 de large fait 720 de haut : c'est le cas réel
  // d'un enregistrement, et le cadre doit y tenir entier.
  assert.ok(CADRAGE_PX * echelleCadrage(720) <= 720, 'le cadre doit tenir en 720 px de haut');
  assert.ok(CADRAGE_PX * echelleCadrage(1000) <= 1000);
});

test('echelleCadrage : plancher respecté — en dessous, on préfère le défilement', () => {
  // Le texte de 12,5 px tomberait sous ~9 px équivalents : illisible, donc
  // infilmable. On plafonne et on rend le défilement plutôt qu'une vidéo
  // qu'on ne peut pas lire.
  assert.equal(echelleCadrage(600), ECHELLE_CADRAGE_MIN);
  assert.equal(echelleCadrage(100), ECHELLE_CADRAGE_MIN);
});

test('echelleCadrage : entrées dégénérées → 1 (jamais 0, jamais NaN)', () => {
  for (const entree of [0, -1, NaN, Infinity, undefined as unknown as number]) {
    assert.equal(echelleCadrage(entree), 1, `entrée refusée : ${String(entree)}`);
  }
  assert.equal(echelleCadrage(508, 500, 8), 1);
  assert.equal(echelleCadrage(500, 0), 1, 'un cadre de hauteur nulle ne divise pas par zéro');
});

test('le cadrage n’est appliqué QU’EN mode tournage, et il est marqué dans le DOM', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx').replace(/\/\/[^\n]*/g, '');
  // Marquage : les mesures et les captures s'y accrochent, et l'inspecteur
  // explique d'un coup d'œil la largeur inhabituelle.
  assert.match(page, /data-cadrage=\{tournage \? String\(CADRAGE_PX\) : undefined\}/);
  // Hors tournage : la largeur publique et AUCUNE transformation.
  assert.match(page, /maxWidth: tournage \? undefined : 1160/);
  assert.ok(page.includes('transform: tournage ?'), 'la transformation doit rester conditionnelle');
  assert.ok(
    page.includes('height: CADRAGE_PX * echelleCadre'),
    'le conteneur doit porter la hauteur réelle, sinon la page défile malgré l’échelle'
  );
});

test('la page expose le rythme et l’écrit dans l’URL (réglage de prise)', () => {
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  assert.ok(page.includes('setDelaiMs'), 'la page doit pouvoir changer le rythme');
  for (const cle of ['rythmeRapide', 'rythmeNormal', 'rythmeLent', 'rythmeHint', 'rythme']) {
    assert.ok(page.includes(cle), `réglage manquant dans la page : ${cle}`);
    assert.equal(typeof frDemo[cle], 'string', `clé FR manquante : demo.${cle}`);
    assert.equal(typeof enDemo[cle], 'string', `clé EN manquante : demo.${cle}`);
  }
});

test('la pastille du mode tournage affiche le rythme ET le cadrage EFFECTIFS', () => {
  // Une valeur d'URL refusée (hors bornes) doit se voir à l'écran : c'est
  // ce qui distingue « réglage ignoré » de « réglage appliqué autrement ».
  for (const [nom, dict] of [['FR', frDemo], ['EN', enDemo]] as const) {
    const gabarit = dict.tournageOn as string;
    for (const cle of ['pas', 'largeur']) {
      assert.ok(gabarit.includes(`{{${cle}}}`), `demo.tournageOn ${nom} sans {{${cle}}}`);
    }
  }
  const page = lire('src/pages/premium/PremiumDemo.tsx');
  assert.match(page, /t\('demo\.tournageOn', \{[\s\S]{0,160}?pas:[\s\S]{0,120}?largeur: CADRAGE_PX/);
});
