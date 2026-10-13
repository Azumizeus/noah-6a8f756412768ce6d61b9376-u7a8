# BuildPact — Plan de gamification

> Écrit le 29 août 2026. Statut : **proposition, rien d'implémenté**.
> Demande d'origine : un système complet XP / rangs / quêtes, cohérent avec
> le projet, fun, addictif, surprenant, fonctionnel — la personne est
> ouverte à modifier le programme Anchor si nécessaire.

> ⚠️ **Note de synchronisation (récupéré depuis by7b, session miroir).**
> Ce document est le plan d'origine, conservé tel quel comme référence
> d'intention. Il ne décrit **pas** l'état actuel du code : la V1 est en
> grande partie implémentée depuis (table `quest_claims`, Edge Function
> `quest-write`, `src/lib/gamification.ts` en V2, `QuestBoard`, `RankBadge`,
> `RankIcons`, `ClaimBurst`). Voir `MIRROR_SYNC_STATE.md` pour l'état réel,
> et le §6 ci-dessous pour les étapes qui restent effectivement ouvertes.

---

## 1. Tendances observées (recherche web, 29/08/2026)

### Gamification "grand public"

- **Duolingo** — le cas d'école. Streaks quotidiens + monnaie ("Gems") +
  ligues sociales (la "Obsidian League"). Résultat mesuré : +71% d'usage
  mensuel. Le levier clé n'est pas le streak seul, c'est la **peur sociale
  de perdre son rang** — à la 95e percentile d'engagement, les usagers
  avec composante sociale tiennent des streaks de 12 jours contre 7 pour
  les autres.
- **Habitica** — transforme une to-do list en JDR (quêtes, XP, "mort" d'un
  personnage si la liste est négligée). Pertinent ici : montre qu'on peut
  gamifier un outil *fonctionnel* sans que ce soit gadget.
- **Strava** (connaissance générale, hors recherche) — kudos, segments,
  classements par segment de course. Le mécanisme qui marche : classement
  **local et contextuel** (ton segment, ton quartier), pas un classement
  global écrasant où 99% des gens sont invisibles.
- **Nike Run Club** — badges "socialement visibles" et défis entre amis.
- Marché 2026 : la gamification pèse ~36,5 Md$ US, et les mécaniques qui
  dominent sont streaks + classements sociaux + jalons personnalisés (pas
  des paliers arbitraires identiques pour tout le monde).

### Web3 / crypto — le plus pertinent pour BuildPact

- **Galxe** — système de "credentials" on-chain : badges/identité
  persistante montrant ce que tu as accompli (NFT détenus, quêtes
  complétées). 21M+ d'adresses, 4900 partenaires. Le point clé : les
  credentials sont **montrables ailleurs** (wallet, profil) — pas
  enfermées dans l'app.
- **Zealy** — quêtes gamifiées classiques (follow, share, participate),
  ~700k utilisateurs actifs/mois. Le format "quest board" hebdomadaire
  avec quêtes qui tournent est directement réutilisable ici.
