// scripts/pre-soumission.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du contrôle de pré-soumission (scripts/pre-soumission.mjs).
//
// Ce que ce fichier protège : un contrôle qui répond « tout va bien »
// sans rien avoir regardé est pire que pas de contrôle — il donne le
// droit de déposer. Les quatre issues sont donc exercées sur les
// fonctions pures (sans réseau), et les garde-fous de source vérifient
// les deux règles qui ne se voient pas à l'exécution :
//
//   1. le script interroge l'endpoint de l'APPLICATION (le relais), pas
//      un nœud public trouvé à côté — sinon il prouverait le mauvais
//      endpoint, exactement comme les scripts RPC existants ;
//   2. toute URL affichée passe par `masquerEndpoint()` — le rapport
//      finit collé dans un ticket ou montré au jury.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BANDEAU_REFUS,
  EN_TETES_CLIENT,
  FICHIERS_ENV,
  base58,
  discriminantCompte,
  enTetesRefuses,
  fichiersDeclarantEndpoint,
  lireEnv,
  lireProgramme,
  resoudreEndpointPrincipal,
  verdictSoumission,
} from './pre-soumission.mjs';

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

const idl = JSON.parse(lire('../src/idl/buildpact.json'));
const script = lire('./pre-soumission.mjs');

/** Sonde « tout s'est bien passé », telle que la rend `classerReponse`. */
const saine = { verdict: 'sain', httpStatus: 200, detail: '' };

// ─── 1. Lecture des fichiers d'environnement ─────────────────────────

test('lireEnv : clés, commentaires, guillemets et lignes vides', () => {
  const valeurs = lireEnv(
    [
      '# un commentaire',
      '',
      'VITE_SUPABASE_URL=https://exemple.supabase.co',
      '  VITE_AUTRE = "valeur entre guillemets" ',
      "SIM_QUOTE='https://guillemets-simples.test'",
      'VIDE=',
      '=sans-cle',
      'pas une affectation',
    ].join('\n')
  );
  assert.equal(valeurs.VITE_SUPABASE_URL, 'https://exemple.supabase.co');
  assert.equal(valeurs.VITE_AUTRE, 'valeur entre guillemets', 'espaces et guillemets retirés');
  assert.equal(valeurs.SIM_QUOTE, 'https://guillemets-simples.test');
  assert.equal('VIDE' in valeurs, false, 'une valeur vide vaut « absente »');
  assert.equal(Object.keys(valeurs).length, 3);
});

test('lireEnv : un « # » dans une valeur n’est PAS un commentaire', () => {
  // Le cas réel : un endpoint peut porter un fragment ou une query string.
  // Couper sur le « # » ferait porter le contrôle sur une autre URL que
  // celle de l'application — silencieusement.
  const valeurs = lireEnv('ENDPOINT=https://exemple.test/rpc#section');
  assert.equal(valeurs.ENDPOINT, 'https://exemple.test/rpc#section');
});

test('le script lit .env.local AVANT .env', () => {
  // Ordre de Vite, et ordre de priorité : un poste de travail doit pouvoir
  // surcharger ce qui est committé.
  assert.deepEqual(FICHIERS_ENV, ['.env.local', '.env']);
});

test('fichiersDeclarantEndpoint : refuse la déclaration, ignore le commentaire', () => {
  const declarations = (texte: string) =>
    fichiersDeclarantEndpoint([{ nom: '.env.local', texte }]);

  // Refusés : les deux noms historiques, et tout nom qui ANNONCE un nœud.
  for (const texte of [
    'VITE_RPC_ENDPOINT=https://devnet.helius-rpc.com/?api-key=deadbeef\n',
    "VITE_REACT_APP_SOLANA_RPC_URL='https://exemple.test'\n",
    'VITE_HELIUS_URL=https://mainnet.helius-rpc.com\n',
    'VITE_DEVNET_URL=https://exemple.test\n',
  ]) {
    assert.deepEqual(declarations(texte), ['.env.local'], `non refusé : ${texte.trim()}`);
  }

  // Acceptés : ce que Vite n'incruste pas, et ce qui ne fait que documenter.
  for (const texte of [
    '# VITE_RPC_ENDPOINT=https://exemple.test\n',
    'VITE_SUPABASE_URL=https://exemple.supabase.co\nVITE_VAPID_PUBLIC_KEY=BEx\n',
    'RPC_URL=https://api.devnet.solana.com\n',
    '',
  ]) {
    assert.deepEqual(declarations(texte), [], `refusé à tort : ${texte.trim() || '(vide)'}`);
  }
});

