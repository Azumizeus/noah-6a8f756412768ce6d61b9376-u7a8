
> ⚠️ **DOCUMENT HISTORIQUE — conservé tel quel.**
> Feuille de route du **hackathon (août 2026)**. Elle décrit l'app d'AVANT le
> shell premium et n'est plus à jour. **Doublon** : brouillon détaillé de `ROADMAP-FR.md`.
> **Référence actuelle : `ETAT-APP-2026-10-08-FR.md`** (ou sa version HTML
> `ETAT-APP-2026-10-08-FR.html`), section « Carte des documents ».

## 1. IDENTITÉ DU PROJET
- **Nom** : BuildPact — « Le pacte des builders. La confiance, c'est du code. »
- **Événement** : Hackathon NOAH 02 — **deadline 26/08/2026 12:00**
- **Concept** : un dev poste un projet avec rôles + % de parts → d'autres devs
  postulent → quand tous sont d'accord, l'accord est écrit on-chain → les backers
  financent via escrow PDA → distribution automatique des revenus selon le contrat
  (2% protocole / 98% membres pro-rata).
- **Ce que la plateforme N'EST PAS** : un espace de travail. Le travail se fait sur
  GitHub/Discord. BuildPact = couche confiance + contrat + paiement.
- **Pitch juges** : « Je suis un solo founder. Ce problème, je le vis. La confiance
  entre cofondateurs ne devrait pas être un acte de foi — elle devrait être du code. »
