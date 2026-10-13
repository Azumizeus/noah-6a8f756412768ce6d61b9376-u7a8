// scripts/rpc-health.test.ts
// ═══════════════════════════════════════════════════════════════════
// Garde-fou du bandeau de santé RPC (lib/rpcHealth.ts).
//
// Contexte mesuré le 11/10/2026 : la fonction Edge `rpc` existe dans le
// dépôt mais n'est pas déployée → l'endpoint PRINCIPAL rend 404 → l'app
// bascule sur le devnet public sans rien dire. « 0 pact » à l'écran, aucune
// cause affichée.
//
// Ce que ce fichier protège, dans l'ordre d'importance :
//   1. la classification des réponses (c'est elle qui décide si on alerte) ;
//   2. la règle d'affichage : alerter sur un endpoint mort, JAMAIS sur un
//      429 passager (un bandeau qui s'allume pour rien ne se lit plus) ;
//   3. la non-divulgation : le résumé ne doit contenir aucune clé d'API,
//      uniquement des origines (lib/rpcMask.ts) ;
//   4. le câblage : le shell premium monte vraiment le bandeau, et chaque
//      rotation d'`anchor.ts` déclare son motif — sans motif, le bandeau
//      afficherait « nœud saturé » pour un relais absent.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DETAIL_MAX,
  MOTIF_KEYS,
  VERDICT_KEYS,
  classerReponse,
  doitAlerter,
  messageSante,
  niveauDepuisVerdict,
  resumerSante,
  sonderEndpoint,
  type SondeRpc,
} from '../src/lib/rpcHealth.ts';
import { frRpcHealth } from '../src/lib/i18n/fr.rpcHealth.ts';
import { enRpcHealth } from '../src/lib/i18n/en.rpcHealth.ts';
import { stylesBandeau } from '../src/lib/rpcBannerStyles.ts';
import { modeTournageActif } from '../src/lib/tournage.ts';

/** Les tables VERDICT_KEYS / MOTIF_KEYS portent la clé i18n COMPLÈTE (elles
 *  sont passées telles quelles à t()), alors que les dictionnaires sont
 *  indexés par clé nue. Ce pont évite de recopier un préfixe à la main. */
const nue = (cle: string) => cle.replace(/^rpcHealth\./, '');

const RELAIS = 'https://exemple.supabase.co/functions/v1/rpc';
const DEVNET = 'https://api.devnet.solana.com';

/** Réponse JSON-RPC 200 générique, pour les cas « ça marche ». */
const OK_JSON = JSON.stringify({ jsonrpc: '2.0', id: 'buildpact-sante', result: { 'solana-core': '1.18.0' } });

// ─── 1. Classification des réponses ───────────────────────────────────

test('404 → endpoint-absent (le cas « fonction Edge non déployée »)', () => {
  const r = classerReponse(404, '{"code":"NOT_FOUND","message":"Requested function was not found"}');
  assert.equal(r.verdict, 'endpoint-absent');
  assert.equal(r.httpStatus, 404);
  assert.ok(r.detail.length > 0, 'le corps doit être conservé pour le diagnostic');
});

test('429 → throttle, et PAS hors-service', () => {
  assert.equal(classerReponse(429, 'too many requests').verdict, 'throttle');
  // Distinction qui porte tout le bandeau : un nœud saturé reste utilisable.
  assert.equal(niveauDepuisVerdict('throttle'), 'degrade');
});

test('5xx et refus 4xx → endpoint-en-panne', () => {
  assert.equal(classerReponse(503, 'Service Unavailable').verdict, 'endpoint-en-panne');
  assert.equal(classerReponse(500, '').verdict, 'endpoint-en-panne');
  assert.equal(classerReponse(401, 'unauthorized').verdict, 'endpoint-en-panne');
  assert.equal(classerReponse(403, '').verdict, 'endpoint-en-panne');
});

test('200 avec une page HTML → pas-du-json (mauvaise URL, pas un nœud)', () => {
  const r = classerReponse(200, '<!doctype html><html><body>BuildPact</body></html>');
  assert.equal(r.verdict, 'pas-du-json');
  assert.equal(niveauDepuisVerdict('pas-du-json'), 'hors-service');
});