// ─── 2. Programme : deux sources qui doivent concorder ───────────────

test('lireProgramme : concordance code ↔ IDL', () => {
  const constants = lire('../src/lib/constants.ts');
  const p = lireProgramme(constants, idl);
  assert.ok(p.duCode, 'constants.ts doit exposer PROGRAM_ID');
  assert.equal(p.duCode, idl.address);
  assert.equal(p.coherent, true);
});

test('lireProgramme : une divergence est signalée, pas lissée', () => {
  const constants = lire('../src/lib/constants.ts');
  const faux = { address: 'So11111111111111111111111111111111111111112' };
  const p = lireProgramme(constants, faux);
  assert.equal(p.coherent, false);
  assert.equal(p.duCode, idl.address, 'le code reste la source du programme interrogé');
  assert.equal(p.deIdl, faux.address);

  // Formulaire d'écriture accepté : espaces et guillemets doubles.
  const variante = `export const PROGRAM_ID = new PublicKey("${idl.address}");`;
  assert.equal(lireProgramme(variante, idl).duCode, idl.address);
  assert.equal(lireProgramme('const rien = 1;', idl).duCode, null);
});

test('le discriminant Project du script est celui que l’IDL déclare', () => {
  // La règle (sha256("account:Project"), 8 premiers octets) est vérifiée
  // contre le fichier que l'application utilise réellement : une
  // convention fausse enverrait un `memcmp` qui ne matche aucun compte, et
  // le rapport conclurait « 0 pact » sur une chaîne qui en contient six.
  const attendu = idl.accounts.find((a: { name: string }) => a.name === 'Project')?.discriminator;
  assert.ok(Array.isArray(attendu), 'l’IDL doit déclarer le discriminant de Project');
  assert.equal(Buffer.from(attendu).toString('hex'), discriminantCompte('Project').toString('hex'));
});

test('base58 : encodage conforme et déterministe', () => {
  // 0x00 → '1' (le zéro de tête de base58), et un aller-retour stable.
  assert.equal(base58(Buffer.from([0])), '1');
  assert.equal(base58(discriminantCompte('Project')), base58(discriminantCompte('Project')));
  assert.notEqual(base58(discriminantCompte('Project')), base58(discriminantCompte('Vault')));
  const sortie = base58(discriminantCompte('Project'));
  assert.ok(/^[1-9A-HJ-NP-Za-km-z]+$/.test(sortie), `alphabet inattendu : ${sortie}`);
  assert.ok(sortie.length >= 8 && sortie.length <= 11, `longueur inattendue : ${sortie.length}`);
});

// ─── 3. Endpoint : celui de l'application, jamais un autre ───────────

test('resoudreEndpointPrincipal : le relais vient de VITE_SUPABASE_URL', () => {
  const r = resoudreEndpointPrincipal({ env: { VITE_SUPABASE_URL: 'https://exemple.supabase.co' } });
  assert.equal(r.url, 'https://exemple.supabase.co/functions/v1/rpc');
  assert.match(r.source, /environnement/);
});

test('resoudreEndpointPrincipal : priorité argument > environnement > fichier > repli', () => {
  const base = {
    explicite: 'https://nœud-direct.test/rpc',
    env: { VITE_SUPABASE_URL: 'https://env.supabase.co' },
    fichierEnv: { VITE_SUPABASE_URL: 'https://fichier.supabase.co' },
    repliSupabase: 'https://repli.supabase.co',
  };
  assert.equal(resoudreEndpointPrincipal(base).url, 'https://nœud-direct.test/rpc');
  assert.equal(
    resoudreEndpointPrincipal({ ...base, explicite: null }).url,
    'https://env.supabase.co/functions/v1/rpc'
  );
  assert.equal(
    resoudreEndpointPrincipal({ explicite: null, env: {}, fichierEnv: base.fichierEnv }).url,
    'https://fichier.supabase.co/functions/v1/rpc'
  );
  const dernier = resoudreEndpointPrincipal({ env: {}, fichierEnv: {}, repliSupabase: base.repliSupabase });
  assert.equal(dernier.url, 'https://repli.supabase.co/functions/v1/rpc');
  assert.match(dernier.source, /repli/);
});

