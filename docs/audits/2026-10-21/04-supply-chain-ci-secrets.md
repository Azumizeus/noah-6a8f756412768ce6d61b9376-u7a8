# Audit supply-chain & CI/CD — secrets, dépendances, garde-fous, déploiement

**BuildPact** · Date : 21/10/2026 · Mode : **lecture seule stricte**
(aucun fichier du dépôt modifié, aucun `npm install` / `npm audit` / `vercel` / `npm run` / script node, aucun appel réseau, aucun `git push` / `commit` / `checkout` / `reset` — seules les commandes de lecture git ont été employées : `git log`, `git show`, `git ls-tree`, `git rev-list`, `git cat-file`, `git for-each-ref`, `git reflog`, `git fsck`)

---

## 1. Périmètre

| Élément | Chemin | Volume audité |
|---|---|---|
| Workflow CI | `.github/workflows/ci.yml` | 261 lignes, 3 jobs (`ci`, `en-ligne`, `quotidien`) |
| Scripts de déploiement | `scripts/deploy-check.mjs`, `scripts/origine-check.mjs`, `scripts/deploy-fleet-check.mjs` | lus intégralement |
| Garde-fous | `scripts/git-guard.mjs`, `scripts/build-guard.mjs`, `scripts/secret-rules.mjs` | lus intégralement |
| Moteur de règles de secrets | `scripts/secret-rules.mjs` | 362 lignes (exporter analysé + rejoué) |
| Scan d'historique | `scripts/history-secret-scan.mjs`, `scripts/helius-key-audit.mjs` | 609 + 358 lignes |
| Service worker push | `public/push-sw.js` | 49 lignes |
| Manifeste de dépendances | `package.json` (93 dépendances directes), `package-lock.json` (1 528 paquets) | analysés statiquement |
| Edge Functions | `supabase/functions/*/index.ts` (12) | lecture ciblée secrets/auth |
| Historique git | **23 commits** atteignables (+1 par reflog), **6 refs**, **577 blobs**, **17,4 Mio** | **100 % lus** |

**Périmètre exclu** : le programme Anchor (audité par `01-programme-onchain.md`), les RLS et policies Storage (auditées par `02-backend-edge-functions-rls.md`), l'ergonomie et l'accessibilité du front.

**Modèle de menace retenu** :
1. un tiers arbitraire clone le dépôt public et y trouve une valeur encore vivante ;
2. un contributeur externe ouvre une PR et tente d'extraire un secret de la CI ou de neutraliser un garde-fou ;
3. un attaquant compromet une dépendance transitive npm ou une action GitHub ;
4. une erreur de procédure (mauvaise branche poussée, mauvais commit mis en ligne) met en production un contenu non vérifié.

---

## 2. Méthode — et ses limites explicites

### 2.1 Ce que j'ai fait

