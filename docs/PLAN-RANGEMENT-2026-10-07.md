# PLAN DE RANGEMENT — seeker-nexus-dev-hub-solana
**Date : 07/10/2026 · Mis à jour le 07/10/2026 en soirée.**
**État : les phases 0 et 1 sont FAITES et vérifiées. Les phases 2, 3 et 5 attendent une décision.**
Chaque étape indique son niveau de risque : `[SÛR]` (réversible, contenu conservé),
`[ACCORD]` (implique un force-push ou une suppression), `[CLÉ]` (touche un secret compromis).

---

## 0. Les 5 vérités à retenir (tout le reste en découle)

| # | Question | Réponse vérifiée |
|---|---|---|
| 1 | Y a-t-il **deux** dossiers `SEEKER-NEXUS-DEV-HUB-SOLANA` ? | **NON.** Celui du Bureau est un **raccourci (symlink)** vers `~/projects/seeker-nexus-dev-hub-solana`. |
| 2 | Rien n'est dupliqué, rien à fusionner ? | **Exact.** `readlink` renvoie le chemin du projet : un seul jeu de fichiers, aucune divergence possible. |
| 3 | Ça explique les pannes de déploiement Vercel ? | **NON, aucun rapport.** La vraie cause est l'identité Git des commits — **corrigée et prouvée le 07/10** (§ Phase 4). |
| 4 | Alors c'est quoi le vrai bazar ? | **18 « gitlinks fantômes » + 4 dépôts Git imbriqués + 6,6 Go de copies mortes + 1 sauvegarde qui contient une clé privée.** |
| 5 | Est-ce grave ? | Le bordel **ne casse rien**, mais il rend chaque `git status` illisible et fait gonfler les clones/sauvegardes de ~6,6 Go. |

---

## 1. Diagnostic précis

### 1.1 Le faux bazar — les « 2 dossiers » (INCIDENT CLOS)

```
~/Desktop/SEEKER-NEXUS-DEV-HUB-SOLANA   →  lrwxr-xr-x  (symlink créé le 29/09 à 04:01)
                                            ↳ /Users/mickaeldunoyer/projects/seeker-nexus-dev-hub-solana
```
- `readlink` confirme la cible ; le nom en MAJUSCULES ne fait que refléter le nom du dépôt GitHub.
- Même schéma pour `~/Desktop/seeker-agents-system` → `~/projects/seeker-agents-system`.
- **Décision :** garder le raccourci ou le supprimer. Aucune conséquence sur le code.
  ```
  rm ~/Desktop/SEEKER-NEXUS-DEV-HUB-SOLANA        # supprime le lien SEUL, pas les fichiers
  ```

### 1.2 Le vrai bazar n°1 — 18 gitlinks fantômes dans le dépôt parent

Le dépôt **parent** (`~/projects/seeker-nexus-dev-hub-solana`, remote
`Azumizeus/SEEKER-NEXUS-DEV-HUB-SOLANA`) suit **18 dossiers comme s'ils étaient des
sous-modules**, mais **il n'existe aucun `.gitmodules`** :

```
.claude/skills/blockchain-skills  helius  integrating-jupiter  light-protocol
lightprotocol-skills  metaplex-skill  pyth-skill  solana-anchor-claude-skill
solana-dev-skill  solana-game-skill  solana-kit  surfpool  vulnhunter   (13)
archive/buildpact-BACKUP-26aout   archive/buildpact-by7b
buildpact-75mv
migration noah /Build Pact Solana Dev-Hub/buildpact-by7b/freellmapi
migration noah /Build Pact Solana Dev-Hub/buildpact-by7b/ui-ux-pro-max-skill
```

**Conséquences mesurées aujourd'hui :**
- `git status` affiche **en permanence** ` M buildpact-75mv` + 13 × ` M .claude/skills/…`
  + 2 × ` M migration noah /…` → tout est rouge en permanence, on ne voit plus les vrais changements.
