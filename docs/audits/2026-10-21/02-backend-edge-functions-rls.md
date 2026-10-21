# Audit backend — Edge Functions, RLS, Storage, Storage-buckets

**BuildPact** · Date : 21/10/2026 · Mode : **lecture seule** (aucun fichier modifié, aucun appel réseau, aucun `supabase` CLI)

---

## 1. Périmètre

| Élément | Chemin | Nb |
|---|---|---|
| Edge Functions (Deno/TS) | `supabase/functions/*/index.ts` (+ `rpc/allowlist.ts`) | 12 |
| Migrations SQL (RLS, policies, buckets, triggers) | `supabase/migrations/*.sql` | 15 |
| Config Supabase locale | `supabase/config.toml` | 1 |
| Client Supabase (front) | `src/lib/supabaseClient.ts` | 1 |
| Clients d'appels Edge Functions (messages signés, chemins de stockage) | `src/lib/{profileRemote,projectWrite,network,contact,vault,chatSession,pushNotifications,gamification,openRoles,media,updates}.ts` | 11 |

Périmètre **exclu** : programme Anchor (`programs/`, `contracts/`), smart contracts on-chain, frontend React (audité uniquement au travers des points de contact backend : construction des messages signés, rendu des champs libres).

Modèle de menace retenu : la chaîne Solana est la source de vérité pour les parts et les SOL ; Supabase ne stocke que des données d'appoint hors chaîne. La frontière de sécurité centrale est donc **la vérification de signature de wallet dans les Edge Functions** (seul moyen d'écrire), puis les **RLS** pour la lecture, puis le **Storage** pour les médias.

## 2. Méthode