test('200 avec un corps vide, un tableau ou un objet sans result/error → pas-du-json', () => {
  assert.equal(classerReponse(200, '   ').verdict, 'pas-du-json');
  assert.equal(classerReponse(200, '[]').verdict, 'pas-du-json');
  assert.equal(classerReponse(200, '{"jsonrpc":"2.0","id":"x"}').verdict, 'pas-du-json');
});

test('200 avec result → sain', () => {
  const r = classerReponse(200, OK_JSON);
  assert.equal(r.verdict, 'sain');
  assert.equal(niveauDepuisVerdict('sain'), 'ok');
});

test('-32401 → methode-bridee, toute autre erreur JSON-RPC → erreur-rpc', () => {
  const bridage = JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32401, message: 'not allowed' } });
  assert.equal(classerReponse(200, bridage).verdict, 'methode-bridee');
  const autre = JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } });
  assert.equal(classerReponse(200, autre).verdict, 'erreur-rpc');
  // Même niveau : l'endpoint vit, il refuse un appel. On n'annonce pas une panne.
  assert.equal(niveauDepuisVerdict('methode-bridee'), 'degrade');
  assert.equal(niveauDepuisVerdict('erreur-rpc'), 'degrade');
});

test('le détail est borné : il se finit dans un bandeau, pas dans un journal', () => {
  const enorme = 'x'.repeat(5000);
  const r = classerReponse(404, enorme);
  assert.ok(r.detail.length <= DETAIL_MAX + 1, `détail trop long : ${r.detail.length}`);
  assert.ok(r.detail.endsWith('…'));
});

// ─── 2. Sonde, avec un `fetch` injecté ────────────────────────────────

test('la sonde classifie la réponse du faux endpoint', async () => {
  const fetchFactice = (async () =>
    new Response(OK_JSON, { status: 200 })) as unknown as typeof fetch;
  const r = await sonderEndpoint(RELAIS, { fetchImpl: fetchFactice });
  assert.equal(r.verdict, 'sain');
});