test('resoudreEndpointPrincipal : aucune source → null (et non une URL bancale)', () => {
  const r = resoudreEndpointPrincipal({ env: {}, fichierEnv: {}, repliSupabase: '' });
  assert.equal(r.url, null);
  assert.match(r.source, /introuvable/);
  // Une base qui n'est pas une URL http(s) rend aussi null : c'est ce qui
  // déclenche le code de sortie « indéterminable » plutôt qu'une sonde
  // sur `undefined/functions/v1/rpc`.
  assert.equal(resoudreEndpointPrincipal({ env: { VITE_SUPABASE_URL: 'pas-une-url' } }).url, null);
});

// ─── 4. Verdict : les quatre issues ─────────────────────────────────

test('verdict : les deux sondes passent → 0, rien à faire', () => {
  const v = verdictSoumission({ version: saine, gpa: saine, comptes: 9, pacts: 6 });
  assert.equal(v.code, 0);
  assert.equal(v.action, null);
  assert.match(v.titre, /9 compte/);
});

test('verdict : endpoint absent (le cas « fonction Edge non déployée ») → refus', () => {
  const v = verdictSoumission({
    version: { verdict: 'endpoint-absent', httpStatus: 404, detail: 'Requested function was not found' },
    gpa: null,
    comptes: null,
  });
  assert.equal(v.code, 1);
  assert.match(v.titre, /JSON-RPC/);
  assert.match(v.action ?? '', /deploy rpc/);
  assert.match(v.action ?? '', /CHECKLIST/);
});

test('verdict : méthode bridée (-32401) → refus, avec le bon geste', () => {
  // Le piège que ce script existe pour attraper : getVersion répond,
  // l'app afficherait quand même « 0 pact ».
  const v = verdictSoumission({
    version: saine,
    gpa: { verdict: 'methode-bridee', httpStatus: 200, detail: 'method not allowed' },
    comptes: null,
  });
  assert.equal(v.code, 1);
  assert.match(v.titre, /BRIDE/);
  assert.match(v.action ?? '', /0 pact/);
});

test('verdict : programme vide → refus (la démo serait vide)', () => {
  const v = verdictSoumission({ version: saine, gpa: saine, comptes: 0, pacts: 0 });
  assert.equal(v.code, 1);
  assert.match(v.titre, /AUCUN compte/);
  assert.match(v.action ?? '', /0 pact/);
});

// ─── 4bis. Pré-vol CORS : la panne du 12/10/2026 ────────────────────

test('enTetesRefuses : la régression `solana-client` est nommée', () => {
  // Ce qui s'est passé : `Access-Control-Allow-Headers` listait tout SAUF
  // `solana-client`. Le pré-vol échouait donc côté navigateur seulement.
  const refuses = enTetesRefuses('content-type, apikey, authorization, x-client-info');
  assert.deepEqual(refuses, ['solana-client']);
  // Et la liste corrigée passe.
  assert.deepEqual(
    enTetesRefuses('content-type, apikey, authorization, x-client-info, solana-client'),
    []
  );
  // Insensible à la casse et aux espaces : un en-tête autorisé reste autorisé.
  assert.deepEqual(enTetesRefuses('Content-Type ,  SOLANA-CLIENT'), []);
  // Une liste absente (ou vide) = tout est refusé : on ne suppose rien.
  assert.deepEqual(enTetesRefuses(null), EN_TETES_CLIENT);
  assert.deepEqual(enTetesRefuses(''), EN_TETES_CLIENT);
  // `solana-client` doit rester DANS la liste attendue : c'est tout l'objet
  // de ce test, et le retirer rendrait la sonde aveugle à sa propre panne.
  assert.ok(EN_TETES_CLIENT.includes('solana-client'));
});

test('verdict : pré-vol qui refuse un en-tête → refus, et le geste le nomme', () => {
  const v = verdictSoumission({
    version: saine,
    gpa: saine,
    comptes: 9,
    pacts: 6,
    cors: { httpStatus: 200, origin: '*', entetes: 'content-type', manquants: ['solana-client'] },
  });
  assert.equal(v.code, 1, 'un relais que le navigateur ne peut pas appeler n’est pas prêt');
  assert.match(v.titre, /REFUSE/);
  assert.match(v.titre, /solana-client/);
  assert.match(v.action ?? '', /Access-Control-Allow-Headers/);
  assert.match(v.action ?? '', /redéployer/);
});

