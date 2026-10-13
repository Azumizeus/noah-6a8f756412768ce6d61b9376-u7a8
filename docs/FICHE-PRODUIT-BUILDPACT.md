# BuildPact — Fiche produit complète

> Dernière mise à jour : 12/10/2026 · Sources : `README.md`, `RESUME_PROJET.md`, `DOSSIER_TECHNIQUE.md`, `docs/JUDGES-ENG.md`, `src/lib/constants.ts`
> Réseau : **Solana devnet** · Program ID `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` · Démo : https://buildpact-solana.vercel.app

---

## 1. Vision — en une phrase

**Rendre coûteux de revenir sur sa parole.**

BuildPact est une **cap table on-chain + escrow pour builders Solana** : un founder publie un projet avec ses rôles et leurs parts, des builders rejoignent avec une part négociée, tout le monde approuve, le deal se verrouille on-chain à 100%, des backers financent le vault, puis la distribution est automatique — **2% protocole, 98% membres au pro-rata, en une transaction**.

Ce n'est pas un remplaçant de GitHub/Discord : le code reste sur GitHub, la conversation sur Discord. BuildPact ajoute la couche manquante — **rôles, parts, approbations, escrow et distribution vérifiables on-chain**.

## 2. Pour qui, quel bénéfice

| Utilisateur | Ce qu'il obtient |
|---|---|
| **Founders** | Publie une idée et ses rôles, onboard des co-founders, verrouille le deal sans coordonner les paiements à la main. |
| **Builders / devs** | Rejoint avec une part vérifiable on-chain au lieu d'une promesse en DM Discord. |
| **Backers** | Finance un projet dont l'allocation est publique et immuable — ce qui est approuvé à la finalisation = ce qui est versé à la distribution. |

## 3. Parcours complet

```
create_project → add_member → approve → finalize → fund → distribute
```

1. **Create** — le founder décrit le projet et ses rôles on-chain.
2. **Join** — les membres postulent avec wallet, rôle, part négociée.
3. **Finalize** — quand tous ont approuvé et que le total = 100% (10 000 bps), le founder verrouille. Après ça, les parts ne bougent plus.
4. **Fund** — les backers financent le vault (PDA escrow).
5. **Distribute** — 2% fee protocole, 98% aux membres au pro-rata, en une transaction.

