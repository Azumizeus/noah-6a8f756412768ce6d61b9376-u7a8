# ⚠️ NOAH PLATFORM — JOURNAL D'INCIDENTS & PROCÉDURES
> Objectif de ce doc : ne plus jamais reperdre 2-3h à rediagnostiquer les mêmes
> pièges de la plateforme NOAH (trynoah.ai) pendant un hackathon. Chronologique,
> factuel, avec la procédure de résolution testée pour chaque cas.
> Dernière maj : 23/08/2026 — J-3 hackathon NOAH 02.
> Doc complémentaire : [[KIT-NOAH-HACKATHON.md]] — référence "comment la
> plateforme marche vraiment" (sources primaires docs.trynoah.ai), à lire
> avant de redémarrer un projet Noah. Ce doc-ci reste le journal chronologique
> des incidents concrets.

---

## 🗺️ Architecture NOAH — pourquoi les agents sont cloisonnés (comprendre, pas subir)

> Ajouté le 23/08 suite à une veille externe (doc officielle `docs.trynoah.ai` +
> analyse croisée) qui confirme et éclaire plusieurs incidents vécus ci-dessous
> (notamment l'incident où le sous-agent NOAH a répondu texto : « cet assistant
> est spécialisé sur les programmes Solana (lib.rs et sa suite de tests)... pour
> le frontend il faut l'assistant Noah AI principal »).

**Le modèle mental de NOAH** : la doc officielle structure la plateforme en 4
parcours séparés — *Build Web Apps*, *Build Mobile Apps*, *Build Smart Contracts*,
*Build Games* — traités comme des builders indépendants, **pas** comme des
facettes d'un seul projet. Le cloisonnement qu'on a vécu (agent Solana = seulement
Rust/Anchor, ne touche ni back ni front) n'est donc pas un bug ponctuel : c'est
l'architecture voulue de la plateforme. Aucune page doc "connecter son smart
contract à son frontend" n'existe dans leur index — c'est un vrai trou côté NOAH,
pas une erreur de notre part.

**Conséquence concrète déjà vécue** : un agent peut créer son propre repo GitHub
tout seul. Si on utilise l'agent Solana puis l'agent généraliste séparément sans
prévoir la jonction en amont, on se retrouve avec 2 repos déconnectés à réconcilier
à la main — exactement le scénario `i7i2` (mort) vs `6cec` (actif) de ce projet.

### Stratégie recommandée pour la prochaine fois

1. **Créer le repo "chapeau" en premier**, avant de lancer le moindre agent —
   pas après. Un seul repo GitHub dès le départ, avec `/programs` et `/frontend`
   comme dossiers dédiés (c'est déjà notre structure actuelle sur `6cec`, à
   reproduire dès J-0 du prochain hackathon plutôt que de laisser NOAH créer ses
   propres repos et fusionner après coup).
2. **L'IDL Anchor est le point de jonction unique** entre le programme et le
   frontend — jamais laisser l'agent généraliste "deviner" les noms
   d'instructions/comptes. Toujours lui donner l'IDL généré en entrée dès le
   premier prompt frontend. (Rappel projet : `frontend/src/idl/buildpact.json`
   + `frontend/src/lib/anchor.ts` sont exactement ce contrat d'interface —
   c'est la procédure "Tâches immédiates si redéploiement" déjà documentée dans
   le prompt maître CERVEAU PROJET.)
3. **Vérifier le budget crédits AVANT de s'engager** sur un hackathon — si
   chaque agent consomme séparément et qu'on fait tourner 2 projets en
   parallèle (Solana + généraliste), le budget crédits peut doubler. Page à
   lire en premier sur une nouvelle plateforme hackathon : *Plans and Credits*.
4. **Le Discord/Telegram officiel vaut plus que la doc** sur ce type de
   plateforme jeune — la doc a toujours du retard sur le produit réel. Poser la
   question de jonction multi-agents publiquement sert double : réponse
   potentielle + visibilité "power user" auprès de l'équipe NOAH.
5. **`/llms.txt`** (mentionné en haut de la doc NOAH) contient l'index complet
   de la doc dans un format pensé pour être ingéré par un LLM — à récupérer et
   garder en contexte dès le début d'un prochain hackathon NOAH plutôt que de
   redécouvrir la structure de la doc à chaud.

### Phases pour monter en compétence sur NOAH hors période de hackathon

1. **Cartographier les limites** : faire 2-3 projets jetables pour noter
   précisément ce que chaque agent accepte, ses limites de contexte, comment il
   réagit à un fichier ajouté manuellement au repo.
2. **Templates de prompts réutilisables** pour les patterns récurrents (escrow,
   staking, mint NFT, token SPL, connexion wallet, indexation d'événements) —
   ne plus repartir de zéro à chaque hackathon.
3. **Script de sync IDL automatisé** (bash/Node) : récupère l'IDL du repo
   programme, le copie côté frontend, régénère les types TS — transforme la
   jonction manuelle en une commande.
4. **Répétition à blanc** : faire un faux hackathon de 48h en solo avant le
   vrai, pour découvrir les frictions sans pression de deadline.

---

## 🔍 Correction du 23/08 (bis) — sources primaires vérifiées, la théorie "4 agents cloisonnés" est probablement fausse

> Le bloc ci-dessus a été écrit à partir d'une analyse externe. En allant lire
> directement `docs.trynoah.ai` (pages `features/agent-mode.md`,
> `features/plan-mode.md`, `mentions-and-commands/mentions.md`,
> `mentions-and-commands/commands.md`, `tutorial/build-complete-dapp.md`,
> `integrations/github.md`) le 23/08, plusieurs points se corrigent.

**Ce qui change** : NOAH n'a que **deux modes**, pas quatre agents séparés —
**Plan Mode** (réflexion/décision, ne touche jamais au code, 1 crédit par
message) et **Agent Mode** (exécution, tarif à l'usage). Le tutoriel officiel
*"Build A dApp From Scratch"* fait explicitement **web app → programme Solana →
intégration** dans **un seul et même projet**, avec un prompt d'intégration en
une étape à la fin. Les 4 catégories *Build Web/Mobile/Smart Contracts/Games*
sont donc plus probablement des **templates de démarrage** que des agents
cloisonnés à vie sur un projet.

**Conclusion révisée sur l'incident i7i2/6cec** : le split en 2 repos vient
très probablement du fait qu'on a ouvert **2 projets NOAH distincts** (un
"programme", un "app générale") au lieu d'**un seul projet multi-phase** —
et non d'un cloisonnement forcé par la plateforme. Doc GitHub confirmée : **1
projet = 1 repo connecté**, NOAH auto-commit dessus à chaque update dès la
connexion faite (bouton GitHub du projet, ou Settings → Integration → GitHub).

**Donc le "repo chapeau" reste une bonne pratique défensive, mais ne devrait
plus être nécessaire si on reste dans un seul projet NOAH du début à la fin.**

⚠️ **Fiabilité de la doc à relativiser** : les pages `mentions.md`,
`commands.md` et `github.md` contiennent des restes texto de **"Cursor"** et
**"Lovable"** (ex. *"Lovable won't be able to update your project"* dans la
page GitHub) — signe que la doc NOAH est un template repris d'autres produits
et pas entièrement réadapté à la marque. Les mécanismes eux-mêmes (@ mentions,
/ commands, sync GitHub auto-commit) sont probablement réels, mais les détails
UI précis sont à vérifier en live plutôt qu'à prendre pour argent comptant.
Note en passant : le lien "Start Building" du tutoriel pointe vers
`noah.plena.finance` — NOAH semble être un produit de **Plena Finance**.

**Point non vérifié** : je n'ai pas d'outil vidéo/audio ici, donc impossible de
regarder la vidéo d'intégration (`youtube.com/embed/gfW0ZY_0DIg`, tuto partie 3
"Integrating the Solana Program"). C'est la seule vraie inconnue qui reste —
à regarder toi-même et à me redire le prompt exact utilisé, pour verrouiller
le playbook ci-dessous.

**@ Mentions** : trois catégories — Files & Folders, Integrations, Docs (React,
TypeScript, Next.js, Tailwind, Node.js, Python listés — **pas de doc
Anchor/Solana** dans la liste officielle, cohérent avec le fait qu'il vaut
mieux donner l'IDL en mention-fichier directe plutôt que compter sur une doc
Solana intégrée).

**/ Commands** : catégories Brand & Identity, Layout & Structure, Quick Fixes,
Animations & Effects, AI Features, Integrations, Language Features — rien de
spécifique Solana/Anchor non plus, cohérent avec le fait que build/test/deploy
programme sont des capacités d'Agent Mode directement, pas des slash-commands.

### 🎯 Playbook hackathon NOAH (révisé, basé sur sources primaires)

1. **Un seul projet NOAH** pour tout le hackathon — web app + programme +
   intégration dans le même projet, jamais 2 projets séparés à réconcilier.
2. **Connecter GitHub dès le J0**, dans ce projet unique. Ne jamais
   Disconnect/Reconnect une fois connecté ([[Incident 1]] : ça génère des
   repos dupliqués).
3. **Séquence conseillée** (calquée sur le tuto officiel) : Plan Mode pour
   cadrer les écrans/contraintes → approuver le plan → Agent Mode génère le
   front → Agent Mode (même projet) build/test/deploy le programme Anchor sur
   devnet → **télécharger et sauvegarder les clés du programme immédiatement**
   (NOAH ne les stocke pas, aucune 2ᵉ chance) → un dernier prompt d'intégration
   en Agent Mode en @mentionnant l'IDL généré + les fichiers frontend concernés
   pour connecter programme et front en une fois.
4. **Toujours @mentionner** le fichier/dossier précis plutôt que décrire en
   texte libre — réduit les hallucinations de noms d'instructions/comptes.
   Donner l'IDL en mention directe, ne pas compter sur une doc Solana intégrée
   (elle n'existe pas dans la liste officielle des Docs mentions).
5. **/ Commands seulement pour du polish UI** (nav, layout, animations) — pas
   de commande dédiée pour la logique Solana/Anchor.
6. **Plan Mode coûte 1 crédit par message même sans exécution** — cadrer une
   feature complexe avant de lancer Agent Mode dessus, pas brainstormer sans
   limite.
7. **Vérifier après connexion GitHub que c'est le même repo qui reste actif**
   tout du long — renommer/déplacer/supprimer le repo casse le sync (warning
   officiel).
8. Sécurité : clés du programme téléchargées et sauvegardées dès le déploiement,
   jamais committées ([[Incident 7]]).
9. Poser la question "un seul projet peut-il vraiment tout faire (web + program
   + intégration) ?" sur Discord/Telegram dès le J0 du prochain hackathon, pour
   confirmer en live avant de s'engager sur une architecture à 2 repos par
   précaution excessive.

---

## Incident 1 (21-22/08) — Reconnexions GitHub qui créent des doublons

**Symptôme** : chaque clic "Disconnect" puis "Reconnect" du repo GitHub dans les
paramètres NOAH créait un **nouveau repo dupliqué** au lieu de se relier au repo
existant (`i7i2`). 4 doublons périmés générés (`qztt`, `itej`, `u2od`, `5suw`).

**Cause** : bug/comportement de l'intégration GitHub de NOAH — "Disconnect" ne
fait pas ce qu'on croit (couper puis relier au même repo), il fait "abandonner
ce repo" et la reconnexion suivante en fabrique un neuf.

**Résolu par** : suppression manuelle des 4 doublons sur GitHub, contact du
support NOAH pour réparer le lien projet ↔ repo.

**Règle retenue** : ne jamais cliquer "Disconnect" dans l'UI NOAH sans avoir
vérifié au préalable le nom exact du repo actuellement connecté (`GitHub
Settings` dans le panneau NOAH → champ `Repository`).

---

## Incident 2 (22/08 nuit) — Projet NOAH complètement déconnecté, candidature hackathon bloquée

**Symptôme** : le projet NOAH n'affichait plus aucun repo connecté du tout.
Impact grave (pas juste inconfort) : **impossible de soumettre la candidature
au hackathon**, la plateforme de soumission dépend du lien projet ↔ repo actif.

**Diagnostic** : demandé à Noah AI (le chat intégré à la plateforme) de relancer
l'action de reconnexion. Résultat : un nouveau repo a été créé —
`noah-6a84b80564b5bc4377d7dcd3-6cec` — remplaçant `i7i2` (fermé/mort côté NOAH).

**Vérification faite avant de considérer le problème résolu** :
1. Panneau `GitHub Settings` de NOAH → `Repository: Azumizeus/noah-...-6cec`,
   `Branch: origin/main`, statut **"Up to date"**, `Last fetched Now`. → confirmé
   connecté.
2. Cross-check : le commit `fa844dd` (visible dans les marqueurs de conflit de
   l'incident 3 ci-dessous) existe **tel quel** dans l'historique local `i7i2` —
   preuve que `6cec` n'est pas un repo vide reparti de zéro mais bien la
   continuité de `i7i2` (probablement un renommage GitHub, qui redirige
   automatiquement les remotes existants).
3. `grep PROGRAM_ID frontend/src/lib/constants.ts` sur `6cec` → bon Program ID
   confirmé (`9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`).

**Règle retenue** : si NOAH affiche "déconnecté", ne pas paniquer sur le nom du
repo qui va apparaître après reconnexion — ce qui compte est (a) le statut
"Up to date" dans `GitHub Settings`, (b) que le contenu (Program ID, wallet
protocole) soit bien le bon. Un renommage de repo ne casse ni Vercel (suit
l'ID du repo, pas son nom) ni Supabase (aucun lien avec GitHub sauf si
intégration migrations activée — pas notre cas).

---

## Incident 3 (22/08 nuit) — Merge automatique de NOAH AI laisse des marqueurs de conflit Git non résolus

**Le plus grave des trois** : la reconnexion (incident 2) avait déclenché un
`Merge branch 'github/main'` automatique côté NOAH, qui n'a **pas résolu** un
conflit — il a laissé les marqueurs `<<<<<<<` / `=======` / `>>>>>>>` **commités
tels quels** dans `programs/workspace/src/lib.rs`, sur la branche `main` du repo
qui allait être présenté aux juges.

**Pourquoi c'est critique** : `anchor build` plante immédiatement à la
compilation sur le premier marqueur (`error: encountered diff marker`). Un juge
qui clone le repo et compile tombe direct sur une erreur — disqualifiant, bien
pire qu'un simple renommage de repo.

**Piège découvert en cours de diagnostic** : un premier scan par motif regex
(`grep -n "^<<<<<<<\|..."`) sur les marqueurs a renvoyé "aucun résultat" alors
qu'ils étaient bien présents — problème d'échappement des chevrons dans l'outil
de recherche utilisé par Noah AI. **Ne jamais se fier à un grep négatif sur des
marqueurs de conflit** — relire le fichier entier ou lancer la compilation pour
avoir une preuve factuelle.

**Étendue réelle** : 3 blocs de conflit dans `lib.rs` (pas 2 comme cru au
premier passage) :
- lignes 8-16 : déclaration de la constante `PROTOCOL_WALLET`
- lignes 55-58 : `require!(protocol_wallet == PROTOCOL_WALLET, ...)` dans
  `create_project`
- ligne ~561 : variante d'erreur `InvalidProtocolWallet` dans l'enum `ErrorCode`
  (sans elle, le `require!` ci-dessus ne compile même pas)

Les trois formaient un tout cohérent : c'est le fix de sécurité "verrouille
`protocol_wallet` on-chain" (commit `fa844dd`, déjà audité et validé
précédemment — voir doc CERVEAU PROJET section 5, J-2). Le merge foireux avait
recréé le conflit sur un fix pourtant déjà mergé auparavant.

**Piège de contenu** : dans chaque bloc, le côté `HEAD` était **vide**. Ce
n'était pas un choix entre deux implémentations concurrentes, mais entre "garder
le verrou de sécurité" (côté `fa844dd`) et "le supprimer silencieusement" (côté
`HEAD`). Un merge automatique mal géré aurait pu choisir HEAD et rouvrir la
faille (détournement des 2% de frais protocole vers un wallet arbitraire) sans
que ça saute aux yeux dans un diff superficiel.

