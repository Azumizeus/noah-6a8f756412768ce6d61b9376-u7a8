# 🎨 PROMPT PREMIUM — Refonte UI/UX BuildPact
> Web3 Solana · interactif · 3D fluide · surprenant
> Généré le 23/08/2026, basé sur l'état réel du produit (post-audit, post-fix).
> Utilisable tel quel dans un outil de génération UI (v0, Lovable, une autre session
> Claude/Figma AI...) ou comme brief pour un designer.

---

## 1) Contexte produit — à connaître par cœur avant de designer quoi que ce soit

**BuildPact** = le hub de confiance pour les builders Solana. Un porteur de projet
publie une idée, les rôles recherchés et la répartition en %. D'autres développeurs
postulent ; quand tout le monde est d'accord, le pacte est verrouillé on-chain. Les
revenus sont distribués automatiquement ; des backers peuvent aussi financer le
projet via un escrow.

**Positionnement** : BuildPact n'est PAS un espace de travail (le code reste sur
GitHub/Discord). C'est la couche de **confiance et de paiement** : accord on-chain,
escrow, distribution. V1 = garantir les parts (façon Kickstarter). V2 (post-hackathon)
= jalons + réputation on-chain + remplacement de membre.

**Audience** : d'abord les juges du hackathon NOAH 02 (26/08/2026), ensuite de vrais
builders Solana solo/indie qui veulent lancer un projet sans négocier les paiements
à la main.

**Ton de marque déjà établi** (à préserver, pas à réinventer) : français direct,
honnête sur les limites (la FAQ Docs assume ouvertement que la sync wallet mobile
est parfois flaky), zéro survente. Web3 sérieux, pas Web3 hype/emoji-partout.

---

## 2) Stack technique — contraintes dures, non négociables