Les pacts finalisés et réels sont visibles sur la [Marketplace](https://buildpact-solana.vercel.app/#/marketplace).

## 4. Architecture on-chain (Anchor 0.31.1 / Rust)

| Élément | Valeur |
|---|---|
| Program ID | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` |
| Project PDA | seeds `["project", creator, project_id]` |
| Vault PDA | seeds `["vault", project]` |
| Parts | basis points, 8 membres max, total = 10 000 bps |
| Fee protocole | `PROTOCOL_FEE_BPS = 200` (2%) — constante compilée |
| Wallet protocole | `PROTOCOL_WALLET` — constante figée, vérifiée à `create_project` |
| Tolérance poussière | `DUST_TOLERANCE_LAMPORTS = 1000` |
| Réseau | Devnet (mainnet = post-hackathon) |

Points structurants :
- **Pas de config account mutable.** Fee et destinataire sont des constantes : personne ne peut monter la fee sur un pact déjà finalisé sans upgrader tout le programme.
- Seeds canoniques partout, signer checks, arithmétique vérifiée (`u128` + `checked_add` pour le total — 8×10000 = 80000 déborderait un `u16`).
- Bornes : `MAX_MEMBERS=8` (chaque membre = un CPI `transfer` dans `distribute`), titre 80 / description 500 / rôle 32 octets UTF-8, `MAX_PROJECT_ID_LEN=20` (seed PDA ≤ 32 octets).
- Vrai plafond = taille de transaction Solana (1232 octets, ~900 utiles sur `create_project`).

## 5. Où vivent les données

| Donnée | Où | Pourquoi |
|---|---|---|
| Membres, parts, approbations | **On-chain** | C'est le produit, doit survivre au serveur. |
| Vault, distribution | **On-chain** | Ça bouge des fonds. |
| Titre, description, rôles | **On-chain** | Partie de l'accord signé. |
| Logos, médias, profils, chat, candidatures, activité | Supabase | Cosmétique, volumineux ou non-contractuel ; cache de lecture, la chaîne reste source de vérité. |

## 6. Frontend & backend

| Couche | Tech |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind, `@solana/wallet-adapter` (desktop + Mobile Wallet Adapter) |
| Routing | Hash routing maison (`src/lib/router.ts`), déploiement statique sans rewrite serveur |
| i18n | FR / EN, switch in-app, FR par défaut |
| Thèmes | 5 palettes (`violet`, `cyan`, `aurum`, `atelier`, `nova`) × mode dark/light, variables RGB `--accent-*-rgb` |
| Backend | Supabase (Postgres + Realtime chat/updates + Edge Functions Deno) |
| Auth | Wallet `signMessage` ed25519, pas de comptes Supabase Auth |
| Déploiement | Vercel (statique) |
| RPC | Relais `supabase/functions/rpc` par défaut (clé dédiée côté serveur, jamais dans le bundle), repli devnet public, override power-user possible |

**Lecture directe, écriture jamais directe.** Le client Supabase n'a aucun droit d'écriture métier. Chaque écriture passe par une Edge Function qui prouve l'identité (signature ed25519, session 24h scopée projet pour le chat, ou transaction on-chain vérifiée pour le journal) puis écrit en `service_role`. Le champ auteur est toujours posé par le serveur depuis le wallet vérifié.

Messages signés (regex ancrées `^…$`, fenêtre 5 min + 60s de tolérance horloge) :
```
BuildPact — <action>
Wallet: <base58>
Projet: <base58>
Timestamp: <ms epoch>
```

Edge Functions : `chat-moderate`, `project-write`, `open-roles`, `update-profile`, `vault`, `contact` — toutes en `verify_jwt: false` (auth = signature Solana).

Pages : `#/` landing/dashboard, `#/marketplace`, `#/builders`, `#/pacts`, `#/pact/:pda` (fiche publique partageable), `#/profil` (grille libre `FreeGrid` persistée par wallet), `#/treasury` (vault, distribution, export CSV), `#/about`, `#/docs`.

## 7. Sécurité — 2 failles réelles trouvées et fixées sur devnet

1. **Protocol fee hijack** — `protocol_wallet` non verrouillé à la création : un appel direct pouvait rediriger les 2%. Fix : constante `PROTOCOL_WALLET` + `require! (InvalidProtocolWallet, 6021)` + test négatif.
2. **Vault drain on close** — `close_project` pouvait balayer un vault financé mais non distribué. Fix : refus si vault > `DUST_TOLERANCE_LAMPORTS` (`VaultNotEmpty, 6022`), en-dessous la poussière est rendue au créateur (neutralise aussi l'attaque dust anti-close).

Passe audit frontend (19–20/09/2026, 0 critique) : anti-double-spend sur `fund` (re-check signature avant retry), source unique `myClaimableSol` nette de fee partout, garde anti-injection CSV (`=HYPERLINK…`), bornes client sur création (parts ≥0, 8 membres max, anti double-création session).

Modèle menaces complet : `docs/SECURITY.md`. Limites V1 assumées : ajout de membre post-approbations sans ré-approbation forcée, `project_updates` = identité prouvée mais membership non vérifiée, bucket médias à durcir, pas de nonces replay Edge en V1.

## 8. Tests & qualité

- **On-chain : 24/24** — happy path complet (create → add → approve → finalize → fund → distribute, protocole = exactement 2%) + tous les rejets : mauvais protocol wallet, signers non-créateur, >100%, incomplet, non-approuvés, doublons wallet (`DuplicateMember`), 9e membre (`TooManyMembers`), modif post-finalize (`AlreadyFinalized`), tampering payout (`MemberMismatch`), close vault plein, dust-close avec refund, close post-distribution avec récup rent.
- **Frontend/tooling :** `npm test` = garde-fous (secret-scan, history-scan, bornes pages premium, etc.).

```bash
npm install
npm run dev          # serveur local
npm test             # suite garde-fous
npm run typecheck    # TypeScript, no emit
npm run build        # typecheck + build prod
```

## 9. Économie & limites produit

- Fee : **2% protocole / 98% membres**, constante, pas d'admin key.
- Cap : 8 membres, 10 000 bps, parts absolues fixées à l'ajout (changer une part = retirer le membre pré-approbation + le ré-ajouter).
- V1 = financement post-finalisation style Kickstarter (risque dev fantôme visible et accepté). V2 : milestones de paiement + réputation on-chain + remplacement de membre + ré-approbation forcée.
- Mainnet : hors scope volontaire — devnet jusqu'à validation complète, rotation de l'upgrade authority prévue post-hackathon (`contracts/target/wallet/wallet.json` = clé devnet versionnée, à brûler avant mainnet).

## 10. Documents pour aller plus loin

| Document | Contenu |
|---|---|
| `docs/JUDGES-ENG.md` / `JUDGES-FR.md` | Deep dive juges : flow, archi, sécu, questions anticipées |
| `docs/DEMO-SCRIPT.md` | Walkthrough démo guidée |
| `docs/SECURITY.md` | Threat model, invariants + codes erreur, fixes, limites |
| `docs/ROADMAP-ENG.md` / `ROADMAP-FR.md` | Build log + plan post-hackathon |
| `RESUME_PROJET.md` | Résumé complet FR |
| `DOSSIER_TECHNIQUE.md` | Décisions d'archi et trade-offs |
| `docs/` | Index doc complet |
