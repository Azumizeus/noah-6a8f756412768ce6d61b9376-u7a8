# 🧰 KIT NOAH — jouer la plateforme comme un pro

> Construit le 23/08/2026 (J-3 hackathon NOAH 02) à partir de **sources
> primaires** : toutes les pages listées ci-dessous ont été fetchées
> directement sur `docs.trynoah.ai` (pas de résumé de résumé). Objectif :
> ne plus improviser sur la plateforme au prochain hackathon, et comprendre
> ce qu'on a réellement vécu sur BuildPact.
> À lire avec [[NOAH-PLATFORM-INCIDENTS.md]] (le journal des galères vécues)
> — ce doc-ci est la référence "comment ça marche", l'autre est "ce qui a
> cassé et pourquoi".

---

## 1) C'est quoi, qui est derrière

Noah = plateforme no-code/prompt-only pour construire des dApps complètes
(front + smart contract + intégration) par conversation. Éditeur derrière :
**Plena Finance** (lien `noah.plena.finance` retrouvé dans plusieurs CTA de
la doc). Discord officiel : `discord.com/invite/P4Zd7x9279`. Support :
`support@plena.finance`.

**Chaînes supportées** — attention, la doc se contredit légèrement :
- `supported-chains/overview` liste seulement **Solana**, "more coming soon".
- `faqs/general` dit "Noah supports **Solana and Irys** (EVM-compatible)".
→ Pour un hackathon Solana comme celui-ci, aucune importance, mais si un jour
on regarde une chaîne EVM sur Noah, vérifier en live plutôt que de se fier à
un seul des deux textes.

---

## 2) Plans & Crédits — ce qui bloque concrètement selon le plan

| Plan | Prix/mois | Crédits/mois | Ce qui change pour nous |
|---|---|---|---|
| Free | 0 $ | 1M | Connexion contrat↔web **limitée** (texto: "on a limited scale") |
| Starter | 10 $ | 5M | Connexion contrat↔web complète |
| Pro | 30 $ | 30M | Build/test/deploy à plus grande échelle |
| Premium | 50 $ | 50M | + support mobile (web ET mobile) |
| Builder | 100 $ | 100M | 100 projets, support dédié |

**Point important pour nous** : sur le plan **Free**, l'intégration
contrat↔frontend est explicitement décrite comme "limited scale" — c'est
peut-être *une partie* de l'explication du split i7i2/6cec (pas seulement
notre erreur d'avoir ouvert 2 projets). À vérifier : sur quel plan tournait
le projet BuildPact au moment de l'incident. Si c'était Free, upgrader avant
le prochain hackathon peut suffire à éviter le problème à la racine, sans
même changer de méthode de travail.

Autres règles : crédits remis à zéro chaque mois (pas de cumul), top-ups
ponctuels achetables sans changer de plan, downgrade différé à la fin du
cycle de facturation en cours.

---

## 3) Les deux vrais modes (pas 4 agents cloisonnés)

- **Plan Mode** — réflexion/décision, ne touche jamais au code, **1 crédit
  par message**. Peut produire un plan structuré éditable en markdown, qu'on
  approuve avant de passer en Agent Mode.
- **Agent Mode** — exécution, tarif à l'usage (beaucoup de tâches < 1 crédit).
  Explore le code, applique les changements, débogue, vérifie.

Les 4 catégories vues dans "Launch" (Web/Mobile/Smart Contracts/Games) sont
des **points d'entrée/templates de démarrage**, pas des agents isolés à vie.
Rien dans la doc primaire ne confirme un cloisonnement dur type "l'agent
Solana ne peut jamais toucher au front" — voir section 9 pour ce qui explique
plus probablement notre vécu.

---

## 4) @ Mentions et / Commands

**@ mentions** (dans le chat input) : 3 catégories — Files & Folders,
Integrations, Docs (React, TypeScript, Next.js, Tailwind, Node.js, Python —
**pas de doc Anchor/Solana** listée). Comportement : `@` ouvre le picker,
`↑/↓` navigue, `Enter` insère, `Esc` ferme. Ne s'applique qu'au message en
cours — à refaire à chaque nouveau message qui a besoin du même contexte.

