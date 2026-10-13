# Plan d'allègement durable du dépôt Git — BuildPact

**Date :** 07/10/2026
**Dépôt :** `Azumizeus/noah-6a8f756412768ce6d61b9376-75mv`
**Mesures :** `node buildpact-75mv/scripts/git-fat-report.mjs` (relancer pour rafraîchir)

---

## 1. Résumé exécutable

| | |
|---|---|
| Taille actuelle de `.git` | **478 Mo** |
| Poids des artefacts de build `**/target/**` | **451,2 Mo — 99,3 % du dépôt** |
| Tout le reste (code, images, IDL) | 3,1 Mo |
| Taille estimée après purge | **~3 Mo (−99 %)** |
| Nombre d'objets à retirer | 6 573 |

**Une seule catégorie explique tout :** les artefacts `cargo build` du programme
Anchor, recopiés dans l'historique. Il n'y a pas 50 problèmes à traiter, il y en a un.

---

## 2. Ce qui a été mesuré, et comment

`.git` fait 478 Mo mais 475 Mo sont des **objets *loose*** (non empaquetés) —
`git count-objects -vH` donne `size: 475.42 MiB` contre `size-pack: 1.86 MiB`.
C'est la signature d'une réécriture d'historique récente (le `git filter-repo`
du retrait de la clé privée a réécrit la base d'objets sans tout empaqueter).

Cette particularité est une chance : un objet *loose* se mesure directement sur
disque (`stat` sur `.git/objects/xx/yyyy…`), sans avoir à démêler les deltas d'un
pack. Le script de rapport fait exactement ça, objet par objet, puis agrège par
catégorie de chemin.

Répartition mesurée :

| Catégorie | Poids | Part | Objets |
|---|---|---|---|
| `**/target/**` (artefacts de build) | 451,2 Mo | **99,3 %** | 6 573 |
| code et données | 2,5 Mo | 0,6 % | 1 629 |
| binaires (favicon, badges) | 570 Ko | 0,1 % | 2 |
| `target/idl` + `target/types` (volontaires) | 3 Ko | 0,0 % | 1 |

Détail des répertoires concernés :

* `programs/workspace/target/` → 6 564 objets
* `contracts/target/` → 7 objets (déjà purgé de la clé privée, mais les
  artefacts de build restent)

**Tous ces objets sont atteignables depuis `HEAD`** (6 571 sur 6 571). Ils ne
sont donc pas de vieux déchets oubliés : ils sont dans la lignée des commits
actuels et partent à chaque `clone`, `fetch` et sauvegarde.

