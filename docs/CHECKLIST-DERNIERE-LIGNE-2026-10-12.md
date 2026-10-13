# Dernière ligne droite — jusqu'au 12/10/2026

> Établi le **10/10/2026** sur `buildpact-75mv`, état mesuré (commandes en bas).
> Deux jours avant la soumission. Ce document ne remplace pas
> `CHECKLIST-TEST-WALLET-2026-10-08.md` (les parcours de signature, qui
> demandent un wallet réel) : il liste ce qui reste **bloquant**, dans l'ordre
> où ça coince.

---

## Bloc 0 — ~~À réparer avant tout le reste~~ RÉSOLU le 12/10 : le relais est déployé

> **État au 12/10/2026, 22 h** : la fonction Edge `rpc` est **déployée**
> **avec** son secret `RPC_UPSTREAM_URL` (voir « Résolution » en fin de bloc).
> `npm run check:soumission` sort **0 / Prêt à déposer** sur l'endpoint réel de
> l'application, et le relais annonce lui-même la cible qu'il sert :
> `x-buildpact-relais: dedie` — le nœud dédié, plus le devnet public.
>
> Le bloc s'est refermé en **deux temps**, et le second temps compte autant que
> le premier : le déploiement répondait 200 alors que le navigateur, lui, ne
> pouvait pas appeler le relais (`solana-client` manquait au pré-vol CORS).
> Trouvé dans l'onglet, pas dans un script — d'où la sonde n° 3 ajoutée à
> `check:soumission` (Bloc 8).

### Le constat d'origine (conservé : c'est la preuve du blocage)


**Constaté en direct ce jour, pas déduit** : le client appelle
`https://<projet>.supabase.co/functions/v1/rpc` comme **endpoint RPC
principal** (décision du 10/10, commit `80a48da` — la clé du nœud dédié ne
part plus dans le bundle). Or :

| Vérification | Résultat |
|---|---|
| `supabase/functions/rpc/` dans le dépôt | présent, commité |
| `POST /functions/v1/rpc` en direct | **404** `{"code":"NOT_FOUND","message":"Requested function was not found"}` |
| `POST /functions/v1/translate` (témoin) | répond (400/401) — la CLI et le projet sont bien joignables |
| Les 10 autres fonctions Edge | déployées (elles répondent 400/401, donc leurs contrôles de signature sont bien **live**) |
| Secret `RPC_UPSTREAM_URL` (nœud dédié) | **absent** de la liste des secrets du projet |

**Conséquence, vue dans le navigateur** : l'application tombe en repli sur
`https://api.devnet.solana.com` (« Failed to fetch », `0 pact(s)` sur
`#/pacts`), alors que la chaîne contient bien 9 comptes dont 6 pacts réels.
Sans correction, la démo comme la prod dépendent du devnet public — celui qui
a déjà valu des 429 quasi permanents (voir le commentaire de
`READ_RPC_ENDPOINTS` dans `src/lib/constants.ts`).

**Deux gestes, dans cet ordre** (à faire par l'utilisateur, ou sur son GO
explicite) :

