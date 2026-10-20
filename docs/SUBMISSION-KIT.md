# BuildPact — Kit soumission hackathon (réutilisable)

Date kit : 13/10/2026, mis à jour le **20/10/2026 (revue complète)** — dépôt canonique `u7a8`, zéro `.env`.

## 1. Liens à coller

- Repo : `https://github.com/Azumizeus/noah-6a8f756412768ce6d61b9376-u7a8`
  - **Public** (re-vérifié le 20/10), branche `main`, branché sur Vercel (projet `noah-6a8f…-u7a8`, déploiement auto).
  - Les anciens liens `…-kvqd`, `Azumizeus/BuildPact` et `Azumizeus/buildpact` renvoient un 404 hors connexion : ne pas les donner au jury.
  - Snapshot propre d'origine : `def8726` (arbre `e64f7ef`) ; pas de `.env`, historique `.env` vide.
  - About → Description : `On-chain cap table + escrow for Solana builders — create → add_member → approve → finalize → fund → distribute` (déjà en place, vérifié le 20/10).
  - Topics : `solana`, `anchor`, `devnet`, `escrow`, `web3`, `buildpact`, `solana-program`, `react`, `typescript`, `hackathon` (posés le 20/10).
  - Home page : `https://buildpact-solana.vercel.app` (déjà en place).
  - ⚠️ Pas de fichier `LICENSE` dans le dépôt avant le 20/10 — un `LICENSE` MIT a été ajouté (à committer).
- Demo live : `https://buildpact-solana.vercel.app/`
  - Sans wallet (argument jury) : `https://buildpact-solana.vercel.app/#/demo`
  - Pacts réels : `https://buildpact-solana.vercel.app/#/marketplace`
- Réseau : **Solana Devnet** (mainnet = post-hackathon)

## 2. Pitch copier-coller

**EN (280c) :**
`BuildPact — on-chain cap table + escrow for Solana builders: create_project -> add_member -> approve -> finalize -> fund -> distribute. 2% protocol / 98% members, Devnet.`

**FR :**
`Cap table + escrow on-chain Solana : create → add_member → approve → finalize → fund → distribute, 2% protocole / 98% membres, simulation sans wallet sur /#/demo.`

## 3. Bloc tech jury

- Program ID : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` (vérifié live sur devnet le 20/10 — authority `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6`, celle de `~/.config/solana/id.json`)
- Framework : Anchor 0.31.1 / Rust — source inchangée depuis le snapshot `def8726`, donc identique au binaire déployé
- Tests on-chain : **43/43** (LiteSVM, hors-ligne) — `tests/workspace.ts` 27 + `tests/load-and-migration.ts` 16 (happy path + rejets). *Le « 24/24 » des versions précédentes du kit était faux : recompte fait le 20/10.*
- Fee : `PROTOCOL_FEE_BPS = 200` constante, pas de config mutable
- PDA : `project = ["project", creator, project_id]`, `vault = ["vault", project]`
- Frontend : React 19 + Vite + TS, hash routing, Vercel static
- Backend : Supabase Edge `functions/v1/rpc` (secret serveur, pas de clé en `VITE_`)
- ⚠️ `x402` (`scripts/x402-*.mjs`) : service **local** de paiement agentique, non déployé et non câblé dans l'app. Ne pas l'annoncer au jury comme une fonctionnalité du produit ; c'est une brique préparatoire.

## 4. Checklist avant Envoi

- [x] Repo `u7a8` en Public (re-vérifié le 20/10)
- [x] README affiche Live demo + Program ID + flow (vérifié le 20/10 sur le README publié)
- [x] README affiche le lien du parcours **sans wallet** (`/#/demo`) — ajouté le 20/10
- [x] README explique la structure du dépôt (BuildPact vs tier NOAH `/v1/*`) — ajouté le 20/10
- [x] `LICENSE` MIT présent — ajouté le 20/10
- [x] Description + topics + home page GitHub posés (20/10)
- [x] Vercel prod en ligne, 12 routes répondent 200 (20/10)
- [x] `/#/demo` charge sans wallet, 8 étapes create → distribute (vérifié dans le navigateur le 20/10)
- [x] `npm run check:soumission` → **« Prêt à déposer »** : 3/3 sondes, 9 comptes du programme, 6 pacts décodables, pré-vol CORS accepté (20/10)
- [x] Audit secrets : `check:history:profond` = 537 blobs lus, rien trouvé ; `check:helius` = aucune clé dans l'historique (20/10)
- [x] Typecheck 0 erreur, lint 0 erreur (35 warnings), build + `build-guard` verts (20/10)
- [ ] **Redéployer Vercel** : la prod sert `8f5e17d`, `main` est à `4aa15f6` (2 commits d'écart, `scripts/` seul — les correctifs de sécurité sont bien en prod). Le badge CI « prod ↔ dépôt » reste jaune tant que ce n'est pas aligné.
- [ ] **Ajouter le secret `VERCEL_TOKEN`** dans Settings → Actions du repo : le job planifié « contrôle quotidien » échoue en boucle (depuis le 15/10) **faute de jeton**, pas à cause du code. Sans lui, le contrôle de provenance et le contrôle de parc restent inertes. `vars.PROD_URL` a été posé le 20/10.
- [ ] **Vidéo 2 min en non répertoriée** (voir `VIDEO-SCRIPT-2MIN.md`). Colosseum en exige **deux** : présentation 2-3 min **et** démo produit ≤ 3 min.
- [ ] Ne jamais remettre `VITE_RPC_ENDPOINT` / clé Helius en env Vercel

## 5. Réponses pièges

- Dev qui disparaît ? V1 Kickstarter-style post-finalization, risque visible. V2 milestones + réputation.
- Shares modifiables ? Non après finalize — garantie, pas limite.
- Fee augmentable ? Non — constante compile-time, pas d'admin.
- Sécu ? PDA canoniques, signer checks, arithmétique vérifiée, 2 failles réelles trouvées et fixées (fee hijack 6021, vault drain 6022).
- Le repo s'appelle `noah-…` : c'est le dépôt de la plateforme NOAH AI qui héberge BuildPact. Le README le dit en clair (« Repository layout ») ; le `src/pages/premium/` (routes `/v1/*`) n'est pas le produit jugé.
- Pourquoi devnet ? Mainnet planifié après l'événement ; tous les chiffres annoncés sont mesurés sur devnet.
- `anchor test` est **interdit** dans ce dépôt : `[provider] cluster = devnet` et l'authority est la clé live → un déploiement écraserait le programme en prod. La suite se lance à la main : `npx ts-mocha -p ./tsconfig.anchor.json -t 1000000 "tests/**/*.ts"` (LiteSVM, hors-ligne).