1. **Énumération exhaustive de l'objets git** : `git rev-list --objects --all --reflog` puis `git cat-file --batch-all-objects` → **753 objets** (577 blobs, 152 arbres, 24 commits), **17,4 Mio** de contenu blob, **495 chemins** distincts jamais vus.
2. **Lecture intégrale des 577 blobs** — y compris les 7 blobs de plus de 256 Kio (jusqu'à 6,9 Mio) et les 31 blobs binaires. J'ai **dépoussé** les deux angles morts que le mode par défaut du script du dépôt laisse ouverts (voir §4.2).
3. **Rejeu de 25 familles de motifs** sur chaque blob : `api-key=` en URL, UUID, `sk-`, `sk-ant-`, JWT (3 segments base64url), `sb_secret_`, `ghp_`/`github_pat_`/`ghs_`/`gho_`, `AKIA`, `xox[abprs]-`, bloc PEM, keypair Solana (tableau de 64 octets), `npm_`, Stripe, Twilio, SendGrid, webhooks Discord/Slack, token Telegram, et **mnémonique BIP-39 (2048 mots)**. Chaque match a été décontextualisé puis **démenti individuellement** (fixtures de test, empreintes `sha512-` du lockfile, adresses base58, `Program ID`).
4. **Détection par forme cryptographique** indépendante des motifs : recherche de tout fragment base64url de **43 caractères** dont le décodage donne exactement **32 octets** (signature d'une clé privée P-256/VAPID), et de tout fragment de **87 caractères** décodant en **65 octets** commençant par `0x04` (clé publique P-256 non compressée). → **39 candidats**, tous dismissed (empreintes `sha512-` du lockfile, `Program ID` base58, `SystemProgram`/`BPFLoaderUpgradeab1e…`, signature du JWT `anon`).
5. **Analyse contextuelle des messages de commit** (les 24 corps de message lus intégralement) : recherche de clés, jetons, seeds, mots de récupération.
6. **Vérification de l'intégralité de la chaîne de livraison** : `ci.yml` → `secret-rules.mjs` → `build-guard.mjs` → `git-guard.mjs` → `deploy-*.mjs` → `push-sw.js`.
7. **Analyse statique des dépendances** : métadonnées `repository`/`homepage` de chaque paquet suspect lues depuis `node_modules/` (pas de réseau), cohérence `package.json` ↔ `package-lock.json`, intégrité SHA-512, liste des paquets à script d'installation, absence d'`overrides`.
8. **Contrôle de reproductibilité** : inventaire des fichiers d'épinglage de toolchain.

### 2.2 Limites — à lire AVANT les conclusions

- **Aucun `npm audit` n'a pu être lancé** (interdit : réseau). L'état de vulnérabilité CVE des 1 528 paquets **n'est pas vérifié**. Ce rapport ne dit **rien** sur les vulnérabilités connues. Seule l'analyse statique (épinglage, provenance, intégrité) est faite.
- **Aucun état GitHub distant n'a été interrogé** (interdit : réseau). Sont donc **invérifiables depuis ce clone** : l'existence de *branch protection* sur `main`, l'état de *required reviewers*, la présence d'autres refs côté serveur (`refs/pull/*`, tags, notes), et surtout **la présence des objets pré-purge dans la base objet de GitHub** (voir SC-05). Le projet le signale lui-même dans `docs/SECURITY-INCIDENT-2026-10-11.md` § 5 : *« Unreachable objects on the remote cannot be enumerated from a clone. »*
- **L'audit est statique** : je n'ai exécuté aucun script du dépôt, donc je n'ai pas *observé* le comportement de `build-guard.mjs`, `git-guard.mjs` ou `history-secret-scan.mjs` — je l'ai **lu** et **rejoué** (les règles de `secret-rules.mjs` ont été réimplémentées en Python et appliquées aux blobs).
- **Aucun état Vercel / Supabase / Helius n'a été interrogé** : l'état *vivant* des clés ne peut pas être établi ici, seulement leur présence dans les octets.
- **La clé `service_role` Supabase et les policies RLS** ne sont pas dans le dépôt : l'impact réel de la clé `anon` en dur (SC-22) dépend des RLS, que je ne peux pas lire. →cf. `02-backend-edge-functions-rls.md`.

---

## 3. Tableau des constats

| # | Sév. | Constat | Emplacement | Correctif |
|---|---|---|---|---|
| **SC-01** | **MAJEUR** | La CI n'exécute **jamais** le scan d'historique : un secret commité puis retiré de HEAD est invisible pour la CI | `.github/workflows/ci.yml` (jobs `ci`/`quotidien`) | Ajouter `npm run check:history` (ou `--profond` en quotidien) au job `ci` |
| **SC-02** | **MAJEUR** | Le scan d'historique en mode défaut saute 7 blobs > 256 Kio (9,5 Mio) + 31 binaires (9,8 Mio) ; `--profond` n'est branché nulle part | `scripts/history-secret-scan.mjs:70,216,230` | Utiliser `--profond` en contrôle quotidien ; le mode défaut n'est qu'un résumé |
| **SC-03** | **MAJEUR** | Actions GitHub épinglées par **tag mutable** (`@v4`), pas par SHA | `.github/workflows/ci.yml:65,72,133,201,206` | Épingler par SHA + commentaire de version |
| **SC-04** | **MAJEUR** | `git-guard.mjs` n'est **branché nulle part** : hook `pre-push` absent, aucun job CI | `.git/hooks/` (vide), `package.json:47` | `npm run guard:install` + job CI sur `push` |
| **SC-05** | **MAJEUR** | État de révocation des deux clés Helius **non prouvé** par le dépôt ; les objets pré-purge subsistent côté serveur GitHub | `docs/SECURITY-INCIDENT-2026-10-11.md:112,129` | Vérifier le tableau de bord Helius + purge côté GitHub (cf. §4.1) |
| **SC-06** | **MAJEUR** | Les garde-fous de secrets sont exécutés **depuis le code de la PR** : une PR peut les neutraliser avant fusion | `.github/workflows/ci.yml:80-109` | Contrôles de secrets hors du code de la PR (`workflow_run` sur le SHA de `main`) + branch protection |
| **SC-07** | MINEUR | `VERCEL_TOKEN` est dans l'**env global du job** `quotidien`, y compris pendant `npm ci` (scripts d'install exécutés) | `.github/workflows/ci.yml:199,212` | Scoper le secret aux étapes qui en ont besoin (`${{ secrets.VERCEL_TOKEN }}` au niveau du step) |
| **SC-08** | MINEUR | `npm ci` exécute les **scripts d'installation** ; 13 paquets du lockfile en ont ; pas de `--ignore-scripts` | `.github/workflows/ci.yml:78,213` | `npm ci --ignore-scripts` sur le job `ci`, ou revue des 13 paquets |
| **SC-09** | MINEUR | Le job `quotidien` est `continue-on-error: true` → il ne peut **jamais** faire échouer le workflow | `.github/workflows/ci.yml:195` | Acceptable si documenté ; le contrôle `ci` (code 3) bloque, lui |
| **SC-10** | MINEUR | `eslint-plugin-react-hooks@5.1.0-rc.0` — **pre-release** épinglée en `devDependencies` | `package.json:137` | Passer sur la stable `5.x` |
| **SC-11** | MINEUR | **Aucun `overrides`/`resolutions`** → impossible de forcer une version transitive corrigée | `package.json` | Ajouter un bloc `overrides` pour les transitives critiques |
| **SC-12** | MINEUR | `express` et `@babel/parser` en `dependencies` (prod) au lieu de `devDependencies` | `package.json:109,52` | Déplacer en `devDependencies` |
| **SC-13** | MINEUR | Lockfile **désynchronisé** : `name`/`version` = `node-solana-starter-app`/`0.0.0` vs `buildpact`/`0.1.0` | `package-lock.json` (racine) | Régénérer le lockfile |
| **SC-14** | MINEUR | Aucun `engines`, pas de `.nvmrc`/`.node-version` ; la CI utilise `node-version: '24'` (major flottant) | `package.json`, `.github/workflows/ci.yml:74` | `.nvmrc` + `engines.node` + version exacte en CI |
| **SC-15** | MINEUR | Aucun `rust-toolchain` → version Rust/Anchor **non reproductible** | `programs/workspace/` | `rust-toolchain.toml` (rust + anchor + yarn) |
| **SC-16** | MINEUR | `build-guard.mjs` ne lit que 17 **extensions texte** et plafonne à 12 Mio → un secret dans un autre format passe | `scripts/build-guard.mjs:45,50-66,90-92` | Étendre aux formats textuels usuels + signaler les ignorés |
| **SC-17** | MINEUR | `analyserBundle` ne détecte **pas** un secret collé sous un nom anodin (UUID opaque) | `scripts/secret-rules.mjs:246-260` | Limite assumée et documentée — cf. `docs/SECURITY-INCIDENT-2026-10-11.md` § 5 |
| **SC-18** | MINEUR | `push-sw.js` : `data.url` du payload push n'est **pas validé** → navigation vers une URL same-origin choisie par l'émetteur | `public/push-sw.js:25,34,40,45` | Valider `url` contre une liste blanche de chemins |
| **SC-19** | MINEUR | `push-sw.js` affiche `title`/`body` du payload **sans validation** → phishing si la clé VAPID fuit | `public/push-sw.js:11,17-18` | Préfixe de marque, longueur bornée, URL de marque |
| **SC-20** | MINEUR | `deploy-fleet-check.mjs` passe `--token` **en argument de ligne de commande** → visible dans `ps` | `scripts/deploy-fleet-check.mjs:98` | `VERCEL_TOKEN` en variable d'environnement, jamais en argv |
| **SC-21** | MINEUR | `deploy-check.mjs` compare la prod à `PROD_EXPECT_SHA` (base SHA de la PR) — bon choix, mais le **script** vient de la PR | `scripts/deploy-check.mjs:80-82`, `.github/workflows/ci.yml:60` | Cf. SC-06 |
| **SC-22** | INFO | Clé Supabase **`anon`** en dur dans les sources (publique par design) | `src/lib/supabaseClient.ts:15-17` | Acceptable ; ne jamais la remplacer par une `service_role` |
| **SC-23** | INFO | `VITE_RPC_ENDPOINT` / `VITE_REACT_APP_SOLANA_RPC_URL` interdits **par convention seulement** (commentaire `.env.example`), pas par un contrôle global | `.env.example:50-77` | Étendre `pre-soumission.mjs` / `rpc-endpoint-guard.test.ts` à toutes les vars `VITE_*` sensibles |
| **SC-24** | INFO | Le commit `174b21f` (rebasé puis abandonné) n'est visible **que par le reflog** → hors périmètre de `git rev-list --all` | `.git/logs/` | Contenu identique à `a3db84d` (arbre `f59c2cf4` commun) → perte nulle ; à savoir |
| **SC-25** | INFO | Aucun `dependabot.yml`, aucun `CODEOWNERS` | `.github/` | Activer Dependabot + `CODEOWNERS` sur `.github/`, `scripts/` |
| **SC-26** | INFO | `NOM_SENSIBLE` **exclut** `anon[_-]?key` → une clé `service_role` sous un nom anodin n'est vue que par la règle JWT | `scripts/secret-rules.mjs:45` | Compléter par un motif `*_KEY` générique sur les JWT |

**Bilan : 0 CRITIQUE · 6 MAJEUR · 11 MINEUR · 4 INFO** (les constats se recoupent : SC-02 est une sous-cause de SC-01).

---

## 4. Détail

### 4.1 Secrets dans l'historique git

#### 4.1.1 Ce que le script du dépôt couvre, et ce qu'il laisse passer

`scripts/history-secret-scan.mjs` est un **excellent** outil — bien écrit, fail-closed sur les cas d'indécision, et thoughtful sur les angles morts. Le tableau de couverture réel :

| Ce qu'il fait | Verdict |
|---|---|
| Énumère tous les blobs atteignables depuis `git rev-list --objects --all` | ✅ inclut `refs/stash` (vérifié : 752 objets avec `--all` vs 753 avec `--reflog`) |
| Lit les blobs ≤ 256 Kio | ⚠️ **7 blobs / 9,5 Mio ignorés** (dont le `.mp4` de 6,9 Mio et les deux `package-lock.json` de 815/778 Ko) |
| Écarte les binaires (contenant `\0`) | ⚠️ **31 blobs / 9,8 Mio ignorés** (PNG, JPEG, MP4) |
| Applique les règles partagées de `secret-rules.mjs` | ✅ une seule source de vérité — bien conçu |
| Masque les valeurs (empreinte SHA-256 + longueur) | ✅ aucun secret ne sort du rapport |
| Mode `--profond` : fenêtres 1 Mio chevauchantes 64 Kio + extraction des plages imprimables des binaires | ✅ referme les deux angles morts — **mais n'est branché nulle part** |
| Budget d'octets → `tronque: true` + code 2 | ✅ fail-closed correct (« ne pas avoir fini n'est pas un feu vert ») |

**Les angles morts réels, qu'il faut dire explicitement :**

