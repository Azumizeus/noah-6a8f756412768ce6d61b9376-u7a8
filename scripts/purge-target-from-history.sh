#!/usr/bin/env bash
# scripts/purge-target-from-history.sh
# ═══════════════════════════════════════════════════════════════════
# Allège durablement le dépôt : retire les artefacts de build Rust/Anchor
# (`**/target/**`) de TOUT l'historique Git.
#
# Constat mesuré le 07/10/2026 sur ce dépôt :
#   .git sur disque ......... 477 Mo
#   objets `target/` ......... 451 Mo compressés (6571 objets)
#   tout le reste ............ 1,8 Mo
#   → 94 % du poids du dépôt est du `cargo build` recopié dans l'historique.
#   → chaque clone, chaque CI, chaque sauvegarde traîne ces 451 Mo.
#
# Ce script est DESTRUCTIF : tous les SHA changent. Il crée une sauvegarde
# (bundle) et REFUSE de tourner sur un arbre de travail sale.
#
# Il NE pousse PAS : le force-push se décide à part, avec l'accord de
# l'équipe (voir les étapes affichées en fin de script).
#
# ⚠ PRÉREQUIS : la sauvegarde contient encore l'ancienne clé privée
# `contracts/target/wallet/wallet.json` si elle n'a pas déjà été purgée.
# Traite-la comme compromise et ne la laisse pas traîner sur disque.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "✗ git-filter-repo introuvable (brew install git-filter-repo) — arrêt." >&2
  exit 1
fi

# On ne regarde que les fichiers SUIVIS : les artefacts présents sur disque
# mais ignorés (programs/workspace/target/ est dans .gitignore) ne font pas
# partie de l'historique et n'ont pas besoin d'être réécrits.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ Fichiers suivis modifiés : commite ou stash d'abord." >&2
  echo "  git-filter-repo refuse de réécrire un dépôt avec des modifs non committées." >&2
  exit 1
fi

# ── 1. Découvrir les répertoires target/ présents dans l'historique ────
# On veut TOUS les `.../target/` SAUF le `target/` de la RACINE, dont
# `target/idl/workspace.json` et `target/types/workspace.ts` sont
# volontairement versionnés (l'IDL documente le contrat et sert aux tests).
TARGET_DIRS=""
for d in $(git log --all --pretty=format: --name-only \
            | grep -E '(^|/)target/' \
            | grep -vE '^target/(idl|types)/' \
            | sed -E 's#(^.*/target/).*#\1#' \
            | sort -u); do
  TARGET_DIRS="$TARGET_DIRS $d"
done

if [ -z "$TARGET_DIRS" ]; then
  echo "✓ Aucun répertoire target/ dans l'historique — rien à faire."
  exit 0
fi

echo "→ Répertoires target/ trouvés dans l'historique :"
for d in $TARGET_DIRS; do echo "    $d"; done

# ── 2. Sauvegarde complète avant toute réécriture ─────────────────────
BACKUP="../$(basename "$REPO_ROOT")-backup-$(date +%Y%m%d-%H%M%S).bundle"
echo "→ Sauvegarde complète du dépôt dans : $BACKUP"
git bundle create "$BACKUP" --all
echo "  (pense à la supprimer / la déplacer une fois la nouvelle histoire validée)"
echo "  (elle peut contenir des secrets : c'est une copie intégrale de l'ancien dépôt)"

# ── 3. Réécriture ─────────────────────────────────────────────────────
# filter-repo nettoie aussi le reflog et relance un `gc --prune=now` en fin
# de course : .git doit revenir autour de 25 Mo.
ARGS=""
for d in $TARGET_DIRS; do ARGS="$ARGS --path $d"; done

echo "→ Réécriture de l'historique ($(git rev-list --count --all) commits)…"
# shellcheck disable=SC2086
git filter-repo --force $ARGS --invert-paths

# ── 4. Vérifications ──────────────────────────────────────────────────
echo "→ Vérification : aucun *target/* ne doit rester hors target/idl et target/types."
RESTE=$(git log --all --pretty=format: --name-only | grep -E '(^|/)target/' | grep -vE '^target/(idl|types)/' | sort -u | head -5 || true)
if [ -n "$RESTE" ]; then
  echo "✗ Il reste des artefacts target/ dans l'historique :" >&2
  echo "$RESTE" >&2
  echo "  Restaure depuis $BACKUP." >&2
  exit 1
fi

for KEEP in target/idl/workspace.json target/types/workspace.ts; do
  if [ -e "$KEEP" ]; then
    echo "✓ Conservé : $KEEP"
  else
    echo "⚠ Absent du disque : $KEEP (vérifie qu'il était bien versionné)"
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "⚠ Des fichiers apparaissent modifiés : les artefacts sur disque ne"
  echo "  correspondent plus à l'index. Ils sont ignorés par .gitignore, donc"
  echo "  c'est attendu — vérifie simplement avec « git status »."
fi

echo "✓ Historique local allégé."
echo "  Taille .git : $(du -sh .git | cut -f1)"

cat <<EOF

────────────────────────────────────────────────────────────────────
Étapes suivantes — MANUELLES, après accord de l'équipe :

  1. git-filter-repo a retiré le remote. Le remettre :
       git remote add origin <url-du-depot>
  2. Réécrire la branche distante (accord explicite requis) :
       git push --force-with-lease origin main
       git push --force-with-lease origin feat/ui-premium-2026
  3. Prévenir les autres clones (ex. Noah) : RE-CLONER, ne pas tirer ni
     merger, sinon les 451 Mo reviennent dans leur copie.
  4. Restaurer l'état initial si besoin :
       git bundle unbundle "$BACKUP"

  Pour empêcher que ça revienne : les règles sont déjà dans .gitignore
  (target/debug, target/release, target/sbpf-solana-solana,
  programs/**/target/, target/deploy/). Vérifie avec :
       node scripts/git-fat-report.mjs
────────────────────────────────────────────────────────────────────
EOF
