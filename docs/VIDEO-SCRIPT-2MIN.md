# Vidéo 2 min — page Démo sans wallet (téléphone, YouTube non répertoriée)

Ouvre `https://buildpact-solana.vercel.app/#/demo` en plein écran. Filme au téléphone posé, 1080p, son clair. Tout ce entre « » est à dire en anglais.

## 0:00-0:20 — Accroche
Montre landing → clique Démo.
« Solana devs build on GitHub, coordinate on Discord. Missing : trust and payment. That's BuildPact. No wallet needed for this tour. »

## 0:20-1:20 — Les 8 étapes sans wallet
Scrolle lentement les 8 étapes `create → fund → distribute`, signatures fictives visibles.
« Full flow, no wallet : create, add members, approve, finalize, fund, distribute. Every step simulated, same logic as on-chain. »
Insiste : « Le parcours complet, sans wallet » à l'écran.

## 1:20-1:45 — Preuve on-chain
Ouvre nouvel onglet `/#/marketplace` → clique Voir historique → Solscan finalize.
« These pacts are real Devnet accounts. Here's the finalize transaction. »

## 1:45-2:00 — Clôture
Retour logo + URL à l'écran.
« BuildPact — the builders' pact. Trust, written in code. Try it live at buildpact-solana.vercel.app. Program 9quyD...VoUJ on Devnet. »

Checklist publish :
- Titre YT : `BuildPact — trustless cap table on Solana (2 min demo, no wallet)`
- Visibilité : Non répertoriée → colle le lien dans le formulaire hackathon
- Description YT : repo + demo + Program ID (voir SUBMISSION-KIT.md)

---

# Ce que Colosseum demande EXACTEMENT (2 vidéos, pas 1)

Le formulaire de soumission Colosseum demande **deux** vidéos distinctes.
Ce script couvre la **vidéo de démo produit** (≤ 3 min). Il faut en plus une
**vidéo de présentation** (2-3 min) qui raconte le produit, pas l'interface.

| Champ du formulaire | Ce qu'il faut | Durée | Support |
|---|---|---|---|
| *A two-to-three-minute presentation video* | le **pourquoi** : le problème, la solution, la traction, le marché | 2-3 min | voix off + captures, ou voix face caméra |
| *A product-demo video of no more than three minutes* | le **comment** : le produit qui tourne | ≤ 3 min | ce script ci-dessus (écran filmé) |

## Structure de la vidéo de présentation (2-3 min), à enregistrer en plus

| Temps | À dire (EN) | À montrer |
|---|---|---|
| 0:00-0:30 | « Three people agree to build a project on a weekend. A week later, one of them has a different share in mind. The deal was never written down. BuildPact writes it down. » | une capture de `#/marketplace` |
| 0:30-1:15 | « A founder creates a project, publishes the roles and what each share is worth. Builders apply with their wallet. When every member has approved and the shares reach 100%, the founder finalizes. After that, the allocation is immutable. » | le parcours `/demo`, étapes 1 à 4 |
| 1:15-1:50 | « Backers fund a vault controlled by the program. When it's time to pay out, one transaction splits the money: 2% to the protocol, 98% to the members, pro-rata by share. Two real vulnerabilities were found in our own audit and fixed live on devnet. » | `#/treasury` ou le code du programme |
| 1:50-2:20 | « This is devnet, and the program is live and verified: program ID on screen. The full repo is public, with the program source, the IDL and the test suite. We're looking for a designer and a growth partner. » | Program ID + lien du repo à l'écran |
| 2:20-2:40 | « Try it without a wallet, right now, at the link on screen. » | URL à l'écran, 5 secondes fixes |

Checklist publish (les deux vidéos) :
- [ ] Vidéo **de présentation** 2-3 min —UTE
- [ ] Vidéo **de démo** ≤ 3 min — ce script
- [ ] Les deux en **non répertorié** (unlisted) : YouTube refuse sometimes l'indexation, c'est voulu
- [ ] Titre, description et liens (repo + démo + Program ID) identiques sur les deux
- [ ] Description YT = repo + demo + Program ID (voir SUBMISSION-KIT.md)
- [ ] Son audible, 1080p, pas de musique qui couvre la voix

