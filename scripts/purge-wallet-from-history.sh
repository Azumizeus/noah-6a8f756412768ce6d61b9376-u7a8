#!/usr/bin/env bash
# scripts/purge-wallet-from-history.sh
# ═══════════════════════════════════════════════════════════════════
# Retire `contracts/target/wallet/wallet.json` (ancienne clé privée publiée)
# de TOUT l'historique Git.
#
# Ce script est DESTRUCTIF sur l'historique local : tous les commits voient
# leur SHA changer. Il crée d'abord une sauvegarde complète (bundle) et
# REFUSE de tourner sur un arbre de travail sale.
#
# Il NE pousse PAS : le force-push vers le remote partagé se décide à part,
# avec l'accord de toute l'équipe (voir les étapes finales affichées).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

PATH_TO_PURGE="contracts/target/wallet/wallet.json"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "✗ git-filter-repo introuvable (brew install git-filter-repo) — arrêt." >&2
  exit 1
fi

# On ne regarde que les fichiers SUIVIS : des fichiers non suivis (artefacts
# locaux) ne font pas partie de l'historique et ne gênent pas la réécriture.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ Fichiers suivis modifiés : commite ou stash tes changements d'abord." >&2
  echo "  git-filter-repo refuse de réécrire un dépôt avec des modifs non committées." >&2
  exit 1
fi

BACKUP="../$(basename "$REPO_ROOT")-backup-$(date +%Y%m%d-%H%M%S).bundle"
echo "→ Sauvegarde complète du dépôt dans : $BACKUP"
git bundle create "$BACKUP" --all

echo "→ Estimation du temps restant : $(git rev-list --count --all) commits à réécrire."
echo "→ Réécriture de l'historique (retrait de $PATH_TO_PURGE)…"
git filter-repo --force --path "$PATH_TO_PURGE" --invert-paths

echo "→ Vérification : le fichier doit être absent de tout l'historique."
if git log --all --oneline -- "$PATH_TO_PURGE" | grep -q .; then
  echo "✗ $PATH_TO_PURGE est encore présent dans l'historique — restaure depuis $BACKUP." >&2
  exit 1
fi
echo "✓ $PATH_TO_PURGE a disparu de tout l'historique."

cat <<EOF

────────────────────────────────────────────────────────────────────
Étapes suivantes — MANUELLES, après accord de l'équipe :

  1. git-filter-repo a retiré le remote. Le remettre :
       git remote add origin <url-du-depot>
  2. Réécrire la branche distante (accord explicite requis) :
       git push --force-with-lease origin main
  3. Prévenir les autres clones (ex. Noah) : RE-CLONER, ne pas tirer/merger,
     sinon l'ancienne clé revient dans leur copie.
  4. Restaurer l'état initial si besoin :
       git bundle unbundle "$BACKUP"

⚠️ La clé était PUBLIÉE : elle doit être considérée comme COMPROMISE.
   Ne jamais la réutiliser — régénérer une autorité neuve si elle détenait
   des droits (ici ce n'était pas l'upgrade authority du programme).
────────────────────────────────────────────────────────────────────
EOF