- React 18 + Vite + TypeScript, Tailwind CSS (config custom), Framer Motion (déjà
  utilisé dans `StatsCard.tsx` pour le compteur animé et les variants d'entrée).
- `@solana/wallet-adapter-react` / `-react-ui` pour la connexion wallet — ne pas
  réécrire le flow de connexion, seulement le reskin visuellement (cf. le fix CSS
  déjà en place sur `.wallet-adapter-modal-title`).
- Routing par hash (`#/route`), pas de router serveur — toute nouvelle page doit
  rester compatible avec ce pattern.
- `i18n` déjà en place (`LanguageContext`, FR/EN) — toute nouvelle UI doit passer
  par `t('clé')`, jamais de texte en dur.
- Bundle déjà à 1.38 MB minifié (warning Vite déjà présent) — toute lib 3D/animation
  ajoutée (three.js, react-three-fiber, lottie...) doit être **lazy-loaded**
  (`dynamic import()`) et jamais bloquer le First Contentful Paint des pages
  critiques (Marketplace, fiche pact publique — ce sont les pages que les juges
  voient en premier).
- Accessibilité WCAG 2.1 AA déjà auditée et corrigée — aucune régression tolérée
  (contraste, touch targets mobile, focus visible, `prefers-reduced-motion` déjà
  respecté dans `StatsCard` via `useReducedMotion` — étendre ce réflexe à toute
  nouvelle animation).
- Devnet uniquement. Program ID et Config PDA sont **verrouillés**, ne jamais les
  toucher ni les afficher comme modifiables dans l'UI.

---

## 3) Identité visuelle actuelle — à faire évoluer, pas à jeter

| Token | Valeur actuelle |
|---|---|
| Fond principal | `canvas` = `#0B0B16` (dark, presque noir-violet) |
| Accent primaire | violet (`accent-violet`), utilisé en glow/border/bg à faible opacité |
| Accent secondaire | `accent-neon` (labels/eyebrow, ex. "TREASURY", "PACTS") |
| Texte | `ink-100` (quasi blanc) → `ink-400` (gris moyen), `white` pour les titres |
| Composant signature | `.glass-panel` — fond semi-transparent + `backdrop-blur`, bordure `border-white/5` à `/10` |
| États de chargement | `.skeleton` (shimmer CSS) + `animate-pulse` Tailwind selon le composant |
| Typo | `font-sans` bold/tracking-tight pour titres, `font-mono` uppercase tracking-wider pour labels/eyebrows |
| Fond décoratif | `.grid-bg` — grille de points en `radial-gradient` masqué en fondu |

**La direction actuelle est déjà "premium sombre minimaliste crédible".** L'objectif
de cette refonte n'est pas de la renier mais de lui injecter du **mouvement, de la
profondeur et des moments de surprise** sans sacrifier la lisibilité ni la confiance
(un juge doit toujours comprendre en 2 secondes ce qu'il regarde).

---

## 4) Les 8 pages à couvrir

1. **Dashboard / Landing** (`/`) — vitrine marketing si déconnecté, tableau de bord
   perso si wallet connecté (même route, rendu conditionnel).
2. **Marketplace** (`/marketplace`) — cards de découverte : pitch, % restant, rôles
   ouverts, montant financé.
3. **Pacts** (`/pacts`) — mêmes cards, filtrées sur "mes pactes" / tous / ouverts /
   finalisés.
4. **Fiche pact publique** (`/pact/:pda`) — la page la plus critique pour la démo :
   rôles, parts (doit totaliser 100% visuellement), vault, QR code de partage, chat,
   fil d'avancement, boutons Postuler/Financer/Distribuer.
5. **Builders** (`/builders`) — annuaire, recherche, fiche détaillée, notation,
   contact sécurisé par signature.
6. **Profil** (`/profil`) — édition profil, export PDF, historique de gains.
7. **Treasury** (`/treasury`) — TVL, distribué, en attente ; flux récents on-chain.
8. **Docs** (`/docs`) — mode d'emploi interactif en 6 étapes, FAQ, kit démo juges
   (QR code + lien direct).

---

## 5) Le flow narratif à rendre visuellement évident

```
create_project → add_member → approve → finalize → fund → distribute
```

Chaque étape a un état on-chain vérifiable. **C'est le cœur du pitch** ("la
confiance, c'est du code") — la refonte doit rendre ce pipeline lisible d'un coup
d'œil, pas juste listé en texte. Une frise, une timeline, un pipeline visuel
traversant plusieurs pages serait plus fort qu'un simple stepper statique (qui
existe déjà et fonctionne, voir Docs).

---

## 6) Direction créative — "3D fluide, surprenant, Web3 Solana"

Pistes concrètes à explorer (ne pas tout faire — choisir 2-3 moments forts plutôt
que du 3D partout, qui alourdirait et distrairait) :

- **Cap table en vue orbitale** : sur la fiche pact, remplacer/augmenter la liste
  de membres par une vue où chaque membre est un nœud en orbite autour du projet,
  la taille du nœud proportionnelle à sa part (%). Clic = zoom sur le détail.
  Léger, en CSS 3D transforms ou Framer Motion — pas besoin de WebGL pour ça.
- **Vault comme coffre qui se remplit** : sur `/treasury` et la fiche pact, une
  visualisation liquide/particules qui monte en fonction du `vault balance` réel
  — feedback immédiat et satisfaisant quand un `fund` on-chain vient de réussir.
- **Pulse on-chain en temps réel** : un léger battement/glow sur les chiffres
  (TVL, claimable) quand une transaction confirmée change la valeur — renforce
  la sensation "c'est vivant, c'est vraiment on-chain", pas des chiffres statiques.
- **Transition de confirmation de transaction** : au lieu d'un simple toast, un
  micro-moment (particule qui part du bouton, traverse l'écran, "atterrit" sur le
  wallet ou le vault) au moment où une signature est confirmée — le genre de
  détail qui marque un juge en 3 secondes de démo.
- **Constellation Marketplace** : en fond de la page Marketplace (décoratif, low
  opacity, `prefers-reduced-motion` désactivable), les projets ouverts comme des
  points reliés par des lignes fines qui pulsent doucement — évoque un réseau
  on-chain sans être un gadget qui ralentit la page.
- **Profondeur des glass-panels** : ajouter un vrai parallax léger au scroll/hover
  (translateZ + perspective CSS) sur les cards existantes plutôt que de tout
  refaire en WebGL — 80% de l'effet "3D fluide" pour 5% du coût de perf.

**Garde-fou** : chaque effet doit avoir un fallback statique propre sous
`prefers-reduced-motion: reduce`, et aucun effet ne doit bloquer l'affichage des
vrais chiffres/rôles/parts (la donnée réelle prime toujours sur l'esthétique).

---

## 7) Ton & microcopy (ux-copy)

- Français par défaut, tutoiement, direct — aucune formule creuse ("Bienvenue
  dans votre espace de gestion de projets décentralisés" = à bannir).
- Honnêteté assumée sur les limites connues plutôt que de les cacher (le pattern
  déjà en place dans la FAQ Docs — "Réseau devnet public qui est saturé, pas un
  problème de sécurité" — à généraliser à tout nouveau message d'erreur/attente).
- Micro-copy des états de chargement/vide : jamais de "Loading..." générique —
  dire concrètement ce qui se passe ("Lecture du vault on-chain...", "Calcul de
  la répartition...").
- CTA orientés action concrète, pas génériques : "Distribuer 0.7 SOL aux membres"
  (déjà en place) plutôt que "Confirmer".

---

## 8) Contraintes non-négociables (rappel)

- Devnet uniquement, ne jamais suggérer visuellement que mainnet est actif.
- Program ID / Config PDA : jamais présentés comme modifiables dans l'UI.
- Aucune donnée mock visible pour les juges — toute maquette/prototype doit
  utiliser soit des données on-chain réelles, soit un état vide honnête.
- i18n FR/EN et WCAG 2.1 AA à préserver sur 100% du nouveau code.
- Le pact de test "Nexus Markdown Ünïcode" reste filtré côté frontend
  (`HIDDEN_PACT_PDAS` dans `useProjects.ts`) — ne pas le refaire apparaître en
  retirant ce filtre par erreur lors d'un refactor de la page Marketplace.

---

## 9) Livrables attendus si ce prompt est exécuté

1. Tokens de design mis à jour (couleurs, ombres, easing d'animation) en
   cohérence avec l'existant `tailwind.config.js`.
2. 2-3 "moments forts" 3D/animés choisis et spécifiés précisément (pas les 6
   pistes de la section 6 en même temps).
3. Prototype interactif de la fiche pact publique en priorité (page la plus vue
   par les juges) avant les autres pages.
4. Spec de performance : budget de poids par nouvelle lib ajoutée, stratégie de
   lazy-loading, mesure avant/après sur le build (`npm run build` déjà à 1.38 MB
   — ne pas dépasser un budget raisonnable, ex. +300 KB gzip max pour les effets
   3D/animation ajoutés).
5. Validation manuelle WCAG 2.1 AA + test `prefers-reduced-motion` avant tout
   merge.

---

## 10) Note de timing (honnêteté, pas de la déco)

Le hackathon NOAH 02 ferme le **26/08/2026 à 12h00**. L'app fonctionne déjà,
buildée, déployée, testée bout en bout. Une refonte visuelle complète avant le
freeze est un pari risqué : mieux vaut choisir **1 à 2 moments forts** de la
section 6 à implémenter sur la fiche pact publique (page de démo) plutôt que de
tout refaire et risquer de casser ce qui marche à J-3. Le reste de ce prompt reste
valable comme feuille de route V2/post-hackathon.