- `git submodule status` → `fatal: no submodule mapping found in .gitmodules for path '…'`.
- **4884 fichiers** du parent sont suivis à l'intérieur de `archive/` et `migration noah /`
  (donc le `.gitignore` qui les ignore **ne sert à rien** : l'ignorance ne s'applique jamais
  à un fichier déjà suivi).
- Le `.gitignore` du parent **n'est même pas committé** (`?? .gitignore`) et son commentaire
  renvoie à `~/archives/…` **qui n'existe pas**.

### 1.3 Le vrai bazar n°2 — 5,4 Go de copies mortes

> Le bundle de 377 Mo listé ci-dessous a été **supprimé le 07/10** (Phase 0) : il en reste
> donc 5,4 Go à traiter, plus 725 Mo dans les deux historiques (Phase 2).

| Élément | Taille | État |
|---|---|---|
| `archive/` | **2,8 Go** | 2 copies mortes : `buildpact-by7b/` (remote `…-by7b`, 18/09), `buildpact-BACKUP-26aout/` (sans remote, 26/08) + docs |
| `migration noah /` | **2,6 Go** | nom avec **espace final** ; contient `mon-projet/` (avec `target/` Rust), des `.zip`, `dossier sans titre/` |
| `.git` du parent | **247 Mo** | dont **~245 Mo = `migration noah /mon-projet/target/**`** (rlib/dylib Rust) |
| `.git` de `buildpact-75mv` | **478 Mo** | dont **451 Mo = `**/target/**`** (déjà analysé) |
| `buildpact-75mv-backup-20261007-151646.bundle` | ~~377 Mo~~ | ✅ **supprimé le 07/10** — il contenait la clé privée |
| `~/Documents/Seeker - Nexus - Ecosystem Program/BuildPact/` | **112 Mo** | 2 `.dmg` (`build-pact- back-up.dmg`, `solana-build-pact-keypair.dmg`), **aucun code, pas un dépôt** |
| Doublons Bureau | ~5 Mo | `seeker-agents-system-BACKUP-20260626_022741/`, `nexus-seeker-v2.{BACKUP,WORKING}.html` |
| `_backup-buildpact/` | 32 Ko | 1 seul `index-buildpact.html` |

### 1.4 L'état du dépôt applicatif (bonne nouvelle)

`buildpact-75mv/` : branche `main`, HEAD = `96c6c49` = `origin/main` (écart `0 0`),
arbre de travail **propre**, CI verte, `buildpact-solana.vercel.app` sert bien `96c6c49`.
**C'est le dossier à ne pas toucher** — il est sain.

### 1.5 Vercel — cause réelle et correctif (détail en Phase 4)

Chaque push créait 2 déploiements `readyState: BLOCKED`,
`errorMessage: "The deployment was blocked because the commit author doesn't have
permission to create deployments for this project."`, `buildingAt: null` — le build n'a
jamais démarré : le refus a lieu **avant**, sur l'identité de l'auteur du commit.
**Aucun rapport avec les dossiers locaux** : Vercel clone depuis GitHub sur ses serveurs.
La cause exacte et le correctif vérifié sont en **Phase 4**.

---

## 2. Le plan, en 5 phases

> **Ordre impératif — il a été respecté** : la Phase 1 est passée avant la Phase 3. Les
> 4884 fichiers de `archive/` et `migration noah /` ne sont plus suivis, donc déplacer ces
> dossiers ne touchera plus `git status`. C'était tout l'intérêt de nettoyer l'index d'abord.

### Phase 0 — Sécuriser la clé privée `[CLÉ]` — ✅ FAIT le 07/10/2026
```bash
cd ~/projects/seeker-nexus-dev-hub-solana
rm -f buildpact-75mv-backup-20261007-151646.bundle
```
**Résultat réel :** bundle de **395 Mo supprimé** ; `ls *.bundle` ne renvoie plus rien.
- Ce bundle était la **copie de l'ancien dépôt AVANT** le retrait de la clé : il contenait
  encore `contracts/target/wallet/wallet.json`.