test('verdict : réponse sans aucun en-tête CORS d’origine → refus', () => {
  const v = verdictSoumission({
    version: saine,
    gpa: saine,
    comptes: 9,
    cors: { httpStatus: 200, origin: null, entetes: null, manquants: EN_TETES_CLIENT },
  });
  assert.equal(v.code, 1);
  assert.match(v.titre, /AUCUN en-tête CORS/);
  assert.match(v.action ?? '', /Access-Control-Allow-Origin/);
});

test('verdict : pas de sonde CORS (null) → elle ne décide pas', () => {
  // `--endpoint` sonde un nœud direct, que l'app n'appelle pas : exiger de
  // lui des en-têtes CORS ferait refuser un contrôle légitime.
  assert.equal(verdictSoumission({ version: saine, gpa: saine, comptes: 9, cors: null }).code, 0);
  assert.equal(
    verdictSoumission({ version: saine, gpa: saine, comptes: 9, cors: { origin: '*', manquants: [] } }).code,
    0
  );
});

test('le script envoie VRAIMENT un pré-vol (OPTIONS + Origin + en-têtes annoncés)', () => {
  // Un verdict qui parle de pré-vol sans jamais en envoyer serait pire
  // qu'inutile : il rassurerait. On vérifie donc la requête elle-même.
  assert.match(script, /method: 'OPTIONS'/);
  assert.match(script, /Origin: ORIGINE_PREVOL/);
  assert.match(script, /'Access-Control-Request-Headers'/);
  assert.match(script, /'access-control-allow-headers'/);
  assert.match(script, /verdictSoumission\(\{ version, gpa, comptes, pacts, cors: corsDecisif \}\)/);
});

test('verdict : aucune sonde du tout → refus, jamais « prêt »', () => {
  // Le cas qui compte le plus : si rien n'a pu être mesuré, on refuse.
  assert.equal(verdictSoumission({}).code, 1);
  assert.equal(verdictSoumission({ version: null, gpa: null }).code, 1);
  assert.equal(verdictSoumission({ version: saine, gpa: null }).code, 1);
});

// ─── 5. Garde-fous de source ────────────────────────────────────────

test('le script interroge l’endpoint de l’app, jamais une variable VITE_RPC_*', () => {
  // Une régression ici rendrait le contrôle trompeur : il sonderait un
  // nœud direct pendant que l'app tourne sur le relais.
  assert.match(script, /env\?\.VITE_SUPABASE_URL/);
  assert.equal(
    /(env|fichierEnv)\.(VITE_RPC_ENDPOINT|VITE_REACT_APP_SOLANA_RPC_URL)/.test(script),
    false,
    'le script ne doit rien lire dans une variable VITE_RPC_*'
  );
  // …mais il REFUSE leur présence dans un fichier d'environnement local :
  // c'est la déclaration — jamais le code — qui a servi la clé Helius dans
  // le bundle de production, mesuré le 11/10/2026.
  assert.match(script, /VITE_\[A-Z0-9_\]\*\(RPC\|HELIUS\|SOLANA\|DEVNET\)/);
  assert.match(script, /fichiersDeclarantEndpoint\(/);
  assert.match(script, /process\.exit\(1\)/);
});

test('chaque endpoint affiché passe par masquerEndpoint()', () => {
  assert.match(script, /masquerEndpoint\(endpoint\)/);
  assert.match(script, /masquerEndpoint\(repli\)/);
  // Aucun `console.log` ne doit rendre l'URL brute : on cherche la
  // variable seule dans une interpolation ou un argument.
  const affichages = script.match(/console\.log\([\s\S]{0,120}?\)/g) ?? [];
  for (const ligne of affichages) {
    assert.equal(
      /\$\{endpoint\}/.test(ligne),
      false,
      `endpoint affiché sans masque : ${ligne.replace(/\s+/g, ' ')}`
    );
  }
});

test('le script REFUSE bruyamment : le bandeau est unique et sort en erreur', () => {
  assert.equal(BANDEAU_REFUS, 'NE PAS DÉPOSER');
  assert.match(script, /process\.exit\(verdict\.code\)/);
  // Le code de sortie du verdict est 1 pour tout refus (testé ci-dessus) :
  // une CI ou un enchaînement de commandes s'arrête là.
  assert.equal(verdictSoumission({ version: null }).code, 1);
});

test('le script ne s’exécute pas à l’import (sinon les tests sonderaient le réseau)', () => {
  assert.match(
    script,
    /const invoqueDirectement =\s*\n?\s*process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/
  );
  assert.match(script, /if \(invoqueDirectement\) \{/);
});