- **SC-02 — le mode par défaut est un résumé, pas un audit.** Mesuré sur *ce* dépôt : le mode par défaut ne lit que **543 blobs sur 577, soit 5,7 Mio sur 17,4 Mio — 33 % des octets**. Il laisse **11,7 Mio (67 %) non lus** : 7 blobs de plus de 256 Kio (9,5 Mio) et 31 binaires (9,8 Mio, en partie les mêmes). Le mode `--profond` existe et fonctionne ; il n'est simplement **appelé nulle part** (ni par la CI, ni par un script, ni par un cron local documenté). Le rapport produit par le mode par défaut affiche « ignorés — N au-delà de 256 Kio, M binaires » : c'est honnête, mais un lecteur pressé lit « ✓ Rien trouvé » juste en dessous.
- **SC-01 — l'historique n'est jamais scanné automatiquement.** `npm run check:history` et `npm run check:history:profond` existent dans `package.json:39-40` mais **aucun workflow, aucun cron, aucun hook** ne les appelle. Un secret commité puis retiré du HEAD (exactement le scénario de l'incident du 09/10) passe **sans que rien ne le signale**.
- **SC-24 — le reflog n'est pas dans le périmètre.** `git rev-list --objects --all` ne liste que les commits atteignables par une ref. Le commit `174b21f` (« ci: déploie la production à chaque push sur main (jeton Vercel) ») n'existe que dans le reflog. J'ai vérifié : son **arbre est identique** à celui de `a3db84d` (`f59c2cf45842ba151b788223d539b1851f086800`) → **aucune perte de contenu**. Mais la propriété « l'historique est scanné » ne vaut que pour les refs, pas pour le reflog.
- **Refs non poussées / tags / notes de commit.** Le dépôt n'a **aucun tag** et **aucune note Git**. Les 4 branches distantes connues (`main`, `automation/mirror-archive-main`, `cursor/fix-tour-bugs-08bc`, `HEAD`) sont toutes **post-purge** et couvertes. Mais `refs/pull/*` côté GitHub n'est pas énumérable ici : le PR #1 (fusionné en `bd23864`) est post-purge, donc a priori sain — **à confirmer côté serveur**.
- **Fichiers renommés.** Non-angle-mort réel : le scan porte sur les **blobs**, pas sur les chemins ; un secret dans un fichier renommé est dans le même blob. C'est un point où l'outil est **plus solide** qu'un scan de noms de fichiers.
- **`.npmrc`, `yarn.lock`, sous-modules** : **aucun risque ici**. Le dépôt n'a qu'un `.npmrc` (une seule version dans toute l'histoire : `legacy-peer-deps=true`, **aucun jeton**), **aucun** `yarn.lock`/`bun.lock`/`pnpm-lock.yaml`/`.yarnrc`, **aucun** `.gitmodules`. Vérifié sur l'arbre ET sur l'historique complet.
- **Secrets dans les messages de commit** : les 24 messages lus intégralement. Aucun secret ; les seules occurrences de « clé »/`jeton` sont des **explications de conception** (« le jeton Vercel », « la clé VAPID a dû être régénérée »). ✔
- **`.env` jamais purgé ?** : aucun fichier `.env` (ni `.env.local`, ni `.env.vapid`, ni `.env.*`) n'a **jamais** été suivi par git. `git check-ignore` confirme que `.env*` est ignoré **et** que `!.env.example` est la seule exception. Le commit de purge `def8726` déclare : *« Aucun .env, aucune vraie clé — fixtures de tests uniquement. »* ✔ **Vérifié : aucun `.env` n'a jamais été commité.**
- **Keypairs Solana** : `**/*-keypair.json` et `target/deploy/` sont ignorés. Le fichier `programs/workspace/target/deploy/workspace-keypair.json` existe **sur le disque** mais n'est **ni suivi ni jamais suivi** (0 occurrence de `keypair` dans les 495 chemins historiques). ✔ **C'est le point le plus sensible de tout le dépôt (autorité d'upgrade du programme Anchor) et il est correctement tenu hors du dépôt.**

#### 4.1.2 Résultat de mon scan exhaustif

**Aucun secret actif dans l'historique actuel.** Détail :

- **Clé Supabase `anon`** (JWT, rôle `anon`, projet `xkznmflyiilgmxhvgega`) : présente dans `src/lib/supabaseClient.ts:17`, dans **les 24 commits** (donc depuis la racine purifiée). **Ce n'est pas une fuite** : la clé `anon` est publique par conception (Supabase la publie dans le bundle client ; la sécurité repose sur les RLS). Elle est identifiée comme telle par le dépôt lui-même (`docs/NOAH-PURGE-VAPID-2026-10-09.md` § 1 : *« le jeton `anon` d'un projet […] n'est pas un secret »*). Le risque résiduel est **100 % conditionné aux RLS**, que je ne peux pas lire (→ `02-backend-edge-functions-rls.md`). → **SC-22 (INFO)**.
- **Clé VAPID privée** : **absente**. La clé de 43 caractères qui figurait dans `docs/BILAN_BUILDPACT_290826.md` aux commits `8572edd`/`910aaf8` (commits **pré-purge**, absents de l'objet git actuel) n'y est plus. Le fichier de HEAD ne contient qu'une mention explicitement négative : *« `VAPID_PRIVATE_KEY` — **jamais dans ce document** »*. ✔
- **Clé Helius** : **absente** des 577 blobs. Les seules occurrences de `api-key=` sont des **fixtures de test** (`0000`, `abcdef`, `deadbeef`, `SECRET-A-NE-PAS-AFFICHER`) et des **commentaires**. ✔
- **Clé de programme Anchor / autorité d'upgrade** : l'adresse `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6` est **publique par nature** (c'est l'adresse, pas la clé) ; la clé privée correspondante est dans `~/.config/solana/id.json`, hors dépôt. ✔
- **Mnémonique BIP-39 / phrase de récupération** : **aucune**. ✔
- **Vercel, OpenAI, Anthropic, AWS, GitHub, Slack, Stripe, Twilio, SendGrid, Discord, Telegram, npm** : **aucune**. ✔

#### 4.1.3 Le point que le dépôt ne peut pas prouver — **SC-05**

C'est le constat le plus important de cette section, et il est **déjà formulé par le projet lui-même** dans `docs/SECURITY-INCIDENT-2026-10-11.md` § 5 :

- Deux clés Helius distinctes ont été servies en clair par la production. Au 11/10/2026 : `643570592694` → **HTTP 401 (révoquée)**, `e27f2e115ee5` → **HTTP 200 (toujours vivante)**, celle-ci présente dans **98 déploiements**.
- Les 166 déploiements ont été énumérés, 99 servaient un bundle porteur de clé ; ils ont été supprimés. Mais le document écrit : *« Avec plus aucune copie atteignable, cette valeur ne peut plus être sondée depuis ici — il faut le confirmer dans le tableau de bord du fournisseur. »*
- L'historique a été **réécrit** (racine orpheline `def8726`, 13/10). Les anciens objets — dont celui qui portait la clé — **peuvent subsister côté serveur GitHub** jusqu'au GC, et sont récupérables par SHA par quiconque les connaît. Le document le dit : *« Unreachable objects on the remote cannot be enumerated from a clone. »*

**Conséquence de l'audit** : la clé est *révoquée* (d'après le message du commit de purge), mais **cet état n'est pas vérifiable depuis le dépôt**, et le dépôt lui-même le signale comme non vérifié.

**Chemins de résolution (sans rien écrire dans le dépôt) :**
1. Tableau de bord Helius → vérifier que **les deux** identifiants sont inactifs (et pas seulement celui qu'on croit). C'est le seul contrôle qui éteint une clé.
2. Tableau de bord Vercel → confirmer qu'aucun déploiement résiduel ne sert le bundle fautif.
3. GitHub → `https://api.github.com/repos/Azumizeus/noah-6a8f756412768ce6d61b9376-u7a8/git/refs` pour lister **toutes** les refs, y compris `refs/pull/*` et les tags ; contrôler qu'aucune ne descend de l'ancien historique.
4. GitHub → contact support pour un **GC / purge des objets inatteignables** du dépôt, si le provider le permet.

---

### 4.2 Dépendances

#### 4.2.1 Vulnérabilités connues — **non vérifiées**

`npm audit` exige le réseau : **je ne l'ai pas lancé**. Je ne peux donc **pas** affirmer que l'arbre est exempt de CVE. Ce que je peux dire : le lockfile est **complet et intègre** (1 528 paquets, **1 527 résolus depuis `registry.npmjs.org`**, **0 paquet sans `integrity` SHA-512**, **0 dépendance git/http/file**), ce qui rend `npm ci` déterministe et vérifiable.

#### 4.2.2 Typosquatting et provenance

J'ai inspecté les métadonnées `repository`/`homepage`/`author` des paquets à risque (lecture locale de `node_modules/`, sans réseau) :

| Paquet | Version | Provenance déclarée | Verdict |
|---|---|---|---|
| `@x402/axios`, `@x402/core`, `@x402/express`, `@x402/svm` | `2.28.0` | `github.com/x402-foundation/x402` | ✔ officiel (x402 Foundation) |
| `@scure/base` | `2.4.0` | `github.com/paulmillr/scure-base` | ✔ officiel |
| `litesvm` | `1.0.0` | *(champ `repository` absent)* | ⚠ Anza, mais **métadonnées absentes** — voir ci-dessous |
| `embla-carousel-react` | `8.5.1` | `github.com/davidjerleke/embla-carousel` | ✔ |
| `vaul` | `0.9.6` | `github.com/emilkowalski/vaul` | ✔ |
| `cmdk` | `1.1.1` | `github.com/pacocoursey/cmdk` | ✔ |
| `react-day-picker` | `8.10.1` | `github.com/gpbl/react-day-picker` | ✔ |
| `react-copy-to-clipboard` | `5.1.0` | `github.com/nkbt/react-copy-to-clipboard` | ✔ |
| `qrcode-generator` | `2.0.4` | `github.com/kazuhikoarase/qrcode-generator` | ✔ |
| `process` | `0.11.10` | `github.com/shtylman/node-process` | ✔ (npm officiel) |
| `@babel/parser` | `8.0.6` | `github.com/babel/babel` | ✔ |
| `eslint-plugin-react-hooks` | `5.1.0-rc.0` | `github.com/facebook/react` | ✔ provenance, ⚠ pre-release (SC-10) |

**Conclusion typosquatting : aucun paquet imitant un nom officiel n'a été trouvé.** Tous les noms correspondent à des packages connus, et tous les `resolved` pointent sur `registry.npmjs.org` avec une empreinte SHA-512.

**Réserve sur `litesvm`** (pas un typosquatting, mais une lacune de traçabilité) : le `package.json` publié **ne déclare ni `repository` ni `homepage`**. Le paquet est bien celui attendu (il est utilisé par `@coral-xyz/anchor` pour les tests locaux), mais l'absence de métadonnées de provenance est un défaut de la chaîne amont, pas du dépôt.

**Point d'attention non résolu** : `@solana/wallet-adapter-nightly@0.1.21` est présent dans l'arbre transitive du lockfile. Il est **transitif** (via `@solana/wallet-adapter-wallets`), pas direct — mais un paquet `nightly` dans l'arbre de production est un vecteur classique (versions non revue, changelog instable). **À examiner si le temps le permet.**

#### 4.2.3 Scripts d'installation

13 paquets du lockfile ont `hasInstallScript: true` :

```
@stellar/stellar-sdk 14.2.0            @swc/core 1.16.2
@trezor/.../protobufjs 7.4.0 (×2)      protobufjs 7.5.5
bigint-buffer 1.1.5                   blake-hash 2.0.0
bufferutil 4.1.0                      fsevents 2.3.3
tiny-secp256k1 1.1.7                  usb 2.18.0
utf-8-validate 6.0.6
```

Ce sont des binaires natifs (compilation Rust) et des helpers standard — **rien d'inattendu**. Mais `npm ci` les **exécute** (SC-08), et `npm ci` tourne dans le job `quotidien` qui porte `VERCEL_TOKEN` dans son environnement (SC-07).

#### 4.2.4 Reproductibilité — **SC-11 à SC-15**

| Manque | Conséquence |
|---|---|
| Aucun `overrides`/`resolutions` | Impossible de forcer une version transitive corrigée sans réécrire le lockfile. **C'est le manque le plus structurant.** |
| `package-lock.json` racine = `node-solana-starter-app` / `0.0.0` (≠ `buildpact` / `0.1.0`) | Le lockfile est hérité d'un gabarit et n'a jamais été régénéré. Les **dépendances** sont pourtant parfaitement synchronisées (0 écart de nom, 0 écart de plage) → `npm ci` fonctionne, mais la traçabilité du lockfile est rompue. |
| Aucun `engines`, pas de `.nvmrc`/`.node-version` | La CI demande `node-version: '24'` → **major flottant**. Un juge qui clone le dépôt n'a aucun moyen de savoir quel Node produire le build validé. |
| Aucun `rust-toolchain` / `rust-toolchain.toml` | La version de Rust **et** d'Anchor n'est pas épinglée. `Anchor.toml` référence le cluster, pas la toolchain. Le programme ne se re-compilera pas à l'identique dans 6 mois. |
| `programs/workspace/Cargo.lock` | ✔ **présent** — le côté Rust est, lui, reproductible au niveau des versions de crates. |
| Versions des Edge Functions | **non versionnées** : `supabase/functions/*/index.ts` est du TypeScript Deno sans `deno.lock`, sans `import_map.json`, sans version de Deno épinglée. `Deno.serve` et le runtime Supabase sont **hors du contrôle du dépôt** : une Edge Function déployée n'est pas reconstructible depuis le dépôt. |

**Réponse à la question « un juge peut-il reproduire le build ? »** : **le front, oui** (`npm ci` + `npm run build` avec le lockfile à jour) ; **le programme Anchor, partiellement** (Cargo.lock présent, toolchain non épinglée) ; **les Edge Functions, non** (runtime non épinglé, déploiement hors dépôt).

---

### 4.3 CI/CD — `.github/workflows/ci.yml`

#### 4.3.1 Ce qui est bien fait

- ✔ **`permissions: contents: read`** au niveau du workflow — minimal. Aucun `write: all`, aucun `id-token`, aucun `actions: write`.
- ✔ **Pas de `pull_request_target`**, pas de `workflow_run`, pas de trigger par `issues`/`issue_comment`. Le seul trigger sur PR est `pull_request` → **les secrets ne sont PAS exposés à une PR de fork**.
- ✔ **Le job `ci` n'a aucun secret.** Il n'expose que `vars.PROD_URL` (variable de dépôt, non sensible). Le job `quotidien` est le seul à porter `secrets.VERCEL_TOKEN`, et il ne s'exécute que sur `schedule` ou `workflow_dispatch` — **jamais sur `pull_request`**.
- ✔ **Aucun artefact publié.** Pas de `upload-artifact`, pas de `actions/upload-pages-artifact`, pas de `release`. Les secrets du build ne sont pas ré-exportés nulle part.
- ✔ **Aucun `if:` sur un secret dans un sens exploitable.** Les seuls tests sont `[ -z "${VERCEL_TOKEN}" ]` (fail-closed, `exit 1`) et `if: env.VERCEL_TOKEN != ''` (job `deploy` **historique**, supprimé de HEAD). La logique « si le jeton est là, je déploie » n'existe plus à HEAD.
- ✔ **`PROD_EXPECT_SHA: ${{ github.event.pull_request.base.sha }}`** — le choix est le bon : sur une PR on compare la prod au commit **de la base**, pas à `head.sha` (contrôlable par l'auteur de la PR). C'est exactement la bonne pratique.
- ✔ **`fetch-depth: 0`** — historique complet, nécessaire pour que `deploy-check.mjs` compte les commits d'avance.
- ✔ **`concurrency` + `cancel-in-progress`** — évite les CI concurrentes.
- ✔ **Codes de sortie distincts bien utilisés** : 0 = conforme, 1 = divergence, 2 = indéterminable, 3 = fuite. Le code 3 **arrête le job** (`exit 1` dans le `case`), la divergence reste informative. C'est la bonne gradation — et elle est explicitement justifiée dans les commentaires de `ci.yml:92-109`.

#### 4.3.2 Les problèmes

**SC-03 — Actions non épinglées par SHA (MAJEUR).**

```yaml
uses: actions/checkout@v4      # ligne 65, 133, 201
uses: actions/setup-node@v4    # ligne 72, 206
```

Une tag est **mutable** : `v4` pointe aujourd'hui sur un commit, et demain sur un autre. Le scénario : compromission du compte `actions` (ou du mainteneur d'une action) → push sur la tag → **tout le code de la CI s'exécute avec les droits de la CI**, sur chaque dépôt qui référence `@v4`. Avec `permissions: contents: read` l'impact direct est limité, mais sur le job `quotidien` le `VERCEL_TOKEN` est présent (SC-07) → **un jeton de déploiement Vercel volable par ce scénario**.

**Correctif** (standard, documenté par OpenSSF) : épingler par SHA complet et mettre la version en commentaire.

```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
uses: actions/setup-node@1e60f620b9541d... # v4.4.0
```

**SC-06 — Les garde-fous s'exécutent depuis le code de la PR (MAJEUR).**

`npm test` (qui contient `secret-scan.test.ts`) et `npm run check:prod` (qui contient `deploy-check.mjs`) sont exécutés **depuis l'arbre de la PR**. Une PR de fork peut donc modifier `scripts/secret-rules.mjs`, `scripts/secret-scan.test.ts` ou `scripts/deploy-check.mjs` pour qu'ils retournent 0. Le contrôle devient alors **vert par construction** — et une fois fusionné, il ne protège plus rien.

Le *contenu* de la PR est évidemment non fiable (c'est le principe de `pull_request`), mais les **contrôles** ne devraient pas l'être. Deux leviers :

1. Exécuter les contrôles de secrets dans un job **`workflow_run`** déclenché sur le SHA de `main` (donc sur du code fusionné) — mais alors ils ne tournent plus *avant* la fusion.
2. **Le vrai remède est organisationnel** : `main` protégé, revue obligatoire, `CODEOWNERS` sur `.github/` et `scripts/`. **Je ne peux pas vérifier l'état de la branch protection depuis ce clone** (pas de réseau) — c'est la limite la plus importante de cette section.

**SC-01 / SC-02 — L'historique n'est jamais scanné (MAJEUR).** Détail en §4.1.1. Le point dur : `check:history` existe, fonctionne, et n'est appelé **par personne**.

**SC-07 — Secret dans l'env global du job.** `VERCEL_TOKEN` est déclaré au niveau du *job* (`ci.yml:199`), donc présent dans **tous** ses steps, y compris `npm ci` (ligne 212-213) qui exécute des scripts d'installation. Recommandation : déplacer la déclaration au niveau des steps qui en ont besoin (`check:origine`, `check:parc`), et ne jamais faire tourner `npm ci` dans un job qui porte un secret.

**SC-08 — `npm ci` sans `--ignore-scripts`.** 13 paquets ont un script d'installation. Sur le job `ci` (exécuté sur le code de la PR), c'est une surface d'exécution non fiable. Correctif : `npm ci --ignore-scripts` sur le job `ci` — les 13 paquets n'ont besoin de leur script que pour binaire natif, et un `npm rebuild` ciblé suffit.

**SC-09 — `continue-on-error: true` sur le job `quotidien`.** Le contrôle quotidien **ne peut jamais** faire échouer le workflow. C'est un choix assumé et documenté (`ci.yml:189-194` : « un badge rouge sur la page d'accueil du dépôt coûte plus que ce qu'il rapporte »). Je le note comme **MINEUR** : le contrôle bloquant est `ci` (code 3), pas `quotidien`. Mais la conséquence est que **le contrôle quotidien peut être cassé silencieusement** : si `check:parc` échoue à cause d'un bug, le workflow reste vert et rien ne le signale. Le job journalier émet bien un `::warning::`/`::error::` dans les logs — mais un log n'est pas une alerte.

#### 4.3.3 Script qui pousse / force-push automatiquement

**Aucun script du dépôt ne pousse.** Vérifié sur les 58 fichiers de `scripts/` : **aucune** occurrence de `git push` exécuté par un script. Les seules commandes git des scripts sont en lecture (`rev-parse`, `log`, `diff`, `ls-tree`, `cat-file`, `merge-base`, `status`, `branch --show-current`).

Le seul script qui **écrit** dans git est `scripts/purge-wallet-from-history.sh` / `scripts/purge-target-from-history.sh` (réécriture d'historique) — et il est protégé par `git-guard.mjs --rewrite`, qui **échoue fermé** sans `ALLOW_HISTORY_REWRITE=1`, refuse un arbre sale, et avertit explicitement du piège du rattachement `-s ours` post-purge (SC-04).

**Le job `deploy` historique** (commits `174b21f` / `a3db84d`, **retiré de HEAD** mais **présent dans l'historique public**) faisait :
```bash
npm i -g vercel@latest                     # ← CLI Vercel NON épinglée, installée à l'exécution
vercel link --project … --yes --token=${VERCEL_TOKEN}   # ← jeton en argv
vercel deploy --prod --yes --token="${VERCEL_TOKEN}"
```
Trois problèmes, tous **historiques** (ce code n'est plus dans `main`) mais **toujours lisible par quiconque clone le dépôt** :
1. `npm i -g vercel@latest` — **dépendance non épinglée téléchargée au moment du déploiement** (typosquatting possible sur `vercel` si l'attention se relâche, et pas de verrou d'intégrité).
2. `--token` en **argument de ligne de commande** → visible dans `ps` sur la machine.
3. `vercel deploy --prod` **depuis les sources locales** → livraison non reproductible, précisément ce que `origine-check.mjs` (commit `2752f7a` / `dd3f307`) a été écrit pour détecter.

Le remplacement par l'intégration Git Vercel (`c599664`, 21/10) est la bonne direction. **Ce n'est plus un risque actif**, mais le commit reste dans l'historique public : c'est un motif à ne pas réintroduire.

---

### 4.4 Garde-fous — ce qu'ils bloquent, ce qu'ils ne bloquent pas

#### 4.4.1 `scripts/build-guard.mjs` — **il analyse bien le bundle produit** ✔

C'est la question posée, et la réponse est **oui** : `build-guard.mjs` ne lit **pas** les sources, il lit le **dossier `dist/` produit** (`:122-135`), fichier par fichier, via `analyserBundle` (`:104`). Il est **branché dans `npm run build`** (`package.json:42` : `npm run typecheck && vite build && node scripts/build-guard.mjs`) → **il tourne donc à chaque build, y compris dans la CI** (`.github/workflows/ci.yml:90`). ✔ C'est le bon garde-fou, au bon endroit.

**Codes de sortie bien pensés** : 0 = lu et propre ; **3 = secret dans le bundle → le build ÉCHOUE** ; 2 = rien n'a pu être lu (dossier absent/vide) → *« un garde-fou qui n'a rien examiné ne doit pas ressembler à un garde-fou qui a validé »*. ✔

**Ce qu'il bloque** :
- une clé dans une URL (`?api-key=…`) — c'est la règle qui a trouvé la clé Helius servie le 11/10 ;
- un littéral **entre guillemets** sous un nom qui annonce un secret (`apiKey:"…"`), via `AFFECTATION_CITEE` ;
- les formats connus : bloc PEM, `sk-`, `AKIA`, `ghp_`, `github_pat_`, `xox*`, keypair Solana (tableau de 64 octets) ;
- un JWT Supabase de rôle **`service_role`** (celui qui court-circuite le RLS) ;
- `GABARIT` écarte les valeurs manifestement fictives (`<…>`, `change_me`, `your-key`, `example`, `redacted`, `todo`, `x{3,}`).

**Ce qu'il ne bloque pas (angles morts) :**

| Angle mort | Mécanisme | Gravité |
|---|---|---|
| **Secret collé sous un nom anodin** | `AFFECTATION_CITEE` exige que le **nom** matche `NOM_SENSIBLE` (`secret`, `private_key`, `service_role`, `api_key`, `apikey`, `access_token`, `auth_token`, `bearer`, `password`, `credential`). `const x = "bc8ce800-…"` passe. | **MAJEUR** en pratique (le cas réel de l'incident) — mais **limite assumée et documentée** dans `docs/SECURITY-INCIDENT-2026-10-11.md` § 5 : *« un UUID ne se distingue pas d'une empreinte »*. SC-17. |
| **Secret dans un fichier non textuel** | `estLisible()` (`:89-92`) ne retient que 17 extensions (`.js .mjs .cjs .jsx .ts .tsx .json .html .htm .css .svg .txt .map .xml .webmanifest`). Un `.env`, un `.pem`, un `.key`, un `.wasm`, un `.br` dans `dist/` → **ignoré silencieusement**. | MINEUR (SC-16) |
| **Fichier > 12 Mio** | `MAX_OCTETS` (`:45`) → ignoré, mais **annoncé** dans la sortie (`ignores.push(...)`). ✔ bonne pratique. | INFO |
| **Valeur < 20 caractères** | `AFFECTATION` / `AFFECTATION_CITEE` exigent ≥ 20 caractères. | INFO |
| **Secret encodé** (base64, hex, ROT, split en concaténation) | Aucune détection : les règles sont sur la **forme en clair**. | INFO (hors de portée d'un scan par motif) |
| **Secret dans un `.map`** | `.map` **est** dans la liste → analysé. ✔ | — |

**Point d'excellence** : le contrôle de la **vitesse** des règles (test `les règles restent linéaires sur une très longue ligne`, `secret-scan.test.ts:163-173`) est un vrai détail d'ingénierie : sans lui, un blob de 400 Kio prenait 8 minutes et le contrôle aurait été abandonné. C'est exactement la bonne priorité (un contrôle qu'on ne lance pas ne protège rien).

#### 4.4.2 `scripts/git-guard.mjs` — **conçu correctement, mais branché nulle part** (SC-04)

**Ce qu'il bloque** :
- **Plus de 5 fichiers** dans un envoi (`LOT_MAX = 5`, `:33`) — le protocole du projet ;
- **une plage de commits incalculable** → échec **fermé** (`:85-88`, `:99-109`) : ref inconnue, objet absent, clone partiel → refus, pas de feu vert. ✔ Excellente propriété ;
- **une base commune introuvable** (branche hors `origin/main`) → refus (`:162-165`) ;
- **une réécriture d'historique** sans `ALLOW_HISTORY_REWRITE=1` (`:209-213`) ;
- **une réécriture sur un arbre sale** (`:183-186`).

**Ce qu'il ne bloque pas :**
- **Le contournement par variable d'environnement.** `ALLOW_MASS_PUSH=1` et `ALLOW_HISTORY_REWRITE=1` désactivent le contrôle. C'est **voulu et tracé** (le message de commit et le message d'erreur l'annoncent) — c'est le bon compromis. Mais : **la variable d'environnement n'est pas journalisée** comme un événement, seulement mentionnée dans la sortie console. Un contournement passé par `ALLOW_MASS_PUSH=1` dans un script CI est **invisible** dans l'historique git.
- **Le contrôle porte sur le *nombre* de fichiers, pas sur leur *contenu*.** Un push de 5 fichiers contenant une clé passe. (C'est le rôle de `secret-scan`.)
- **Il n'est branché nulle part.** Le hook `pre-push` **n'est pas installé** (`.git/hooks/` ne contient que les `.sample`) ; `npm run guard:push` (`:47`) est une commande manuelle. **Aucun job CI ne l'appelle.** → un `git push --force` ou un envoi de 200 fichiers passe **sans contrôle**.
- **Un `--force` n'est jamais détecté.** `git-guard` raisonne en `diff --name-only <plage>` ; une réécriture d'historique change les SHA, donc la plage est incalculable → refus… **à condition que le hook soit installé**. Sans hook : rien.

**Correctif prioritaire** : `npm run guard:install` (le script existe, il écrit le hook) **et** un job CI sur `push` qui refuse un push dont la plage dépasse 5 fichiers. Un `pre-receive` côté serveur serait plus robuste, mais hors périmètre d'un dépôt public gratuit.

#### 4.4.3 `scripts/secret-rules.mjs` — les règles de détection, et leurs angles morts

C'est le cœur partagé par `secret-scan.test.ts` (arbre de travail), `history-secret-scan.mjs` (historique) et `build-guard.mjs` (bundle). **Une seule source de vérité** — c'est la bonne architecture, et le commentaire d'en-tête explique pourquoi (« deux copies d'une même liste de motifs finissent toujours par diverger »).

| Règle | Motif | Détecte | Ne détecte pas |
|---|---|---|---|
| `FORMATS_CONNUS` | 7 motifs : PEM, `ghp_`, `github_pat_`, `sk-` (32+), `xox[baprs]-`, `AKIA…`, keypair Solana (64 octets) | ces formats précis | `sk-ant-…` explicitement (mais matche `sk-` si ≥32 car. après) ; `ghs_`/`gho_`/`ghu_` (jetons GitHub de workflow) ; `npm_…` ; `sb_secret_…` |
| `JWT` | `eyJ…\.eyJ…\.…` | tout JWT **dont le rôle est `service_role`** | un JWT `anon`/`authenticated` (correct : publics) ; un JWT dont le payload est malformé (`roleDuJeton` → `null` → **ignoré silencieusement**) |
| `NOM_SENSIBLE` | 12 alternatives | `secret`, `private_key`, `priv_key`, `service_role`, `api_key`, `apikey`, `access_token`, `auth_token`, `bearer`, `password`, `passwd`, `credential` | **`anon_key`** (exclu **délibérément**, `:42-44`) ; `token` seul ; `key` seul ; `vapid_private_key` → matche `private_key` ✔ ; `helius_api_key` → matche `api_key` ✔ |
| `AFFECTATION` | `nom = "valeur"`, valeur ≥ 20 car. | affectation littérale sous un nom sensible | valeur < 20 car. ; valeur avec caractères hors `[A-Za-z0-9+/_=.-]` ; **une référence d'environnement est explicitement ignorée** (`REFERENCE_ENVIRONNEMENT`) — donc `import.meta.env.VITE_FOO` n'est pas signalée, et la valeur **reste** traquée dans `dist/` par `build-guard` ✔ |
| `AFFECTATION_CITEE` | idem, **guillemets exigés** | idem, dans les bundles minifiés | une affectation **non** guillemetée dans un bundle |
| `VALEUR_LONGUE` | `[A-Za-z0-9_-]{32,}` **+** `formeDeCle` (au moins une minuscule, **une majuscule**, **un chiffre**) | un token long « à forme de clé » sur une ligne qui mentionne un mot sensible | ⚠️ **un secret tout en minuscules** (hexadécimal) ; **un secret sans chiffre** ; **un secret de moins de 32 car.** ; une base64 **avec** `/`, `+`, `=` (alphabet volontairement étroit, `:88-97`) |
| `URL_CREDENTIAL` | `[?&](api_key\|apikey\|key\|token\|access_token\|secret)=valeur` (≥ 16 car.) | un secret en paramètre d'URL | valeur < 16 car. ; paramètre nommé autrement (`?auth=`, `?k=`) |
| `GABARIT` | `^(<\|[\|%\|{)\|x{3,}\|change_me\|your_\|example\|placeholder\|redacted\|todo` | — | ⚠️ **supprime toute valeur commençant par `[`, `{`, `<`, `%`** → une valeur *réelle* commençant par `[` est ignorée ; et `example`/`todo` **dans** une vraie valeur la fait disparaître |

**Les trois angles morts structurels, à assumer explicitement :**

1. **La forme, pas l'entropie.** Toutes les règles sont des motifs. Une clé « obfusquée » (base64 d'un base64, hex, chainée par concaténation, splittée sur plusieurs lignes) passe. C'est inhérent à l'approche ; le projet le sait et l'écrit.
2. **`GABARIT` est un filtre large.** `^(<|\[|%|\{)` est en tête de motif : **toute** valeur commençant par `[` est ignorée. Une clé `[abc...` réelle serait supprimée. Impact pratique faible (les secrets ne commencent pas par `[`), mais c'est une exception non documentée dans le motif de la règle.
3. **Le rôle `anon` est un carve-out assumé** (`:42-44`, `:124-131`). C'est correct pour Supabase. Mais la conséquence est qu'**une clé `service_role` stockée sous un nom qui ne contient pas `service_role` est vue uniquement par la règle JWT** — donc seulement si le payload est décodable. SC-26.

**Ce qui est excellent dans ce module :**
- le mode `masquer: true` (empreinte SHA-256 + longueur) pour l'historique, et le mode non masqué qui ne montre qu'un **préfixe de 8 caractères** pour l'arbre de travail ;
- `formeDeCle` calibré sur les valeurs **réelles** trouvées dans l'historique du 09/10 ;
- le mode `strict` (règles structurelles seules) pour les binaires, motivated par une **mesure** : 831 faux positifs sur 843 trouvailles dans les `.rcgu.o` de `target/` ;
- la borne de 65 caractères sur le nom de variable, avec le **coût mesuré** de la version non bornée (quadratique : 5 115 ms sur une ligne de 40 000 caractères) ;
- `REFERENCE_ENVIRONNEMENT`, qui empêche le dépôt d'être rouge sur du code sain — avec le bon commentaire : *« un contrôle qu'on ne peut pas garder vert finit désactivé »*.

---

### 4.5 Service worker / push — `public/push-sw.js`

**Question 1 : le SW peut-il servir du contenu arbitraire ? → NON.** ✔

Le SW n'a **que deux gestionnaires** : `push` (`:8`) et `notificationclick` (`:32`). Il n'y a **aucun** gestionnaire `fetch`, donc :
- il n'intercepte **aucune** requête réseau ;
- il ne maintient **aucun** cache ;
- il ne peut donc **ni servir, ni modifier, ni réécrire** la moindre ressource.

C'est délibéré et documenté (`:3-5` : *« volontairement PAS un service worker PWA complet (pas de cache offline ici) »*). Le SW est enregistré au scope racine depuis `src/lib/pushNotifications.ts`. **Aucun risque de service du contenu arbitraire, aucun risque de cache poisoning, aucune persistance de contrôle sur les pages.** ✔ C'est la conception la plus sûre possible pour un SW de push.

**Question 2 : push notifications forgées ? → Possible, mais conditionné à la clé VAPID.**

Le modèle Web Push/VAPID : le **service de push** (FCM/Mozilla) ne transmet un message au SW que si la requête est signée par la **clé privée VAPID** correspondante. Donc :
- **Sans** la clé privée VAPID → **pas de push forgé**. Le SW affiche ce que le serveur envoie, rien de plus.
- **Avec** la clé privée VAPID → **push forgé possible** : l'attaquant choisit `title`, `body` et `url` (payload entièrement sous son contrôle, `:11`).

**La clé VAPID privée est-elle exposée ?**
- Dans le dépôt : **non** — vérifié (aucun fragment base64url de 43 car. décodant en 32 octets, hors faux positifs). ✔
- Sur le serveur : `Deno.env.get('VAPID_PRIVATE_KEY')` dans `supabase/functions/push/index.ts:261` → secret Supabase, hors dépôt. ✔
- Historiquement : **elle a été exposée** (commits `8572edd`/`910aaf8`, purge le 09/10) et **régénérée** (`docs/BILAN_BUILDPACT_290826.md:25-28` : *« régénérée, les nouveaux secrets posés côté Supabase […] vérifiés par `supabase secrets list` »*). ✔

**⇒ Le risque résiduel de forge est conditionné à l'état de la clé VAPID *actuelle* (celle posée après la rotation), que je ne peux pas vérifier depuis le dépôt.** Le contrôle existe : `npm run check:vapid` compare la paire locale à celle du serveur **par empreinte** (sans jamais afficher la valeur). Il n'est pas branché en CI (il exige un accès au serveur).

**Les deux weaknesses du SW (SC-18, SC-19) :**

```js
data = { ...data, ...event.data.json() };   // :11 — payload entièrement sous contrôle de l'émetteur
self.registration.showNotification(data.title, { body: data.body, ... });  // :17-18
const targetUrl = event.notification.data?.url || '/';   // :34
client.navigate(targetUrl);                                // :40
self.clients.openWindow(targetUrl);                        // :45
```

- **`title` et `body` ne sont ni validés ni bornés** → un push forgé (donc : VAPID compromise) peut afficher un **hameçonnage** dans une notification système : *« ⚠️ Votre wallet a été compromis — connectez-vous sur buildpact-solana.vercel.app »*. Le SW ne préfixe pas la marque, ne borne pas la longueur, ne filtre pas les URL. → **SC-19 (MINEUR)**. Le correctif est simple : un préfixe de marque non contournable côté serveur (`[BuildPact] `), une longueur bornée, et un `renotify`/`tag` pour remplacer la notification précédente plutôt que d'empiler.
- **`data.url` n'est pas validé** → `client.navigate()` et `openWindow()` sont contraints à l'**origine** par la spécification, donc **pas de redirection cross-origin** (pas de phishing vers un site tiers). En revanche, un push forgé peut naviguer l'onglet ouvert vers **n'importe quel chemin de l'origine** — y compris une route qui déclencherait une action ou afficherait un état que l'utilisateur croira légitime. → **SC-18 (MINEUR)**. Correctif : valider `url` contre une liste blanche de préfixes (`/`, `/pacts/…`, `/premium/…`) et rejeter le reste.
- `data = { ...data, ...event.data.json() }` : le spread permet à un payload de **remplacer** `title`/`body`/`url` — mais aussi d'ajouter des clés arbitraires, qui sont ignorées. Pas de problème en soi. Le `try/catch` autour de `event.data.json()` est correct (un payload non-JSON ne casse pas le SW) ✔.
- `includeUncontrolled: true` dans `matchAll` (`:37`) : ramène un onglet non contrôlé — **comportement voulu et standard** (le SW est au scope racine, la page est la même origine). ✔

**Conclusion §4.5** : le SW est **conçu sans surface d'attaque de service de contenu**, ce qui est le point le plus important. Le risque de forge de notification est **entièrement conditionné à la clé VAPID privée**, qui n'est pas dans le dépôt. Les deux faiblesses restantes (titre non validé, URL non validée) sont des **améliorations de robustesse**, pas des vulnérabilités exploitables aujourd'hui.

---

### 4.6 Déploiement

**Question : les scripts de déploiement peuvent-ils exposer le token Vercel ?**

| Script | Traitement du jeton | Verdict |
|---|---|---|
| `scripts/origine-check.mjs` | `jetonVercel(env, contenuAuthCli)` (`:96-107`) : env d'abord, sinon `auth.json` de la CLI. Le jeton est mis dans un **en-tête** de requête. **Jamais imprimé** (le commentaire d'en-tête `:40-43` l'énonce, et le code le respecte). | ✔ **correct** |
| `scripts/deploy-fleet-check.mjs` | `args.push('--token', token)` (`:98`) → **le jeton est un argument de ligne de commande**, donc visible dans `ps` pour tout utilisateur de la machine. | ⚠ **SC-20 (MINEUR)** — corriger en passant par `VERCEL_TOKEN` en variable d'environnement (la CLI Vercel la lit). |
| `scripts/deploy-check.mjs` | **Aucun jeton** : interroge l'URL **publique** de la production. | ✔ |

**Question : push forcé ?** → **Non.** Aucun script n'exécute `git push` (§4.3.3). Le seul script qui réécrit l'historique (`purge-*-from-history.sh`) exige `ALLOW_HISTORY_REWRITE=1` et un arbre propre.

**Question : déploiement depuis une source non vérifiée ?** → **C'était le cas, et c'est corrigé.** Le job `deploy` historique faisait `vercel deploy --prod` depuis les sources locales, **sans** contrôle de commit — précisément le scénario que `origine-check.mjs` a été écrit pour détecter (`source: cli` vs `source: git`, `origine-check.mjs:9-13`). Ce job a été **remplacé** par l'intégration Git Vercel (`c599664`, 21/10), et le contrôle quotidien interroge désormais l'API Vercel pour vérifier que la production **vient bien d'un commit**.

**Question : risque de déploiement d'une branche non voulue — `main` est-il protégé ?**

- **Côté dépôt** : le déclencheur Vercel est l'intégration Git, qui suit `main` par défaut ; le job `en-ligne` ne s'exécute que sur `push` vers `main` ou `workflow_dispatch` (`ci.yml:126`) ; le job `deploy` (historique) utilisait `--scope`/`VERCEL_PROJECT` **en variables de dépôt**, pas en dur. ✔
- **Côté GitHub** : **je ne peux pas vérifier l'existence d'une branch protection sur `main` sans réseau.** C'est une **limite explicite** de cet audit, et c'est un point que le propriétaire doit vérifier en priorité : *une règle de protection de `main` (revue obligatoire + interdiction du force-push) est le contrôle qui rendrait le `git-guard` et les autres garde-fous crédibles*.
- **Un angle mort réel** : `workflow_dispatch` permet de lancer n'importe quel job sur **n'importe quelle branche** où le workflow existe. Le job `quotidien` y porte `VERCEL_TOKEN`. Un mainteneur (ou un attaquant ayant obtenu un jeton d'écriture) pourrait déclencher le workflow sur une branche contenant du code hostile → le job `quotidien` exécute `npm ci` (scripts d'installation) avec `VERCEL_TOKEN` dans l'environnement (SC-07). La combinaison SC-07 × SC-08 × `workflow_dispatch` est le chemin d'exfiltration le plus plausible du dépôt.

---

### 4.7 Reproductibilité — réponse à « un juge peut-il reproduire le build ? »

| Composante | Reproductible ? | Manque |
|---|---|---|
| **Front React/Vite** | **Oui**, à condition d'avoir Node 24 | `.nvmrc`, `engines.node` (SC-14) ; `package-lock.json` racine à renommer (SC-13) |
| **Programme Anchor** | **Partiellement** | `rust-toolchain.toml` (SC-15) ; `Cargo.lock` ✔ présent |
| **Edge Functions** | **Non** | Runtime Deno non épinglé, pas de `deno.lock`, pas d'`import_map.json`, déploiement hors dépôt (Vercel CLI / dashboard Supabase) — **les migrations SQL, elles, sont versionnées** (`supabase/migrations/`, 15 fichiers) ✔ |
| **Environnement de déploiement** | **Non** | Variables Vercel hors dépôt (par conception), le projet Vercel et son `orgId` sont **en dur** dans `origine-check.mjs:120-123` (public par construction, documenté) |
| **Outil de build** | **Non** | `legacy-peer-deps=true` dans `.npmrc` → le mode de résolution n'est pas le mode par défaut de npm ; le lockfile a été produit avec cette option. Sans elle, `npm ci` échoue. C'est documenté et assumé (`.npmrc:1-15`), mais un juge qui lance `npm ci` sans ce fichier (ou avec un npm différent) **échoue**. |

---

## 5. Ce qui est correct — à ne pas casser

C'est une partie importante de l'audit : ce dépôt est **très au-dessus** de la moyenne sur ce sujet, et beaucoup de ce qui suit est difficile à réimplementer.

1. **Le modèle de sortie « fail-closed » est appliqué partout et de façon cohérente.** Code 2 = *« rien n'a pu être mesuré »* ≠ code 0 = *« validé »*. C'est appliqué dans `build-guard.mjs` (`:115-120,161-164`), `history-secret-scan.mjs` (`:476-481`), `secret-check.mjs`, `vapid-check.mjs`, `origine-check.mjs` (`:30-31`), `deploy-fleet-check.mjs` (`:220,228,303`). **C'est la propriété la plus importante de tout l'outillage** : un contrôle qui n'a rien mesuré ne doit jamais ressembler à un contrôle qui a validé. Le projet l'a comprise et l'a écrite dans le code, pas seulement dans la documentation.
2. **Une seule source de vérité pour les règles de secrets** (`secret-rules.mjs`), partagée par les trois consommateurs (arbre, historique, bundle). Le commentaire d'en-tête explique *pourquoi* — c'est exactement la bonne raison.
3. **`build-guard` analyze le bundle produit**, pas les sources, et est branché dans `npm run build` → il tourne à chaque build, en local **et** en CI. C'est le contrôle qui ferme le mécanisme réel de l'incident (Vite inline les variables `VITE_*` **déclarées**, même non lues).
4. **`check:prod` vérifie ce qui est RÉELLEMENT servi**, pas ce qui ought l'être — et le **code 3 arrête le job** alors que la divergence reste informative. La gradation 0/1/2/3 est claire, documentée et appliquée dans les trois jobs.
5. **`origine-check.mjs` ferme la faille de reproductibilité** : une livraison faite à la main n'est ni relisible en diff, ni reconstructible. Le contrôle le mesure au lieu de l'espérer.
6. **Le `vercel link`/déploiement par jeton a été remplacé** par l'intégration Git, et le job de déploiement qui utilisait `vercel@latest` non épinglé a été retiré de `main`.
7. **`permissions: contents: read`** au niveau du workflow ; aucun secret exposé aux PR ; aucun `pull_request_target` ; aucun artefact publié.
8. **`PROD_EXPECT_SHA` = base SHA de la PR** (et non `head.sha`) : le choix techniquement correct.
9. **Aucun secret en clair dans l'historique actuel** : ni clé Helius, ni clé VAPID, ni keypair, ni `.env`, ni mnemonic, ni jeton de fournisseur. La clé `anon` Supabase présente est publique par construction.
10. **Les secrets sont systématiquement hors du dépôt et manipulés par empreinte** (`vapid-check.mjs`, `secret-check.mjs`) : le rapport ne montre ni la valeur, ni même un préfixe. C'est rare et c'est très bien fait.
11. **Le relais RPC a une liste blanche de méthodes JSON-RPC** (`supabase/functions/rpc/allowlist.ts`), un plafond de corps (64 Kio) et un plafond de lot (20) — donc pas de relais ouvert qui consommerait le quota de la clé.
12. **`baseUrlError()`** dans `assistant-chat` refuse `http:`, les identifiants dans l'URL, `localhost`, `.local`, `.internal`, les IPv4/IPv6 littérales : garde anti-SSRF raisonnable, testée, et **ses limites sont écrites** (le DNS rebinding n'est pas détectable depuis le runtime Edge).
13. **La documentation de sécurité est exemplaire** : `docs/SECURITY-INCIDENT-2026-10-11.md` consigne l'incident, **ce qui n'est pas affirmé** (`:106-131`), et la limite de mesure. `docs/NOAH-PURGE-VAPID-2026-10-09.md` documente la procédure de purge. **Un juge qui lit ces deux documents comprend mieux la posture de sécurité du projet que la plupart des README d'architecture.**
14. **Des tests qui prouvent que les contrôles savent échouer** : chaque règle a un cas de test avec une **valeur synthétique assemblée à l'exécution** (`secret-scan.test.ts:62-70`) — pour que le fichier de test lui-même ne contienne pas un secret. Une attention au détail rare.
15. **Le garde-fou anti-quadratique** : le test de performance des règles (`secret-scan.test.ts:163-173`) est un vrai contrôle d'ingénierie, avec la mesure avant/après documentée.

---

## 6. Ce qu'il faut faire — par ordre de rapport coût/bénéfice

### Maintenant (30 minutes, aucun risque)

1. **`npm run guard:install`** — poser le hook `pre-push`. Le script existe, il est écrit, il n'est simplement pasbranché. *(SC-04)*
2. **Ajouter au job `ci`** (après `npm test`) :
   ```yaml
   - name: Historique : aucune valeur de forme secrète
     run: npm run check:history
   ```
   *(SC-01 — quelques secondes sur 17 Mio.)*
3. **Déclarer `VERCEL_TOKEN` au niveau du step**, pas du job, dans `quotidien`. *(SC-07)*
4. **`npm ci --ignore-scripts`** dans le job `ci`. *(SC-08)*
5. **Vérifier le tableau de bord Helius** : les deux clés sont-elles inactives ? *(SC-05 — le seul contrôle qui éteint une clé.)*
6. **Vérifier la branch protection de `main`** sur GitHub (revue obligatoire, pas de force-push). *(SC-04, SC-06 — non vérifiable d'ici.)*

### Cette semaine (2–3 heures)

7. **Épingler les actions par SHA** (5 occurrences : lignes 65, 72, 133, 201, 206). *(SC-03)*
8. **`npm run check:history:profond`** en contrôle quotidien (lecture des gros blobs et des binaires). *(SC-02)*
9. **Ajouter un `overrides`** pour les transitives critiques, et `dependabot.yml`. *(SC-11, SC-25)*
10. **`.nvmrc` + `engines.node` + `rust-toolchain.toml`** ; corriger le `name`/`version` racine du lockfile. *(SC-13, SC-14, SC-15)*
11. **Valider `url` et borner `title`/`body` dans `public/push-sw.js`.** *(SC-18, SC-19)*
12. **Passer `VERCEL_TOKEN` par variable d'environnement dans `deploy-fleet-check.mjs`** au lieu de `--token` en argv. *(SC-20)*

### Ce mois-ci

13. **Rétablir le contrôle de secrets hors du code de la PR** (job `workflow_run` sur le SHA de `main`) ou, à défaut, `CODEOWNERS` + revue obligatoire sur `scripts/` et `.github/`. *(SC-06)*
14. **Déployer le `check:history` sur un dépôt miroir** pour attraper ce qui traîne dans les forks et les clones de la plateforme.
15. **Documenter dans `docs/SECURITY.md`** la posture « un secret non purgé est un secret compromis, et une purge ne révoque rien » — le message existe déjà dans les documents d'incident ; le remonter au niveau de la politique le rend actionnable.

---

## 7. Verdict

**Peut-on affirmer que le dépôt public ne contient AUCUN secret révoqué ou non révoqué dans son historique ?**

**Non — pas avec la certitude qu'exigerait cette affirmation, et la nuance est importante.**

Ce que l'audit **établit** :
- ✅ **L'ensemble de l'historique git atteignable** (23 commits, 5 refs, 577 blobs, 17,4 Mio — **100 % lus, y compris les gros blobs et les binaires**, ce que le mode par défaut du script du dépôt ne fait pas) **ne contient aucun secret actif** : ni clé Helius, ni clé VAPID, ni keypair Solana, ni `.env`, ni mnemonic, ni jeton de fournisseur.
- ✅ La seule valeur de forme secrète en dur est la clé Supabase **`anon`**, **publique par conception** (elle est dans le bundle client de toute application Supabase) ; son impact réel dépend des RLS, auditées par un autre audit.

Ce que l'audit **ne peut pas** établir, et qu'il faut dire sans détour :
- ⚠️ **L'historique pré-purge n'est plus dans le dépôt, mais il peut subsister côté serveur GitHub** (objets inatteignables, récupérables par SHA, jusqu'au GC). Le projet l'écrit lui-même dans `docs/SECURITY-INCIDENT-2026-10-11.md` § 5. **La clé Helius concernée est déclarée révoquée** (message du commit `def8726`) et **c'est bien la seule action qui éteint une clé** — mais **cet état n'est vérifiable ni depuis le dépôt, ni depuis ce clone, et le dépôt lui-même le qualifie de « à confirmer dans le tableau de bord du fournisseur »**. Il faut le confirmer. **C'est le seul point qui empêche de conclure « zéro secret »**, et c'est un point *hors du dépôt*.
- ⚠️ **L'état vivant des clés côté fournisseurs** (Helius, Vercel, Supabase, VAPID post-rotation) est **hors de portée d'un audit statique**. Le dépôt en donne un aperçu daté du 11/10/2026, pas l'état d'aujourd'hui.
- ⚠️ **La configuration de sécurité côté GitHub** (branch protection, refs `refs/pull/*`, tags, notes) **n'est pas vérifiable depuis un clone sans réseau**.
- ⚠️ **Les vulnérabilités CVE des 1 528 paquets** ne sont pas vérifiées (`npm audit` interdit : réseau).

**En résumé, et c'est la formulation que je retiens** :
> *L'**historique git du dépôt, en l'état où il est clonable aujourd'hui**, ne contient aucun secret actif — c'est établi, blob par blob, sans angle mort de taille ni de type. L'**historique pré-purge**, qui portait une clé Helius aujourd'hui déclarée révoquée, **n'est plus dans le dépôt** mais **subsiste peut-être sur le serveur GitHub** ; cette vérification-là ne peut pas être faite d'ici et constitue le **seul point ouvert** de cette question. Et la **CI, telle qu'elle est écrite, ne prouve pas** ce constat : elle ne scanne ni l'historique, ni les gros blobs. **Ce que l'audit démontre, la CI ne le démontre pas au quotidien.***

C'est, en soi, le constat le plus actionnable de ce rapport : **le projet a construit des outils de détection/protection réellement solides, et ne les a pas branchés.** Les trois briques manquantes — `check:history` en CI, le hook `pre-push`, l'épinglage des actions par SHA — sont chacune un changement de quelques lignes.

---

*Audit réalisé en lecture seule stricte le 21/10/2026 — aucun fichier du dépôt modifié, aucun script exécuté, aucun appel réseau, aucune commande git mutante.*