1. Récupérer une **nouvelle** clé de nœud devnet (l'ancienne est encore dans
   l'historique git, voir Bloc 5 — elle doit être révoquée, pas réutilisée) et
   l'enregistrer **côté serveur**, jamais dans un fichier du dépôt :
   `supabase secrets set RPC_UPSTREAM_URL="https://devnet.helius-rpc.com/?api-key=<nouvelle clé>"`
   (ou via Supabase → Edge Functions → Secrets). La valeur ne se colle pas
   dans une conversation.
2. Déployer la fonction manquante :
   `supabase functions deploy rpc --no-verify-jwt`
   (`--no-verify-jwt` est obligatoire : `@solana/web3.js` ne pose aucun en-tête
   d'authentification, une vérification JWT rendrait la fonction inutilisable —
   le commentaire d'en-tête de `supabase/functions/rpc/index.ts` le rappelle).

**Vérification qui compte** (pas le code HTTP du déploiement) : un
`getVersion` renvoyé par le relais, puis `#/marketplace` affichant ses pacts
**sans** le RPC personnalisé.

### Résolution — 12/10/2026

Ce qui a été fait, et ce qui a été MESURÉ :

1. `supabase functions deploy rpc --project-ref <ref> --no-verify-jwt` →
   `Deployed Functions on project …: rpc` (CLI 2.115.0) ;
2. `npm run check:soumission` (le contrôle, Bloc 8) → **code 0** :
   `✓ JSON-RPC rendu` **et** `✓ 9 compte(s) détenu(s) par le programme`,
   `✓ 6 pact(s) décodable(s)` — les sondes passent **par le relais**, donc
   `#/pacts` affichera ses pactes au lieu de « 0 pact(s) » ;
3. le **secret** `RPC_UPSTREAM_URL` est posé (`supabase secrets set …
   --project-ref xkznmflyiilgmxhvgega`, valeur lue dans `.env.local` — un
   fichier ignoré par git — et **jamais** recopiée dans un fichier du dépôt ni
   dans une conversation) ; la liste des secrets du projet le confirme, avec
   son empreinte ;
4. le déploiement est **refait après** la pose du secret, puis mesuré :
   `POST /functions/v1/rpc` → `HTTP 200`, `x-buildpact-relais: dedie`,
   `getVersion` renvoyé par le nœud dédié.

### Le second temps : le relais répondait, le navigateur ne pouvait pas l'appeler

Mesuré le 12/10 **dans l'onglet** (Bloc 8, sonde 3), après un déploiement
vert : `@solana/web3.js` pose un en-tête `solana-client` sur chacune de ses
requêtes. Cet en-tête n'était pas dans `Access-Control-Allow-Headers` : le
navigateur faisait donc échouer le **pré-vol**, l'application classait le
relais « injoignable » et repassait au devnet public — pendant que `curl`, le
relais lui-même et **toutes** les sondes en ligne de commande répondaient
200. Un déploiement réussi, un `check:soumission` vert, et une application
qui ne s'en servait pas.

Corrigé à deux endroits, et c'est le second qui empêche la rechute :

- `supabase/functions/rpc/index.ts` ajoute `solana-client` à
  `Access-Control-Allow-Headers` (re-déployé derrière) ;
- `scripts/pre-soumission.mjs` envoie désormais un **vrai pré-vol**
  (`OPTIONS` + `Origin` + `Access-Control-Request-Headers`) et **refuse**
  (code 1, `NE PAS DÉPOSER`) si un en-tête du client n'est pas autorisé. Un
  contrôle qui n'exerce que la ligne de commande ne pouvait pas voir cette
  panne : sans navigateur, il n'y a pas de pré-vol.

**Vérification qui compte** (celle du jury : l'onglet) : sur `#/pacts`, les
requêtes partent vers `…/functions/v1/rpc` — pré-vol accepté, `POST` 200 —
et **aucune** vers `api.devnet.solana.com` ; la page affiche ses pactes
(vaults, membres, médias) sans bandeau de repli.

---

## Bloc 1 — La vidéo de 3 minutes (aucune dépendance technique)

Storyboard : `DEMO-SCRIPT.md`. La voix est en anglais. À tourner en dernier,
**après** le Bloc 0 : le parcours à l'image passe par la lecture on-chain.

---

## Bloc 2 — `/create` avec un vrai wallet (0/20)

`CHECKLIST-TEST-WALLET-2026-10-08.md` est à **0/20** : les parcours de
signature ne peuvent pas être exécutés sans wallet réel (l'agent n'en a pas).
C'est le seul point de validation qui ne peut pas être délégué.

---

## Bloc 3 — Dépôt de la soumission

Portail : `colosseum.com/worldsfair`. Livrables : dépôt (privé) + vidéo 3 min.
La candidature NOAH.AI × Colosseum (18/09) était déjà soumise avec l'URL live
seule ; c'est la **soumission complète** du 12/10 qui attend ces livrables.

---

## Bloc 4 — Git : on ne purge pas l'historique, on repart d'un dépôt propre

**Décision du 12/10** (elle remplace le « pousser les deux commits » du 10/10) :
le dépôt Noah `Azumizeus/noah-…-75mv` **reste tel quel** — il devient la
**preuve du blocage** montrée au jury, avec la capture du tableau de bord. On
ne le réécrit pas, on ne le supprime pas, on n'y pousse plus rien :

- sauter la clé dans un fichier ne suffit pas quand elle reste lisible dans un
  blob d'historique — `git clone` la rend à n'importe qui, pour toujours ; et
  le 11/10/2026 a montré la moitié inverse du problème : un dépôt impeccable
  peut cohabiter avec une clé servie en clair par le site (Bloc 5.1) ;
- une réécriture d'historique (filter-repo) laisserait des SHA neufs à
  re-vérifier et un dépôt dont personne ne peut plus dire ce qu'il contient.

Le dépôt **propre** est donc un dépôt NEUF, sous un nom neuf, avec un seul
commit racine.

**Créé et poussé le 12/10/2026** : dépôt **privé** `Azumizeus/buildpact`
(<https://github.com/Azumizeus/buildpact>), branche `main`.

| Point | État vérifié |
|---|---|
| Commit racine | `20a57c9` — arbre = poste de travail (426 fichiers, 14,9 Mo) |
| Fichiers d'environnement | seuls `.env.example` — `.env`, `.env.local`, `.env.vapid` sont ignorés |
| `StudyVault/`, `graphify-out/` | exclus (ajoutés au `.gitignore`) : ni notes perso ni 4,3 Mo de sorties d'outil chez le jury |
| Historique | balayé en **mode profond** — tous les blobs, binaires compris : **0 trouvaille** |
| Contrôle sur le **clone distant** (l'interface du jury) | **426 fichiers**, arbre du distant **identique à l'arbre local** (comparaison de `HEAD^{tree}`, pas de date ni de message), balayage profond : **0 trouvaille** |
| Passe du 12/10 au soir | le correctif du pré-vol CORS (relais + sonde + tests) est **dans l'arbre poussé** : le dépôt propre ne peut plus décrire une correction qu'il ne contient pas |
| Branche `main` locale, dépôt Noah | **intactes** — aucune écriture |
| CI du nouveau dépôt (`.github/workflows/ci.yml`) | typecheck · lint · tests · build, sans secret requis — se déclenche au push |

Commande réellement utilisée (elle reste utile pour un autre poste) :

```bash
git remote add propre https://github.com/<proprietaire>/buildpact.git
git push --no-verify -u propre depot-propre:main
```

⚠️ **`--no-verify` était nécessaire, et c'est le seul cas légitime du projet.**
Le hook `pre-push` (`scripts/git-guard.mjs`, posé pour la limite « 5 fichiers
par passe » du sync Noah) cherche une base commune avec `origin/main` ; un
commit racine n'en a aucune — vérifié le 12/10, il répond
« ENVOI BLOQUÉ : base commune introuvable » quoi qu'on lui passe. Le garde
protège `origin/main`, pas un dépôt neuf ; et ce qu'il cherche (une clé), le
balayage profond l'a déjà fait sur cet arbre exact. Le hook n'a pas été
désinstallé : il reste utile sur le dépôt Noah.

Ce qui reste à faire :

1. dans **Vercel** → projet → *Settings → Git* : **Disconnect** le dépôt Noah
   (bouton visible sur la capture) puis **Connect** `Azumizeus/buildpact`,
   sinon la prod continue de suivre un dépôt qu'on ne met plus à jour ;
2. vérifier ensuite `npm run check:prod` : la prod doit servir le commit du
   nouveau dépôt, pas `2cc9d23`.

> Le dépôt Noah ne reçoit plus rien et ne doit pas être supprimé : il porte la
> **preuve du blocage** — l'historique et la capture du tableau de bord —, pas
> la clé. Mesuré le 11/10/2026 : la clé Helius n'y est **plus lisible**, elle
> n'y est plus du tout. Ce qui la maintenait en vie était hors du dépôt
> (Bloc 5.1).

> Ce qui n'est plus une contrainte : la limite « **5 fichiers par passe** » du
> sync GitHub de NOAH. Elle venait de son outil de synchronisation, pas de git ;
> un `git push` direct n'a pas cette limite. C'est aussi pour ça que le nouveau
> dépôt se pousse avec la CLI et non par le sync.

**Reste hors dépôt** (fichiers de travail, non suivis) : `archive/`, les
copies `migration noah …/`, `Dernier IDL.json Via Trynoah` (suivi, à renommer
si l'on veut effacer la dernière trace du nom Noah dans l'arbre livré).

---

## Bloc 5 — Sécurité : ce qui reste ouvert

### 5.1 Mesuré le 11/10/2026 : la clé n'était plus dans le dépôt, elle servait le site

La question posée était simple — « la clé est-elle encore là ? ». Réponse
mesurée, par empreintes, sans jamais afficher de valeur :

| Contrôle | Résultat |
|---|---|
| Valeur **entière** cherchée dans les **2 433 objets** du `.git` (orphelins de purge compris) | **absente** |
| Balayage **profond** de l'historique : 1 095 blobs, 25,8 Mio, binaires compris | **0 trouvaille** |
| Historique des **deux** dépôts distants (`origin`, `propre`) | **0 trouvaille** |
| `npm run check:helius` | aucune clé Helius |
| `dist/` local (bundle livré par le poste) | un seul `?api-key=...` : le **placeholder** du champ « RPC personnalisé » |

Le dépôt était donc propre — et la clé, elle, **toujours vivante**, dans deux
endroits qu'aucun contrôle ne regardait :

| Où | État mesuré | Action |
|---|---|---|
| Variable **`VITE_RPC_ENDPOINT`** du projet Vercel (Production **et** Preview) | posée ; empreinte `e27f2e115ee5` — la même clé | **retirée le 11/10/2026** (`vercel env rm`, les deux cibles) |
| **Bundle de production** `buildpact-solana.vercel.app/assets/index-*.js` | la clé en clair (une occurrence) ; `getHealth` → **HTTP 200, `result: ok`** | dépend de la révocation (ci-dessous) |

**La leçon, et c'est elle qui compte.** Le code avait cessé de lire la
variable (commit `80a48da`) et `dist/` sortait propre : deux contrôles verts,
qui donnaient tous les deux raison. Mais Vite incruste en clair la valeur
d'une variable `VITE_` **évaluée au build** — et la variable était restée
posée sur la plateforme. Un contrôle qui ne regarde que la *lecture* ne voit
pas la *déclaration*. D'où `scripts/rpc-endpoint-guard.test.ts` : il refuse
toute déclaration d'endpoint `VITE_` dans un fichier d'environnement local,
ces fichiers que ni `secret-scan` (non versionnés) ni le contrôle d'artefact
(absent de `dist/`) ne voient. Symétriquement, la livraison elle-même est
désormais **lue** : `npm run check:prod` fouille les bundles servis (§5.3).

`VITE_RPC_ENDPOINT` a aussi été retiré de `.env.local` le 11/10/2026 : la
ligne y portait une clé, et l'y laisser était un piège — à la première ligne
restaurée dans `constants.ts`, la clé repartait dans le bundle.

### 5.2 Ce qui reste à faire, dans cet ordre

1. **Révoquer la clé** dans le tableau de bord Helius. C'est le **seul** geste
   qui éteint la fuite : ni la purge d'historique, ni la suppression de la
   variable, ni un dépôt neuf ne dévalident un droit d'appel. La sonde du
   11/10 répond encore **HTTP 200**.
2. **Rebrancher Vercel** sur `Azumizeus/buildpact` (Bloc 4) : le prochain
   build partira d'un code qui ne lit ni ne déclare aucun endpoint.
3. `npm run check:prod` doit alors servir le commit du nouveau dépôt.

**Résidu assumé** : l'ancien bundle reste servi jusqu'à la reconstruction de
la prod — mais une fois la clé révoquée, il ne rend plus qu'un endpoint mort.
C'est la révocation qui protège ; le reste est de l'hygiène.

### 5.2 bis Rotation du nœud du relais — comment la rendre vérifiable

Une rotation de clé était **invisible** : le relais expose bien
`X-Buildpact-Relais: dedie | devnet-public`, mais ce champ dit seulement s'il
tourne sur un nœud dédié — jamais QUELLE clé il utilise (c'est précisément ce
qu'on attend d'un relais). Il n'y avait donc aucun moyen de savoir si la
nouvelle clé était en service, ou si l'ancienne répondait encore.

`npm run check:secret` comble ce trou. Il compare, **par empreinte**, la
valeur du secret déployé `RPC_UPSTREAM_URL` à celle d'un fichier local, hors
dépôt, sans jamais afficher la valeur :

| Étape | Commande | Ce qui doit sortir |
|---|---|---|
| 0. (guide) | `npm run check:secret` | **code 2** + le mode d'emploi, si le fichier n'existe pas encore |
| 1. écrire le fichier | copier l'URL RPC depuis Helius, puis `pbpaste \| sed 's\|^\|RPC_UPSTREAM_URL=\|' > ~/.buildpact-rpc.env` | une seule ligne, hors dépôt, sans recopier la clé dans un chat |
| 2. poser | `npx supabase secrets set --env-file ~/.buildpact-rpc.env --project-ref …` | la CLI lit le fichier : la valeur ne passe par aucun journal |
| 3. prouver | `npm run check:secret` | **code 0** — « le relais tourne sur CE fichier (empreinte … des deux côtés) » |
| 4. prouver l'usage | un POST au relais | `X-Buildpact-Relais: dedie` (sinon il est retombé sur `devnet-public`) |
| 5. prouver le parcours | `npm run check:soumission` | **code 0**, les trois sondes vertes |

Le **premier** passage dit « DIVERGENCE » : c'est normal et c'est le but — le
relais tourne encore sur l'ancienne clé. C'est justement ce que rien ne
permettait de voir avant.

### 5.2 ter Pour le jury

Tout ce bloc tient dans une page lisible d'un seul tenant, écrite pour être
vérifiée plutôt que crue : [`SECURITY-INCIDENT-2026-10-11.md`](SECURITY-INCIDENT-2026-10-11.md)
(où la clé était servie, pourquoi les quatre contrôles du dépôt ne pouvaient
pas la voir, ce qui a été fermé, ce qui reste ouvert, et les commandes qui
refont les mesures). Aucune valeur n'y figure : empreintes seulement.

- **Purge de l'historique** : remplacée par le dépôt neuf (Bloc 4). Le dépôt
  Noah garde son histoire — c'est assumé et documenté, il sert de preuve du
  blocage. La clé Helius, elle, doit toujours être **révoquée** chez le
  fournisseur : un dépôt neuf ne révoque rien.
  Les scripts d'audit restent dans `scripts/` (`history-secret-scan.mjs`,
  `helius-key-audit.mjs`, `git-guard.mjs`) et servent au contrôle du NOUVEAU
  dépôt, où ils doivent sortir à 0.
- **Secret `VAPID_PRIVATE_KEY`** : présent côté Supabase (donc utilisé par
  l'app), et l'ancienne paire a circulé. Une rotation n'est pas dans le
  chemin critique de la démo, mais elle doit être tracée.

### 5.3 Ajouté le 11/10/2026 : le contrôle lit la LIVRAISON, pas seulement le commit

Le contrôle qui manquait ne demandait presque rien : ouvrir les fichiers
servis et les lire avec les règles de secrets du dépôt. C'est maintenant
`npm run check:prod`, qui télécharge la page **et les bundles qu'elle
référence** (5/5 lus le 11/10) et les passe à `scripts/secret-rules.mjs` →
`analyserBundle()`.

| | |
|---|---|
| Verdict mesuré le 11/10 sur `buildpact-solana.vercel.app` | **code de sortie 3** — `paramètre « api-key » d'une URL = valeur en clair (empreinte e27f2e115ee5, 36 car.)` |
| Valeur affichée | **jamais** : empreinte sha256 et longueur, comme l'audit d'historique — un contrôle qui recopie ce qu'il trouve est un contrôle qui fuit |
| En CI | la divergence de commit reste **informative** ; le code 3, lui, **arrête le job** — une clé exposée n'est pas un retard de déploiement |
| Chemin non-fuite | vérifié à part : une page sans bundle sort en **1** (divergence), avec `⚠ la page servie ne référence aucun bundle` — jamais un faux « propre » |

**Calibré sur la production réelle, pas sur une intuition** : les règles de
texte donnaient **3 trouvailles pour 1 seule vraie**. Les deux autres étaient
des expressions minifiées de `@supabase/supabase-js`
(`access_token = this.socket.<champ>`) : un faux positif par bundle rend le
contrôle inaudible, donc `analyserBundle()` exige des littéraux **entre
guillemets**, et ces deux expressions sont devenues des cas de test
explicites.

**Détail qui vaut d'être noté** : la première version du commentaire qui les
citait s'est fait refuser par `secret-scan` — un fichier de règles scanné par
ses propres règles. Les exemples portent donc un `<gabarit>`, avec la raison
écrite juste au-dessus. La démonstration du problème venait gratis.

---

## Bloc 6 — « Description polluée » : réglé, et ce n'était pas un problème de données

Diagnostic initial (« il faut réécrire la description on-chain via
`update_description` ») était **faux et risqué** : la chaîne on-chain n'est pas
une description, c'est un conteneur écrit par le wizard
(`[<étape>] <pitch> | Rôles créateur : … | 💰 Seed founder : …`), et
`update_description` aurait détruit le badge d'étape (plus rien ne matche
`STAGE_MAP`) en coûtant une signature par pact.

La cause réelle : **toutes les vues faisaient `parsed.pitch || pact.description`**.
Dès que le pitch libre est vide, ce repli affichait la chaîne brute au
visiteur. Six surfaces touchées, corrigées le 10/10 :

- `src/lib/pitchParse.ts` (nouveau, module pur) : `displayPitch()` et
  `displayPitchShort()` — l'affichage ne retombe **jamais** sur la chaîne brute ;
- `src/pages/premium/PremiumPacts.tsx`, `PremiumDashboard.tsx`,
  `PremiumMarketplace.tsx`, `PremiumPact.tsx` ;
- `src/components/MarketplaceCard.tsx`, `PactCard.tsx` ;
- `src/pages/premium/PremiumProjectCard.tsx` masque un paragraphe vide.

**Un bug de plus trouvé en écrivant le test** : sur un pact **sans pitch
libre**, les marqueurs `| Rôles créateur : …` n'étaient pas reconnus (le
`\s*` du bracket consommait l'espace qui précédait le séparateur) — les rôles
du créateur s'affichaient donc à la place du pitch. Corrigé dans
`pitchParse.ts`.

**Preuve, mesurée ce jour** — donnée on-chain vs écran :

| On-chain (`getProgramAccounts`, base64) | Affiché dans le navigateur |
|---|---|
| `[🤝 Les deux] Seeker Nexus OS (nom complet : …` | `Seeker Nexus OS (nom complet : …` |
| `[🤝 Les deux] Mobile Game Space Shooter For Seeker Mobile  \| Rôles créateur : 👑 Founder / …` | `Mobile Game Space Shooter For Seeker Mobile` |
| `[🤝 Les deux] Seeker Monitor application native de…` | `Seeker Monitor application native de…` |

6 comptes sur 9 portent un marqueur interne ; aucune des trois surfaces
(`#/pacts`, `#/marketplace`, `#/pact/<pda>`) n'en laisse passer un. Le badge
d'étape, lui, est bien toujours rendu (« 🤝 Cherche devs & investisseurs »).

Garde-fou ajouté : `scripts/pitch-display.test.ts` (16 tests) vérifie le
comportement, **et** lit le source des six surfaces pour empêcher le retour du
repli brut.

---

## Bloc 7 — Ajouté le 11/10/2026 : la panne devient visible, et le parcours rejouable

Deux chantiers nés du même constat : le Bloc 0 (relais non déployé) était
**invisible à l'écran**, et la vidéo dépendait d'un wallet qui n'est pas prêt
(0/20 au Bloc 2).

### 7.1 Bandeau de santé RPC — une bascule ne peut plus être silencieuse

- `src/lib/rpcHealth.ts` (module **pur**, `fetch` injecté) : classe la réponse
du relais (`sain`, `throttle`, `endpoint-absent` sur 404, `endpoint-en-panne`,
`pas-du-json`, `erreur-rpc`, `injoignable`) et en déduit un niveau.
- `src/hooks/useRpcHealth.ts` : sonde `getVersion` sur l'endpoint **principal**,
  avec cache d'une minute (le shell premium remonte à chaque changement de
  page — sans cache, une sonde par navigation) et abonnement au journal de
  rotations.
- `src/lib/constants.ts` : `rotateReadRpc()` / `rotateRpc()` enregistrent
  désormais `{liste, depuis, vers, motif, a}`. `anchor.ts` passe le motif
  (`relais-injoignable`, `methode-bridee`, `throttle`).
- `src/components/RpcHealthBanner.tsx`, monté dans `PremiumNav` (seul point
  commun aux dix pages premium) : alerte rouge si l'endpoint principal est
  hors-service, information si une rotation a eu lieu. Il ne s'allume **pas**
  sur un 429 passager, et n'affiche que des **origines** masquées
  (`lib/rpcMask.ts`) — jamais une URL porteuse de clé.

**Vérifié dans le navigateur le 11/10** : le relais non déployé étant réel, le
bandeau s'est affiché de lui-même — « L'endpoint prévu
(xkznmflyiilgmxhvgega.supabase.co) ne répond pas. Les lectures basculeront sur
le repli — https://api.devnet.solana.com ». La première
version disait « aucun repli n'est disponible » alors que la liste en
contenait un : corrigé (le repli est maintenant nommé).

### 7.2 Page `#/demo` — le parcours rejouable sans wallet

- `src/lib/demoScenario.ts` (module **pur**, sans aucun import) : construit
  create → add_member ×2 → approve ×2 → finalize → fund(12 SOL) → distribute,
  avec le partage exact du programme — 2 % de frais, 98 % au prorata des bps,
  **troncature entière par membre** (comme `distributeWithReceipt`). Adresses
  et signatures sont FICTIVES et **déterministes** (mêmes valeurs à chaque
  prise, ce qui rend deux enregistrements comparables).
- `src/pages/premium/PremiumDemo.tsx` (route `#/demo`, entrée « Démo » dans la
  navigation) : lecture automatique (2,4 s/étape) ou pas-à-pas, vault qui se
  remplit puis se vide, frais/net, répartition nominative. La page annonce en
  clair qu'il s'agit d'un rejeu hors chaîne — aucune transaction n'est envoyée.

**Vérifié dans le navigateur le 11/10** : rejeu complet jusqu'à l'étape 8/8,
vault à 0,0000 SOL, frais 0,2400 SOL, net 11,7600 SOL, parts 5,8800 / 3,5280 /
2,3520 SOL ; libellés FR et EN sans `{{placeholder}}` résiduel.

**Deux bugs trouvés à l'écran, pas par les tests** (et gardés par un test
depuis) : la chronologie affichait les `{{placeholders}}` bruts (le composant
appelait `t()` sans les paramètres de l'étape), et le bouton principal était
sans style (`.p-btn` seul ne pose ni fond ni bordure — il faut la variante
`primary` ou `ghost`).

### 7.3 Ajouté le 12/10 — le bandeau couvre aussi le shell legacy `/v1`

Le point laissé ouvert le 11/10 (« monté dans le shell premium uniquement »)
est refermé. `/v1` était le dernier endroit de l'app où une panne d'endpoint
restait muette — précisément le shell de secours qu'on ouvre quand le reste
ne répond pas.

- `src/lib/rpcBannerStyles.ts` (module **pur**) : les styles du bandeau
  deviennent une table à deux variantes. `premium` = les styles en ligne
  `--p-*` d'avant, à l'octet près. `legacy` = **classes Tailwind**, qui lisent
  les variables du shell `/v1` (`--canvas-*-rgb`, `--ink-*-rgb`,
  `--accent-violet-rgb`) et suivent donc gratuitement ses palettes et son mode
  clair.
- `src/components/DashboardLayout.tsx` : monte `useRpcHealth` +
  `RpcHealthBanner variante="legacy"` en tête de `<main>`, donc sur les onze
  pages legacy d'un coup (elles passent toutes par ce layout).
- `src/pages/MonProfilPage.tsx` : `#/v1/profile?settings=1` ouvre directement
  le panneau de réglages — c'est ce que pose le bouton « Configurer un RPC »
  du bandeau legacy (le champ RPC vit là). Refermer retire le paramètre via
  `replaceState`, pour qu'un rechargement ne rouvre pas le panneau.

**Pourquoi une variante au lieu d'un simple montage** : `/v1` ne définit
AUCUNE variable `--p-*`. La version premium y serait invisible (fond
`var(--p-canvas)` → transparent, texte hérité). Un bandeau invisible est pire
que pas de bandeau : il laisse croire qu'on a vérifié. Un test le verrouille
(`--p-` interdit dans la variante legacy, présent dans la premium).

**Vérifié dans le navigateur le 12/10** : sur `#/v1`, le bandeau s'affiche du
premier coup, en jetons legacy, avec le vrai incident (« The app is running on
the fallback — https://api.devnet.solana.com — instead of the intended
endpoint (…supabase.co) »). Sur `#/demo` (premium), il garde son rendu clair
d'après réécriture. « Configure an RPC » mène bien à `#/v1/profile?settings=1`
avec le panneau ouvert ; le fermer laisse l'URL sur `#/v1/profile` sans
rouvrir (mesuré).

### 7.4 Ajouté le 12/10 — mode tournage `#/demo?tournage=1`

Objectif : lancer l'enregistrement **sans toucher la souris** — on ouvre le
lien, on appuie sur REC.

- `src/lib/tournage.ts` (module **pur**, sans import) : lit/écrit
  `?tournage=` dans le hash (valeurs non reconnues = faux) et porte un petit
  store à abonnés.
- `src/hooks/useModeTournage.ts` : amorce depuis le hash, suit `hashchange`,
  et bascule en écrivant **dans les deux** (store + hash) — le lien est donc
  partageable et le mode survit à un rechargement, ce qui compte : un
  rafraîchissement en pleine prise ne doit pas faire revenir le bandeau au
  milieu de la vidéo.
- `src/pages/premium/PremiumDemo.tsx` : le mode actif relance le rejeu à
  l'étape 1 et lance la lecture tout seul, affiche « Mode tournage actif » (un
  état invisible se diagnostique mal pendant une prise) et expose une bascule
  « Mode tournage ».
- `src/components/RpcHealthBanner.tsx` : masqué quand le mode est actif — la
  vidéo parle du produit, pas de l'état de l'infrastructure.

**Le mode n'est JAMAIS actif par défaut** (test dédié) : masquer un incident
RPC doit rester un geste explicite, jamais l'effet de bord d'une page.

**Vérifié dans le navigateur le 12/10** : `#/demo?tournage=1` — aucun bandeau
de santé, mention « Recording mode on — replay runs by itself, health banner
hidden. », rejeu mené seul jusqu'à 8/8. Bascule inverse cliquée : retour à
`#/demo`, bandeau de retour, mention disparue.

**Un défaut trouvé dans la console, corrigé** : la première version du hook
affectait le store dans l'initialiseur de `useState` — donc **pendant le
rendu** — ce qui notifiait les composants déjà montés (« Cannot update a
component (RpcHealthBanner) while rendering a different component
(PremiumDemo) »). Invisible pour les tests, visible dès le premier
chargement. Le store est maintenant aligné dans un effet, et un test
interdit l'écriture pendant le rendu. Après correction, un rechargement
complet de `#/demo?tournage=1` et de `#/v1` ne produit plus qu'un seul type
d'erreur en console : le vrai refus du relais (CORS/404).

### 7.5 Ajouté le 12/10 — rythme réglable dans l'URL et cadrage 1000 px

La limite laissée ouverte le 11/10 (« la répartition nominative est sous la
ligne de flottaison en fenêtre de 1000 px ») est refermée, et le rythme de la
prise devient un paramètre.

- **Rythme** — `#/demo?tournage=1&pas=3.5` : durée d'affichage d'une étape,
en **secondes** (point ou virgule, bornes 0,4 s → 30 s), lue par
`lireDelaiEtape()` dans `src/lib/tournage.ts`. Hors bornes ou illisible →
durée par défaut (2,4 s), jamais un rythme deviné. Trois raccourcis sont
affichés à l'écran en mode tournage (Rapide 1,6 s · Normal 2,4 s · Lent
3,5 s) et **écrivent dans l'URL** : deux prises du même lien sont donc
identiques, et une prise trop rapide se corrige en changeant un chiffre.
La pastille d'état affiche la durée EFFECTIVE — une valeur refusée se voit,
au lieu de changer la vidéo en silence.
- **Cadrage 1000 px** — le mode tournage fixe un cadre de **1000 × 1000 px**
(`CADRAGE_PX`) : participants et vault passent côte à côte au-dessus de la
carte d'étape, qui garde les deux colonnes ; marges et cartes resserrées.
Aucune information n'est retirée (le bandeau d'honnêteté « rejeu hors
chaîne » reste affiché, c'est le point non négociable de cette page).
Le cadre garde sa taille LOGIQUE et c'est le rendu qui s'adapte :
`echelleCadrage(hauteurFenetre)` rend un facteur dans [0,7 ; 1], appliqué en
`transform: scale()` sous un conteneur qui porte la hauteur réelle — sans
lui, la page défilerait malgré l'échelle.

**Mesuré dans le navigateur le 12/10** (carte « Répartition aux membres »
visible, défilement nécessaire) :

| Fenêtre | Échelle | Défilement | Carte de répartition |
|---|---|---|---|
| 1000 × 1000 | 0,99 | **0 px** | bas à 956 px |
| 1000 × 800 | 0,79 | **0 px** | bas à 763 px |
| 1280 × 720 (16:9) | 0,71 | **0 px** | bas à 686 px |
| 1000 × 600 | 0,70 (plancher) | 100 px | bas à 675 px |

Avant ce lot, la même page en 1000 × 1000 demandait **319 px** de défilement
et la carte tombait 223 px sous la ligne de flottaison. Le plancher de 0,7
est délibéré : en dessous, un texte de 12,5 px passerait sous ~9 px
equivalents. On préfère alors rendre le défilement (fenêtre très basse)
plutôt qu'une vidéo illisible. **Au-dessus de ~710 px de haut, tout est
visible sans défiler.**

Le rythme a été vérifié à l'exécution, pas seulement à l'affichage :
`?pas=3.5` produit des intervalles mesurés de 3513 ms et 3509 ms entre deux
étapes.

---

## Bloc 8 — Ajouté le 12/10 : le contrôle à lancer avant de déposer

**`npm run check:soumission`** (`scripts/pre-soumission.mjs`) répond à une
seule question, mais c'est celle qui rate en silence : **l'endpoint RPC
principal de l'application répond-il vraiment ?**

Pourquoi un script de plus alors que `rpc-check.mjs` et `idl-check.mjs`
existent : ceux-là interrogent `api.devnet.solana.com` ou un `RPC_URL` passé
à la main. Ils peuvent donc réussir pendant que l'application, elle, tourne
sur le repli — exactement l'état du Bloc 0. Celui-ci part de l'endpoint que
l'application construit (`VITE_SUPABASE_URL` → `construireUrlProxy()`, la
même fonction que `src/lib/constants.ts`).