test('un endpoint qui casse devient injoignable, jamais une exception', async () => {
  const fetchFactice = (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
  const r = await sonderEndpoint(RELAIS, { fetchImpl: fetchFactice });
  assert.equal(r.verdict, 'injoignable');
  assert.equal(r.httpStatus, 0);
  assert.equal(niveauDepuisVerdict('injoignable'), 'hors-service');
});

test('sans endpoint configuré, on ne prétend pas avoir mesuré', async () => {
  const r = await sonderEndpoint('   ');
  assert.equal(r.verdict, 'endpoint-absent');
  assert.equal(r.detail, 'aucun endpoint configuré');
});

test('sans `fetch` disponible, la sonde le dit au lieu de planter', async () => {
  const r = await sonderEndpoint(RELAIS, { fetchImpl: undefined });
  // Sous Node 18+, `fetch` global existe : on ne peut donc pas forcer son
  // absence. On vérifie seulement que l'appel rend un verdict valide.
  assert.ok(['sain', 'injoignable', 'endpoint-en-panne', 'pas-du-json'].includes(r.verdict));
});

// ─── 3. Résumé : masquage et détection de bascule ─────────────────────

const CLE_FUITE = 'api-key=SECRET-A-NE-PAS-AFFICHER';

function sondeFactice(verdict: SondeRpc['verdict']): SondeRpc {
  return { verdict, httpStatus: 200, detail: '' };
}

test('le résumé ne contient JAMAIS une clé d\'API, seulement des origines', () => {
  const sante = resumerSante({
    sonde: sondeFactice('endpoint-absent'),
    primaire: `https://devnet.helius-rpc.com/?${CLE_FUITE}`,
    actif: DEVNET,
    rotation: {
      liste: 'lecture',
      depuis: `https://devnet.helius-rpc.com/?${CLE_FUITE}`,
      vers: DEVNET,
      motif: 'relais-injoignable',
      a: 1,
    },
    verifieA: 2,
  });

  const rendu = JSON.stringify(sante);
  assert.ok(!rendu.includes('SECRET-A-NE-PAS-AFFICHER'), `clé divulguée : ${rendu}`);
  assert.equal(sante.primaire, 'https://devnet.helius-rpc.com');
  assert.equal(sante.actif, DEVNET);
  assert.equal(sante.rotation?.depuis, 'https://devnet.helius-rpc.com');
});

test('surRepli : vrai seulement si les deux endpoints diffèrent', () => {
  const base = { sonde: sondeFactice('sain'), primaire: RELAIS };
  assert.equal(resumerSante({ ...base, actif: RELAIS }).surRepli, false);
  assert.equal(resumerSante({ ...base, actif: DEVNET }).surRepli, true);
  // Sans endpoint actif connu, on n'affirme rien.
  assert.equal(resumerSante({ ...base, actif: '' }).surRepli, false);
});

test('niveau inconnu tant que la sonde n\'a pas rendu son verdict', () => {
  const sante = resumerSante({ sonde: null, primaire: RELAIS, actif: RELAIS });
  assert.equal(sante.niveau, 'inconnu');
  assert.equal(sante.verdict, null);
});

// ─── 4. Règle d'affichage ─────────────────────────────────────────────

test('endpoint principal mort → on alerte', () => {
  const sante = resumerSante({
    sonde: sondeFactice('endpoint-absent'),
    primaire: RELAIS,
    actif: DEVNET,
  });
  assert.equal(doitAlerter(sante), true);
  const message = messageSante(sante);
  assert.ok(message);
  assert.equal(message.cle, 'rpcHealth.alertFallback');
  assert.equal(message.ton, 'alerte');
  assert.equal(message.verdictCle, VERDICT_KEYS['endpoint-absent']);
});

test('endpoint mort AVANT la bascule → on annonce le repli au lieu de dire qu\'il n\'y en a pas', () => {
  const sante = resumerSante({
    sonde: sondeFactice('injoignable'),
    primaire: RELAIS,
    actif: RELAIS,
    repli: DEVNET,
  });
  const message = messageSante(sante);
  assert.equal(message?.cle, 'rpcHealth.alertDown');
  // Le repli est nommé : sans ça, le bandeau observé en dev annonçait
  // « aucun repli » alors que la liste en contenait un.
  assert.equal(message?.params.repli, DEVNET);
  assert.ok(
    String(frRpcHealth.alertDown).includes('{{repli}}'),
    'le libellé doit porter le nom du repli'
  );
});

test('endpoint mort ET aucun repli dans la liste → « rien ne se chargera »', () => {
  const sante = resumerSante({
    sonde: sondeFactice('injoignable'),
    primaire: RELAIS,
    actif: RELAIS,
  });
  assert.equal(messageSante(sante)?.cle, 'rpcHealth.alertNoFallback');
  assert.equal(sante.repli, null);
});

test('le repli annoncé est masqué comme le reste', () => {
  const sante = resumerSante({
    sonde: sondeFactice('endpoint-absent'),
    primaire: RELAIS,
    actif: RELAIS,
    repli: `https://devnet.helius-rpc.com/?${CLE_FUITE}`,
  });
  assert.equal(sante.repli, 'https://devnet.helius-rpc.com');
  assert.ok(!JSON.stringify(sante).includes('SECRET-A-NE-PAS-AFFICHER'));
});

test('un 429 passager SANS bascule n\'affiche rien', () => {
  const sante = resumerSante({
    sonde: sondeFactice('throttle'),
    primaire: RELAIS,
    actif: RELAIS,
  });
  assert.equal(sante.niveau, 'degrade');
  assert.equal(doitAlerter(sante), false);
  assert.equal(messageSante(sante), null);
});

test('tout va bien → aucun bandeau', () => {
  const sante = resumerSante({ sonde: sondeFactice('sain'), primaire: RELAIS, actif: RELAIS });
  assert.equal(doitAlerter(sante), false);
  assert.equal(messageSante(sante), null);
});

test('absence de mesure ET absence de bascule → pas d\'alerte ; bascule seule → alerte', () => {
  const sansRien = resumerSante({ sonde: null, primaire: RELAIS, actif: RELAIS });
  assert.equal(doitAlerter(sansRien), false);

  // Une rotation observée est un FAIT : on la signale sans attendre la sonde.
  const bascule = resumerSante({
    sonde: null,
    primaire: RELAIS,
    actif: DEVNET,
    rotation: { liste: 'lecture', depuis: RELAIS, vers: DEVNET, motif: 'relais-injoignable', a: 5 },
  });
  assert.equal(doitAlerter(bascule), true);
  const message = messageSante(bascule);
  assert.equal(message?.cle, 'rpcHealth.alertRotated');
  // Information, pas panne : le repli fonctionne.
  assert.equal(message?.ton, 'info');
  assert.equal(message?.motifCle, MOTIF_KEYS['relais-injoignable']);
});

test('le motif de rotation est traduit, pas affiché en clair', () => {
  for (const motif of Object.keys(MOTIF_KEYS) as (keyof typeof MOTIF_KEYS)[]) {
    const cle = nue(MOTIF_KEYS[motif]);
    assert.ok(typeof frRpcHealth[cle] === 'string', `clé FR manquante : ${cle}`);
    assert.ok(typeof enRpcHealth[cle] === 'string', `clé EN manquante : ${cle}`);
  }
});

// ─── 5. Parité i18n : une clé utilisée par le code doit exister ────────

test('toutes les clés verdict utilisées par le bandeau existent en FR et en EN', () => {
  for (const cle of Object.values(VERDICT_KEYS)) {
    assert.ok(typeof frRpcHealth[nue(cle)] === 'string', `clé FR manquante : ${nue(cle)}`);
    assert.ok(typeof enRpcHealth[nue(cle)] === 'string', `clé EN manquante : ${nue(cle)}`);
  }
  // Les clés appelées directement par le composant, hors tables.
  const directes = [
    'title',
    'titleDegraded',
    'alertFallback',
    'alertDown',
    'alertNoFallback',
    'alertRotated',
    'reason',
    'checkedAt',
    'retry',
    'checking',
    'settings',
    'hide',
  ];
  for (const cle of directes) {
    assert.ok(typeof frRpcHealth[cle] === 'string', `clé FR manquante : rpcHealth.${cle}`);
    assert.ok(typeof enRpcHealth[cle] === 'string', `clé EN manquante : rpcHealth.${cle}`);
  }
});

test('les deux dictionnaires rpcHealth portent exactement les mêmes clés', () => {
  const fr = Object.keys(frRpcHealth).sort();
  const en = Object.keys(enRpcHealth).sort();
  assert.deepEqual(en, fr);
});

// ─── 6. Câblage : sans ça, tout ce qui précède reste invisible ────────

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');

test('le shell premium monte le bandeau (sinon la détection ne sert à rien)', () => {
  const nav = lire('src/pages/premium/PremiumNav.tsx');
  assert.ok(nav.includes('RpcHealthBanner'), 'PremiumNav doit monter RpcHealthBanner');
  assert.ok(nav.includes('useRpcHealth'), 'PremiumNav doit utiliser useRpcHealth');
});

test('chaque rotation déclare son motif (sinon le bandeau mentirait sur la cause)', () => {
  // Les commentaires sont retirés avant l'analyse : le fichier en contient
  // qui citent `rotateRpc()` en prose, et ils brouilleraient la découpe.
  const anchor = lire('src/lib/anchor.ts').replace(/\/\/[^\n]*/g, '');
  const appels = [...anchor.matchAll(/rotate(?:Read)?Rpc\(([\s\S]{0,400}?)\)\s*;/g)];
  assert.ok(appels.length >= 2, `les deux points de rotation doivent être présents (${appels.length} trouvés)`);
  for (const [, args] of appels) {
    assert.ok(
      /'(throttle|methode-bridee|relais-injoignable)'/.test(args),
      `motif absent dans : rotateRpc(${args.trim().slice(0, 60)})`
    );
  }
});

test('le bandeau n\'imprime jamais un endpoint brut (il lit le résumé masqué)', () => {
  const banner = lire('src/components/RpcHealthBanner.tsx');
  assert.ok(banner.includes('messageSante'), 'le bandeau doit décider via messageSante()');
  // `sante.primaire` / `sante.actif` sont interpolés dans les libellés : ils
  // viennent de resumerSante(), donc déjà masqués. Le risque serait de
  // reconstruire une URL ici (concaténer un chemin sur l'origine, par ex.).
  assert.ok(!/https?:\/\//.test(banner), 'aucune URL ne doit être écrite en dur dans le bandeau');
});

// ─── 7. Les deux shells : premium ET legacy ──────────────────────────
//
// Le bandeau est né dans le shell premium. `/v1` restait donc le dernier
// endroit de l'app où une panne d'endpoint était muette — et c'est
// justement le shell de secours. Corrigé le 12/10/2026.

/** Pages servies par le shell legacy. Toutes DOIVENT passer par
 *  DashboardLayout, sinon elles n'héritent pas du bandeau. */
const PAGES_LEGACY = [
  'DashboardPage',
  'PactsPage',
  'CreatePactPage',
  'MarketplacePage',
  'AboutPage',
  'DocsPage',
  'PactPublicPage',
  'MonProfilPage',
  'TreasuryPage',
  'BuildersPage',
  'NetworkPage',
  'LandingPage',
];

test('le shell legacy monte le bandeau (sinon /v1 resterait muet)', () => {
  const layout = lire('src/components/DashboardLayout.tsx');
  assert.ok(layout.includes('RpcHealthBanner'), 'DashboardLayout doit rendre le bandeau');
  assert.ok(layout.includes('useRpcHealth'), 'DashboardLayout doit sonder l\'endpoint');
  assert.match(
    layout,
    /variante="legacy"/,
    'la variante legacy est OBLIGATOIRE : /v1 ne définit aucun token --p-*'
  );
});

test('TOUTES les pages legacy passent par DashboardLayout', () => {
  // Le bandeau n'est monté qu'ici : une page legacy écrite un jour sans ce
  // layout redeviendrait un écran muet, sans qu'aucun autre test ne le voie.
  for (const page of PAGES_LEGACY) {
    const source = lire(`src/pages/${page}.tsx`);
    assert.ok(
      source.includes('DashboardLayout'),
      `${page}.tsx n'utilise pas DashboardLayout — elle échapperait au bandeau de santé`
    );
  }
});

test('le shell premium nomme aussi sa variante', () => {
  const nav = lire('src/pages/premium/PremiumNav.tsx');
  assert.match(nav, /variante="premium"/, 'PremiumNav doit déclarer la variante premium');
});

test('« Configurer un RPC » mène à un écran qui OUVRE vraiment le réglage', () => {
  // Un bouton qui promet le champ RPC et dépose l'utilisateur sur une page
  // où il faut encore chercher le panneau ne tient pas sa promesse — au
  // pire moment, puisque c'est là que quelque chose est cassé.
  const layout = lire('src/components/DashboardLayout.tsx');
  assert.match(
    layout,
    /#\/v1\/profile\?settings=1/,
    'le bandeau legacy doit pointer sur le profil avec le paramètre d\'ouverture'
  );
  const profil = lire('src/pages/MonProfilPage.tsx');
  assert.ok(
    profil.includes('settings=1') && profil.includes('setSettingsOpen(true)'),
    'MonProfilPage doit ouvrir le panneau quand ?settings=1 est présent'
  );
  assert.ok(
    profil.includes('replaceState'),
    'refermer doit retirer le paramètre sans relancer un hashchange (sinon il se rouvre)'
  );
});

// ─── 8. Le legacy ne peut pas emprunter les tokens premium ───────────
//
// C'est LA règle qui empêche de recréer le bug qu'on vient de corriger :
// sur /v1, `color: var(--p-ink)` retombe en héritage et
// `background: var(--p-canvas)` sur transparent — un bandeau invisible, donc
// un incident masqué que l'utilisateur croit avoir vérifié.

const serialiser = (styles: ReturnType<typeof stylesBandeau>) => JSON.stringify(styles);

test('la variante legacy ne référence AUCUN token --p-*', () => {
  for (const alerte of [true, false]) {
    const styles = stylesBandeau('legacy', alerte, false);
    assert.ok(
      !serialiser(styles).includes('--p-'),
      `un style legacy emprunte un token premium (alerte=${alerte}) : ${serialiser(styles)}`
    );
  }
});

test('la variante legacy porte de vraies classes, pas du vide', () => {
  const styles = stylesBandeau('legacy', true, false);
  // Le fond : sans classe, la boîte serait transparente.
  assert.ok(styles.containerClass.includes('bg-'), 'le conteneur legacy doit poser un fond');
  assert.ok(styles.containerClass.includes('border'), 'le conteneur legacy doit poser une bordure');
  // Les jetons du shell /v1, qui suivent ses palettes et son mode clair.
  assert.ok(styles.titreClass.includes('text-'), 'le titre legacy doit poser une couleur de texte');
  assert.ok(
    styles.principalClass.includes('bg-accent-violet'),
    'le bouton principal legacy doit utiliser l\'accent du shell /v1'
  );
  // Le message de cause et l'horodatage existent aussi en legacy : sans
  // classe de texte, ils hériteraient d'une couleur illisible.
  assert.ok(styles.causeClass.length > 0 && styles.heureClass.length > 0);
});

test('la variante legacy garde les TROIS actions du bandeau', () => {
  const styles = stylesBandeau('legacy', false, false);
  for (const [nom, classe] of [
    ['principal', styles.principalClass],
    ['secondaire', styles.secondaireClass],
    ['masquer', styles.masquerClass],
  ] as const) {
    assert.ok(classe.length > 0, `action ${nom} sans style en legacy`);
  }
});

test('la variante premium n\'a pas perdu ses tokens (aucune régression visuelle)', () => {
  const styles = stylesBandeau('premium', true, false);
  assert.equal(styles.containerClass, '', 'le premium reste en styles en ligne');
  assert.ok(serialiser(styles.containerStyle).includes('var(--p-canvas)'), 'fond premium');
  assert.ok(serialiser(styles.titreStyle).includes('var(--p-err)'), 'titre premium en alerte');
  assert.ok(serialiser(styles.iconeStyle).includes('var(--p-err)'), 'pastille premium en alerte');
});

test('le ton change le style dans LES DEUX variantes', () => {
  // Une alerte qui ressemble à une information ne se lit pas comme une alerte.
  for (const variante of ['premium', 'legacy'] as const) {
    const alerte = serialiser(stylesBandeau(variante, true, false));
    const info = serialiser(stylesBandeau(variante, false, false));
    assert.notEqual(alerte, info, `alerte et info se ressemblent en ${variante}`);
  }
});

test('une sonde en cours atténue le bouton principal (les deux variantes)', () => {
  assert.ok(serialiser(stylesBandeau('premium', false, true)).includes('0.6'));
  assert.ok(stylesBandeau('legacy', false, true).principalClass.includes('disabled'));
});

// ─── 9. Le mode tournage masque le bandeau ───────────────────────────

test('le bandeau se retire en mode tournage', () => {
  const banner = lire('src/components/RpcHealthBanner.tsx');
  assert.ok(banner.includes('useModeTournage'), 'le bandeau doit lire le mode tournage');
  assert.match(
    banner,
    /if \(modeTournage\) return null;/,
    'le masquage doit précéder le calcul du message, sinon le bandeau se peindrait avant de disparaître'
  );
});

test('le mode tournage démarre TOUJOURS à faux', () => {
  // Un défaut à vrai masquerait toutes les pannes RPC de l'app en silence —
  // exactement ce que le bandeau existe pour empêcher. Lu sur le module
  // réellement chargé, pas sur une intention écrite dans un commentaire.
  assert.equal(
    modeTournageActif(),
    false,
    'le store doit démarrer à faux : le mode ne naît que d\'un hash explicite'
  );
  const demo = lire('src/pages/premium/PremiumDemo.tsx');
  assert.ok(
    !demo.includes('setModeTournage'),
    'seul le hook doit écrire dans le store, jamais une page directement'
  );
});