**⚠ Il reste 5 copies en clair de la MÊME clé sur le disque** — tant qu'elles existent,
la clé reste à traiter comme compromise :

| Fichier | Taille |
|---|---|
| `buildpact-75mv/contracts/target/wallet/wallet.json` | 229 o |
| `archive/buildpact noah 18:09:26/…/contracts/target/wallet/wallet.json` | 229 o |
| `migration noah /Build Pact Solana Dev-Hub/buildpact-by7b/contracts/target/wallet/wallet.json` | 241 o |
| `migration noah /Build Pact Solana Dev-Hub/FEUILLE_DE_ROUTE.md` (cite la clé en clair) | 1 occurrence |
| `RAPPORT-BUILDPACT-VS-NOAH-2026-10-07.md` (cite la clé en clair) | 2 occurrences |

- Les trois `wallet.json` sont dans des dossiers que la **Phase 3** sort du dépôt : à
  supprimer définitivement à ce moment-là, pas seulement à déplacer.
- Le dernier document est déjà **exclu de Git** (`.gitignore` : `/RAPPORT-*.md`), il ne
  peut donc pas partir sur un remote — mais il reste lisible sur le disque.
- **Décision :** si la clé sert encore → la mettre dans un gestionnaire de mots de passe et
  supprimer ces copies ; sinon → supprimer les cinq.

### Phase 1 — Assainir le dépôt parent (gitlinks fantômes) `[SÛR]` — ✅ FAIT
**Résultat réel : commit `550f520` — 4942 entrées retirées du suivi (18 gitlinks,
21 `.DS_Store`, le reste étant le contenu des archives), 0 gitlink restant, et
`git status` **totalement vide**. Aucun fichier n'a été supprimé du disque.**

Aucun fichier n'est supprimé du disque : on retire seulement du **suivi**.
```bash
cd ~/projects/seeker-nexus-dev-hub-solana
git rm -r --cached --quiet buildpact-75mv archive "migration noah " .claude/skills
```
Puis corriger et committer le `.gitignore` (remplacer le commentaire périmé) :
```gitignore
# Copies archivées et dépôts imbriqués : présents sur disque, HORS suivi Git.
/archive/
/migration noah /
/buildpact-75mv/
/.claude/skills/

# Artefacts de build (régénérés)
target/
node_modules/
dist/
.next/

# Bruit macOS
.DS_Store
```
```bash
git add .gitignore
git commit -m "chore: retire du suivi les gitlinks fantômes, les archives et les dépôts imbriqués"
```
**Vérification (critère de succès) — PASSÉ le 07/10 :**
```bash
git status --porcelain                        # VIDE (aucune ligne, vérifié)
git status --porcelain --untracked-files=no    # VIDE
git ls-files -s | awk '$1==160000' | wc -l     # 0
git submodule status                           # ne renvoie plus "fatal:"
```
*Option non retenue (plus lourde) :* transformer les 13 `.claude/skills/*` en vrais
sous-modules avec un `.gitmodules`. Inutile pour un dev solo — ils restent des dossiers
Git indépendants, simplement ignorés par le parent.

**Découverte au passage :** le dépôt parent **n'existe pas sur GitHub**.
`git ls-remote origin` répond `remote: Repository not found.` et aucun dépôt
`SEEKER-NEXUS-DEV-HUB-SOLANA` n'apparaît sur le compte `Azumizeus`. Il est purement local :
la Phase 2 (b) ne demandera donc **aucun force-push**, et rien de ce dépôt ne peut fuiter
sur un remote.