1. Lecture intégrale des 12 Edge Functions (validation d'entrée → vérification → requêtes → logs → réponses d'erreur).
2. Reconstitution de l'état **final** des policies par application chronologique des 15 migrations (les `drop policy` des migrations ultérieures priment sur les créations antérieures).
3. Relecture croisée des constructeurs de messages signés côté client (`src/lib/*`) pour vérifier que le format canonique serveur ↔ client est aligné et que la signature est bien liée à ce qu'elle prétend prouver.
4. Vérification de l'exposition des secrets : `git ls-files`, `git grep`, bundle `dist/`, `.env*`.
5. Relecture des points de sortie (logs, messages d'erreur renvoyés au client) pour la fuite d'information.

**Limites explicites de cet audit** (elles conditionnent la lecture de ce rapport) :

- L'audit est **statique**. Aucun test contre la base Supabase réelle n'a été exécuté : les constats A6 et A7 sont donc des *constats à vérifier en base*, pas des vulnérabilités confirmées.
- Les tables `pact_events`, `project_updates`, `role_interests`, `project_media`, `project_chat_messages`, `network_posts`, `network_post_reactions`, `network_post_comments`, `xp_events` **n'ont pas de `CREATE TABLE` dans le dépôt** (créées via le dashboard Supabase). Le dépôt ne trace que les policies *supprimées*. L'état RLS final de ces tables n'est donc **pas reconstituable à partir des fichiers** — c'est le constat A7, et il impose de lire le catalogue `pg_policies` avant toute affirmation (notamment dans le dossier Colosseum).

---

## 3. Tableau des constats

| # | Sév. | Constat | Fichier:ligne |
|---|---|---|---|
| **A1** | **MAJEUR** | Les messages signés ne portent ni nonce, ni domaine, ni action : une signature capturée est un jeton porteur réutilisable sur plusieurs actions/ressources | `vault/index.ts:43`, `network-write/index.ts:26`, `update-profile/index.ts:46`, `contact/index.ts:33` |
| **A2** | **MAJEUR** | `vault` : une seule signature ouvre l'accès aux documents confidentiels de **tous** les pacts du wallet | `vault/index.ts:43`, `:157-162`, `:240-243` |
| **A3** | **MAJEUR** | `project-write` action `event` : la preuve on-chain ne lie ni le projet, ni le montant, ni le type → forge d'événements « X a financé N SOL » sur n'importe quel projet | `project-write/index.ts:174-204`, `:333-339` |
| **A4** | **MAJEUR** | `push` action `send` : liste de destinataires arbitraire, appartenance au pact jamais vérifiée, URL de notification non validée → push-phishing vers n'importe quel abonné | `push/index.ts:238-307`, `public/push-sw.js:40-56` |
| **A5** | **MAJEUR** | `translate` : le quota quotidien est indexé sur une clé **fournie par le client** → contournement trivial, épuisement de la clé DeepL partagée | `translate/index.ts:137-140`, `:158-163` |
| **A6** | **MAJEUR** | `builder-avatars` / `builder-banners` : l'absence de policy d'écriture n'est **pas garantie par le dépôt** (aucun `drop policy`, contrairement à `project-media`) → défacement d'avatar possible via la clé anon | `20260828103536_codify_builder_and_documents_schema.sql:218-231` |
| **A7** | **MAJEUR** | L'état RLS final de 9 tables n'est pas reconstituable depuis le dépôt (créées hors migrations) → le dossier ne peut pas affirmer l'état réel | `supabase/migrations/*` (absence de `CREATE TABLE`) |
| **B1** | MINEUR | Rate limits indexés sur un wallet auto-déclaré → contournement Sybil ; `network-write` n'a **aucun** plafond sur les URL d'upload | `update-profile/index.ts:163-175`, `network-write/index.ts:322-347` |
| **B2** | MINEUR | `rpc` : quota par IP lue dans `x-forwarded-for` (forgeable) → le relais devient un proxy ouvert vers le nœud dédié | `rpc/index.ts:88`, `:206` |
| **B3** | MINEUR | `assistant-chat` : aucun rate limit ; garde anti-SSRF qui ne bloque pas un nom DNS résolvant vers une IP privée/métadonnées | `assistant-chat/index.ts:67-89`, `:190-219` |
| **B4** | MINEUR | `chat-moderate` action `post` : aucune vérification d'appartenance au pact → écriture dans le chat d'un pact dont on n'est pas membre | `chat-moderate/index.ts:250-306` |
| **B5** | MINEUR | `project-write` actions `update`/`apply` : pas d'appartenance au pact → spam dans le fil d'avancement d'un projet tiers | `project-write/index.ts:360-396`, `:401-428` |
| **B6** | MINEUR | Divulgation systématique du message d'erreur Postgres brut au client (schéma, contraintes) | 10 fonctions, ex. `update-profile/index.ts:320`, `project-write/index.ts:393` |
| **B7** | MINEUR | `contact` action `send` : plafond de 5/min mais **aucun plafond cumulé** → spam d'inbox en masse | `contact/index.ts:143-169` |
| **B8** | MINEUR | `vault` action `upload-url` : ligne `project_documents` insérée **avant** l'upload, sans rate limit → pollution de la table | `vault/index.ts:203-229` |
| **B9** | MINEUR | `VITE_TOKENS_API_KEY` lu côté client, contrairement à la règle du dépôt (« jamais de clé dans le livré ») | `src/components/WalletPanel.tsx:179` |
| **C1** | INFO | `update-profile` : `avatar_url` / `banner_url` acceptés comme URL arbitraire (hotlink / pixel de suivi) | `update-profile/index.ts:103-104` |
| **C2** | INFO | `push` action `subscribe` : `endpoint` non validé (doit être l'URL d'un push service) | `push/index.ts:141-176` |
| **C3** | INFO | Le corps d'erreur tiers (DeepL) est journalisé verbatim dans les logs Edge | `translate/index.ts:200` |
| **C4** | INFO | Aucune politique de rétention sur `translation_cache` (croissance illimitée) | `20260918120000_create_translation_cache.sql:22-26` |
| **C5** | INFO | Le bucket `builder-banners` est utilisé par le code mais n'est déclaré dans aucune migration | `update-profile/index.ts:130`, `:271-291` |
| **C6** | INFO | Clé `anon` codée en dur en repli du bundle — public par conception, mais la RLS devient la seule frontière | `src/lib/supabaseClient.ts:15-17` |

**Totaux : 0 CRITIQUE · 7 MAJEUR · 9 MINEUR · 6 INFO.**

Aucun constat n'implique de prise de contrôle de fonds : **la chaîne n'est jamais écrite par ce backend** (le relais `rpc` ne fait que relayer des transactions signées par le wallet de l'utilisateur, et `project-write`/`quest-write`/`vault` n'écrivent que des lignes hors chaîne).

---

## 4. Détail des constats

### A1 — MAJEUR — Les messages signés ne portent ni nonce, ni domaine, ni action

**Localisation :** `vault/index.ts:43`, `network-write/index.ts:26-28`, `update-profile/index.ts:46`, `contact/index.ts:33`, `push/index.ts:49-60`.

**Description.** Le schéma de preuve de BuildPact est bon sur un point essentiel — le wallet est toujours extrait **du message signé** et jamais du payload — mais le message lui-même est pauvre :

```
BuildPact — accès au vault\nWallet: <wallet>\nTimestamp: <ms>
BuildPact — réseau builders\nWallet: <wallet>\nTimestamp: <ms>
BuildPact — mise à jour de profil\nWallet: <wallet>\nTimestamp: <ms>
BuildPact — contact\nWallet: <wallet>\nTimestamp: <ms>
```

Il manque trois choses :

1. **Un nonce (valeur unique par opération).** Une signature est rejouable pendant toute sa fenêtre de fraîcheur (5 min), et **sans limite d'usage** : la même signature authorize N opérations.
2. **Un binding de domaine/URI.** Le message ne dit pas à quelle application il sert. Un `signMessage` ne montre pas l'origine du site qui le demande : n'importe quel site peut demander à l'utilisateur de signer un texte qui ressemble à un texte BuildPact, et le portefeuille le valide sans jamais voir « buildpact.app ».
3. **Le binding de l'action et des paramètres.** Sur `vault`, `network-write`, `update-profile` et `contact`, le message ne contient ni l'action, ni la ressource, ni les paramètres. La signature prouve « je suis ce wallet », pas « je veux faire **cette** action **sur cette** ressource **avec ces** paramètres ».

**Impact.** Un site malveillant (ou une extension de navigateur compromise, ou un front BuildPact compromis) demande à l'utilisateur de signer un message anodin du format attendu, récupère la signature, et la rejoue à volonté pendant 5 minutes contre toutes les ressources liées à ce wallet (voir A2 pour le pire cas). L'impact n'est pas le vol de fonds — aucun de ces endpoints ne bouge d'argent — mais l'usurpation d'identité de l'utilisateur et l'accès à des données confidentielles.

**Impact concret, endpoint par endpoint** (une seule signature capturée = 5 min de pouvoir) :

| Endpoint | Message signé | Ce que la signature autorise de trop |
|---|---|---|
| `vault` | wallet + timestamp | **L'accès aux documents de tous les pacts du wallet** (A2) — le pire cas |
| `update-profile` | wallet + timestamp | Réécriture du profil de la victime (display_name, bio, liens) + émission d'URL d'upload dans **ses** dossiers de storage (`avatar.${ext}` / `banner.${ext}` — le chemin est wallet-scopé, donc l'impact reste circonscrit à la victime) |
| `network-write` | wallet + timestamp | Publier/commenter/supprimer des posts **au nom de la victime** (le message ne lie ni l'action, ni l'post) + émettre des URL d'upload sans plafond (B1) |
| `contact` | wallet + timestamp | Envoyer des demandes de contact au nom de la victime (5/min, plafond non global) |
| `push` subscribe | wallet + endpoint | S'abonner aux notifications push **de la victime** vers un endpoint contrôlé par l'attaquant → interception de son flux de notifications (C2) |

**Scénario concret.**

```
1. La victime ouvre evil.example, qui demande wallet.connect() puis signMessage.
2. evil.example construit : "BuildPact — accès au vault\nWallet: <victime>\nTimestamp: <now>"
3. La victime signe (le popup affiche un texte qui ressemble à un texte BuildPact).
4. evil.example possède (message, signature) valides pour 5 minutes.
5. Il énumère les PDA de pact où la victime est membre (public on-chain),
   puis appelle vault { action:'list', projectPda: <PDA>, message, signature }
   → reçoit une signed URL (10 min) vers chaque document confidentiel.
```

**Recommandation.** Basculer vers un format de type **SIWE (EIP-4361)** : `domain`, `uri`, `nonce` (serveur), `issued-at`, `statement` (l'action et la ressource), et un magasin de nonces consommés une seule fois côté serveur. Correctif minimal si SIWE est trop lourd (bump du format de message) :

```ts
// vault/index.ts — lier l'action ET la ressource ET un nonce serveur
const VAULT_RE = new RegExp(
  `^BuildPact — vault\nAction: (list|upload-url|review)\nProjet: (${B58})\n` +
  `Document: (\\d+|-\n?)\nWallet: (${B58})\nNonce: ([0-9a-f-]{36})\n` +
  `Domain: buildpact\\.app\nTimestamp: (\\d{10,16})$`
);
// puis : vérifier le nonce (table `auth_nonces`, suppression à la consommation),
// vérifier action/ressource, et ne rejouer JAMAIS une signature déjà consommée.
```

### A2 — MAJEUR — `vault` : une seule signature ouvre tous les vaults du wallet

**Localisation :** `vault/index.ts:43` (regex), `:147-151` (message/signature), `:157-162` (`projectPda` issu du payload), `:240-243` (`isMember`), `:254-273` (émission des signed URLs).

**Description.** Le message signé du vault est `BuildPact — accès au vault\nWallet: X\nTimestamp: T` : il **ne contient pas le projet**. La fonction reçoit `projectPda` dans le payload, le valide syntaxiquement (`WALLET_RE`), puis lit le compte `Project` on-chain et vérifie l'appartenance (`isMember`). Cette vérification est correcte **pour le wallet qui signe** — mais elle est orthogonale à la portée de la signature. Une signature obtenue pour un projet vaut pour **tous** les projets où ce wallet est membre.

**Impact.** Fuite de livrables confidentiels (documents de pact, notes de revue du founder) de **tous** les pacts du wallet, en une seule capture de signature. C'est le pire impact de tout le backend en matière de confidentialité : le vault est explicitement conçu comme « un LIVRABLE CONFIDENTIEL » (en-tête du fichier).

**Preuve de concept (requêtes exactes).**

```bash
# signature capturée : (message, signature) — valide 5 min
curl -X POST "$SUPABASE_URL/functions/v1/vault" -H 'content-type: application/json' -d '{
  "action":"list", "projectPda":"<PDA_DU_PACT_A>",
  "message":"BuildPact — accès au vault\nWallet: <WALLET>\nTimestamp: <T>",
  "signature":[ ...64 octets... ] }'
# → 200, documents[] avec url (signed URL 10 min) + founderNote

# même signature, autre pact où la victime est membre :
curl ... -d '{ "action":"list", "projectPda":"<PDA_DU_PACT_B>", "message":"<même>", "signature":[...] }'
# → 200 : la signature n'est pas liée au projet, elle passe.
```

**Recommandation.** Faire figurer `projectPda` **et** l'action dans le message signé (cf. A1), et vérifier que le `projectPda` signé === celui du payload. Le modèle de `project-write` (UPDATE_RE / MEDIA_RE, `project-write/index.ts:78-86`) et de `open-roles` (`open-roles/index.ts:45-47`) est déjà le bon modèle : le appliquer au vault.

```ts
const VAULT_RE = new RegExp(
  `^BuildPact — accès au vault\nAction: (list|upload-url|review)\nProjet: (${B58})\n` +
  `Wallet: (${B58})\nTimestamp: (\\d{10,16})$`
);
const [, signedAction, signedProject, wallet, tsStr] = parsed;
if (signedProject !== projectPda) return jsonResponse({ error: 'Signature émise pour un autre projet.' }, 400);
if (signedAction !== action)         return jsonResponse({ error: 'Signature émise pour une autre action.' }, 400);
```

### A3 — MAJEUR — `project-write` action `event` : preuve on-chain incomplète → événements financiers forgex

**Localisation :** `project-write/index.ts:174-204` (`verifyEventTx`), `:301-348` (action `event`), `:333-339` (insertion).

**Description.** L'action `event` n'exige pas de signature (choix assumé : pas de second popup), et remplace la preuve par la vérification de la transaction on-chain. La vérification est **réellement plus forte qu'une signature sur l'identité**, mais elle ne prouve que quatre choses :

1. la transaction existe on-chain ;
2. elle a réussi (`meta.err === null`) ;
3. elle invoque le programme BuildPact ;
4. `actor` est signataire.

Ce qu'elle **ne prouve pas** :

- que la transaction concerne **le projet** `project_pda` transmis dans le payload ;
- que l'instruction invoquée est bien celle qui correspond à `kind` (`fund` / `approve` / `finalize` / …) ;
- que `amount_sol` (valeur **entièrement client**) est le montant réellement transféré.

Or ces trois valeurs (`project_pda`, `kind`, `amount_sol`) sont **prises du payload et écrites telles quelles** (`:333-339`). La contrainte `UNIQUE (tx_sig)` (migration `20260828180000_close_public_write_policies.sql:43-44`) empêche seulement le doublon de la *même* transaction ; elle n'empêche pas d'utiliser une transaction quelconque pour fabriquer **un** événement au choix.

**Impact.** Intégrité de la donnée financière **affichée** : le fil d'activité d'un projet peut afficher « X a financé 40 SOL » alors qu'aucun SOL n'a bougé. Le backend ne touche pas l'argent, mais il fabrique une représentation fausse de l'état financier d'un pact, visible publiquement (lecture publique de `pact_events`). C'est exactement le type de donnée sur lequel se fondent un jury ou un investisseur. La documentation du fichier (`:30-38`) affirme « on prouve l'acte, pas seulement l'identité » — l'affirmation est aujourd'hui trop forte par rapport au code.

**Preuve de concept.**

```
1. L'attaquant exécute sur devnet une transaction BuildPact de son choix
   (ex. createProject, ou n'importe quelle instruction du programme) —
   il est signataire, la transaction réussit, elle invoque PROGRAM_ID.
2. POST /functions/v1/project-write
   { "action":"event", "kind":"fund", "actor":"<attaquant>",
     "amountSol": 9999, "projectPda":"<PDA_D_UN_PACT_TIERS>",
     "txSig":"<sig de la tx du point 1>" }
3. verifyEventTx() renvoie null (4 conditions respectées) → INSERT accepté.
4. Le fil du pact tiers affiche "… a financé 9999 SOL".
```

**Recommandation.** Parser la transaction et **dériver** `kind`, `amount_sol` et `project_pda` de l'instruction réellement exécutée, au lieu de faire confiance au payload. Concrètement : décoder les instructions Anchor du programme (discriminant + args) de `tx.transaction.message.instructions` / `innerInstructions`, puis :

```ts
// après verifyEventTx() : extraire l'instruction BuildPact de la tx
const ev = parseBuildPactInstruction(tx); // { kind, amountSol, projectPda, actor } | null
if (!ev) return jsonResponse({ error: 'Événement non reconnu dans la transaction.' }, 403);
if (ev.projectPda !== projectPda) return jsonResponse({ error: 'Événement pour un autre projet.' }, 400);
if (ev.kind !== kind)           return jsonResponse({ error: 'Type d\'événement incohérent.' }, 400);
if (ev.amountSol !== amountSol) return jsonResponse({ error: 'Montant incohérent avec la transaction.' }, 400);
```

À défaut d'un parseur complet, **rejeter** `amount_sol` issu du client (le mettre à `null` et laisser la chaîne l'afficher) et valider au minimum que `kind` correspond à l'instruction appelée.

### A4 — MAJEUR — `push` action `send` : push-phishing vers n'importe quel abonné

**Localisation :** `push/index.ts:238-307` (action `send`), `:271-272` (liste de destinataires), `:274-279` (requête `.in('wallet', targets)`), `:292` (payload de notification) ; `public/push-sw.js:40-56` (ouverture de l'URL).

**Description.** Le message signé lie `actor`, `pact` et `type` — mais **pas la liste des destinataires, ni le titre, ni le corps, ni l'URL**. Le serveur ne vérifie :

- **ni** que l'acteur est membre du pact mentionné ;
- **ni** que `projectPda` désigne un pact réel ;
- **ni** que `wallets` correspond aux membres de ce pact ;
- **ni** que `wallets` est borné (aucune limite de taille de tableau) ;
- **ni** que `url` est une URL interne à l'application.

Le service worker (`public/push-sw.js:44-55`) fait `client.navigate(targetUrl)` / `openWindow(targetUrl)` sur l'URL **fournie par l'expéditeur**. Un `url` externe (phishing) fait donc ouvrir la notification un site tiers, en takeoff sur l'onglet BuildPact déjà ouvert.

L'en-tête du fichier (`:16-21`) annonce une limite « assumée (v1) » : « un wallet pourrait déclencher un faux push pour un pact dont il est membre ». **Le code est en réalité plus large que la limite documentée** : le wallet déclenche un push vers *n'importe quel* wallet abonné, pas seulement les membres d'un pact dont il est membre.

**Impact.** Push-phishing ciblé : l'attaquant choisit le titre (« BuildPact — action requise »), le corps (« votre wallet a été compromis, connectez-vous pour sécuriser vos fonds ») et l'URL (page de phishing qui imite la connexion wallet). La notification s'affiche avec l'icône BuildPact etbenefie de la confiance déjà établie par les notifications légitimes. C'est le vecteur le plus directe vers le vol de fonds par le wallet lui-même (la phishing wallet connect qui suit ne demande qu'un clic). En prime : envoi massif (tableau `wallets` non borné) → coût Edge +aturation des carnets de notifications.

**Preuve de concept.**

```
POST /functions/v1/push
{
 "action":"send", "actorWallet":"<attaquant>", "projectPda":"<PDA_quelconque>",
 "type":"approvals", "wallets":["<cible1>","<cible2>", ...],
 "title":"BuildPact — action requise",
 "body":"Votre wallet a été compromis. Cliquez pour sécuriser vos fonds.",
 "url":"https://evil.example/connect",
 "message":"BuildPact — notification push\nWallet: <attaquant>\nPact: <PDA_quelconque>\nType: approvals\nTimestamp: <T>",
 "signature":[...]
}
→ 200, sent:N  (aucune vérification d'appartenance au pact)
```

**Recommandation.**

1. Borner `wallets` (ex. 50 max) et vérifier que chaque destinataire est **effectivement membre du pact** (le compte `Project` on-chain contient `members[]` — le même décodeur que `vault/index.ts:101-104`).
2. Rejeter `url` qui n'est pas une URL interne (`/...` ou même origine de l'app) — ou l'ignorer et reconstruire l'URL côté serveur à partir du pact.
3. Signer la liste des destinataires (ou un hash de celle-ci) dans le message.
4. Ajouter un plafond d'envois par wallet par minute.

### A5 — MAJEUR — `translate` : quota contournable → épuisement de la clé DeepL partagée

**Localisation :** `translate/index.ts:137-140` (clé de quota), `:143-163` (contrôle), `:186-196` (appel DeepL), `:235-248` (incrément).

**Description.** Le quota quotidien (8 000 caractères) est indexé sur `usage_key`, calculé ainsi :

```ts
const usageKey =
  body.wallet?.trim() ||                       // ← fourni par le client, NON authentifié
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  'unknown';
```

`body.wallet` est une chaîne libre : l'appelant la change à chaque requête et repart sur un compteur virginial. Le repli `x-forwarded-for` est également forgeable (en-tête de requête). Le plafond n'est donc contournable qu'en changeant une chaîne dans le JSON.

**Impact.** La clé DeepL est **partagée par toute l'application** (500 000 caractères/mois sur le palier gratuit, cf. en-tête `:20-28`). Un script loopant la fonction épuise le quota en quelques minutes ; au-delà, DeepL refuse (503 à toute l'app) ou bascule sur un palier payant. S'y ajoute le coût des invocations Edge Functions (non facturables au palier gratuit au-delà d'un certain volume). Le commentaire du fichier reconnaît « best-effort », mais le contournement ne demande **aucune** usurpation d'IP ni de wallet : c'est une chaîne JSON.