**Procédure suivie avant validation (ne jamais sauter cette étape)** :
1. Demandé à Noah AI de coller le contenu brut des blocs en conflit, marqueurs
   inclus, sans les résoudre.
2. Vérifié la valeur du wallet du bloc `fa844dd`
   (`AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH`) contre :
   - `PLATFORM_WALLET` dans `frontend/src/components/CreatePactWizard.tsx`
     → match exact.
   - Le `lib.rs` local propre (`i7i2`, sans conflit) → match exact, même code
     déjà en prod avant l'incident.
3. Seulement après ce cross-check → validation de garder `fa844dd`.

**Effet de bord découvert** : la macro `pubkey!()` utilisée dans le fix n'était
pas explicitement importée dans les `use` du fichier — inquiétude soulevée par
Noah AI, non fondée : elle passe bien par `anchor_lang::prelude::*` en Anchor
0.31.1 (confirmé par la compilation propre qui a suivi).

**Résolu par** : Noah AI a supprimé les 3 blocs de marqueurs en gardant le côté
`fa844dd`, recompilé — 0 erreur, 0 warning, `declare_id!` inchangé. Confirmé
qu'aucun marqueur ne subsistait ailleurs dans le repo (pas seulement `lib.rs`).

**Règle retenue** : après toute reconnexion/re-sync NOAH, avant de considérer
le repo sain, chercher explicitement des marqueurs de conflit (`grep -rn
'^<<<<<<<' .` en excluant `node_modules`/`target`) ET lancer une vraie
compilation — jamais l'un sans l'autre.