→ **Pour nous** : puisqu'il n'y a pas de doc Solana/Anchor mentionnable,
toujours donner l'IDL ou le fichier programme **en mention directe**
(`@buildpact.idl.json`) plutôt que compter sur une connaissance Solana
"ambiante" de l'outil.

**/ commands** : catégories Brand & Identity, Layout & Structure, Quick
Fixes, Animations & Effects, AI Features, Integrations, Language Features.
Rien de spécifique Solana/Anchor — cohérent avec le fait que build/test/deploy
programme sont des actions de la toolbar projet (section 5), pas des
slash-commands du chat.

⚠️ Ces deux pages de doc contiennent des restes texto **"Cursor"** (nom d'un
autre outil) — signe que la doc est un template pas 100% réadapté. Le
mécanisme lui-même est probablement réel, les détails d'UI exacts sont à
vérifier en live.

---

## 5) La toolbar d'un projet Noah (Code Editor)

Onglets : **Preview** (aperçu live) · **Code** (éditeur complet, recherche
fichiers, édition directe — **payant uniquement**, inutile en Agent Mode) ·
**Test** (résultats des tests auto-générés pour un smart contract) · **Cloud**
(backend managé : Supabase, voir section 8) · **Integrations** (protocoles
Web3, voir section 10).

Actions à droite : **Download** (zip du projet complet) · **GitHub Connect**
· **Audit** (rapport PDF sécurité contrat) · **Share** (rendre le projet
public) · **Publish** (déploie contrat on-chain + web sur **Netlify**, en un
clic).

---

## 6) Séquence de build recommandée (calquée sur le tuto officiel)

Le tuto *"Build A dApp From Scratch"* (Meme Coin Launchpad) fait tout dans
**un seul projet**, dans cet ordre :

1. **Web-App Development** — décrire l'app, Noah génère tout le front. Note :
   même dans le tuto officiel, "Your Projects" affiche **deux cartes séparées**
   pour le même nom de projet — une taguée "Web App", une taguée "Solana
   Program". C'est une même famille de projet avec deux artefacts distincts,
   pas un unique bloc de code fusionné.
2. **Solana Program Development** — décrire le programme, Noah génère code +
   tests auto + audit. **Télécharger le keypair et l'IDL immédiatement** (Noah
   ne les stocke pas — aucune 2ᵉ chance si perdu).