- **Réponses questions pièges** :
  - « Dev disparaît / livre mal ? » → v1 = financement post-finalisation façon
    Kickstarter, risque assumé ; v2 = milestones (jalons) + réputation on-chain +
    remplacement de membre par nouveau pact.
  - « Parts modifiables ? » → non après finalize (verrouillé on-chain) ; oui avant,
    avec re-approbation de tous les membres.
  - « Sécurité ? » → seeds PDA canoniques, vérifications signer, arithmétique
    checked (pas d'overflow silencieux).

## 2. INFOS VERROUILLÉES (NE JAMAIS RÉGÉNÉRER SANS VALIDATION HUMAINE)
| Élément | Valeur |
|---|---|
| Program ID **actif** | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` |
| Config PDA **actif** | `5yRNQhn7W6sCFNVWhTWbZowQRKL7dNSaqYkpTtPxEF2C` |
| Fee protocole | 200 bps (2%) → wallet `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH` |
| Réseau | **Devnet** (mainnet = post-hackathon uniquement) |
| Frontend prod | https://buildpact-hazel.vercel.app |
| Repo **actif** | github.com/AzumiZeus/noah-6a84b80564b5bc4377d7dcd3-**6cec** (privé) |
| ⚠️ Ancien repo (MORT côté NOAH, ne plus utiliser) | `...-i7i2` — renommé/remplacé par `6cec` le 22/08 suite à déconnexion NOAH. Historique git identique jusqu'au renommage (commit `fa844dd` présent dans les deux). Voir `NOAH-PLATFORM-INCIDENTS.md` incident 2. |
| ⚠️ Ancien Program ID (MORT, fermé, irrécupérable) | `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ` — ne plus jamais l'utiliser |

**✅ Point de vigilance du 21/08 RÉSOLU le 22/08 :** confirmé que le repo de travail
(`~/Desktop/buildpact-repo`) est bien sur `9quyDwnt...` partout (`constants.ts`,
account size on-chain vérifié = 934 octets via `getProgramAccounts`, correspond
exactement aux constantes locales). Plus de dossier clone divergent — un seul
repo, un seul Program ID, confirmé.

**⚠️ Nouveau point réglé le 22/08 (sécurité) :** une clé privée de wallet
déployeur (`wallet.json` + copie dans `archive/wallets/`) avait fuité dans
l'historique git (3 commits). Purgée intégralement via `git filter-repo` +
force-push (historique réécrit, confirmé absent via `git log --all`). Wallet
non utilisé par les outils de déploiement (`Anchor.toml` pointe sur
`~/.config/solana/id.json`), solde devnet négligeable (1.8 SOL) — impact réel
nul, mais hygiène corrigée. `wallet.json` et `archive/wallets/` sont maintenant
dans `.gitignore`.

**⚠️ Récidive le 22/08 (nuit, 22h44)** : malgré le `.gitignore`, `wallet.json`
a été **recommis** (commit "restaure wallet déployeur pour nouveau program"),
et cette fois `target/deploy/workspace-keypair.json` — la clé du program
lui-même — aussi (commit "nouveau program keypair"). Repurgé via
`git filter-repo`. Différences avec la 1ère fois : **pas encore force-pushé**
(repo confirmé privé, décision volontairement différée) et le repo `i7i2` pas
vérifié. Les copies en clair (backup repo, `wallet-recovered.json` retrouvé sur
le Mac, clé du program) déplacées vers 2 volumes chiffrés AES-256 sur clé USB
débranchée. Détail complet : `NOAH-PLATFORM-INCIDENTS.md` incident 7.

## 3. STACK TECHNIQUE
- **Programme** : Solana / Anchor 0.30 / Rust — instructions : `create_project`,
  `add_member`, `remove_member`, `approve`, `finalize`, `fund`, `distribute`,
  `close_project`.
- **Frontend** : React + Vite + TypeScript, Tailwind, Wallet Adapter → Vercel.
  IDL : `frontend/src/idl/buildpact.json`.
- **Backend off-chain** : Supabase (auth signMessage, Realtime chat).
- **RPC** : Helius dédié devnet en priorité (fix rate-limit 429 du RPC public),
  fallback Ankr puis RPC officiel Solana.
- **Wallets supportés** : Phantom, Backpack, Solflare (desktop + MWA/Seed Vault
  mobile).
- **Fichiers clés** : `programs/workspace/src/lib.rs`, `frontend/src/idl/buildpact.json`,
  `frontend/src/lib/anchor.ts`, `frontend/src/lib/constants.ts`,
  `frontend/src/pages/{Dashboard,Pacts,Marketplace,Treasury,Docs,About,PactPublic}Page.tsx`,
  `frontend/src/components/{CreatePactWizard,PactCard,MarketplaceCard,AddMemberModal,EditMediaModal,MediaPicker,VideoEmbed,UpdatesFeed,TxBanner,DashboardLayout}.tsx`,
  `frontend/src/lib/{media,updates}.ts`, `frontend/supabase/{project_media,project_updates}.sql`,
  `frontend/src/hooks/useProjects.ts` (usePactActions, useProjects, useTreasury).
- **Règles métier on-chain** : parts en basis points (total EXACT = 10 000 bps) ;
  finalize founder-only ; approve par chaque membre ; vault = PDA par projet
  (seeds `["vault", project]`) ; project PDA (seeds `["project", creator,
  project_id_bytes]`) ; project_id ≤ 32 caractères (limite de seeds).
- **Gotchas frontend confirmés** : décodage camelCase de l'IDL (`protocolWallet`,
  `shareBps`, pas snake_case) ; `distribute` exige `remaining_accounts` = membres
  dans l'ORDRE EXACT de `project.members`, sinon `MemberMismatch`.

## 4. HISTORIQUE — CE QUI EST FAIT (ne pas refaire)

### Avant le 20/08
Programme Anchor complet déployé, wizard 3 étapes, reprise pact orphelin,
AddMemberModal, fixes build (blockhash, retry/rotation RPC).

### 20-21/08 — Programme fermé & reconstruit (hors plan, 2 jours)
L'ancien programme (`266V7Jct...`) a été fermé/perdu sur devnet. Nouveau keypair
généré, redéployé sous `9quyDwnt...`, Config PDA recréée (200 bps), IDL +
`PROGRAM_ID` frontend resynchronisés, test end-to-end complet confirmé
(create → add_member → approve → finalize → fund → distribute).

### 21/08 — Diagnostic wallet mobile (Seed Vault / MWA), journée entière
4 bugs réels corrigés et mergés : `VersionedTransaction` (v0) au lieu de legacy
(fix "Missing signature"), `ComputeBudget` pré-injecté avant signature,
`appIdentity.uri` dynamique (`window.location.origin`), RPC Helius dédié (fix
429). Nonce durable testé en sandbox isolé puis **abandonné définitivement** — pas
qu'un bug technique : Backpack et Phantom affichent tous deux un écran de sécurité
bloquant ("STOP. YOU MIGHT BE GETTING ATTACKED") sur toute signature de nonce
durable, par design (protection anti-phishing "sign now, drain later"). Matrice de
fiabilité finale établie sur 3 wallets × desktop/mobile :

| Environnement | Phantom | Backpack | Solflare |
|---|---|---|---|
| Desktop (Brave + Chrome, macOS) | ✅ | ✅ | ✅ |
| Seeker mobile | ❌ (boucle infinie) | ✅ | ❌ (boucle infinie) |

**Stratégie de démo : n'importe quel wallet desktop, ou Backpack sur Seeker mobile
si le critère hackathon l'exige. Ne jamais ouvrir Phantom/Solflare mobile devant
les juges.** Détail complet : `BUG MWA SEEKER MOBILE/SEED-VAULT-MWA-KNOWN-ISSUES 3.md`.

### 21/08 soir — Polish produit, données réelles & accessibilité
- **Treasury** : reconstruite avec de vraies données on-chain (TVL, distributions,
  historique de transactions Solscan) — l'ancienne version était 100% mock,
  violation directe de la règle absolue n°3. Corrigé.
- **Docs** : Program ID mort corrigé (affichage dynamique) puis page entièrement
  refondue — guide interactif étape par étape, FAQ accordéon, glossaire, détail
  technique/sécurité.
- **About** : nouvelle page créée — pitch produit + roadmap client V1/V2 (distincte
  de la roadmap interne de sprint).
- **CreatePactWizard** : passé en pleine largeur, design premium, stepper visuel.
- **Audit A11y WCAG 2.1 AA** complet + 4 corrections appliquées : contraste des CTA
  violets (texte blanc → `ink-900`, ~3.6:1 → ~4.9:1), contraste texte secondaire
  (`ink-500` → `ink-400`), association labels/inputs (`htmlFor`/`id` ou `sr-only`)
  sur CreatePactWizard, AddMemberModal, PactCard, cibles tactiles des boutons ×
  portées à ~36px.
- **Audit "signes vibe-codé"** passé sur tout le code (checklist 30 points) — rien
  de critique ; usage massif d'emojis et violet saturé identifiés mais assumés
  comme identité de marque, non corrigés (trop de scope pour le gain à 5 jours de
  la deadline).

### 22/08 — Marketplace, multi-rôles, médias projet, fiabilité wallet (journée complète)
- **Marketplace/Discovery livré** (J-4 critique) : cards pitch/% restant/rôles
  ouverts/montant financé, filtres Recrutent/Cherchent des fonds, parcours
  investisseur testé.
- **Multi-rôles cumulables par membre** : un membre peut cocher plusieurs rôles
  (ex. Lead Dev + UX/UI) au lieu d'un seul, dans `CreatePactWizard` ET
  `AddMemberModal` (label combiné, tronqué en octets ≤ 24 pour rester valide
  on-chain).
- **Fix définitif bug 6005** (`InvalidParameter`) : la troncature UTF-8
  précédente laissait parfois un octet de tête de séquence multi-octets
  orphelin (ex. emoji coupé), que `TextDecoder` remplaçait par U+FFFD — ce qui
  repassait AU-DESSUS de la limite d'octets. Nouvelle troncature qui exclut la
  séquence incomplète entière ; validé par fuzzing (356 cas, 0 échec).
- **UX wizard** : bouton "Finaliser" retiré de l'étape 3 (appelait une tx
  vouée à l'échec — les membres démarrent toujours non-approuvés) → remplacé
  par "OK, fermer". Auto-refresh de la liste Pacts à la fermeture du wizard.
- **Fix vault balance/claimable figés** après `distribute()` : la carte
  appelait un helper interne au lieu du callback parent qui déclenchait le
  refresh — corrigé via un callback `onDistributed` dédié.
- **Logo + bannière + vidéo de présentation projet** (Supabase Storage +
  table `project_media`) : upload réel à la création ou après coup ("Modifier
  les médias"), affichés sur Pacts/Marketplace/fiche publique. Vidéo =
  lien externe YouTube/Loom/Vimeo embarqué (pas d'upload de fichier vidéo,
  pour ne pas saturer le quota gratuit Supabase).
- **Fil d'avancement des membres** (table `project_updates`) : chaque membre
  poste un court texte + lien optionnel, affiché en liste chronologique sur
  la fiche publique — complète l'`ActivityFeed` (qui ne montre que les
  transactions on-chain loggées).
- **Kit démo juges renforcé** : liens "🔍 Projet" / "💰 Vault" sur chaque
  pact → historique on-chain complet et permanent (Solana Explorer),
  indépendant de Supabase — un juge peut vérifier même si l'appli est down.
- **`AddMemberModal` agrandie** (petite fenêtre → pleine largeur comme le
  wizard) + total des parts du projet entier enfin affiché clairement
  (couleur verte/orange selon 100% atteint ou non).
- **3 bugs wallet réels corrigés** (pas de la simple flakiness RPC) :
  1. Rotation RPC (Helius → Ankr → officiel) qui ne s'appliquait jamais
     pendant les 3 tentatives de retry (la connexion était créée une seule
     fois avant la boucle) → cause du ressenti "boucle infinie de
     signature" avec Backpack quand le RPC était saturé.
  2. Bouton Déconnecter qui semblait ne rien faire : `autoConnect` du
     wallet-adapter relisait la clé `localStorage['walletName']` juste
     après le reload et reconnectait tout seul le même wallet. Corrigé en
     effaçant cette clé au disconnect.
  3. Message d'erreur RPC brut illisible ("Solana error #8100002...")
     affiché tel quel dans le bandeau `TxBanner` → remplacé par un message
     clair ("réseau devnet saturé, réessaie").
- **Tests multi-wallets confirmés fonctionnels** (22/08, en plus de la
  matrice du 21/08) : Solflare desktop Brave macOS → approve + finalize +
  distribute OK. Backpack/Phantom desktop → OK une fois les 3 bugs ci-dessus
  corrigés. Les écrans "Simulation Unavailable" / erreurs 429 restants
  viennent de la simulation de sécurité PROPRE au wallet (son propre RPC),
  hors du contrôle de l'app — congestion devnet publique confirmée en
  observant nous-mêmes des 429 sur `api.devnet.solana.com` en temps réel.

### 22/08 soir/nuit — Vault v2, profil sécurisé (bugs réels), annuaire builders complet
Session très au-delà du plan initial J-3/J-2, livrée le même soir que le Marketplace.

- **Vault de documents privés par projet** : upload par les membres, review par le
  founder, historique de versions (ré-upload = nouvelle version chaînée via
  `supersedes_id`, dépliage dans l'UI au lieu d'écraser l'ancienne), lien direct
  partageable vers un document précis (sans accès sans signature + appartenance
  au projet). Sécurité identique au reste : Edge Function `vault` vérifie une
  signature ed25519 (`tweetnacl`) avant d'utiliser `service_role`, table fermée
  par RLS sans policy publique.
- **Avatar de profil** : upload via signature wallet, bucket public dédié,
  affiché dans le chat et le fil d'avancement à la place de l'adresse brute.
- **3 vrais bugs de sauvegarde de profil corrigés en cascade**, découverts un
  par un uniquement parce que l'Edge Function a été modifiée pour renvoyer le
  vrai message Postgres au lieu d'un message générique :
  1. `type="url"` sur les champs github/twitter/portfolio bloquait la
     signature elle-même via la validation HTML5 native (submit jamais
     déclenché) → passé en `type="text"`.
  2. Colonne `available` manquante sur `builder_profiles` (table créée avant
     l'ajout de cette colonne au schéma, `create table if not exists` ne
     l'ajoute pas rétroactivement) → `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
  3. Colonne `pseudo` orpheline (ancien nom avant `display_name`), NOT NULL
     sans défaut → au lieu de patcher au cas par cas, bloc SQL générique qui
     `DROP NOT NULL` sur toute colonne orpheline sans défaut (sauf `wallet`),
     pour ne plus jamais revivre ce whack-a-mole.
  4. `notify pgrst, 'reload schema';` ajouté pour éviter le délai de cache
     PostgREST après un `ALTER TABLE` manuel.
- **Mode aperçu/édition de la page Profil** : après sauvegarde, la page affiche
  une fiche en lecture seule (bouton "✏️ Modifier" pour repasser en édition)
  au lieu d'un formulaire en permanence ouvert.
- **Niveau de compétence par skill** (Débutant/Confirmé/Expert), affiché
  partout où les compétences apparaissent (profil, annuaire, export PDF).
- **Export PDF du profil builder** : CSS d'impression ciblée sur la fiche
  uniquement (`window.print()`), zéro dépendance ajoutée.
- **Annuaire des builders (`/builders`)** : liste tous les profils, recherche
  insensible aux accents/casse (cherche pseudo + bio + compétences, pas
  seulement le pseudo), filtre disponibilité, fiche détaillée en modale au
  clic sur une carte (bio complète, compétences+niveaux, liens, wallet, note).
- **Demandes de contact entre builders** — livrées en v1 MVP (écriture
  publique, même compromis que le chat), puis **durcies en v2 le soir même**
  suite à une demande explicite de l'utilisateur (« comment rendre ça vrai ? »):
  signature signMessage obligatoire des deux côtés (envoi ET lecture de sa
  propre boîte de réception), table fermée par RLS sans policy publique,
  Edge Function dédiée `contact`.
- **Notation des builders 1 à 6 étoiles** — sécurisée dès le départ (pas de
  version MVP-ouverte cette fois, leçon retenue de la demande de contact) :
  signature signMessage + unicité par paire de wallets (impossible de bourrer
  les urnes), moyenne publique exposée uniquement via une vue Postgres agrégée
  (jamais le détail des votes individuels).
- **Fix bug réel de fiabilité wallet** : la boîte de réception des demandes de
  contact déclenchait `signMessage` automatiquement dans un `useEffect` au
  chargement de la page Profil → certains wallets (Solflare confirmé)
  refusent ou affichent un popup vide/cassé quand la signature n'est pas
  déclenchée par un clic direct, d'où un ressenti "marche 1 fois sur 2".
  Corrigé en exigeant un clic explicite sur un bouton "🔓 Déverrouiller" —
  même pattern que le vault. **Règle établie pour la suite : ne jamais
  appeler `signMessage` dans un `useEffect`, toujours derrière un clic.**
- **Navigation clarifiée** : icône logo et texte "BuildPact" séparés en 2
  liens (accueil marketing vs Dashboard, au lieu d'un lien unique redondant) ;
  Dashboard priorise les pacts du wallet connecté (créateur/membre) au lieu
  des 4 premiers pacts du protocole entier ; bouton "💬 Discussion & Vault"
  rendu visible en pleine largeur sur chaque carte pact (remplaçait un petit
  lien "Partager" invisible comme point d'accès pour soi-même), puis masqué
  sur la fiche pact elle-même (redondant avec chat+vault affichés en dessous)
  et réduit en taille partout ailleurs.
- **Investigation popup signature persistant** (rapporté par l'utilisateur
  après le fix ci-dessus) : recherche exhaustive de tous les appels
  `signMessage(` dans le code — les 4 seuls existants (`vault.ts`,
  `profileRemote.ts` ×2, `contact.ts`) sont bien tous derrière un clic
  bouton, aucun `useEffect` fautif retrouvé. Hypothèse retenue : build
  frontend pas encore redéployé sur Vercel depuis le fix, ou cache
  navigateur — **à confirmer après un `git push` + redeploy + hard refresh**.

## 5. ROADMAP RESTANTE (voir aussi `buildpact-roadmap-v2.html`, checklist interactive)
- **J-5 (22/08) ✅ FAIT** : repo réel confirmé sur le bon Program ID · fiche
  projet détaillée · boutons Postuler/Financer.
- **J-4 (22/08) CRITIQUE ✅ FAIT** : Marketplace/Discovery — cards (pitch, %
  restant, rôles ouverts, montant financé) + parcours investisseur complet
  testé. Bonus hors plan initial livré le même jour : multi-rôles, médias
  projet (logo/bannière/vidéo), fil d'avancement membres, kit démo juges,
  3 bugs wallet corrigés.
- **J-3 (23/08) ✅ FAIT en avance (22/08 soir/nuit)** : profil builder
  (signMessage → Supabase) + page profil + chat projet (Realtime) — et très
  au-delà : vault documents avec historique de versions, avatar, mode
  aperçu/édition, export PDF, niveau de compétence, annuaire des builders
  avec fiche détaillée, demandes de contact sécurisées, notation 1-6 étoiles.
  Voir section 4 pour le détail complet.
- **J-2 (24/08)** : audit sécurité (signer/ownership/seeds PDA), polish
  UX/A11y restant. Landing page publique déjà faite (hors plan initial).
  ✅ **Point ouvert RÉSOLU le 22/08** : popup de signature auto-déclenché
  confirmé corrigé après redeploy Vercel + hard refresh côté utilisateur.
  C'était bien un problème de build pas encore redéployé / cache navigateur,
  pas un bug de code résiduel.
  ✅ **Audit sécurité fait le 22/08 (Claude + vulnhunter/zz-code-recon)** :
  trou réel trouvé — `protocol_wallet` n'était pas verrouillé on-chain dans
  `create_project` (n'importe qui appelant le programme directement pouvait
  rediriger les 2% de frais). Fix codé (constante `PROTOCOL_WALLET` +
  `require!`), **upgrade devnet effectué et confirmé** (slot 485986808 →
  486658175, même Program ID `9quyDwnt...`, Authority `8eui3v5x...`
  inchangée). 2 points mineurs documentés en commentaire dans `lib.rs`
  (caller non restreint sur `distribute` — voulu et sûr ; vault SystemAccount
  nu — édge case théorique sans impact en usage normal). Rien d'autre trouvé.
  ⚠️ **Découverte importante en cours de route** : l'autorité d'upgrade réelle
  du programme est `wallet.json` (pubkey `8eui3v5x...`), **PAS**
  `~/.config/solana/id.json` comme indiqué plus haut dans ce doc (section 2,
  point du 22/08) — cette affirmation était fausse, vérifiée factuellement
  via `solana program show`. L'incident de fuite git du 20/08 concernant
  `wallet.json` était donc plus sérieux que noté à l'époque ("impact réel
  nul") puisque ce fichier EST la vraie autorité de déploiement. Risque
  limité (repo privé), mais **à faire post-hackathon : changer l'autorité
  d'upgrade vers une clé fraîche** (`solana program set-upgrade-authority`).
  ⚠️ **Bug plateforme NOAH découvert (doublons)** : chaque "Disconnect/Reconnect" du
  repo GitHub dans l'intégration NOAH créait un NOUVEAU repo dupliqué au lieu
  de se relier à l'existant (`i7i2`) — a généré 4 doublons périmés (qztt,
  itej, u2od, 5suw), tous supprimés. Le lien projet NOAH ↔ repo GitHub a dû
  être réparé manuellement (support NOAH contacté). Ne plus jamais cliquer
  Disconnect dans l'UI NOAH sans vérifier le nom exact du repo cible avant.
  🔴 **Incident majeur du 22/08 nuit — RÉSOLU** : le projet NOAH s'est
  retrouvé complètement déconnecté (candidature hackathon bloquée). Reconnexion
  a créé un nouveau repo `...-6cec` (remplace `i7i2`). Ce nouveau repo avait un
  merge automatique cassé par NOAH AI, laissant 3 blocs de marqueurs de conflit
  Git commités dans `lib.rs` (build cassé pour tout juge qui clone). Conflits
  résolus en conservant le fix sécurité `protocol_wallet` (vérifié contre le
  frontend + une copie locale saine avant validation), suite de tests
  `LiteSVM` mise à jour (13/13 verts, dont un nouveau test négatif), puis
  **redéployé sur devnet avec succès** via CLI manuelle depuis un Codespace
  (l'outil de déploiement natif de NOAH étant cassé — bug de chemin
  d'artefacts côté infra NOAH). Confirmé : slot `486658175` → `486682958`,
  même Program ID, même Authority (`8eui3v5x...`), aucune donnée on-chain
  perdue. **Détail complet, chronologique, avec toutes les commandes et pièges
  d'environnement rencontrés : voir `NOAH-PLATFORM-INCIDENTS.md`.**
- **J-1 (25/08)** : script démo (pact → membre → finalize → fund → distribute) +
  vidéo 3 min + README premium. **Pas encore commencé au 21/08 soir.**
- **J-0 (26/08)** : freeze code 12:00 + soumission + backup vidéo si la démo live
  échoue.

## 6. RÈGLES DE COLLABORATION (CONTRAIGNANTES)
1. Français, tutoiement, direct, concis.
2. Avant toute modification destructrice de fichier ou déploiement : annoncer en
   1 ligne + attendre GO.
3. Jamais de remplacement complet de fichier sans backup/commit préalable.
4. Ne jamais régénérer Program ID / Config PDA / clés (section 2) sans validation
   humaine explicite.
5. Ne pas refaire ce qui est dans l'historique (section 4) — doute → demander.
6. Scope : toute idée hors roadmap (section 5) → noter en « post-hackathon », ne
   pas coder sans validation.
7. Aucune donnée mock/fake visible dans l'app — un juge doit pouvoir vérifier
   chaque chiffre sur l'explorer Solana devnet. (Violé une fois sur Treasury,
   corrigé le 21/08 — rester vigilant sur les futures pages.)
8. Workflow de livraison : Claude édite une copie locale, la présente, l'humain
   copie/colle dans GitHub (éditeur web) et laisse Vercel redéployer — pas de
   Codespaces. **Exception posée le 22/08** : un déploiement de programme
   Solana (upgrade on-chain) est sorti de ce cas — l'outil de déploiement natif
   de NOAH étant cassé (bug d'infra, voir `NOAH-PLATFORM-INCIDENTS.md` incident
   5), un Codespace GitHub a été utilisé pour lancer `solana program deploy`
   en CLI, seule voie fonctionnelle trouvée. Rester dans ce cas précis
   (déploiement de programme quand l'outil NOAH échoue), pas une réouverture
   générale du workflow Codespaces pour l'édition de code courante.

## 7. ÉQUIPE (rôles IA)
AEGIS (orchestration/arbitrage) · RUSTIK (programme Solana) · NEXUS (frontend) ·
CIPHER (sécurité, véto déploiement) · VERA (UX/A11y, véto frontend) ·
LINGUA (i18n FR/EN) · ECHO (pitch/vidéo/marketing).