---

## Incident 4 (22/08 nuit) — Suite de tests périmée par rapport au nouveau contrôle de sécurité

**Symptôme** : après le fix de l'incident 3, 12 tests LiteSVM sur 13 échouaient.

**Cause** : `tests/workspace.ts` générait un `protocolWallet` **aléatoire** à
chaque run et le passait à `create_project` — comportement normal avant le
verrou, mais rejeté par le nouveau `require!`. Les 11 autres échecs n'étaient
qu'une cascade (sans projet créé, rien d'autre ne peut s'exécuter).

**Ce que ça révèle** : le programme faisait exactement son travail ; c'est la
suite de tests qui datait d'avant le fix de sécurité. Piège classique : un
échec de test après un fix de sécu peut être soit une régression, soit — comme
ici — la preuve que le fix marche et que c'est le test qui est obsolète. Il
faut lire l'erreur avant de conclure.

**Résolu par** : wallet de test aligné sur la constante verrouillée +
**ajout d'un test négatif explicite** (un créateur tiers tente de rediriger les
frais vers son propre wallet → doit être rejeté avec `InvalidProtocolWallet`).
Sans ce test négatif, on aurait la preuve que le chemin nominal marche mais
aucune preuve que l'attaque bloquée l'est vraiment. 13/13 tests verts ensuite.