- **Layer3** — quêtes éducatives pas à pas ("connecte un wallet", "fais un
  swap") pour onboarder des débutants. Pertinent vu que le projet cible
  aussi des devs web3 débutants.
- **Jupiter (Jupuary), Kamino, Sanctum** — programmes de points par
  "saisons". Le signal le plus important trouvé dans la recherche :
  *"la plupart des airdrops ne récompensent plus les sursauts d'un jour,
  ils favorisent l'usage répété."* C'est exactement le principe anti-farm
  à intégrer ici (voir §3, "garde-fous").
- Sur X/Twitter spécifiquement : pas de mécanique de gamification native
  documentée pour la plateforme elle-même en 2026 — la pertinence de
  "tendances Twitter" ici est plutôt *le contenu qui performe* (flex de
  badges/NFT, classements, streaks affichés en capture d'écran), pas une
  fonctionnalité X à copier.

### Ce que BuildPact peut voler à chacun

| Source | Ce qu'on prend |
|---|---|
| Duolingo | Streak + classement social contextuel, pas de classement global écrasant |
| Habitica | Gamifier l'outil fonctionnel lui-même, pas une couche à côté |
| Strava | Classements par contexte (par pact, pas juste global) |
| Galxe | Badges montrables/flexables en dehors de l'app |
| Zealy | Quest board hebdomadaire à quêtes tournantes |
| Jupiter/Kamino | Récompenser l'usage répété dans le temps, pas le sursaut |

---

## 2. Ce qui existe déjà et qu'on peut réutiliser (important)

Le protocole a **déjà** toute la matière première nécessaire, sans toucher
au programme Anchor :

- `pact_events` (Supabase) journalise déjà `approve`, `fund`, `finalize`,
  `distribute`, `add_member` — et **chaque ligne référence une tx déjà
  confirmée on-chain** (`tx_sig`), vérifiée côté serveur dans
  `project-write` avant écriture (voir `src/lib/activity.ts`). C'est
  exactement la même garantie anti-triche qu'un système XP a besoin :
  impossible de gagner de l'XP sans une vraie transaction validée.
- Le programme émet déjà 9 events (`ProjectCreated`, `MemberApproved`,
  `ProjectFinalized`, `ProjectFunded`, `FundsDistributed`, etc.) —
  largement suffisant comme déclencheurs.
- `MonProfilPage.tsx` / `src/lib/profile.ts` / `profileRemote.ts` — un
  système de profil existe déjà, c'est la page naturelle pour afficher
  rang/XP/badges.
- `BuildersPage.tsx` / `BuilderDetailModal.tsx` — annuaire des builders,
  endroit naturel pour afficher le rang de chacun (ça sert aussi la vraie
  proposition de valeur du protocole : juger la crédibilité d'un builder).

**Conclusion : la V1 complète peut se construire sans modifier
`programs/workspace/src/lib.rs` ni redéployer le programme.** Voir §5 pour
l'option on-chain, en phase 2 seulement.

---

## 3. Design proposé

### Sources d'XP (V1, zéro nouvelle instruction on-chain)

| Action | Déclencheur (déjà existant) | XP | Garde-fou anti-abus |
|---|---|---|---|
| Créer son 1er pact | `ProjectCreated` (1er de ce wallet) | 150 | unique |
| Créer un pact (suivants) | `ProjectCreated` | 40 | — |
| Approuver / être approuvé | `MemberApproved` | 25 | compte une seule fois par paire de wallets |
| Finaliser un pact | `ProjectFinalized` | 200 | jalon majeur |
| Financer un pact (backer) | `ProjectFunded` | 30 + bonus `min(100, 20·ln(1+SOL))` | échelle log : un whale ne domine pas linéairement, un petit backer n'est jamais à zéro |
| Être financé (créateur/membre) | `ProjectFunded` (autre wallet) | 15 | partagé, volontairement petit |
| Distribuer les fonds | `FundsDistributed` | 50 | — |
| Ajouter / être ajouté comme membre | `MemberAdded` | 10 | — |
| Profil de pact complet (logo+bannière+description) | détecté via `project_media` | 20 | une fois par pact |
| Streak hebdo : ≥1 action on-chain réelle cette semaine | calculé | 25 | basé sur une vraie tx, pas une simple visite d'app |
| Bonus diversité : collaborer avec un wallet jamais croisé avant | calculé sur les paires acteur/projet | 15 | anti-Sybil — empêche deux wallets de se renvoyer la balle en boucle pour farmer |

### Rangs (échelle unique, thème "builder on-chain")

1. **Anon** (0 XP)
2. **Contributor** (100 XP)
3. **Builder** (400 XP)
4. **Shipwright** (1000 XP) — typiquement débloqué après une 1ère finalisation
5. **Architect** (2500 XP)
6. **Protocol Veteran** (6000 XP)
7. **Legendary Pact-Maker** (15 000 XP) — rare, le rang "flex"

### Badges (achievements à la Steam/Xbox — indépendants du rang, ce sont les plus "fun/surprenants")

- 🤝 **Trusted Approver** — approuvé 10+ membres différents
- 🐋 **Whale Backer** — financé 5+ SOL en une seule tx
- 🌱 **Serial Founder** — créé 3+ pacts
- ⚡ **Speed Finalizer** — finalisé un pact dans les 24h après création
- 🔁 **Loyal Backer** — financé le même pact 3+ fois
- 🌙 **Night Owl** — 5+ actions entre minuit et 5h (pur flavor, zéro
  fonction — exactement le genre de détail "surprenant" qui fait
  screenshot sur X)
- 🎯 **First Mover** — un des 50 premiers wallets à créer un pact — cohorte
  genesis, fenêtre limitée dans le temps, devient rare une fois close
  (effet FOMO)
- 🃏 **Degen Energy** — titre de pact en majuscules ou avec emoji — clin
  d'œil pur, zéro enjeu de triche possible

### Quêtes (boucle de rétention)

- **Quotidienne, douce** : première action on-chain réelle du jour → +10
  XP bonus. Pas de perte de streak punitive (public non captif, ton fun
  pas anxiogène).
- **Board hebdomadaire, 3 quêtes tournantes** façon Zealy, ex. : "financer
  2 pacts différents", "approuver 1 nouveau membre", "finaliser un pact".
  Compléter les 3 dans la semaine → bonus XP + flair "Weekly MVP".
- **Achievements ponctuels** : les badges ci-dessus font déjà office de
  quêtes one-shot.

### Où ça s'affiche

- `MonProfilPage.tsx` — rang + jauge XP (réutiliser l'esthétique "jauge
  liquide" de `VaultShareGauge.tsx` pour rester cohérent visuellement) +
  étagère de badges + board de quêtes hebdo.
- `BuildersPage.tsx` / `BuilderDetailModal.tsx` — badge de rang à côté de
  chaque builder.
- `PactCard.tsx` — petite icône de rang à côté de chaque membre dans la
  liste (façon rôle Discord, coût d'implémentation faible, visibilité
  forte).
- Nouvelle page **Leaderboard** — classement par XP, filtrable
  all-time/hebdo. Inspiré Strava : prévoir un classement *par pact*
  (contextuel) en plus du classement global, pour éviter l'effet "99% des
  gens invisibles" qui tue l'engagement dans un classement purement
  global.

---

## 4. Architecture V1 (recommandée) — sans toucher au programme

- Nouvelle table Supabase `xp_events` (ledger append-only : wallet,
  source, montant, `created_at`), écrite **côté serveur, dans
  `project-write`**, juste après la vérification+écriture d'un
  `pact_event` existant — même frontière de confiance, aucune nouvelle
  surface d'attaque : impossible de miner de l'XP sans une vraie tx déjà
  validée par le serveur.
- Vue SQL `wallet_xp` agrégeant `xp_events` par wallet — toujours
  cohérente, pas de cache à invalider.
- Badges et quêtes : calculés à la volée par requête sur les données
  existantes pour la V1 (pas de table dédiée) — plus simple, et les
  règles de badges peuvent changer sans migration.
- Composants neufs : `RankBadge`, `XpBar` (déjà quasi prêt via
  `VaultShareGauge`), `BadgeShelf`, `WeeklyQuestBoard`, page
  `LeaderboardPage`.

---

## 5. Option Phase 2 — badges on-chain (nécessite ton GO explicite)

La demande d'origine était ouverte à modifier le programme. Deux façons de
le faire, avec un écart de risque important :

**A. Ajouter un compte "Reputation" au programme BuildPact lui-même**
(nouvelle PDA `["reputation", wallet]`, nouvelle instruction
`record_milestone`). Risque : touche le programme actuellement stable et
vérifié on-chain (voir mémoire `buildpact_program_live_verified`),
nécessite un nouvel upgrade, un nouvel audit informel des chemins
ajoutés, et une politique claire de qui peut appeler l'instruction (le
serveur avec une clé dédiée ? risque de centralisation à documenter).

**B. NFT compressé (Metaplex Bubblegum) minté côté serveur quand un
badge est débloqué.** Le badge devient un vrai objet on-chain, visible
dans Phantom/Backpack, capturable en screenshot, transférable — l'effet
"flex on X" recherché, en mieux : c'est littéralement l'asset qu'on montre.
Zéro modification du programme BuildPact — Bubblegum est un programme
Metaplex séparé, déjà audité et utilisé par tout l'écosystème Solana.

**Recommandation : l'option B.** Même effet waouh que "modifier le
programme", sans toucher à un programme qui vient d'être vérifié stable
(28-29/08) et dont chaque changement demande un nouvel upgrade + tests
end-to-end. À ne lancer qu'après la V1 off-chain, une fois les règles de
badges stabilisées par l'usage réel — minter un NFT pour une règle qui va
encore changer trois fois coûte du rent et de la confusion.

---

## 6. Plan d'implémentation, dans l'ordre

1. Migration Supabase : table `xp_events` + vue `wallet_xp`.
2. Hook XP dans `project-write` (action `event`) — attribution
   automatique selon le tableau §3 à chaque `pact_event` inséré.
3. `RankBadge` + `XpBar` + branchement sur `MonProfilPage.tsx`.
4. Badges calculés à la volée + `BadgeShelf`.
5. Quest board hebdomadaire (3 quêtes tournantes).
6. Rang affiché sur `BuildersPage`/`BuilderDetailModal` et `PactCard`.
7. Page `LeaderboardPage` (global + par pact).
8. *(Optionnel, phase 2, GO séparé)* NFT compressé Bubblegum par badge.

Rien de tout ça ne touche `Program ID` / `Config PDA` — cohérent avec la
règle absolue du projet. Étapes 1-7 : aucun redéploiement du programme,
juste frontend + Supabase.
