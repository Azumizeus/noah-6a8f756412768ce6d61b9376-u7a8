# 🧠 BUILDPACT — CERVEAU PROJET (PROMPT MAÎTRE)
> Coller intégralement au début de toute nouvelle session de travail (IA ou humain).
> ⚠️ **MISE À JOUR MAJEURE : 18/09/2026** — tout le contenu ci-dessous jusqu'à la
> section 0 est un historique daté d'AOÛT 2026, en partie PÉRIMÉ (repos `i7i2`/`6cec`
> morts, URL `buildpact-hazel.vercel.app` fausse). **Lire la section 0 "MISE À JOUR
> 18/09/2026" en premier** — elle contient l'état réel actuel et prime sur tout le
> reste du document en cas de contradiction. Le reste du fichier reste utile comme
> historique/archive (architecture programme, audits, matrice wallet — toujours
> valides) mais PAS pour les repos/URLs/statut hackathon.
> Version courte de pilotage à jour (à coller en premier dans une nouvelle
> conversation) : `**AEGIS** — PROMPT CERVEAU — BUILDPACT, POST-RECONSTRUCTION.md`.

## 0. MISE À JOUR 18/09/2026 — RECONSTRUCTION REPO + CANDIDATURE + TRANSFERT NOAH

**Contexte** : entre le 23/08 (dernière maj de ce fichier) et le 18/09, le
programme Solana a été confirmé toujours actif (pas fermé comme on le craignait),
mais la structure des repos GitHub et le pipeline de déploiement Vercel se sont
révélés confus et ont dû être entièrement reconstruits/audités.

**Repos actuels (les seuls qui comptent)** :
- `Azumizeus/noah-6a84b80564b5bc4377d7dcd3-by7b` — miroir complet le plus à jour,
  rendu public temporairement pour la candidature hackathon.
- `Azumizeus/noah-6a8f756412768ce6d61b9376-leb2` — repo natif du projet NOAH
  actuellement utilisé dans le playground (project ID différent de `by7b` — ce
  sont bien 2 projets NOAH distincts, pas 2 noms du même).
- Morts/supprimés, ne plus jamais toucher : `6cec` (supprimé, 404 confirmé),
  `i7i2` (abandonné). Sans rapport : `t7dj` ("Seeker I"), `seeker-strike`.

**RÈGLE — SYNC GITHUB, jamais plus de 5 fichiers modifiés en une seule passe**
(ajoutée 19/09, très important) : le sync de l'espace de travail NOAH vers
GitHub bloque, part en conflit, ou n'aboutit à rien si trop de fichiers
changent d'un coup — vécu concrètement le 19/09 (143 commits jamais
synchronisés, obligé de recréer un repo GitHub propre pour débloquer).
Découper tout gros chantier en lots de 5 fichiers max, et vérifier CHAQUE
lot directement sur GitHub (nouveau commit visible sur `main`, hash noté)
avant d'entamer le lot suivant. "Fichier écrit dans l'espace de travail"
n'est PAS "fichier synchronisé" : ne jamais annoncer une modif comme faite
tant que le commit n'est pas confirmé sur GitHub.

**Frontend prod réel** : `https://buildpact-solana.vercel.app` (l'URL
`buildpact-hazel.vercel.app` mentionnée plus bas dans ce document est fausse/périmée).

**Bug critique résolu — images/profils/vault ne s'affichaient plus** : deux
causes cumulées, (a) variables d'env Supabase absentes du dashboard Vercel
(`.env` gitignored, jamais poussé en prod), (b) le projet Supabase
`xkznmflyiilgmxhvgega` était en pause (statut INACTIVE) — réveillé via l'outil
MCP Supabase. Vérifié en live : les vraies URLs Supabase Storage s'affichent
correctement sur `/marketplace`.

**Découverte Vercel** : la prod ne déployait pas depuis GitHub — historiquement
lancée en CLI (`vercel --prod`) depuis un dossier local non versionné. Le Git
Settings de Vercel a été reconnecté sur `leb2`, mais **un déploiement de test
depuis ce lien n'a pas encore été confirmé** (hash du bundle JS inchangé au
dernier check) — à vérifier avant de s'y fier pour un futur déploiement.

**Candidature NOAH.AI × Colosseum Builder Program** : **soumise et validée**.
Lien démo soumis = l'URL live uniquement (champ GitHub optionnel, laissé vide,
repo pas communiqué). Deadline finale Colosseum (soumission complète) :
**12 octobre 2026**.