---

## Incident 5 (22/08 nuit) — Outil de déploiement interne de NOAH cassé (bug d'infra, pas de code)

**Symptôme** : le bouton/outil de déploiement de Noah AI échouait 2 fois de
suite avec un message générique laissant croire à des artefacts manquants
(`target/deploy/workspace.so`, IDL, `wallet.json`) — alors que les 3 fichiers
étaient bien présents et listés.

**Cause probable identifiée par Noah AI lui-même** : décalage de chemin entre
l'endroit où le compilateur écrit réellement (`/mnt/target/debug/...`) et
l'endroit où l'outil de déploiement va chercher (`target/` du repo) — bug
d'environnement côté NOAH, hors de portée pour corriger depuis le repo.

**Contournement** : abandon du bouton/outil natif NOAH, déploiement fait
manuellement en ligne de commande depuis un Codespace GitHub (voir incident 6).

**Règle retenue** : si le déploiement natif NOAH échoue 2 fois avec la même
erreur générique malgré des artefacts confirmés présents, ne pas s'acharner —
basculer direct sur CLI manuelle (`solana program deploy`) plutôt que de
perdre du temps à retenter.

---

## Incident 6 (22/08 nuit) — Friction d'environnement Codespace pour le déploiement CLI manuel

Suite de petits pièges rencontrés en cascade en ouvrant un Codespace GitHub sur
le nouveau repo `6cec` pour déployer en CLI. Chacun pris isolément est mineur,
mais l'enchaînement a coûté du temps — à connaître à l'avance la prochaine fois.