Les 10 plus gros objets pèsent à eux seuls ~45 Mo et sont tous des `lib*.rlib`
(mono-deps, `solana-zk-sdk`, `mpl_token_metadata`, `zerocopy`, graphes
d'incrémental) — c'est-à-dire du `cargo build` brut.

---

## 3. Pourquoi c'est là

1. `programs/workspace/target/` a été committé à un moment où il n'était pas
   encore dans `.gitignore`.
2. Il a ensuite été **ignoré** (la règle existe bien aujourd'hui) mais **jamais
   retiré de l'index**, et surtout jamais purgé de l'historique : l'ignorer
   empêche les nouveaux ajouts, pas de nettoyer le passé.
3. `.gitignore` protège donc l'avenir, pas le présent. C'est le point clé.

---

## 4. Le plan — 3 phases

### Phase A — Prévention (déjà en place, à vérifier)

`.gitignore` couvre à ce jour :

```
target/debug
target/release
target/sbpf-solana-solana
target/.rustc_info.json
target/deploy/            ← critique : contient workspace-keypair.json
programs/**/target/
programs/workspace/target/
**/*-keypair.json
wallet.json
```

La règle `programs/**/target/` doit rester : c'est elle qui empêche la
reconstitution du problème. À vérifier périodiquement :

```bash
git ls-files | grep -E '(^|/)target/'   # ne doit sortir que target/idl/… et target/types/…
```

Aujourd'hui la sortie est conforme : uniquement `target/idl/workspace.json` et
`target/types/workspace.ts`, tous deux **volontairement versionnés** (l'IDL
documente le contrat et sert aux tests). La purge ne doit pas les toucher.

### Phase B — Purge de l'historique (à décider, nécessite un accord)

Script prêt : `buildpact-75mv/scripts/purge-target-from-history.sh`

Ce qu'il fait, dans l'ordre :

1. **Refuse de tourner** si des fichiers suivis sont modifiés (garde-fou
   `git status --porcelain --untracked-files=no`).
2. **Découvre automatiquement** les répertoires `.../target/` présents dans
   l'historique, en **excluant explicitement** `target/idl/` et `target/types/`
   de la racine. Aucun risque de couper l'IDL.
3. **Crée une sauvegarde complète** (`git bundle create …bundle --all`) avant
   toute réécriture.
4. **Réécrit** via `git filter-repo --path <dir> --invert-paths` (pas de glob
   ambigu : les chemins sont passés explicitement).
5. **Vérifie** qu'aucun `*target/*` ne subsiste hors IDL/types et que les deux
   fichiers volontaires sont toujours là.
6. Affiche `du -sh .git` après coup et les étapes manuelles restantes.

Il ne pousse pas. Le force-push est une décision séparée.

```bash
cd buildpact-75mv
bash scripts/purge-target-from-history.sh
# → puis, après accord explicite :
git remote add origin <url>
git push --force-with-lease origin main
git push --force-with-lease origin feat/ui-premium-2026
```

> **Pourquoi `--force-with-lease` et pas `--force`** : la *lease* vérifie que la
> référence distante est toujours celle qu'on croit. Si Noah a poussé entre
> temps, le push est refusé au lieu d'écraser son travail.

### Phase C — Surveillance

`scripts/git-fat-report.mjs` répond en une commande à « le dépôt regrossit-il ? ».
À lancer après tout gros merge de branche, ou en amont d'un onboarding :

```bash
node scripts/git-fat-report.mjs
```

Sortie attendue après purge : la ligne `artefacts de build **/target/ (à purger)`
doit disparaître et `.git` doit afficher ~3 Mo.

---

## 5. Précautions — à lire avant d'exécuter

| Risque | Traitement |
|---|---|
| Tous les SHA changent | Étape normale d'une réécriture. La sauvegarde `.bundle` permet de revenir en arrière (`git bundle unbundle`). |
| Les autres clones divergent | **Noah doit re-cloner**, ne pas tirer ni merger — sinon les 451 Mo reviennent dans sa copie, et un merge peut ressusciter l'ancienne clé privée dans l'historique. |
| La sauvegarde `.bundle` contient des secrets | Le bundle de la purge précédente (`buildpact-75mv-backup-20261007-151646.bundle`, ~395 Mo) **contient encore `wallet.json`** : la clé privée `7M2CKUR…`. À sécuriser ou supprimer une fois l'histoire validée. Ne jamais le committer ni le déposer sur un cloud partagé. |
| Les artefacts locaux apparaissent « supprimés » | Attendu : `filter-repo` retire aussi le fichier du disque. Comme `programs/workspace/target/` est ignoré, `git status` ne les montrera pas. Les relancer avec `cargo build`/`anchor build` si besoin. |
| Perte de la clé de programme | **Aucun risque ici** : `target/deploy/workspace-keypair.json` n'est pas dans l'historique (il était déjà ignoré et non suivi). L'upgrade authority `8eui3v5x…` est hors dépôt, dans `~/.config/solana/id.json`. |

---

## 6. Ce qu'il ne faut PAS faire

* **Ne pas** utiliser `git filter-branch` : lent, fragile, et il laisse des refs
  de sauvegarde qui gardent les objets vivants (`refs/original/`).
* **Ne pas** se contenter d'un `git gc` : il recompresse les objets mais les
  **garde**, puisqu'ils sont atteignables. `.git` resterait autour de 400 Mo.
  Le gain de `gc` serait cosmétique.
* **Ne pas** utiliser `--path-glob '*/target/*'` sans vérification : un glob
  trop large peut, selon l'implémentation, capturer aussi `target/idl/`. Le
  script passe des chemins explicites pour cette raison — et vérifie à la fin.
* **Ne pas** retirer `target/idl/workspace.json` ni `target/types/workspace.ts` :
  ils sont versionnés volontairement et référencés par le code
  (`src/lib/onchainLimits.ts` documente la synchro vers `src/idl/buildpact.json`).

---

## 7. Bénéfices attendus

* Clone initial : ~478 Mo → ~3 Mo (−99 %). Idem pour chaque `CI checkout` en
  `fetch-depth: 0` (ce que fait `ci.yml`).
* Temps de `git clone`, `git fetch`, sauvegardes et miroirs réduits d'un ordre
  de grandeur.
* Un dépôt qui redevient inspectable : `git log --stat` et la recherche d'objets
  cessent de parcourir du binaire de compilation.

---

## 8. État des lieux au 07/10/2026

* Analyse : **faite** (chiffres ci-dessus, reproductibles via le script).
* Scripts livrés : `buildpact-75mv/scripts/git-fat-report.mjs`,
  `buildpact-75mv/scripts/purge-target-from-history.sh`.
* Purge : **non exécutée** — elle implique un second force-push et une
  coordination avec Noah. À déclencher sur décision explicite.
* Prévention : `.gitignore` déjà correct, vérifié.
