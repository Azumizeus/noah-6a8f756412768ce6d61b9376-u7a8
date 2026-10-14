# BuildPact — Kit soumission hackathon (réutilisable)

Date kit : 13/10/2026 — commit `def8726` / arbre `e64f7ef` — 1 commit, zéro `.env`.

## 1. Liens à coller

- Repo : `https://github.com/Azumizeus/noah-6acd96d8d87497d0afff880c-kvqd`
  - Doit être **Public** : `Settings → General → Danger Zone → Change visibility → Public`
  - Vérifié : 1 commit `buildpact: snapshot propre e64f7ef`, pas de `.env`, historique `.env` vide.
  - About → Description : `On-chain cap table + escrow for Solana builders`
  - Topics : `solana`, `anchor`, `devnet`, `escrow`, `web3`
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

- Program ID : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`
- Framework : Anchor 0.31.1 / Rust
- Tests on-chain : 24/24 (happy path + rejets)
- Fee : `PROTOCOL_FEE_BPS = 200` constante, pas de config mutable
- PDA : `project = ["project", creator, project_id]`, `vault = ["vault", project]`
- Frontend : React 19 + Vite + TS, hash routing, Vercel static
- Backend : Supabase Edge `functions/v1/rpc` (secret serveur, pas de clé en `VITE_`)

## 4. Checklist avant Envoi

- [ ] Repo en Public (sinon 404 jury)
- [ ] README affiche Live demo + Program ID + flow
- [ ] Vercel Deploy `Ready` sur `def8726`
- [ ] `/demo` charge sans wallet (8 étapes create → distribute)
- [ ] Vidéo 2 min en non répertoriée (voir `VIDEO-SCRIPT-2MIN.md`)
- [ ] Ne jamais remettre `VITE_RPC_ENDPOINT` / clé Helius en env Vercel

## 5. Réponses pièges

- Dev qui disparaît ? V1 Kickstarter-style post-finalization, risque visible. V2 milestones + réputation.
- Shares modifiables ? Non après finalize — garantie, pas limite.
- Fee augmentable ? Non — constante compile-time, pas d'admin.
- Sécu ? PDA canoniques, signer checks, arithmétique vérifiée, 2 failles réelles trouvées et fixées (fee hijack 6021, vault drain 6022).
