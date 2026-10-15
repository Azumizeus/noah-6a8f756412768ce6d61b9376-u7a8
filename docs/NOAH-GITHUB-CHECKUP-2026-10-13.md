# Check-up galères Noah + GitHub — 13/10/2026

> **Mise à jour 15/10/2026 — ce qui suit est le journal du 13/10, conservé tel quel.**
> Dépôt canonique actuel : `Azumizeus/noah-6a8f756412768ce6d61b9376-u7a8` (public, branché sur Vercel, prod = `c0cadb2`).
> Les dépôts `kvqd`, `043v`, `BuildPact` et `buildpact` ne sont plus joignables publiquement.
> Le Program ID correct est `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` (voir l'erratum en bas).

## Où on en est (le principal)
- Repo à envoyer au hackathon : `Azumizeus/noah-6acd96d8d87497d0afff880c-kvqd`
  - État GitHub vérifié : `main = def8726`, arbre `e64f7ef`, 1 seul commit
    `buildpact: snapshot propre e64f7ef (purge historique leak Helius bc8ce800 révoquée)`.
  - Contenu : `contracts/`, `programs/workspace`, `supabase/`, `src/`, `docs/`,
    `README.md` complet, `.env.example` seul (pas de `.env` en worktree ni en historique).
  - Badge : Private (à passer en Public pour le jury).
- Repo source de secours : `Azumizeus/noah-6acd8a1cd87497d0afff8657-043v`
  - Même état : `main = def8726`, arbre `e64f7ef`.

## Ce qui a merdé (chronologie courte)
1. **Scaffold Noah avec `.env` à clé** : chaque nouveau projet/conversation Noah
   injecte un `.env` portant une URL Helius avec `api-key` (empreinte `e27f2e115ee5`,
   clé révoquée depuis). Inerte en local, mais présent dans `Initial Commit`.
2. **Maquette `/readme` au lieu du vrai code** : après envoi d'une capture GitHub +
   « gogogo », Noah a cru à une demande de maquette statique (`Readme.tsx`,
   retouches `index.css`/`App.tsx`). Non poussé, resté local. Résolu par consigne
   « stop, ne commit/push rien ».
3. **Workspace vidé** : demandes « supprimer .env », « supprime tout » → Noah a
   supprimé fichiers (`package.json`, configs, `bun.lock`), dossiers vidés,
   commits locaux `AI Update: Delete ...`. Non poussé (`Sync 1↓5↑` jamais cliqué).
   Résolu en ne poussant rien.
4. **Fusion `043v` impossible** : testé `git fetch <043v> 736a7f2b0` →
   `fatal: couldn't find remote ref`. Ancien historique envolé après force-push,
   aucun commit de fusion constructible. Abandonné (avec excuses).
5. **Proposition Noah « recopie fichier par fichier si repo public »** : refusée —
   lent, binaires/images perdus, historique perdu, risque de mock divergent.
6. **Nouveau repo `kvqd`** : créé via nouvelle conversation full-stack.
   Push forcé `849e8f4...def8726 HEAD -> main` réussi (`PUSH_EXIT:0`),
   vérifié par clone frais (`CLONE_EXIT:0`, `NO_ENV:OK`, historique `.env` vide).
   Ancien `Initial Commit 849e8f4` (scaffold + `.env` révoqué) désormais orphelin
   non-référencé, en attente GC GitHub.
7. **Sync Noah bloqué** : `pull-changes 409 Conflict` (historiques sans ancêtre
   commun après force-push : local `849e8f4` vs distant `def8726`) + `503 / CORS`
   sur `labs.trynoah.ai` (`github-info`, `sync-status`, `commits`, `vm/status`).
   Backend TryNoah down au moment des tests. Ne pas cliquer Sync en boucle.
8. **Nom affiché** : `Azumizeus` = username (normal, dans l'URL), `mickaeldunoyer` =
   auteur/`Name` du profil. Pour masquer : `github.com → Settings → Public profile
   → Name` à vider/pseudo. Commits déjà poussés gardent l'ancien auteur.

## À faire pour l'envoi hackathon
- [ ] `kvqd → Settings → Danger Zone → Change visibility → Public` (jury).
- [ ] `About → ⚙️` : description + topics `solana`, `anchor`, `devnet`.
- [ ] Lien à coller : `https://github.com/Azumizeus/noah-6acd96d8d87497d0afff880c-kvqd`
      + démo Vercel + mention Devnet + Program ID `9quyDwntXD8bhNtArFcF7xEXVFaXYMB83wPEuEqVOUj`.
- [ ] Quand TryNoah revient : nouvelle conversation vide → `Publish` → donner le
      nom ici **avant** de parler à Noah → push snapshot avant ses edits → Sync vert.

## Règles Noah qui marchent
- Ne jamais lui dire « clone le repo » (il rebricole du mock `/readme`).
- Ne jamais cliquer `Sync` quand ça affiche `↓↑` après un force-push (conflit assuré).
- Toujours : le laisser créer son repo → stop immédiat → envoyer le nom ici → push
  par Freebuff → ensuite seulement lui parler.
- Ne plus lui envoyer de captures GitHub comme consigne de code.

*Fichier généré le 13/10/2026. Aucune valeur secrète dedans (empreintes seules).*

## Erratum 15/10/2026
- Le Program ID était mal recopié dans la section « À faire pour l'envoi hackathon » (`…XD8bhNtArFcF7xEXVFaXYMB83wPEuEqVOUj`). Valeur correcte : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`, celle de `Anchor.toml` et du README.