**Chantier en cours — transfert manuel vers NOAH** : le bouton "Sync Changes"
de NOAH est cassé (aucune option "resolve", cause = force-push qui a cassé la
continuité d'historique git que NOAH utilise en interne). Solution actée avec
l'utilisateur : coller manuellement le code de `by7b` dans l'éditeur NOAH,
fichier par fichier en suivant les dépendances, jusqu'à ce que le "journal de
quêtes" (gamification V2) et les thèmes premium (Aurum/Atelier) soient
fonctionnels dans NOAH — puis faire un export frais + re-push vers `leb2`
plutôt que de compter sur le Sync cassé. Budget : 50M tokens NOAH ajoutés par
l'utilisateur, ~25M alloués à finir ce chantier BuildPact.

Déjà transféré et confirmé chez NOAH : `ProfileSettingsModal.tsx` + 8
sous-composants, `QuestBoard.tsx`/`QuestIcons.tsx`/`ClaimBurst.tsx` + CSS
d'animation, `lib/gamification.ts`, `lib/constants.ts` (RPC custom),
`lib/profile.ts`/`lib/profileRemote.ts` (corrige un vrai bug : thème/bannière
non sauvegardés), i18n `gamification.*`/`theme.*`/`settings.*`,
`MonProfilPage.tsx` (livré, en attente de confirmation NOAH).

Restant : (1) confirmer que `MonProfilPage.tsx` rend le panneau réglages
atteignable chez NOAH, (2) **le plus gros morceau** — transférer les vrais blocs
CSS des thèmes Aurum/Atelier (`[data-mode='light']`, `[data-theme='aurum']`,
`[data-theme='atelier']` — ~200+ lignes, NOAH n'a que des stubs), (3) vérifier
les clés i18n `profile.settings*`, (4) export + re-push propre vers `leb2`,
(5) vérifier le déploiement auto Vercel↔`leb2`, (6) repasser `by7b`/`leb2` en
privé maintenant que la candidature est soumise, (7) plus tard : aplatir la
structure de `by7b` (retirer le wrapper `frontend/`), préparer les livrables
Colosseum pour le 12/10.

**MISE À JOUR 20/09/2026 — états finalisés (prime sur tout ce qui précède) :**

- **Repo unique : `Azumizeus/noah-…-75mv`** = local + GitHub + NOAH connecté. Vercel ↔ GitHub ↔ `bf71780+` VALIDÉ. `by7b` et `leb2` ont été **SUPPRIMÉS** (doublons en retard, GO utilisateur, sans backup). Pas de repos Interoplabs à l'appui. **`75mv` est PRIVÉ** depuis le 20/09 (conversion réussie).
- **Pipeline turned pro : pushes OK via `/usr/bin/git`** (le git Homebrew x86_64 fige sur github.com — utiliser /usr/bin/git pour push/pull).
- **Fix sécurité lot 2b** : anti double-`fund` (sentSig guard), `.env` désindexé du git, localStorage profil passé au crible, credential helper réglé sur `gh` (osxkeychain buggé sur autre machine context).
- **Wizard `/create` REVIVÉ** (`commit 625d943`) : CreatePactPage.tsx + route CREAWizard + guards anti double-create/share NaN/limite réelle 8 membres/total excluant lignes vides.
- **Cohérence financière** (`2b799fc`) : quote-part nette 2% partout, états erreurs RPC explicites (jamais de "0 SOL"), auto-refresh Treasury 45s.
- **Qualité** (`6507375`) : `tsc --noEmit` = 0 erreur (tsconfig réparé), eslint 3656 → ~25 (baseline pragmatique), CSV anti-injection Excel, fix hooks VaultPanel.
- **A11Y** (`98ad9ff`) : Escape/dialog/focus-guard ApplyModal, aria-pressed filtres, timers QuestBoard clearés.
- **Docs juges FR/EN + DEMO-SCRIPT mis à jour** dans `buildpact-75mv/docs/` (10/10 = tournage vidéo 3 min + portail Colosseum).
- **Reste avant 12/10** : tourner la vidéo 3 min, tester /create sur la prod, soumission portail colosseum.com/worldsfair.


**Règle de rôle à rappeler à chaque session** : Claude/AEGIS-7 ne donne jamais
le "GO" à la place de l'utilisateur — présente l'analyse, attend sa décision
explicite avant toute action destructrice (push, suppression, redeploy).

---

## HISTORIQUE ARCHIVÉ (août 2026 — repos/URLs ci-dessous PÉRIMÉS, architecture programme toujours valide)
> Incident 8 résolu le 23/08 : merge NOAH jamais réellement corrigé (~25+ fichiers,
> pas juste lib.rs) + projet Vercel branché sur le mauvais repo (i7i2, mort). Les 2
> réparés à l'époque, site en ligne sur `buildpact-solana.vercel.app`. Détail complet
> dans `NOAH-PLATFORM-INCIDENTS.md` (incident 8).
> ✅ Les 8 points de l'audit UI/UX (`UI-UX-AUDIT-22-08.md`) sont tous corrigés et
> vérifiés en live à l'époque.
> 🎨 Piste refonte visuelle V2 (3D fluide, non urgente) : `PROMPT-DESIGN-UI-PREMIUM-BUILDPACT.md`.

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
| ⚠️ Frontend prod (PÉRIMÉ) | ~~https://buildpact-hazel.vercel.app~~ → **réel : https://buildpact-solana.vercel.app** (voir section 0) |
| ⚠️ Repo (PÉRIMÉ, mort/supprimé) | ~~github.com/AzumiZeus/noah-6a84b80564b5bc4377d7dcd3-6cec~~ → **repos réels : `by7b` (miroir) et `leb2` (natif NOAH), voir section 0** |
| ⚠️ Ancien repo (MORT côté NOAH, ne plus utiliser) | `...-i7i2` — renommé/remplacé par `6cec` le 22/08, lui-même supprimé depuis (voir section 0). Voir `NOAH-PLATFORM-INCIDENTS.md` incident 2. |
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
