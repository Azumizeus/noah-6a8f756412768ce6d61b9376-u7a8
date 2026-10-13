# BuildPact — Dossier technique

> Dernière mise à jour : 29 août 2026
> Public visé : développeur qui reprend le code. On y trouve les décisions
> d'architecture et leurs contreparties, pas un catalogue de fonctions.

---

## 0. Design system — thème d'accent

Les couleurs de marque ne sont plus des littéraux. Trois variables CSS
portent la triade d'accent, définies dans `src/index.css` et sélectionnées
par un attribut `data-theme` sur `<html>` :

| Variable | Rôle | Exemples d'usage |
|---|---|---|
| `--accent-violet-rgb` | primaire | navigation active, bordures, CTA |
| `--accent-neon-rgb` | argent | fund, distribute, claim |
| `--accent-gold-rgb` | mise en avant | badges, chiffres clés |

Les **noms sont des rôles, pas des couleurs** : sous la palette `aurum`,
`--accent-violet-rgb` vaut un doré. Les renommer aurait imposé de toucher
chaque classe Tailwind du projet, pour un gain purement cosmétique.

### Le piège à connaître avant de toucher à ça

Les variables contiennent des **canaux RGB séparés** (`153 69 255`), jamais
un hex ni un `rgb(...)` complet. C'est imposé par `tailwind.config.js`, qui
déclare :

```js
"accent-violet": "rgb(var(--accent-violet-rgb) / <alpha-value>)"
```

C'est ce qui permet à `bg-accent-violet/20` de fonctionner. Mettre un hex
dans la variable produirait `rgb(#9945FF / 0.2)` — invalide. Tailwind
n'échouerait pas : la déclaration serait simplement ignorée et l'élément
rendrait **transparent**, sans erreur de build ni avertissement. Une
régression de ce type ne se voit qu'à l'œil, page par page.

Même logique en CSS pur : on écrit `rgb(var(--accent-violet-rgb) / 0.35)`,
jamais `rgba(153, 69, 255, 0.35)` — sinon l'élément reste violet quel que
soit le thème. C'est le cas des orbes de fond, de `grid-bg`, des ombres de
`.card-lift` et des dégradés de boutons, tous convertis.

### Persistance