1. **`solana: command not found` malgré une installation en cours** — le
   `.devcontainer` du repo installe Solana CLI + Anchor via
   `postCreateCommand` en arrière-plan au premier boot. Le terminal peut être
   utilisable avant que cette installation soit terminée. → **Attendre la fin
   du `postCreateCommand`** (visible dans l'onglet terminal dédié ou la barre
   de statut en bas) avant de lancer quoi que ce soit.

2. **Le binaire existe mais n'est pas dans le `PATH`** — même après
   installation terminée, rien n'était ajouté à `.bashrc`. Fix :
   ```bash
   export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
   echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
   ```

3. **Le `PATH` ne persiste pas dans un nouvel onglet terminal** — ouvrir un
   nouvel onglet bash dans ce Codespace ne re-source pas `.bashrc` (shell non
   interactif ou non connexion). Deux fois retombé sur `command not found`
   après avoir changé d'onglet. → **Rester dans le même terminal du début à la
   fin de la session de déploiement**, et dupliquer l'export dans `~/.profile`
   en plus de `.bashrc` par sécurité.

4. **`No default signer found`** — Codespace tout neuf, aucun keypair
   configuré (`~/.config/solana/id.json` absent). Fix : pointer explicitement
   sur le wallet du repo :
   ```bash
   solana config set --keypair /workspaces/<nom-repo>/wallet.json
   ```

5. **⚠️ Piège de sécurité — RPC par défaut sur `mainnet-beta`** — après avoir
   configuré le keypair, `solana config set` affichait `RPC URL:
   https://api.mainnet-beta.solana.com` comme valeur par défaut. Le flag
   `--url devnet` explicite sur chaque commande masquait le problème, mais un
   oubli de ce flag sur une future commande aurait pu **taper sur mainnet par
   erreur** — violation directe de la règle absolue "devnet uniquement". Fix
   appliqué immédiatement :
   ```bash
   solana config set --url devnet
   ```
   **Règle retenue : sur tout Codespace/environnement neuf, verrouiller le RPC
   devnet au niveau config AVANT de lancer la moindre commande Solana, ne
   jamais compter uniquement sur un flag `--url` répété à la main.**

6. **Piège de l'ancienne autorité archivée** — le repo contient
   `archive/wallets/old_upgrade_authority_20260820.json`. Avant tout
   déploiement, vérifier que `solana address` (wallet actif) correspond bien à
   `Authority` retourné par `solana program show <PROGRAM_ID> --url devnet` —
   **et pas** à cette archive. Ici confirmé match sur
   `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6`. Si ça ne matche pas, le
   déploiement échoue (garde-fou réseau, pas une punition).

7. **`anchor-cli` non installé** — seul Solana CLI est installé par défaut
   dans ce Codespace, pas la CLI Anchor complète. `anchor upgrade` a proposé de
   l'installer à la volée → **refuser** (compilation depuis les sources,
   plusieurs minutes perdues pour rien) et utiliser directement :
   ```bash
   solana program deploy target/deploy/workspace.so \
     --program-id <PROGRAM_ID> --url devnet
   ```
   qui fait un upgrade automatique si le program-id existe déjà et que
   l'autorité correspond — aucun besoin d'Anchor CLI pour un simple upgrade de
   bytecode.