3. **Integrating the Solana Program** — mécanisme confirmé en détail le 23/08
   via des captures extraites de la vidéo tuto (plus une simple "un seul
   prompt" comme le suggérait le texte de la doc) :
   1. Ouvrir **Settings** (icône engrenage, coin supérieur droit du Code
      Editor) → **Contract Integration** (ou Project Settings → onglet
      **Smart Contracts**, avec un 3ᵉ onglet **Env. Variable**).
   2. **Select Deployed Contract** : choisir dans la liste déroulante le
      contrat déjà déployé (adresse tronquée, réseau, date) — ou **Enter
      manually** s'il n'apparaît pas. Un disclaimer rappelle que le contrat
      doit déjà être déployé pour continuer. Cliquer **Integrate**.
   3. Ça génère un **SDK TypeScript auto-généré** dans `src/lib/<nom-du-
      projet>.ts` (ex. `memeCoinLaunchpad.ts`), basé sur `@coral-xyz/anchor` +
      `@solana/web3.js` + les helpers SPL Token (`ASSOCIATED_TOKEN_PROGRAM_ID`,
      `TOKEN_PROGRAM_ID`, `getAssociatedTokenAddressSync`...) — exactement le
      pattern qu'on utilise déjà à la main dans `frontend/src/lib/anchor.ts`.
      Ça valide notre approche.
   4. Ce SDK seul ne suffit pas : il faut ensuite un **prompt de suivi
      explicite** décrivant quel bouton doit déclencher quelle instruction.
      Exemple vu dans le tuto (paraphrasé) : *ajouter la transaction de
      lancement de token au bouton de lancement dans l'app web*.
   5. Noah met alors à jour les composants concernés pour utiliser de vraies
      transactions (gestion d'erreurs, états de chargement, confirmation avec
      lien Explorer, fetch temps réel des comptes on-chain), et crée un
      **checkpoint** ("Checkpoint Created — Revert?") pour pouvoir annuler ce
      lot de changements si besoin.

**Bonus confirmé** : la Preview de Noah tourne dans un **iframe
CodeSandbox/SandPack** (domaine `sandpack.codesandbox.io`) et déclenche une
**vraie popup de wallet** (Backpack dans le tuto) pour confirmer une vraie
transaction Devnet directement depuis la preview. "Tester le wallet dans la
preview" (mentionné dans `features/preview-debug`) est donc une interaction
réelle, pas un mock.

Prompt d'ouverture type donné par la doc Quick Start :
> "Build a meme coin launchpad dApp on Solana where users can create their
> own tokens, configure supply and fees, and see a dashboard of launched
> coins. Include wallet connect, a responsive UI, and a simple analytics
> section."

Conseils de prompting officiels : être explicite sur les actions utilisateur,
préciser la chaîne/l'environnement (Devnet vs Mainnet), énoncer les règles
métier (fees, limites, contrôle d'accès) plutôt que les laisser implicites,
itérer par petits messages ciblés après la première version.

---

## 7) Testing & IDL

Quand tu construis un smart contract, Noah génère et lance automatiquement
des tests (init, logique cœur, validation d'input, edge cases, gestion de
comptes, gestion d'erreurs), visibles dans l'onglet **Test** (total / passés
/ échoués / durée). Si un test échoue, décris le comportement attendu à Noah
et relance. **Une fois les tests verts, clique "Generate IDL.json"** — c'est
ce fichier qui sert ensuite à connecter le programme au frontend.

→ Ça valide exactement notre procédure déjà documentée dans le prompt maître
CERVEAU PROJET ("Maj IDL → Maj `frontend/src/lib/anchor.ts` → recréer Config
PDA → test end-to-end create→add_member→approve→finalize→fund→distribute").
Rien à changer là-dessus.

---

## 8) Sécurité — les 4 outils intégrés

- **Smart Contract Audit** (bouton **Audit** en haut à droite) : génère un
  **PDF téléchargeable**, avec sévérité (Critical/High/Medium/Low/Info) sur
  Access Control, Arithmetic, Reentrancy, PDA Validation, Account Validation,
  Token Handling, Error Handling. Ne déploie rien, analyse seulement. Gratuit
  (ne consomme pas de crédits au-delà de l'usage normal).
- **Code Security Review** : sur demande dans le chat ("Review my app's
  security"), couvre XSS, injections, auth, secrets en dur, dépendances npm
  vulnérables, RLS Supabase mal configurée. Consomme des crédits comme un
  message normal.
- **API Keys & Secrets** : ne jamais coller une clé API en clair dans le chat
  — Noah la détecte et propose de la stocker en **Supabase secret**, appelée
  ensuite via une **Edge Function** côté serveur. Ne jamais coller de clé
  privée wallet / seed phrase, même en test.
- **Data & Privacy** : le code t'appartient, export possible à tout moment
  (bouton Download = zip, ou export GitHub). Projets privés par défaut. Les
  clés API/secrets sont chiffrées au repos, jamais partagées entre users.
  Anonymisation avant tout usage en entraînement de modèle.

→ **Pour BuildPact** : le rapport PDF officiel Noah reste une bonne "carte
gratuite" à glisser dans le dossier hackathon en plus de l'audit CIPHER déjà
fait manuellement — deux sources valent mieux qu'une pour les juges.

---

## 9) 🚨 Déploiement — le point qui nous concerne le plus directement

**Noah ne déploie le web que sur Netlify.** Confirmé à 3 reprises dans la
doc (`launch/build-web-apps`, `deploy-and-host/dapp-publish`, `faqs/general`)
— aucune mention de Vercel nulle part dans toute la documentation consultée.

**Nous, on est sur Vercel** (`buildpact-solana.vercel.app`, voir incident 8
dans `NOAH-PLATFORM-INCIDENTS.md`). Ce que ça implique concrètement :

- Le bouton **Publish** de Noah (celui qui déploie "contrat on-chain + web
  Netlify en un clic") **n'est pas notre chemin de mise en prod** — si on le
  clique par réflexe, ça crée un déploiement Netlify parallèle et inutile,
  pas notre site réel.
- Notre vraie chaîne de déploiement, c'est : Noah **commit sur GitHub**
  (mécanisme normal, indépendant de Netlify) → **Vercel** a sa propre
  intégration GitHub (configurée manuellement le 23/08, root dir `frontend`)
  qui rebuild automatiquement à chaque push sur la branche connectée.
- Donc **la seule chose qui doit rester vraie en permanence** : le repo et la
  branche connectés à Noah sont les mêmes que ceux connectés à Vercel. C'est
  exactement ce qui a cassé lors de l'incident 8 (Vercel pointait sur le repo
  mort `i7i2` pendant que Noah poussait sur `6cec`).
- **Ne jamais cliquer "Disconnect/Reconnect" GitHub côté Noah** (incident 1 :
  ça duplique le repo) et **ne jamais renommer/déplacer/supprimer le repo**
  (warning officiel de la doc GitHub : ça casse le sync).

**Check rapide à faire au prochain hackathon dès J0** : ouvrir Vercel →
Settings → Git, confirmer que "Connected Git Repository" pointe bien vers LE
repo que Noah vient de créer/utiliser — avant d'écrire la moindre ligne de
code.

---

## 10) Supabase — connecter l'existant plutôt que dupliquer

Fait clé pour nous : **"One Supabase project per Noah project."** Chaque
projet Noah ne peut être lié qu'à **un seul** projet Supabase à la fois.

Deux façons de connecter (`Cloud` tab ou `Settings → Integration`) : OAuth
uniquement, jamais de copier-coller de clé API. Deux flows possibles :

- **Créer un nouveau projet Supabase** depuis Noah (nom, mot de passe DB,
  région).
- **Connecter un projet Supabase existant** — c'est notre cas si on repart
  un jour d'un projet Noah pour BuildPact : le doc précise que **Noah ne
  détecte pas automatiquement le schéma existant**, il faut le décrire
  explicitement dans le premier prompt (tables, champs). Et pour les scripts
  de migration que Noah propose ensuite : **ne les pousser que s'ils ajoutent
  vraiment quelque chose** — ne jamais pousser un script "par défaut" si le
  schéma cible existe déjà, sous peine de dupliquer/écraser des colonnes.

**Notre setup actuel** : BuildPact n'utilise **pas** le "Noah Cloud" OAuth —
notre Supabase est branché à la main (clés dans `.env.local` / variables
d'env Vercel, récupérées via les outils Supabase directs). C'est intentionnel
et ça marche, mais si un jour on relance un projet Noah sur ce même Supabase,
il faudra utiliser le flow **"Connect an Existing Project"** décrit
ci-dessus plutôt que de laisser Noah en créer un nouveau vide — sinon on se
retrouve avec deux bases Supabase déconnectées, même souci que le split
GitHub.

---

## 11) Intégrations protocoles Web3 disponibles (pour plus tard, pas pour J-1)

Onglet **Integrations → Protocols** : Metaplex (NFT), Pump.fun (meme coins),
Raydium + Raydium Swap (DEX), deBridge (cross-chain), CoinGecko (prix),
Privy (auth wallet), Token Balance, Meteora (yield). Config en 3 clics
(sélectionner → configurer clés → intégrer dans le code).

→ Pertinence future déjà notée dans `ROADMAP 2.1.md` : **Metaplex** pour le
NFT Card Game (S2), **CoinGecko/Pyth** pour le Trading Game (S3). Rien
d'actionnable pour BuildPact avant le 26/08.

---

## 12) Mobile / Seeker (pour le futur pivot mobile, pas pour BuildPact web)

Deux étapes séparées, dans cet ordre :

1. **Expo (EAS) Setup** — connecter un compte Expo (4 identifiants : access
   token, project ID, slug, package name auto-généré) pour que Noah build un
   APK/AAB dans le cloud, sans Android Studio local.
2. **Publish to Seeker** — créer un compte publisher sur
   `publish.solanamobile.com`, **lancer la vérification KYC en tout premier**
   (1-2h d'attente, à démarrer avant même de builder), puis lister le dApp
   (icône 512×512, bannière 1200×600), **minter le dApp en NFT on-chain**
   (~0,02 SOL + frais upload) avant de pouvoir publier une release.

→ Pertinent pour **Seeker Game's** (app séparée visant déjà ce pivot) et pour
le futur "App Mobile — cible future" mentionné dans le `CLAUDE.md` racine.
Pas pertinent pour BuildPact (web only, pas de plan mobile actuel).

---

## 13) Templates — accélérateur pour le prochain dry-run

Galerie accessible depuis la sidebar (**Templates**), filtrable par catégorie
(Full Stack Dapp, Smart Contract, Mobile, Games) et par chaîne. **Cloner un
template ne le modifie pas** (projet indépendant) et **ne reçoit pas les
mises à jour futures** du template source.

→ Pour la "répétition à blanc 48h" déjà recommandée dans
`NOAH-PLATFORM-INCIDENTS.md`, partir d'un template **Full Stack Dapp** plutôt
que d'une page blanche peut faire gagner du temps de découverte pur.

---

## 14) Ce qu'on a déjà vécu, et où le retrouver

Tout le détail chronologique des incidents (repos dupliqués, split i7i2/6cec,
program mort, terminal corrompu, sous-agent NOAH aux infos périmées, etc.) et
la stratégie "repo unique + IDL comme contrat d'interface" restent dans
[[NOAH-PLATFORM-INCIDENTS.md]] — ce doc-ci ne les répète pas, il donne le
contexte officiel qui les explique.

---

## 15) Checklist J0 — prochain hackathon Noah

1. Vérifier le **plan/crédits actif** avant de s'engager (section 2) —
   upgrader si le plan Free limite la connexion contrat↔web.
2. **Un seul projet Noah** pour toute la durée — web + programme +
   intégration, jamais deux projets à réconcilier après coup.
3. Connecter GitHub **dès le début**, ne plus jamais Disconnect/Reconnect,
   ne jamais renommer/déplacer/supprimer le repo derrière.
4. Si déploiement web hors Netlify (Vercel comme nous, ou autre) : **ignorer
   le bouton Publish de Noah**, configurer le déploiement séparément, et
   vérifier à chaque connexion GitHub que c'est le même repo des deux côtés.
5. Télécharger et sauvegarder **keypair + IDL** dès le premier déploiement
   devnet réussi — Noah ne les stocke pas, aucune deuxième chance.
6. Si Supabase existant à réutiliser : passer par **"Connect an Existing
   Project"**, décrire le schéma dans le premier prompt (Noah ne le détecte
   pas), ne pousser une migration que si elle ajoute vraiment quelque chose.
7. Générer le **rapport d'audit PDF** (bouton Audit) une fois les tests
   verts — gratuit, à glisser dans le dossier de soumission.
8. Utiliser **@mentions** pour donner le fichier/IDL exact à chaque prompt
   d'intégration plutôt que de décrire en texte libre.
9. Poser toute question d'architecture ambiguë sur le **Discord officiel**
   (`discord.com/invite/P4Zd7x9279`) dès J0, la doc a du retard sur le
   produit réel.