### Phase 2 — Alléger les deux historiques `[ACCORD]`
Le script existe déjà et est générique :
[buildpact-75mv/scripts/purge-target-from-history.sh](buildpact-75mv/scripts/purge-target-from-history.sh)
(bundle de sécurité automatique, refuse de tourner sur un arbre sale, ne pousse rien).
```bash
# a) dépôt applicatif : 478 Mo → ~3 Mo
cd ~/projects/seeker-nexus-dev-hub-solana/buildpact-75mv && bash scripts/purge-target-from-history.sh

# b) dépôt parent : 247 Mo → ~2 Mo
cd ~/projects/seeker-nexus-dev-hub-solana && bash buildpact-75mv/scripts/purge-target-from-history.sh
```
**Ce que ça implique (d'où le `[ACCORD]`) :** tous les SHA changent → **force-push** sur les
deux remotes, et **Noah doit re-cloner** (ne pas tirer/merger, sinon les 451 Mo reviennent
chez lui). C'est le même lot que celui du
[PLAN-ALLEGEMENT-GIT-BUILDPACT-2026-10-07.md](PLAN-ALLEGEMENT-GIT-BUILDPACT-2026-10-07.md).

### Phase 3 — Sortir les copies mortes du dépôt puis de la machine `[ACCORD]`
Une fois la Phase 1 committée, déplacer ne touche plus rien à Git.
```bash
mkdir -p ~/archives                      # le dossier cité par l'ancien .gitignore
cd ~/projects/seeker-nexus-dev-hub-solana
mv archive            ~/archives/nexus-archive-2026-10-07
mv "migration noah "  ~/archives/nexus-migration-noah-2026-10-07   # note : espace final supprimé
mv _backup-buildpact  ~/archives/nexus-backup-buildpact-2026-10-07
```
Puis, **après avoir vérifié** que rien n'est unique (ouvrir `~/archives/…`, comparer les
dates), mettre à la corbeille plutôt que `rm -rf` :
- `~/archives/nexus-migration-noah-2026-10-07/**.zip` (`buildpact-by7b.zip` 484 Ko,
  `noah-6a8f756412768ce6d61b9376 -2.zip`) et `mon-projet/target/` (regénérables).
- `~/Documents/Seeker - Nexus - Ecosystem Program/BuildPact/` (2 `.dmg`, 112 Mo) →
  garder seulement si tu as besoin de restaurer un jour l'ancienne clé.
- Bureau : `seeker-agents-system-BACKUP-20260626_022741/`, `nexus-seeker-v2.BACKUP.html`,
  `nexus-seeker-v2.WORKING.html` (≈5 Mo) → corbeille ; garder `nexus-seeker-v2.html`.
- `~/Desktop/SEEKER-NEXUS-DEV-HUB-SOLANA` (raccourci) → au choix, voir §1.1.

**Résultat attendu :** ~6,6 Go récupérés, et un workspace réduit aux 4 dossiers utiles :
`buildpact-75mv/`, `docs/`, `.claude/`, `NOAH AI PLATEFORME PRO/`.

### Phase 4 — Réparer les déploiements Vercel — ✅ RÉSOLU ET PROUVÉ le 07/10

**Cause exacte (mesurée sur les 100 derniers déploiements) :**