8. **Commande multi-lignes tronquée au copier-coller** — une commande avec des
   retours à la ligne (`\` de continuation) collée dans le terminal Codespace a
   été mal interprétée, exécutant `solana program deploy` seul sans arguments.
   → **Toujours donner les commandes de déploiement sur une seule ligne**,
   sans `\`, pour ce type de terminal.

**Déploiement final réussi** :
```bash
solana program deploy target/deploy/workspace.so \
  --program-id 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ --url devnet
```
Confirmé par `solana program show` : `Last Deployed In Slot` passé de
`486658175` à `486682958`, `Authority` inchangée, même Program ID — upgrade
propre, aucune donnée on-chain existante (Config PDA, projets) perdue.

---

## Incident 7 (22/08 nuit) — Récidive : wallet déployeur + clé du program recommis dans git

**Contexte** : un premier incident du même type (wallet.json + `archive/wallets/`
fuité dans l'historique) avait déjà été purgé et corrigé plus tôt le 22/08 (voir
section 2 du doc CERVEAU PROJET). Ce fut une récidive : le commit `chore:
restaure wallet déployeur pour nouveau program` a **recommis** un `wallet.json`
en clair, et le commit `chore: nouveau program keypair, ancien program fermé` a
commis `target/deploy/workspace-keypair.json` — cette fois **la clé du program
lui-même**, pas juste le wallet déployeur.

**Détection** : repéré en scannant un fichier `wallet-recovered.json` (241
octets) qui traînait sur le Mac local sans qu'on sache d'où il venait. Taille
suspecte (correspond exactement à un tableau `secretKey` Solana de 64 bytes).
Vérification dans le repo :
```bash
git --no-pager log --all --full-history --source -- "*wallet*.json" "*keypair*.json" "id.json"
git --no-pager show --stat <hash>
```
→ a confirmé les deux fichiers exposés et les commits exacts.

**Résolu par** :
1. Backup complet du repo avant réécriture (`cp -r`, puis un `.bundle` séparé
   sur volume chiffré externe).
2. Purge de l'historique local avec `git filter-repo --path wallet.json --path
   target/deploy/workspace-keypair.json --invert-paths --force`. `filter-repo`
   supprime le remote `origin` par sécurité et **remet aussi à jour le
   working tree** (les fichiers disparaissent du disque, pas seulement de
   l'historique) — confirmé vide avec le même `git log --all --full-history`.
3. `.gitignore` renforcé (`wallet.json`, `target/deploy/*.json`,
   `*.keypair.json`, `id.json`, `.env*`).
4. Les 3 copies en clair qui traînaient (backup repo, `wallet-recovered.json`
   Mac, clé du program) déplacées dans 2 images disque chiffrées AES-256
   (Utilitaire de disque macOS), elles-mêmes sur clé USB débranchée —
   originaux supprimés + Corbeille vidée après vérification.

**Non fait volontairement (décision différée, pas un oubli)** :
- **`force-push` sur GitHub pas encore effectué** — repo **privé** (confirmé),
  donc pas d'urgence de scan public/bot. En attente de décision utilisateur
  avant de réécrire l'historique partagé (risque de casser une sync active du
  bot NOAH AI sur `github/main`).
- **Repo `i7i2` jamais vérifié** — même commande de scan à lancer dedans un
  jour (voir checklist ci-dessous), pas bloquant pour le hackathon.
- **Rotation de `wallet.json`** (nouveau wallet déployeur) pas faite — pas
  d'urgence identifiée (repo privé, aucune preuve d'accès externe). Rotation
  du `workspace-keypair.json` (= nouveau Program ID) explicitement **hors de
  question sans validation humaine**, règle absolue du projet.

**Règle retenue** : un `.gitignore` posé une fois ne suffit pas — un fichier
déjà tracké peut être **recommis** par une commande `git add` trop large ou un
"chore: restaure X" bien intentionné qui ignore l'historique du `.gitignore`.
Après toute restauration manuelle de wallet/keypair dans un repo, revérifier
immédiatement `git status` + le `.gitignore` avant le prochain commit. Un
glisser-déposer Finder entre deux volumes différents **copie, ne déplace
pas** — toujours supprimer l'original + vider la Corbeille après avoir
sécurisé une copie ailleurs.

---

## Incident 8 (23/08) — Merge NOAH jamais réellement résolu + Vercel connecté au mauvais repo

**Contexte** : le merge automatique raté du bot NOAH (référencé dans l'incident
3 comme "résolu") laissait en fait des marqueurs de conflit Git
(`<<<<<<< HEAD` / `=======` / `>>>>>>>`) non nettoyés dans **~25+ fichiers**
sur tout le repo `6cec` (pas seulement `lib.rs`) : `App.tsx`, tous les
composants principaux, `lib/*.ts`, `pages/*.tsx`, `package.json`,
`.gitignore`, `ROADMAP.md`, `programs/workspace/src/lib.rs`, etc. Le commit
`main` était donc **non-compilable** ; la prod ne fonctionnait que parce que
Vercel servait un ancien build antérieur au merge cassé.

**Détection** : repéré en creusant le bug du sous-titre invisible (audit
UI/UX du 22/08) — `npm run build` échouait avec des dizaines d'erreurs TS.

**Résolu par** :
1. Deux tentatives de script Python (regex `.*?` + `DOTALL`) ont **supprimé du
   code légitime non conflictuel** dans certains fichiers (ex. `WalletButton.tsx`
   a perdu `type WalletButtonProps`, `truncateAddress()`) — repéré via
   `git diff HEAD` avant tout commit, aucune perte réelle car rien n'était
   encore committé. `git checkout -- .` a tout annulé proprement.
2. Le collage de scripts multi-lignes en heredoc dans le terminal Codespace a
   échoué plusieurs fois de suite (contenu tronqué/mélangé) — **abandon des
   heredocs terminal pour ce genre d'opération**.
3. Solution finale : un **one-liner Perl** (`perl -i -0pe 's/.../gs'`) avec
   lookahead négatif caractère par caractère (`(?:(?!MARQUEUR).)*`) au lieu de
   `.*?` — s'arrête exactement au bon marqueur, gère aussi le cas "section
   vide" sans sur-consommer. Appliqué sur la liste exacte des fichiers
   affectés en une seule commande, sans risque de dépassement.
4. Après résolution : `npm run build` (frontend) et `anchor build`
   (`programs/workspace`) passent tous les deux sans erreur.
5. **Le projet Vercel `buildpact` (domaine `buildpact-hazel.vercel.app`)
   pointait sur l'ancien repo `i7i2` mort**, pas sur `6cec` — aucun des push
   sur `6cec` n'avait donc jamais atteint la prod, quel que soit le contenu.
   Le projet a été supprimé par erreur (`buildpact-hazel.vercel.app`
   n'existe plus, définitivement) avant que ce diagnostic soit confirmé.
6. Nouveau projet Vercel recréé depuis `6cec`, avec **Root Directory =
   `frontend`** (le repo est un monorepo, la racine seule ne contient pas
   l'app Vite) et Build/Output Command explicites (`npm run build` /
   `dist`), plus les variables d'env `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` (récupérées directement via le MCP Supabase, pas
   de fichier `.env.local` dans ce Codespace). Nouvelle adresse prod :
   `buildpact-solana.vercel.app`.

**Règle retenue** : un incident documenté "résolu" doit être **re-vérifié
avant de le croire sur parole** — ici incident 3 affirmait le merge réglé,
c'était faux pour tout sauf `lib.rs`. Pour du texte à supprimer entre deux
marqueurs littéraux exacts, préférer un lookahead négatif caractère par
caractère à un `.*?` non-greedy — plus lent mais ne peut pas dépasser la
borne. Et : **toujours vérifier quel repo un projet Vercel/déploiement a en
source** avant de chercher pourquoi un fix ne s'affiche pas en prod — un
push réussi sur le bon repo ne garantit rien si le déploiement écoute un
autre repo.

---

## ✅ Checklist rapide — si NOAH refait un coup pareil

1. Panneau `GitHub Settings` NOAH → `Repository` + statut ("Up to date" ?
   quel nom de repo exactement ?).
2. `grep -rn '^<<<<<<<' .` (hors `node_modules`/`target`) sur tout le repo
   connecté — pas seulement le fichier qu'on pense concerné.
3. Vraie compilation (`anchor build` ou équivalent) — jamais se fier à un
   grep négatif seul.
4. Si contenu en conflit touchant sécurité/wallet/PDA : demander le contenu
   brut des deux côtés, cross-checker contre le frontend et/ou une copie
   locale connue saine, **avant** de valider un côté.
5. Si déploiement natif NOAH échoue 2× avec la même erreur générique →
   basculer CLI manuelle direct, ne pas insister.
6. Sur environnement de déploiement neuf (Codespace ou autre) : `solana
   config set --url devnet` en premier réflexe, avant toute autre commande.
7. Vérifier `solana address` == `Authority` de `solana program show` avant
   tout déploiement — attention aux wallets archivés dans `archive/`.
8. Ne jamais utiliser `anchor upgrade` si `anchor-cli` n'est pas déjà
   installé sur l'environnement — `solana program deploy` suffit pour un
   upgrade de bytecode.
9. Avant tout commit après une restauration manuelle de wallet/keypair,
   `git status` + vérifier le `.gitignore` — un fichier déjà ignoré peut être
   recommis par un `git add` trop large (vécu : incident 7).
10. Après un `git filter-repo`, penser à re-`git remote add origin <url>`
    avant tout push (le remote est supprimé automatiquement), et vérifier que
    le `git log --all --full-history` sur le(s) fichier(s) purgé(s) est bien
    vide avant de considérer l'historique local propre.
11. **Avant de cliquer le bouton "Deploy" natif de Noah sur un programme déjà
    en prod** : toujours comparer l'adresse du "Deployment Wallet
    (Auto-Generated)" affichée dans la modale à l'`Authority` réelle
    (`solana program show <ID> --url devnet`). Si ça ne correspond pas —
    annuler, ne pas déployer (voir incident 9).

---

## Incident 9 (23/08) — Bouton "Deploy" de Noah génère un wallet de déploiement aléatoire, sans lien avec l'upgrade authority réelle

**Contexte** : après le fix `protocol_wallet` (verrou on-chain contre le
détournement des 2% de frais protocole — voir commit correspondant), tentative
de redéployer le programme `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` via
le bouton **Deploy** de Noah sur le projet "BuildPact Protocol" (type Smart
Contract standalone).

**Symptôme** : la modale "Deploy Contract" affichait bien le bon Program ID
(`9quyDwnt...VoUJ`), mais :
1. Une étape demandait de télécharger un nouveau `keypair.json` ("Download and
   store securely. We don't retain this data on our end.") — pattern identique
   à celui documenté pour un **premier déploiement**, pas un upgrade.
2. Le **"Deployment Wallet (Auto-Generated)"** affiché
   (`3RVaSG7YpP2WE7bm6E9GLKGqHHdqTEuAobdK4uRJmxfS`, 0.0000 SOL, 2.025 SOL
   requis) **n'avait aucun rapport** avec l'`Authority` réelle du programme
   déployé, vérifiée juste avant via `solana program show
   9quyDwnt...VoUJ --url devnet` → `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6`.

**Cause probable** : le bouton "Deploy" de Noah pour un projet type "Smart
Contract" standalone ne distingue pas "premier déploiement" et "upgrade d'un
programme déjà en prod" — il génère systématiquement un nouveau wallet de
déploiement, sans détecter ni réutiliser l'upgrade authority on-chain
existante.

**Risques identifiés si on avait continué** : soit un échec de transaction
propre (le réseau Solana refuse une signature d'un wallet non autorisé à
upgrader — aucune casse possible, juste perte de temps/SOL de faucet), soit —
scénario non vérifié et donc traité comme risque réel — un déploiement sous un
Program ID différent si Noah ignore le champ affiché et se base sur la
nouvelle keypair générée en interne, recréant le scénario i7i2/6cec côté
Program ID cette fois.

**Décision prise** : **annulé, aucun déploiement effectué**. Le fix reste
committé dans `lib.rs` (visible sur GitHub, donc lisible par les juges) mais
inactif on-chain. Justification : le programme actuellement déployé reste
pleinement fonctionnel pour la démo — la faille théorique corrigée (appel
direct du programme hors frontend officiel avec un `protocol_wallet` forgé) ne
touche pas le flux utilisateur normal, donc n'affecte pas ce qui sera jugé.

**Règle retenue** : pour un vrai upgrade de programme existant via Noah,
**vérifier D'ABORD** `solana program show <ID> --url devnet` (champ
`Authority`) avant d'ouvrir la modale Deploy, puis comparer à l'adresse du
"Deployment Wallet (Auto-Generated)". Si elles ne correspondent pas — ne pas
utiliser le bouton Noah ; passer par la CLI locale (`solana program deploy
--program-id <ID> --upgrade-authority <fichier keypair correspondant à
l'Authority réelle>`), à condition d'avoir retrouvé ce fichier quelque part
dans le repo/l'environnement local. Reste à faire, non urgent : localiser la
clé privée correspondant à `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6` si on
veut activer ce fix on-chain après la deadline du hackathon.

---

## Incident 10 (23/08) — Peur de perte de la seed phrase upgrade authority, récupérée via backup git bundle

**Contexte** : suite à l'incident 9, recherche de la clé privée correspondant
à l'upgrade authority `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6`. Deux
images disque (`.dmg`) chiffrées existaient en local, l'une contenant
supposément cette clé. Le mot de passe (généré et enregistré via Proton Pass)
ne fonctionnait pas à l'ouverture ("phrase secrète incorrecte") — cause non
identifiée avec certitude (mauvaise entrée Proton Pass, caractère invisible
copié, ou mot de passe réellement différent de celui utilisé à la création).

**Résolu par** : un troisième fichier de sauvegarde, non chiffré, a été
retrouvé — `~/Documents/BuildPact/buildpact-repo-BACKUP-avant-purge-20260822.bundle`,
un **git bundle** pris avant le nettoyage d'historique (`git filter-repo`,
voir incident 7) qui avait purgé les secrets committés par erreur. Procédure :

1. `git clone <chemin>.bundle buildpact-restore` — extraction complète de
   l'historique, y compris les commits contenant d'anciens secrets.
2. `git log --all --diff-filter=A --name-only | grep -i "keypair\|wallet"` —
   repère les commits ayant ajouté des fichiers de clés (`wallet.json`,
   `target/deploy/workspace-keypair.json`).
3. Les deux fichiers existaient encore à l'état courant du bundle (pas besoin
   de checkout d'un commit précis).
4. Installation de `solana-keygen` en local sur le Mac (absent au départ) via
   l'installeur officiel Anza (`curl -sSfL https://release.anza.xyz/stable/install`),
   puis de `libusb` via Homebrew (dépendance manquante, erreur
   `Library not loaded: libusb-1.0.0.dylib`).
5. `solana-keygen pubkey <fichier>` sur chaque candidat (jamais le contenu du
   fichier lui-même) — confirmation :
   - `wallet.json` → `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6` (l'autorité
     recherchée, match exact).
   - `target/deploy/workspace-keypair.json` → `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`
     (le Program ID lui-même, match exact également).
6. Le fichier `workspace-keypair.json` déjà présent dans le Codespace était
   périmé (`CYmp93D1SzWjwpu62cKAeDBT3mvvQaLhCvBmTf194YSK` — un reste de
   l'ancien programme fermé) : remplacé par la version correcte via
   glisser-déposer dans l'explorateur VS Code du Codespace.

**Statut final** : la clé n'est **pas perdue** — accès rétabli via une source
de sauvegarde différente de celle initialement supposée. Le DMG verrouillé
reste inaccessible mais n'a plus d'importance, une copie fonctionnelle des
deux fichiers nécessaires existe maintenant côté Codespace, prête pour
l'upgrade du fix `protocol_wallet` (incident 9).

**Règle retenue** : garder **plusieurs sauvegardes de nature différente**
(pas seulement 2 DMG chiffrés côte à côte) — ici, un simple `git bundle` non
chiffré pris avant une purge d'historique a servi de filet de secours quand
la sauvegarde "officielle" est devenue inaccessible. Toujours **tester
immédiatement** un mot de passe de sauvegarde chiffrée juste après l'avoir
défini (fermer/rouvrir), plutôt que de découvrir un problème des semaines
après. Pour vérifier une clé sans jamais exposer son contenu :
`solana-keygen pubkey <fichier>` uniquement — jamais coller/afficher le JSON
brut d'un keypair, même partiellement, où que ce soit.