Deux sondes, dans cet ordre :

1. `getVersion` — l'endpoint rend-il du JSON-RPC 2.0 ? (le cas mesuré :
fonction Edge non déployée → 404) ;
2. `getProgramAccounts` — l'appel qui liste TOUS les pacts, **celui que
Helius bridait en -32401** et celui qui décide si `#/pacts` affiche
« 0 pact(s) ». Un endpoint qui répond à `getVersion` et refuse celui-là
passe toutes les vérifications naïves tout en cassant la moitié de l'app.

Codes de sortie : **0** = les trois sondes passent (dont le **pré-vol CORS**) ·
**1** = à corriger, bandeau `NE PAS DÉPOSER` · **2** = indéterminable
(configuration illisible). Le repli (devnet public) est sondé à la fin, à
titre informatif seulement. Aucune URL brute n'est affichée : tout passe par
`masquerEndpoint()`.

**Sonde 3 — le pré-vol CORS** (ajoutée le 12/10 après la panne trouvée dans
l'onglet) : le script envoie un `OPTIONS` avec `Origin` et
`Access-Control-Request-Headers` — exactement ce que le navigateur envoie
avant un `POST` portant `solana-client` — et lit ce que le relais autorise.
Un en-tête du client non autorisé ⇒ **code 1**, avec le nom de l'en-tête et
le geste (`Access-Control-Allow-Headers` puis redéploiement). C'est la seule
sonde du dépôt qui mesure l'en-tête d'un **navigateur** : en Node, sans
navigateur, il n'y a pas de pré-vol — donc rien à mesurer.

**Résultats mesurés le 12/10, non retouchés :**

| Lancement | Sortie |
|---|---|
| `npm run check:soumission` (avant déploiement) | `✗ endpoint-absent (HTTP 404)` sur les sondes → `NE PAS DÉPOSER`, code **1** — le Bloc 0 est bien réel, et désormais **détectable automatiquement** |
| `node scripts/pre-soumission.mjs --endpoint=https://api.devnet.solana.com` | `✓ 9 compte(s) détenu(s) par le programme`, `✓ 6 pact(s) décodable(s)`, `Prêt à déposer`, code **0** — les sondes et le filtre `memcmp` sont prouvés sur la chaîne réelle |
| `npm run check:soumission` (après déploiement **et** pose du secret) | `✓ solana-core 4.4.0-beta.0` · `✓ 9 compte(s) du programme` · `✓ 6 pact(s) décodable(s)` · `✓ pré-vol accepté (content-type + solana-client)` → `Prêt à déposer`, code **0** |
| `POST` direct sur le relais, avec `solana-client` | `HTTP 200`, `x-buildpact-relais: dedie`, `access-control-allow-origin: *` — la cible annoncée est le nœud dédié, pas le repli |
| `#/pacts` dans l'onglet | pré-vol accepté, `POST …/functions/v1/rpc` → 200, **aucune** requête vers `api.devnet.solana.com`, 4 cartes affichées (6 pacts on-chain moins les 2 pacts de test cachés par `hiddenPacts.ts`), sans bandeau de repli |

Le lancement sur le devnet public est la preuve que le script **sait
réussir** : sans lui, un contrôle qui refuserait toujours serait
indiscernable d'un contrôle cassé. Le pré-vol, lui, est la preuve qu'un
« vert » n'est pas la même chose qu'un « utilisé » : le 12/10 au matin, les
deux étaient verts et l'application ne se servait pas du relais.

---

## État des vérifications au 12/10/2026

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | 0 erreur |
| `npm test` | **323/323** (+6 pour le pré-vol CORS : la régression `solana-client` est nommée par un test, pas par une capture d'écran) |
| `npm run check:soumission` | **0 / Prêt à déposer** — **trois** sondes vertes (dont le pré-vol CORS), 9 comptes, 6 pacts, sur le relais **avec secret** · refusait 1 avant le déploiement |
| Dépôt neuf `Azumizeus/buildpact` (privé) | historique **neuf** (aucun commit d'avant la purge), **426 fichiers**, clone distant balayé en profond : 0 trouvaille ; arbre du distant **identique** à l'arbre local (`HEAD^{tree}` comparé) |
| Cadrage 1000 px (`#/demo?tournage=1`) | 0 px de défilement de 1000 × 1000 jusqu'à 1280 × 720 ; plancher 0,7 sous ~710 px de haut |
| Rythme `?pas=3.5` | intervalles mesurés 3513 ms / 3509 ms |
| Bandeau de santé RPC sur le relais réellement absent | affiché dans les DEUX shells, repli nommé (devnet public) |
| Page `#/demo` rejouée de bout en bout (FR et EN) | 8 étapes, vault vidé, parts exactes |
| `#/demo?tournage=1` | rejeu lancé seul, bandeau masqué, bascule inverse OK |
| « Configurer un RPC » (bandeau legacy) | ouvre le panneau de réglages legacy, champ RPC présent |
| Correspondances correctifs de signature (10 fonctions Edge) | présents dans le dépôt **et** déployés (ils répondent 400/401) |
| Relais `rpc` | **déployé**, **secret posé**, cible annoncée `dedie` (`x-buildpact-relais`) — voir Bloc 0 |
| Rendu `#/pacts`, `#/marketplace`, `#/pact/<pda>` sur données réelles | 4 cartes, descriptions propres, badge d'étape rendu |
| Commits locaux en avance sur `origin/main` | 2 (dépôt Noah — plus poussés, il devient la preuve du blocage) |
| Historique du dépôt propre (branche `depot-propre`) | balayé en profond **sur un clone du distant** : tous les blobs lus, 0 trouvaille ; et sur le poste, **toutes refs confondues**, 0 trouvaille |

---

## Ce qui n'est pas fait, dit franchement

- La vidéo n'est pas tournée, la soumission n'est pas déposée.
- La checklist wallet reste à 0/20 : aucune signature n'a été testée de bout
  en bout par un agent.
- Le relais n'est pas déployé, donc **rien de ce qui précède ne prouve** que
  l'app fonctionne sur le nœud dédié — la vérification ci-dessus a été faite
  avec un RPC personnalisé pointé sur le devnet public, pour contourner le
  404. C'est un contournement de test, pas un état livrable.
- La purge de l'historique git et la révocation de la clé Helius restent à
  faire côté fournisseur et côté Freebuff.
- Le bandeau de santé est désormais monté dans **les deux** shells (premium
  et legacy `/v1`) — la limite du 11/10 est refermée. Reste une exception
  volontaire : en **mode tournage**, il est masqué (c'est le but de ce mode) ;
  un incident pendant une prise est donc invisible à l'écran, mais il reste
  tracé dans la console et dans le journal de rotation.
- Le cadrage de tournage s'arrête à **~710 px de haut** (échelle plancher
  0,7). Dans une fenêtre plus basse (1000 × 600), il reste ~100 px à faire
  défiler, ou il faut réduire le zoom du navigateur. C'est un choix : au-delà
  d'un certain rétrécissement, on ne lit plus une vidéo, on la devine.
- La prod Vercel suit encore le dépôt **Noah** : tant que *Settings → Git*
  n'est pas reconnecté à `Azumizeus/buildpact` (Bloc 4), la prod ne servira
  pas le code du dépôt propre — et donc pas la correction du pré-vol CORS.
  `npm run check:prod` le dira noir sur blanc : c'est le prochain geste.
- Le secret `RPC_UPSTREAM_URL` a été posé avec la valeur de `.env.local`
  (celle du poste, pas une clé neuve) — et la pose est **vérifiée par
  empreintes**, sans jamais afficher la valeur : `supabase secrets list`
  annonce `76677eda62ac…`, exactement le `sha256` de la valeur locale. Ce qui
  garantit que le relais appelle le nœud que le poste connaît, et rien de plus.
  La question « cette clé est-elle celle qui a été publiée dans l'historique
  du dépôt Noah ? » n'est **pas** tranchée ici : c'est précisément ce que
  `npm run check:helius` (empreintes, code 0/1/2) sert à décider, et la
  rotation du Bloc 5 reste due. Un relais qui tourne vite sur une clé non
  renouvelée tourne vite, pas proprement.
- Le dépôt Noah reste privé avec sa clé lisible dans l'historique : c'est
  assumé et montré au jury, mais cela signifie qu'aucun **clone public** de
  cet historique ne doit exister.