| Auteur du commit (login GitHub) | Déploiements | Verdict Vercel |
|---|---|---|
| `Azumizeus` | 4 | **3 READY** (+1 `ERROR` de build, pas de blocage) |
| `dunkcashcoins` | 35 | **33 BLOCKED** (2 READY les 19–20/09, avant l'application stricte de la règle) |
| aucun (auteur `Noah AI`, e-mail inconnu de GitHub) | 1 | BLOCKED |

L'équipe Vercel `azumizeus-projects` (plan **Hobby**) n'autorise que l'identité
`Azumizeus` à déclencher un déploiement. Or **deux identités Git coexistaient dans le même
historique** :

```
Azumizeus  <dunkcashcoins@proton.me>   →  reconnu par GitHub comme Azumizeus   → déploie ✅
AzumiZeus  <dunkcashcoins@gmail.com>   →  reconnu par GitHub comme dunkcashcoins → BLOCKED ⛔
```

**Correctif appliqué** (les 71 commits de l'identité fautive venaient de la config locale
du dépôt) :
```bash
cd ~/projects/seeker-nexus-dev-hub-solana/buildpact-75mv
git config user.name  "Azumizeus"
git config user.email "dunkcashcoins@proton.me"
```
**Preuve :** commit vide `59daca8` (branche jetable `chore/vercel-identity-check`) poussé
→ déploiement Vercel `BUILDING` puis **`READY`** (branche supprimée après vérification).
Les déploiements issus d'un push ne sont plus `BLOCKED`.

**Reste à traiter :** les commits de l'agent **Noah** sont signés `Noah AI <bot@plena.ai>`
(146 commits) : cet e-mail n'est rattaché à aucun compte GitHub, donc **ces push-là seront
encore bloqués**. Deux issues : faire committer l'agent avec l'identité du dépôt, ou
ajouter un déploiement déclenché depuis la CI avec un token Vercel.

**Rappel :** `vercel --prod` depuis `buildpact-75mv/` reste le contournement manuel
(fonctionne toujours, source `cli`), et `npm run check:prod` vérifie le commit servi.

### Phase 5 — Garde-fous pour que ça ne revienne pas `[SÛR]`
1. **Un dossier = un dépôt.** Ne jamais `git init` un dépôt à l'intérieur d'un autre.
2. **Jamais `git init` ni `git add` à la racine `~/projects/`** — chaque projet vit chez lui.
3. `target/`, `node_modules/`, `dist/`, `.next/` **dans le `.gitignore` AVANT le premier commit**.
4. **Vérification mensuelle** : `cd buildpact-75mv && npm run check:fat` (classe le poids de
   l'historique par catégorie).
5. **Pas de sauvegarde en clair dans le dépôt** : un bundle/zip de sauvegarde contient
   *tout*, clés comprises → le stocker hors du workspace et chiffré.
6. **Une identité Git par dépôt lié à Vercel.** La config *globale* de cette machine est
   `mickaeldunoyer <mickael.dunoyer@gmail.com>` — une **troisième** identité, distincte de
   celles de `buildpact-75mv`. Tout dépôt connecté à Vercel doit donc recevoir, en local :
   `git config user.name "Azumizeus"` et `git config user.email "dunkcashcoins@proton.me"`,
   sinon ses push seront `BLOCKED` (vérifié : 33 déploiements bloqués pour cette raison).
7. **Vérifier qu'un push a bien déployé** après tout changement d'identité ou de compte :
   `cd buildpact-75mv && npm run check:prod` (compare le commit servi à `HEAD`).

---

## 3. Tableau de bord

| Phase | Risque | Effet | État |
|---|---|---|---|
| 0 — clé | `[CLÉ]` | supprime la fuite résiduelle | ✅ **fait** (5 copies restantes, voir ci-dessus) |
| 1 — dépôt parent | `[SÛR]` | `git status` redevient lisible | ✅ **fait** (`550f520`, status vide) |
| 4 — Vercel | `[SÛR]` | les push redéploient enfin | ✅ **fait et prouvé** |
| 5 — garde-fous | `[SÛR]` | ça ne revient pas | à faire (5 min) |
| 3 — rangement | `[ACCORD]` | −5,5 Go de copies mortes | en attente de décision |
| 2 — purges | `[ACCORD]` | −720 Mo sur les `.git` | en attente de décision |

**Reste à faire, dans l'ordre : 5 (garde-fous) → 3 (rangement) → 2 (purges).**
- La phase 3 sort `archive/`, `migration noah /` et `_backup-buildpact/` du dépôt — et c'est
  le moment de supprimer les cinq copies de la clé listées en Phase 0.
- La phase 2 réécrit l'historique : **force-push sur le dépôt applicatif uniquement** (le
  parent n'a pas de remote), et **Noah doit re-cloner**, sinon les 451 Mo reviennent chez lui.