`src/lib/theme.ts` mémorise le choix sous deux clés : une par wallet et une
globale. La clé globale n'est pas redondante — le thème doit s'appliquer
avant toute connexion (la landing s'affiche sans wallet), sinon chaque
chargement démarrerait sur la palette par défaut puis basculerait, produisant
un flash de couleur visible.

`ThemeProvider` doit être monté **à l'intérieur** du `WalletProvider` : il
lit `useWallet()`. Au-dessus, il plante au rendu.

La synchronisation multi-appareils (colonne `theme_id` sur
`builder_profiles`) n'est pas branchée — voir la feuille de route.

**19/09 — deux axes, pas un seul.** Le système a évolué : `data-theme`
(palette d'accent — `violet`, `cyan`, `aurum`, `atelier`, **`nova`** ajoutée
le 19/09, + `coral` retirée du menu mais toujours valide en base) et
`data-mode` (`dark`/`light`, axe indépendant) se combinent. La liste des
palettes et leurs libellés vivent dans `src/lib/theme/palettes.ts` (module
pur, sans import React) — `src/lib/theme.ts` ne fait que traduire une
palette en triade RGB. Toute palette existe dans DEUX listes séparées :
`ALL_PALETTES` (résout un profil existant, jamais on n'en retire une entrée)
et `PALETTES` (ce que proposent les sélecteurs) — voir le commentaire en
tête de `palettes.ts` pour la raison de cette séparation.

---

## 1. Architecture générale

```
Navigateur (React 19 + Vite)
  ├── @solana/wallet-adapter ──► Programme Anchor (devnet)
  │                              9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ
  │
  └── fetch ──► Edge Functions Deno (Supabase)
                  │  vérifient une signature ed25519
                  │  ou une transaction on-chain
                  └──► Postgres (service_role, RLS contournée)

Lecture directe : navigateur ──► Postgres (clé anon, SELECT public)
```

Le point à retenir : **la lecture est directe, l'écriture ne l'est jamais.**
Le client Supabase du frontend n'a plus aucun droit d'écriture sur les tables
métier.

---

## 2. Le problème central : Postgres ne connaît pas Solana

Toute la complexité backend découle d'un fait unique. Une policy RLS peut
tester `auth.uid()`, mais il n'existe pas de compte Supabase ici — l'identité
est une clé publique Solana. Postgres n'a aucun moyen de vérifier qu'un
appelant contrôle cette clé.

Conséquence : une policy `INSERT with check (true)` sur une table contenant
une colonne `author_wallet` remplie par le client est équivalente à *aucune
authentification du tout*. C'était l'état initial de cinq tables.

Trois réponses possibles, toutes utilisées selon le cas :

| Preuve | Coût pour l'utilisateur | Utilisée pour |
|---|---|---|
| Signature ed25519 unitaire | 1 popup wallet | Actes rares et délibérés |
| Jeton de session signé (24 h) | 1 popup / 24 h | Chat (volume élevé) |
| Vérification de transaction on-chain | 0 popup | Journal d'activité |

La troisième est la plus forte des trois : elle prouve l'**acte**, pas
seulement l'identité. Elle n'est applicable que lorsqu'une transaction existe
déjà, ce qui est précisément le cas du journal.

---

## 3. Format des messages signés

Tous les messages suivent la même forme :

```
BuildPact — <action>
Wallet: <base58>
Projet: <base58>        ← absent pour la révocation, qui est wallet-large
Timestamp: <ms epoch>
```

Ils sont validés côté serveur par des **regex ancrées** (`^…$`), jamais par
`includes`.

C'est load-bearing et ça mérite d'être compris : les formats se ressemblent
beaucoup. Avec une correspondance partielle, une signature obtenue pour une
candidature pourrait être présentée comme une autorisation de modifier les
médias d'un projet. L'ancrage rend les formats mutuellement inacceptables.

**Corollaire pratique :** modifier un de ces libellés côté client — un
espace, un accent, l'ordre des lignes — casse l'action correspondante. Le
symptôme est un « Message de signature invalide » qui ne dit pas lequel des
deux côtés a bougé. Les constructeurs sont centralisés dans
`src/lib/projectWrite.ts` pour limiter le risque.

Fenêtre de fraîcheur : 5 minutes, avec 60 secondes de tolérance pour les
horloges en avance. Sans cette tolérance, un poste légèrement désynchronisé
verrait toutes ses signatures refusées.

---

## 4. Sessions de chat

### Le compromis

Signer chaque message est le comportement sûr. C'est aussi un popup wallet
par message, ce qui rend un chat inutilisable — et le contournement évident
serait de retirer la sécurité, pas d'endurer les popups.

Le wallet signe donc **une fois** un jeton valable 24 h, scopé à **un
projet**, stocké en `localStorage`.

### Ce que ça coûte, explicitement

C'est un *bearer token*. Qui le lit (XSS, extension, poste partagé) peut
publier sous ce wallet jusqu'à expiration. Il n'y a pas d'échappatoire à ça :
c'est la contrepartie exacte du confort gagné. Trois garde-fous bornent le
dégât sans le supprimer :

1. **Scope projet** — un jeton volé ne pollue qu'un chat.
2. **Rate limit** — 10 messages/minute par wallet.
3. **Révocation serveur** — le seul moyen de tuer un jeton déjà sorti.

### Le modèle *cutoff*

`chat_session_revocations` stocke, par wallet, une date : *toute session
signée avant cet instant est refusée*. Pas une liste de jetons révoqués.

Ce n'est pas le premier réflexe, et la raison mérite d'être écrite : pour
blacklister un jeton, il faut le connaître. Or celui qui révoque est sur un
**autre appareil** que celui compromis — il n'a pas le jeton sous la main.
Un cutoff couvre les jetons inconnus, ce qui est exactement le cas d'usage.
Effet de bord bienvenu : une ligne par wallet, la table ne grossit jamais.

Deux détails load-bearing :

- **Tolérance de 60 s sur le cutoff.** Le cutoff est en heure serveur, le
  timestamp de session en heure client. Sans marge, un utilisateur dont la
  pendule retarde re-signe un jeton daté « avant » sa propre révocation :
  rejeté, re-signé, rejeté. Popup en boucle, sans issue possible pour lui.
  Le prix accepté : un jeton volé signé dans la minute précédant la
  révocation y survit.
- **Échec fermé sur la lecture du cutoff.** Si la requête échoue, le message
  est refusé (503). Traiter la panne comme « pas de révocation »
  ressusciterait silencieusement des jetons que l'utilisateur croit morts —
  soit exactement le scénario que le dispositif existe pour fermer.

### Trois niveaux, à ne pas confondre

| Action | Portée | Effet serveur |
|---|---|---|
| `clearChatSession` | 1 projet, ce navigateur | aucun |
| `clearChatSessionsForWallet` | tous projets, ce navigateur | aucun |
| `revokeChatSessions` | tous projets, **tous appareils** | cutoff posé |

La déconnexion du wallet déclenche le niveau 2 (`useChatSessionCleanup`).
Elle **ne peut pas** déclencher le niveau 3 : révoquer exige une signature,
et le wallet vient précisément de se déconnecter. Limite structurelle.

### Le panneau du profil

`ChatSessionsPanel` liste les jetons du navigateur courant. Cette liste
n'est **pas** un inventaire des sessions actives — le serveur ne tient aucun
registre des jetons émis. Une session ouverte sur un téléphone n'y figure
pas.

L'avertissement affiché sous la liste n'est pas décoratif : sans lui,
l'écran se lit comme un inventaire complet et donne un faux sentiment de
sécurité. Le bouton de révocation, lui, agit bien partout — l'écart entre les
deux est la principale source de confusion possible sur cet écran.

---

## 5. Journal d'activité : preuve par la transaction

`logPactEvent` s'exécute juste après une transaction confirmée. Exiger une
signature y ajouterait un **second** popup immédiatement après celui de la
transaction — insupportable en usage réel.

L'Edge Function vérifie donc la transaction elle-même. Quatre conditions,
chacune fermant un abus précis :

1. La transaction existe on-chain → interdit d'inventer une signature.
2. Elle a réussi (`err === null`) → une transaction échouée ne finance rien ;
   la journaliser afficherait un versement qui n'a pas eu lieu.
3. Elle invoque **notre** programme → interdit de recycler un transfert SOL
   quelconque comme preuve.
4. `actor` en est signataire → interdit d'attribuer la transaction d'un
   autre.

Deux protections complètent le dispositif :

- **Contrainte `UNIQUE` sur `tx_sig`** — la vérification prouve qu'une
  transaction a eu lieu, pas qu'elle n'est pas rejouée cinquante fois pour
  gonfler le fil. Le doublon (code `23505`) est traité comme un succès
  idempotent côté fonction.
- **Réessai unique sur `tx_not_found`** (HTTP 409, 2,5 s) — l'appel suit la
  confirmation de près et le nœud RPC interrogé peut avoir une seconde de
  retard d'indexation. Sans réessai, des événements réels disparaîtraient du
  fil pour une simple course entre nœuds. Un refus 403, lui, n'est jamais
  réessayé : il signifie que la transaction ne prouve pas l'événement, ce
  qu'un réessai ne changera pas.

---

## 6. Médias : une signature, pas quatre

`EditMediaModal` peut modifier logo, bannière, vidéo et texte de présentation
en une fois. Si chaque champ déclenchait son propre appel signé, une
sauvegarde coûterait jusqu'à quatre popups d'affilée.

D'où le découpage en deux temps dans `src/lib/media.ts` :

1. `uploadMediaFile()` — pousse le binaire vers le bucket. Aucune signature.
2. `saveProjectMedia()` — écrit tous les champs en **un** appel signé.

L'ordre est délibéré : si l'utilisateur refuse le popup, on laisse un fichier
orphelin dans le bucket (sans coût réel, écrasé au prochain essai) plutôt
qu'une signature consommée pour un enregistrement qui échoue ensuite.

Convention de l'API : **champ absent = inchangé**, **chaîne vide = effacement
explicite**. Le serveur construit la mise à jour par liste blanche de
colonnes — un `upsert` bâti sur l'objet client permettrait d'écrire des
colonnes non prévues.

`saveProjectMedia` est aussi la seule action à vérifier le **founder**
on-chain, en plus de la signature. Une signature prouve l'identité, pas
l'autorisation : sans ce contrôle, n'importe qui signerait son propre message
pour remplacer la bannière d'un projet tiers.

---

## 7. Décodage on-chain sans Anchor

Les Edge Functions tournent en Deno, où Anchor n'est pas disponible. Elles
lisent `Project.creator` en brut :

```
[0..8]   discriminant Anchor  → vérifié avant toute lecture
[8..40]  creator: Pubkey      → premier champ de la struct
```

Le discriminant est contrôlé, donc un compte d'un autre type est bien
rejeté. **Mais un réordonnancement des champs de `Project` dans `lib.rs` ne
l'est pas** : la fonction lirait 32 octets au mauvais endroit, obtiendrait
une pubkey arbitraire, et refuserait toutes les écritures — sans erreur de
compilation, sans log explicite, avec un simple « seul le founder peut… »
adressé au founder légitime.

Si l'ordre des champs doit changer, ces fonctions doivent être mises à jour
dans le même mouvement : `chat-moderate`, `project-write`, `open-roles`.

Cette lecture reste possible parce que `creator` est le **premier** champ.
Un champ plus loin dans la struct ne serait pas à offset fixe : Borsh
sérialise les `String` en `[4 octets de longueur][octets]`, donc tout ce qui
suit une chaîne se décale.

---

## 8. Contraintes du programme

| Constante | Valeur | Pourquoi cette valeur |
|---|---|---|
| `MAX_MEMBERS` | 8 | Chaque membre ajoute un CPI `transfer` dans `distribute` |
| `TOTAL_BPS` | 10 000 | Somme des parts, invariant vérifié on-chain |
| `MAX_PROJECT_ID_LEN` | 20 | Sert de seed PDA — plafond Solana à 32 octets |
| `MAX_TITLE_LEN` | 80 | Après upgrade (40 avant) |
| `MAX_DESC_LEN` | 500 | Après upgrade (280 avant) |
| `MAX_ROLE_LEN` | 32 | Après upgrade (24 avant) |
| `PROTOCOL_FEE_BPS` | 200 | 2 %, wallet destinataire figé on-chain |
| `DUST_TOLERANCE_LAMPORTS` | 1 000 | Permet de fermer un pact distribué à la poussière près |

Deux pièges récurrents :

- **Ce sont des OCTETS UTF-8, pas des caractères.** Un « é » en vaut 2, un
  emoji jusqu'à 4. Un compteur basé sur `String.length` annonce une capacité
  qui n'existe pas, et l'utilisateur découvre le problème au moment de
  signer. Utiliser `utf8ByteLength()` de `src/lib/textSafety.ts`.
- **Le vrai plafond est la taille de transaction**, pas le rent. Une
  transaction Solana est limitée à 1232 octets tout compris. Sur
  `create_project`, il reste de l'ordre de 900 octets utiles. Toute borne
  au-delà de ~800 est de l'espace payé mais physiquement inatteignable.

`src/lib/onchainLimits.ts` reflète ces valeurs côté frontend via le drapeau
`PROGRAM_UPGRADED`. **Ce drapeau est actuellement incohérent avec l'IDL** —
voir `FEUILLE_DE_ROUTE.md`, priorité 1.

---

## 9. Frontend — choix notables

**Routing par hash.** `src/lib/router.ts`, pas de `BrowserRouter`. Permet un
déploiement statique sans règle de réécriture serveur. Contrepartie : les URL
portent un `#`, et le référencement en souffre. Acceptable pour une app
derrière un wallet, à reconsidérer si les fiches publiques deviennent un
canal d'acquisition.

**i18n maison.** `src/lib/i18n/`, FR par défaut. Une dépendance de moins pour
deux langues et un volume de chaînes modeste. Le jour où une troisième langue
arrive avec des règles de pluriel, la question se repose.

**Rotation RPC.** `src/lib/constants.ts` maintient une liste ordonnée
(Helius dédié → Ankr → Solana public) et bascule sur erreur 429. Helius est
en tête parce que c'est un nœud unique : derrière un load balancer, une
transaction peut être envoyée à un nœud qui n'a pas encore vu le blockhash,
d'où les « Blockhash not found » intermittents.

**Deux noms de variable pour le RPC.** `VITE_RPC_ENDPOINT` (canonique) et
`VITE_REACT_APP_SOLANA_RPC_URL` (hérité). Le double lookup existe parce que
seul le second était présent dans `.env` : sans lui, la clé Helius n'était
jamais lue et le front tombait directement sur Ankr.

---

## 10. Configuration et clés

### Variables d'environnement

| Variable | Rôle | Conséquence si absente |
|---|---|---|
| `VITE_SUPABASE_URL` | Projet Supabase | Backend entièrement muet |
| `VITE_SUPABASE_ANON_KEY` | Clé publique | Backend entièrement muet |
| `VITE_RPC_ENDPOINT` *(ou l'ancien nom)* | RPC dédié | Repli sur les RPC publics |

Tout ce qui est préfixé `VITE_` finit dans le bundle et est **public**. La
clé anon l'est par nature — c'est la RLS qui protège les données, pas le
secret de cette clé. Une `service_role` ne doit jamais s'y trouver ; elle est
injectée par Supabase dans l'environnement des Edge Functions.

L'absence des deux premières ne produit **aucune erreur** : `isRemoteEnabled`
passe à `false` et l'application se contente de ne rien remonter. C'est le
mode de panne le plus difficile à diagnostiquer du projet.

### Clés

| Fichier | Contenu | Statut |
|---|---|---|
| `contracts/target/wallet/wallet.json` | Autorité d'upgrade | présent |
| `contracts/target/wallet/id.json` | Copie, nom attendu par Anchor | présent |
| `contracts/target/deploy/workspace-keypair.json` | Keypair du programme | **absent** |

Sur le keypair du programme : il est irrécupérable — une clé privée ne se
déduit pas d'une adresse publique. Il n'est cependant **pas nécessaire**. Il
ne sert qu'au premier déploiement à une adresse donnée, qui a déjà eu lieu.
Les upgrades n'engagent que l'autorité d'upgrade. Le seul scénario bloquant
serait un redéploiement à la même adresse après suppression du programme, ce
qui n'est pas un cas atteignable ici.

`scripts/keys-check.mjs` dérive les pubkeys réelles des keypairs présents et
les compare à l'autorité attendue et au program ID, plutôt que de faire
confiance à un commentaire. Un fichier de keypair n'est qu'un tableau de 64
octets : rien, à le regarder, ne dit à quelle adresse il correspond — d'où le
risque de découvrir l'erreur au moment d'un `anchor upgrade`, c'est-à-dire
trop tard.

> ⚠️ `wallet.json` est une clé privée en clair, versionnée. Acceptable en
> devnet, et seulement là. Avant tout mainnet : régénérer l'autorité, la
> sortir du dépôt, considérer celle-ci comme brûlée.

---

## 11. Diagnostic rapide

| Symptôme | Piste |
|---|---|
| Rien ne charge côté social, aucune erreur | Variables Supabase absentes → `isRemoteEnabled === false` |
| Variable ajoutée mais toujours rien | Vite ne relit `.env` qu'au démarrage — relancer `npm run dev` |
| « Message de signature invalide » | Libellé désynchronisé entre `projectWrite.ts` et la regex serveur |
| Une écriture disparaît sans erreur | Appel direct à `supabase.from(...).insert()` sur une table verrouillée |
| « Seul le founder… » adressé au founder | Décodage on-chain faussé — ordre des champs de `Project` modifié ? |
| `InvalidParameter` (6005) à la signature | Bornes du front supérieures à celles du programme déployé |
| « Blockhash not found » intermittent | RPC derrière load balancer — vérifier que Helius est bien en tête |
| Popup de signature en boucle sur le chat | Horloge locale décalée de plus de 60 s |