**Preuve de concept.**

```bash
for i in $(seq 1 500); do
  curl -s -X POST "$SUPABASE_URL/functions/v1/translate" -H 'content-type: application/json' \
    -d "{\"text\":\"$(head -c 1900 /dev/urandom | base64 | head -c 1900)\",\"targetLang\":\"en\",\"wallet\":\"w$i\"}" \
    -o /dev/null &
done
# chaque requête part sur un compteur « w1 », « w2 », … → quota jamais atteint
```

**Recommandation.** Ne jamais accepter une clé d'identité non authentifiée comme clé de quota. Options, par ordre de préférence :

1. **Exiger une signature wallet** sur l'appel de traduction (même schéma que les autres Edge Functions) → la clé de quota devient le wallet **prouvé**. Coût : un popup par traduction, inacceptable en UX → donc à combiner avec un jeton de session court (cf. le modèle `chat-moderate`).
2. **Quota par IP de.edge** (en-tête `x-forwarded-for` réel, non spoofable côté edge runtime si on lit l'IP source de la plateforme) + quota global quotidien sur la fonction (compteur partagé, pas par clé).
3. **Plafond global dur** sur la fonction : un compteur de caractères consommés par jour, toutes requêtes confondues, qui refuse au-delà d'un seuil — indépendant de l'identité.

```ts
// garde-fou global, non contournable par le client
const { data: global } = await supabase.from('translation_usage')
  .select('chars_used').eq('usage_key', 'GLOBAL').eq('usage_day', today).maybeSingle();
if ((global?.chars_used ?? 0) + text.length > GLOBAL_DAILY_LIMIT) {
  return json({ error: 'Service de traduction temporairement indisponible.' }, 429);
}
```

### A6 — MAJEUR (à vérifier en base) — `builder-avatars` / `builder-banners` : fermeture d'écriture non garantie

**Localisation :** `20260828103536_codify_builder_and_documents_schema.sql:218-231` ; `20260828190000_close_project_media_storage_write_policies.sql:34-39` (contraste) ; `update-profile/index.ts:125-131`, `:248-291`.

**Description.** La migration de schéma crée le bucket `builder-avatars` en `public = true` et affirme : « Aucune policy storage sur ces buckets : l'upload passe toujours par une signed upload URL émise côté serveur ». **Mais elle ne supprime aucune policy existante.** Or la migration `20260828190000` a dû faire exactement cela pour `project-media` :

```sql
drop policy if exists "project_media_storage_public_insert" on storage.objects;
drop policy if exists "project_media_storage_public_update" on storage.objects;
```

Le commentaire de cette migration explique que ces policies **existaient** (« n'importe qui pouvait écraser `<pda>/logo.png` … chemin déterministe + clé anon ») et qu'elles ont été créées à la main via le dashboard Supabase. Le même mécanisme de création manuelle a servi pour `builder-avatars` et `builder-banners` — et pour ces deux-là, **aucun `drop policy` n'a jamais été écrit**. L'affirmation « aucune policy » est un commentaire, pas une garantie.

**Impact (si une policy d'écriture existe sur `builder-avatars`)** : le chemin est déterministe (`${wallet}/avatar.${ext}`, `update-profile/index.ts:258`) et la clé `anon` est publique dans le bundle (`src/lib/supabaseClient.ts:15-17`). Un attaquant peut alors **écraser l'avatar de n'importe quel builder** — ou, pire, déposer un fichier à un chemin arbitraire du bucket. C'est de laoustruction d'identité visuelle sur la page publique d'un profil, en une requête.

**Vérification à exécuter en base (lecture seule).**

```sql
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (qual like '%builder-avatars%' or qual like '%builder-banners%'
        or with_check like '%builder-avatars%' or with_check like '%builder-banners%');

select id, name, public from storage.buckets
 where id in ('builder-avatars','builder-banners','project-media','network-media','project-documents');
```

**Recommandation.** Écrire une migration explicite (et non un commentaire) qui ferme l'écriture sur ces buckets, exactement comme pour `project-media` :

```sql
drop policy if exists "builder_avatars_storage_public_insert" on storage.objects;
drop policy if exists "builder_avatars_storage_public_update" on storage.objects;
drop policy if exists "builder_avatars_storage_public_delete" on storage.objects;
-- idem pour builder-banners, et vérifier qu'aucune policy ne subsiste
-- pour project-media / network-media / project-documents.
```

Et **créer** le bucket `builder-banners` dans le dépôt (constat C5) pour que l'écart de versionnage disparaisse.

### A7 — MAJEUR (process) — L'état RLS final de 9 tables n'est pas reconstituable depuis le dépôt

**Localisation :** `supabase/migrations/*` — aucune migration ne contient de `CREATE TABLE` pour `pact_events`, `project_updates`, `role_interests`, `project_media`, `project_chat_messages`, `network_posts`, `network_post_reactions`, `network_post_comments`, `xp_events`.

**Description.** Ces tables ont été créées via le dashboard Supabase. Le dépôt ne trace que les policies **supprimées** (`drop policy`) et les tables **créées** par migration. Conséquence directe : la méthode « reconstituer l'état final des policies » est inapplicable pour ces 9 tables. En l'état, on ne peut pas affirmer dans un dossier que, par exemple, `xp_events` n'a pas de policy d'INSERT (une telle policy laisserait auto-créditer l'XP et fausser le classement), ni que `role_interests` est en lecture restreinte (le tableau de `RESUME_PROJET.md:196-207` dit « restreinte », la migration ne le dit pas, et le tableau dit aussi `builder_ratings`/`project_documents` « publiques » alors que la migration les ferme explicitement — **le document et le dépôt se contredisent**).

**Impact.** Le modèle de sécurité du projet repose sur « aucune table n'accepte d'écriture publique ». Cette propriété n'est **pas démontrable** à partir du dépôt pour 9 tables sur 18. Pour un dossier de concours (Colosseum), c'est le point faible le plus visible : la revueiera poser la question, et la réponse sera « l'état n'est pas dans le dépôt ».

**Recommandation.** Écrire une migration de **codification** idempotente (le modèle existe déjà : `20260828103536_codify_builder_and_documents_schema.sql`) qui crée chaque table manquante avec `if not exists`, active le RLS, et **drop explicitement** les policies d'écriture résiduelles par nom. Puis joindre au dossier un relevé `pg_policies` horodaté (SELECT seul) qui serve de preuve d'état.

```sql
-- gabarit pour les tables sans DDL dans le dépôt
do $$ begin
  if not exists (select 1 from pg_class where relname='xp_events') then
    create table public.xp_events (
      id bigserial primary key, wallet text not null,
      source text not null, amount integer not null,
      created_at timestamptz not null default now());
  end if;
end $$;
alter table public.xp_events enable row level security;
-- aucune policy d'écriture : l'INSERT passe par quest-write / project-write (service_role)
```

### B1 — MINEUR — Rate limits indexés sur une identité auto-déclarée (contournement Sybil)

**Localisation :** `update-profile/index.ts:163-175` (compteur mémoire par wallet), `network-write/index.ts:189-196`, `:273-279` (comptes DB par `author_wallet`), `network-write/index.ts:322-347` (**aucun** plafond sur `post-media-upload-url`), `contact/index.ts:143-156`, `chat-moderate/index.ts:308-324`.

Tous ces plafonds sont indexés sur le wallet — une identité que l'attaquant **génère lui-même** (un keypair ed25519 gratuit) et qui ne coûte rien à multiplier. Un attaquant peut donc contourner chaque plafond en changeant de wallet, et il n'a même pas besoin d'un portefeuille : il signe lui-même avec la clé qu'il a générée. `network-write` est le pire cas : l'action `post-media-upload-url` (`:322-347`) émet une signed upload URL de 5 Mo **sans aucun contrôle de débit** → le bucket `network-media` est remplissable avec un seul wallet.

**Recommandation.** Ajouter un plafond **global par fonction** (compteur partagé par instance, ou table de compteurs) en plus du plafond par wallet, et plafonner `post-media-upload-url` (5 uploads/min par wallet + plafond global). Un plafond par IP d'edge est complémentaire, pas suffisant.

### B2 — MINEUR — `rpc` : quota par IP forgeable via `x-forwarded-for`

**Localisation :** `rpc/index.ts:88` (900 req/min/IP), `:206` (`req.headers.get('x-forwarded-for')`).

L'IP de comptage est lue dans un en-tête **fourni par le client**. Il suffit d'envoyer `x-forwarded-for: <random>` à chaque requête pour obtenir un compteur neuf. Le relais devient alors un proxy ouvert vers le nœud dédié Helius (clé dans l'URL du secret serveur) et vers le devnet public — coût Helius à la charge du projet, et méthode `sendTransaction` autorisée dans la liste blanche (`allowlist.ts:69`), donc un tiers peut pousser des transactions via le relais (sur devnet, sans conséquence financière réelle).

La conception du relais est par ailleurs **bonne** (liste blanche de méthodes, plafond 64 Kio, plafond de 20 requêtes par lot, échec fermé) et l'origine du nœud n'est jamais loggée (`origine()`, `rpc/index.ts:113-119`) — c'est bien la *clé* d'IP qu'il faut remplacer.

**Recommandation.** Compter sur l'IP source réelle de l'invocateur (fournie par le runtime edge, pas par un en-tête client), ou mieux : combiner IP + quota global par instance, et mettre `sendTransaction` derrière un contrôle supplémentaire (ou le retirer de la liste blanche hors devnet).

### B3 — MINEUR — `assistant-chat` : pas de rate limit + garde anti-SSRF incomplète

**Localisation :** `assistant-chat/index.ts:67-89` (garde `baseUrlError`), `:190-219` (handler sans quota).

La garde bloque `http://`, les identifiants dans l'URL, `localhost`, `.local`, `.internal` et les IP **littérales** (v4 et v6). Elle **ne bloque pas** un nom DNS public qui résout vers `169.254.169.254` (métadonnées cloud) ou `10.0.0.0/8` : le garde est donc contournable par un enregistrement DNS que l'attaquant contrôle (`baseUrl = https://evil.example` → A → `169.254.169.254`). L'en-tête du fichier (`:61-65`) le reconnaît et argues que le runtime Edge n'a pas accès au réseau interne — ce qui est vrai pour le *réseau du projet*, mais pas une protection du garde lui-même. Par ailleurs la fonction n'a **aucun** rate limit : chaque appel est une invocation Edge facturée, sans clé de projet utilisée (BYOK) — l'impact est donc sur la facture d'invocations, pas sur une clé de fournisseur.

**Recommandation.** Résoudre le nom d'hôte côté serveur et vérifier que l'IP obtenue n'est ni privée, ni de loopback, ni dans `169.254.0.0/16` (ou `fetch` avec `redirect: 'error'` + resolution manuelle). Ajouter un plafond global d'invocations par minute.

### B4 — MINEUR — `chat-moderate` action `post` : pas de contrôle d'appartenance au pact

**Localisation :** `chat-moderate/index.ts:250-306`.

La session signée est **bien** scopée au projet (`SESSION_RE`, `:41-43`, vérifié `:261-266`) et la revocation serveur est en place avec échec fermé (`:279-291`, `fetchRevocationCutoff`). En revanche, la fonction vérifie que le projet **existe** on-chain (`:300-306`) mais **pas** que l'auteur est membre du pact. Un wallet qui ne fait pas partie du pact peut donc signer une session pour ce pact et y publier des messages (10/min).

C'est cohérent avec le modèle MVP documenté (migration `20260828110330_close_project_chat_delete_policy.sql:23-28` : « n'importe quel visiteur peut lire, tout wallet connecté peut écrire »), et le chat est de surcroît lisible publiquement — l'impact réel se limite au spam dans un espace public. D'où **MINEUR** et non MAJEUR.

**Recommandation.** Vérifier l'appartenance via `project.members[]` on-chain (même décodeur que `vault/index.ts:101-104`) et n'ouvrir l'INSERT qu'aux membres ; à défaut, mentionner explicitement le modèle dans le dossier.

### B5 — MINEUR — `project-write` `update` / `apply` : pas d'appartenance au pact

**Localisation :** `project-write/index.ts:360-396` (update), `:401-428` (apply).

La signature prouve l'identité de l'auteur (correct, `author_wallet` vient du message signé, `:385-390`), mais rien ne vérifie que ce wallet est membre du projet ni même qu'un pact existe. Un tiers peut donc publier des « mises à jour d'avancement » et des candidatures sur n'importe quel PDA de projet. L'identité affichée est authentique (c'est déjà mieux que le modèle ouvert précédent), mais l'intrusion dans le fil d'un projet tiers reste possible.

**Recommandation.** Même correctif que B4 : vérifier `project.creator`/`project.members[]` on-chain avant d'écrire dans `project_updates` et `role_interests`.

### B6 — MINEUR — Divulgation des messages d'erreur Postgres au client

**Localisation :** `update-profile/index.ts:313-321` (assumé et documenté), `project-write/index.ts:345`, `:393`, `:425`, `:587`, `quest-write/index.ts:206`, `:224`, `contact/index.ts:167`, `:193`, `push/index.ts:175`, `:201`, `:233`, `:280`, `vault/index.ts:229`, `:250`, `:306`, `chat-moderate/index.ts:339`, `:240`.

Le message d'erreur brut de PostgREST est renvoyé au client dans **toutes** les fonctions d'écriture. Il révèle noms de tables, colonnes et contraintes (`violates check constraint "project_pda_format_chk"`), ce qui facilite le ciblage d'autres attaques (injection, exploitation de contraintes). Le cas `update-profile` est explicitement assumé (« Devnet/MVP »), mais la pratique est généralisée à l'ensemble du backend.

**Recommandation.** Journaliser le détail côté serveur (`console.error`) et renvoyer un message générique au client ; l'UI n'a pas besoin du nom de la contrainte.

### B7 — MINEUR — `contact` action `send` : plafond de débit mais pas de plafond cumulé

**Localisation :** `contact/index.ts:143-169`.

5 demandes/minute par wallet expéditeur, mais **aucun plafond total** sur le nombre de demandes reçues par destinataire, et aucun plafond global. Un attaquant sybil (B1) peut remplir la boîte de réception de n'importe quel builder.

**Recommandation.** Plafonner le nombre de demandes *reçues* par destinataire (ex. 100/jour) et ajouter un plafond global.

### B8 — MINEUR — `vault` : ligne `project_documents` insérée avant l'upload, sans rate limit

**Localisation :** `vault/index.ts:203-229`.

La ligne est insérée avant que le fichier ne soit effectivement déposé ; un upload abandonné laisse une ligne `pending` orpheline. Sans plafond de débit, un membre peut créer autant de lignes `pending` que voulu par signature.

**Recommandation.** Insérer la ligne après confirmation de l'upload (via une action `commit` distincte), ou nettoyer les lignes `pending` dépassant un délai.

### B9 — MINEUR — `VITE_TOKENS_API_KEY` lu côté client

**Localisation :** `src/components/WalletPanel.tsx:179-182`, `src/lib/token-registry.ts:14-19`.

Le dépôt a une règle explicite (« jamais de clé dans le livré ») et le relais RPC existe précisément pour la respecter. Mais `WalletPanel` lit `import.meta.env.VITE_TOKENS_API_KEY` : si la variable est posée dans l'environnement de build de production, Vite **l'inline dans le bundle** (le bundle actuel n'en contient pas — vérifié, `dist/` est propre — mais la conception l'autorise). L'impact est faible (clé d'API de lecture seule d'un registre de tokens), la contradiction avec la règle du dépôt est le vrai sujet.

**Recommandation.** Ne pas lire de `VITE_*` sensible côté client : router l'appel via une Edge Function (comme le RPC) ou assumer explicitement que cette clé est publique.

### C1 à C6 — INFO

- **C1** `update-profile/index.ts:103-104` : `avatar_url`/`banner_url` acceptés comme chaînes de 500 caractères sans contrôle de protocole ni d'origine → hotlink vers un pixel de suivi. Correction : n'accepter que les URL du bucket `builder-avatars`/`builder-banners` ou une origine autorisé.
- **C2** `push/index.ts:141-176` : `endpoint` n'est pas validé (un `endpoint` HTTPS arbitraire est accepté) → si l'utilisateur est trompé (A1), l'attaquant peut s'abonner à **ses propres** notifications push. Correction : valider `https://` + liste d'origines de push services connus.
- **C3** `translate/index.ts:200` : le corps d'erreur de DeepL est journalisé verbatim. Aucun secret n'est journalisé ailleurs (vérifié sur les 12 fonctions), mais la règle « jamais de valeur de fournisseur dans les logs » mérite d'être appliquée par convention.
- **C4** `20260918120000_create_translation_cache.sql:22-26` : aucune rétention sur `translation_cache` ; la table grossit d'une ligne par (message × langue).
- **C5** `update-profile/index.ts:130` : le bucket `builder-banners` est utilisé mais n'est créé dans aucune migration → écart entre le code et l'état versionné (couvert par A6).
- **C6** `src/lib/supabaseClient.ts:15-17` : la clé `anon` est en dur en repli (payload JWT relu : `role: anon`, expiration 2100). C'est **public par conception** — mais cela signifie que la clé ne peut jamais être changée sans modifier le code, et qu'elle est dans chaque bundle. À garder en tête : c'est la RLS qui protège, pas la clé.

---

## 5. Ce qui est correct (à valoriser dans le dossier Colosseum)

Ces points sont solides et doivent être mis en avant : ils sont le fruit d'un travail de durcissement réel et mesurable.

**5.1 La vérification de signature est fail-closed partout, sans exception**
Les 12 fonctions qui écrivent utilisent le même schéma : `nacl.sign.detached.verify` sous `try/catch` avec `verified = false` par défaut, puis refus explicite. Aucun chemin ne « suppose » la validité, aucun `catch` ne laisse passer. Les erreurs de vérification structurelle (`bs58.decode` sur une chaîne invalide, signature de mauvaise longueur) sont refusées, pas tolérées (`vault/index.ts:66-82`, `project-write/index.ts:112-123`, `network-write/index.ts:50-61`, `quest-write/index.ts:66-77`, `push/index.ts:69-80`, `update-profile/index.ts:216-228`, `contact/index.ts:50-75`, `open-roles/index.ts:63-88`).

**5.2 Le wallet vient toujours du message signé, jamais du payload**
C'est le point le plus important du modèle et il est appliqué partout : `parsedMsg` → `wallet`, et le payload n'est jamais utilisé pour l'identité (`update-profile/index.ts:194-204`, `project-write/index.ts:363`, `network-write/index.ts:167`, `contact/index.ts:122-124`, `vault/index.ts:149-151`). Un `wallet: "victime"` dans le JSON ne prouve rien et est ignoré.

**5.3 Les formats de message sont ancrés (`^…$`) et mutuellement exclusifs**
Aucune vérification par `includes`. Les 16 formats de message signés (profil, projet update/apply/media, quête, réseau, rôles, contact, vault, push ×4, chat ×3) sont **tous** distincts : une signature obtenue pour une action n'est **pas** rejouable sur une autre action d'une autre fonction. C'est le piège classique, et il est évité.

**5.4 La fraîcheur du timestamp est vérifiée partout**
Fenêtre de 5 minutes + tolérance de 60 s d'écart d'horloge, avec refus explicite (« Signature expirée »). Le rejeu hors fenêtre est impossible.

**5.5 Les signatures sont liées à la ressource quand c'est pertinent**
`project-write` (`UPDATE_RE`, `APPLY_RE`, `MEDIA_RE` : wallet + projet + timestamp), `open-roles` (wallet + projet), `quest-write` (wallet + quête + **semaine**, avec recalcul serveur de la semaine UTC), `chat-moderate` (session : wallet + projet + validité ; suppression : wallet + projet + **id du message** ; révocation : wallet), `push` (abonnement/désabonnement/préférences : wallet + endpoint ; envoi : wallet + pact + type). Sur ces endpoints, le rejeu transversal est impossible. **C'est le modèle à généraliser à `vault` / `network-write` / `update-profile` / `contact` (constats A1/A2).**

**5.6 L'autorisation du propriétaire est vérifiée on-chain, pas supposée**
- `project-write` action `media` : lecture de `project.creator` sur le compte Anchor du projet, avec vérification du **discriminant** avant décodage (`:142-158`, `:545-554`) ;
- `project-write` action `media-upload-url` : founder on-chain **ou** redérivation du PDA depuis `(wallet, projectId)` — ce qui ferme le cas « projet pas encore visible du RPC » sans ouvrir de trou ;
- `open-roles` : `project.creator` lu via le même IDL Anchor que le front (`:91-101`, `:186-188`) ;
- `vault` : `isFounder` / `isMember` sur `project.creator` / `project.members[]` (`:98-104`), et la suppression de document est bornée par `.eq('project_pda', projectPda)` ;
- `chat-moderate` suppression : founder-only + `.eq('project_pda', …)`.

**5.7 Le journal d'activité est adossé à une transaction on-chain réelle**
`verifyEventTx` (`project-write/index.ts:174-204`) vérifie quatre conditions distinctes (existence, succès, invocation du programme, signataire) et refuse avec un 409 explicite quand le RPC n'a pas encore indexé. Le `tx_sig` porte une contrainte `UNIQUE` (migration `20260828180000:43-44`) → pas de gonflement du fil. (La lacune A3 porte sur le *lien* entre la tx et le projet/montant, pas sur la réalité de la tx elle-même.)

**5.8 L'écriture du `author_wallet` vient du serveur**
Partout où une ligne contient un auteur (`project_updates`, `role_interests`, `network_posts`, `network_post_comments`, `project_chat_messages`, `project_documents`), la colonne est posée depuis le wallet vérifié, jamais depuis le JSON client. C'est la correction directe de l'usurpation d'identité qui existait à l'origine.

**5.9 Les RLS d'écriture sont fermées sur toutes les tables dont le dépôt connaît le DDL**
Aucune policy d'INSERT/UPDATE/DELETE sur `builder_profiles`, `project_open_roles`, `builder_contact_requests`, `builder_ratings`, `project_documents`, `chat_session_revocations`, `quest_claims`, `push_subscriptions`, `translation_cache`, `translation_usage` — RLS activée sans policy = inaccessible en direct (`20260828103536`, `20260828164126`, `20260829140000`, `20260829150000`, `20260918120000`). Les policies d'écriture ouvertes historiquement (`pact_events`, `project_updates`, `role_interests`, `project_media`, `project_chat_messages`) ont été explicitement supprimées (`20260828180000`, `20260828114318`, `20260828110330`).

**5.10 Les données sensibles sont hors de la portée du client**
`builder_contact_requests` (messages privés), `builder_ratings` (qui a noté qui), `project_documents` (livrables confidentiels) : aucune policy de lecture ; seuls des agrégats sont exposés (`builder_ratings_summary`, `grant select` explicite, `20260828103602`). `project_documents_summary` est explicitement **révoqué** aux rôles `anon`/`authenticated` (`20260828103536:216`). Le bucket `project-documents` est **privé** (`:226-228`) et n'est accessible que par signed URL émise après contrôle d'appartenance.

**5.11 Les vues d'agrégat ont été durcies contre les GRANTs par défaut**
`revoke all … from anon, authenticated` puis `grant select` ciblé (`20260828103602`) : la surface d'écriture sur les vues non auto-updatables est retirée.

**5.12 Les chemins de stockage sont calculés côté serveur, donc pas de path traversal**
`${wallet}/avatar.${ext}` (`update-profile:258`), `${projectPda}/${kind}.${ext}` (`project-write:514`), `${wallet}/${Date.now()}.${ext}` (`network-write:333`), `${projectPda}/${crypto.randomUUID()}` (`vault:203`). Toutes les entrées sont des base58 validés par regex ; aucune donnée client n'entre dans un chemin.

**5.13 Le bucket `project-media` a bien été fermé en écriture**
`20260828190000` supprime explicitement les policies `insert`/`update` sur `storage.objects` et le documente comme un choix assumé (« fermer une faille de défacement public plutôt que de laisser une fonctionnalité tourner sur un chemin non authentifié »). L'upload passe désormais par une signed URL émise par `project-write` après contrôle de la signature **et** de l'identité du founder.

**5.14 Les limites de débit sont en échec fermé**
Toutes les lectures de compteur qui alimentent un refus traitent l'erreur SQL comme un refus (`network-write:189-192`, `chat-moderate:318-321`, `contact:150-153`, `translate:153-156`) — une panne SQL ne dégrade pas la limite en « zéro message ».

**5.15 La révocation des sessions de chat est réelle et fail-closed**
Le modèle « cutoff par wallet » (`20260828164126`) couvre le cas d'usage difficile (révoquer depuis un autre appareil), et `fetchRevocationCutoff` **lève** en cas d'erreur SQL plutôt que de rendre une panne interpretée comme « pas de révocation » (`chat-moderate:126-138`, `:279-285`).

**5.16 Aucun secret n'est exposé côté client, et le relais RPC existe pour ça**
La clé `anon` du bundle est un JWT `role: anon` (relu, aucune `service_role`). La clé Helius n'est plus lue par le front : le relais `rpc` la prend dans un secret serveur (`RPC_UPSTREAM_URL`) et **n'expose jamais l'origine du nœud** — `origine()` ne renvoie que l'origine sans query string (`rpc/index.ts:113-119`, `:252-262`). Vérifié également : `dist/` ne contient aucune clé réelle (l'occurrence `api-key=` est le placeholder `https://devnet.helius-rpc.com/?api-key=...` de l'UI), et la CI dispose d'un scan de secrets sur l'arbre, l'historique **et** le bundle servi (`scripts/history-secret-scan.mjs`, `scripts/secret-check.mjs`, `scripts/deploy-check.test.ts`).

**5.17 Le relais RPC est fermé par liste blanche**
`allowlist.ts` : liste blanche de méthodes (et non liste noire), refus de tout lot dont une seule requête est invalide, plafond de 64 Kio, plafond de 20 requêtes par lot, `id` obligatoire. Le `sendTransaction` y figure, ce qui est un choix à revoir hors devnet, mais la conception est saine.

**5.18 L'anti-SSRF d'`assistant-chat` existe et est explicite**
`baseUrlError` refuse `http:`, les identifiants dans l'URL, `localhost`, `.local`, `.internal` et les IP littérales. Le garde est perfectible (B3) mais l'intention et le réflexe sont là, et la réponse ne renvoie jamais le corps brut d'une cible interne.

**5.19 CORS restreint par liste blanche**
Toutes les fonctions repassent par `withCors()` : l'origine est répercutée **seulement** si elle figure dans `ALLOWED_ORIGINS` (surchargeable par secret d'environnement), sinon l'en-tête est supprimé. Le `Access-Control-Allow-Origin: '*'` des en-têtes statiques ne subsiste que sur la réponse de préflight `OPTIONS` (sans effet sur l'accès aux données, l'authentification étant la signature).

**5.20 La surface de l'API est minimale**
`supabaseClient.ts` n'expose que `SUPABASE_PROJECT_URL` et la clé `anon`. Pas de `SERVICE_ROLE_KEY` dans le front, pas de clé de fournisseur lue dans un composant (à l'exception de B9).

---

## 6. Plan de remédiation priorisé

**Semaine 1 (avant toute soumission)**
1. Exécuter les vérifications SQL de A6 et A7 et **joindre le relevé `pg_policies`** au dossier.
2. Fermer explicitement l'écriture sur `builder-avatars` / `builder-banners` (A6) et créer le bucket `builder-banners` en migration (C5).
3. Lier `vault` à la ressource et à l'action (A2) — correctif de 10 lignes, gain immédiat.
4. Plafonner le destinataire et l'URL de `push` (A4) — correction de 20 lignes, ferme le push-phishing.
5. Durcir `translate` : plafond global non contournable (A5).

**Semaine 2**
6. Décoder l'instruction on-chain dans `project-write` action `event` et en dériver `kind`/`amount`/`project_pda` (A3) — c'est le constat le plus visible pour un juge, parce qu'il touche à la représentation de l'argent.
7. Introduire nonce + binding de domaine dans les messages signés (A1) — idéalement en passant à un format SIWE ; à défaut, lier action + ressource + paramètres dans tous les messages.
8. Vérifier l'appartenance au pact dans `chat-moderate` (B4) et `project-write` (B5).

**Semaine 3-4**
9. Plafonds de débit globaux (par fonction) en complément des plafonds par wallet (B1).
10. Compteur `rpc` sur l'IP réelle + plafond global (B2).
11. Garde anti-SSRF renforcée par résolution DNS (B3).
12. Migration de codification pour les 9 tables orphelines + relevé `pg_policies` versionné (A7).
13. Messages d'erreur génériques côté client (B6).

---

## 7. Ce que cet audit ne dit pas

- Il ne dit pas que le backend est « non sûr » : **la vérification cryptographique des signatures est fail-closed, les formats sont ancrés et mutuellement exclusifs, le wallet est toujours issu du message signé, et l'RLS est fermée en écriture sur toutes les tables que le dépôt documente.** Le modèle de preuve est sound ; ce sont son *périmètre* (action/ressource) et son *contexte* (domaine, nonce) qui sont trop larges.
- Il ne dit pas non plus que le risque est dans le RLS : hors les deux points à vérifier en base (A6/A7) et la lecture publique assumée du chat, le RLS est dans un état correct et Defendable.
- Il ne couvre pas le programme Anchor, la logique de distribution de l'escrow, ni le front React (hors points de contact backend). Un audit séparé du smart contract (`solana-security`) et un audit XSS/accessibilité du front seraient complémentaires.
- Les conclusions de sécurité reposent sur le **code** ; l'état réel de la base peut différer. C'est précisément l'objet de A6/A7 et c'est la première chose à lever pour un dossier solide.
