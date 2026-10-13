# BuildPact — Résumé complet du projet

> Dernière mise à jour : 19 septembre 2026 (voir `FEUILLE_DE_ROUTE.md`,
> section « Fait le 19/09 » pour le détail des changements récents —
> dashboard profil en grille libre, palette Nova, incident de sync
> Noah↔GitHub et sa résolution)
> Réseau : **Solana devnet** · Program ID `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`

---

## 1. Ce que fait le produit

BuildPact est une plateforme où un porteur de projet (« founder ») formalise
**on-chain** la répartition des parts entre co-fondateurs, avant qu'il y ait
de l'argent à partager. Le contrat crée un `Project` avec des membres, chacun
avec une part en points de base, et un vault qui distribue les entrées de
fonds selon cette répartition.

L'intention produit tient en une phrase : **rendre coûteux de revenir sur sa
parole**. Un accord verbal entre trois personnes qui codent le week-end ne
survit pas au premier chèque ; un compte Solana signé par les trois, si.

Autour de ce noyau on-chain, une couche hors-chaîne (Supabase) porte tout ce
qui n'a pas besoin d'être immuable : profils, médias, chat, candidatures,
journal d'activité.

---

## 2. Découpage on-chain / hors-chaîne

C'est la décision structurante du projet, et elle explique la moitié du code.

| Donnée | Où | Pourquoi |
|---|---|---|
| Membres, parts, approbations | **On-chain** | C'est l'objet du produit. Doit survivre à la disparition du serveur. |
| Vault, distribution | **On-chain** | Manipule des fonds. |
| Titre, description, rôle | **On-chain** | Fait partie de l'accord signé. |
| Logo, bannière, vidéo, à-propos | Supabase | Cosmétique, volumineux, révisable. |
| Profils builders, notes, contacts | Supabase | Social, non contractuel. |
| Chat projet | Supabase | Volume élevé, valeur nulle une fois lu. |
| Rôles recherchés, candidatures | Supabase | Éphémère par nature. |
| Journal d'activité | Supabase | Cache de lecture — la vérité reste la chaîne. |

**Le prix de ce découpage**, à ne pas perdre de vue : tout ce qui est dans la
colonne Supabase est reconstruit à la main pour être digne de confiance. Une
base Postgres ne sait pas qui contrôle une clé Solana. C'est toute la raison
d'être des Edge Functions décrites plus bas.

---

## 3. Programme Anchor (`programs/workspace/src/lib.rs`)

- **Framework** : Anchor 0.31.1
- **Comptes** : `Project` (PDA `["project", creator, id]`), vault PDA `["vault", project]`
- **Contraintes** : `MAX_MEMBERS = 8`, total des parts = `10 000` bps
- **Premier champ de `Project`** : `creator: Pubkey`, juste après les 8 octets
  de discriminant Anchor.

Ce dernier point est **load-bearing** : plusieurs Edge Functions lisent
`creator` en décodant l'octet 8 à 40 du compte, sans Anchor (indisponible en
Deno). Si l'ordre des champs de la struct change, ces fonctions liront une
mauvaise pubkey et refuseront tout — **silencieusement**, sans erreur de
compilation. Le discriminant est vérifié avant lecture, donc un compte d'un
autre type est bien rejeté, mais un réordonnancement de champs ne l'est pas.

### État de l'IDL et du drapeau `PROGRAM_UPGRADED`

> Une version antérieure de ce document affirmait que
> `src/idl/buildpact.json` ne contenait pas `update_description` et
> qualifiait la situation de bug actif. **C'était une erreur de lecture.**

Vérification faite fichier par fichier, les trois artefacts du dépôt sont
**cohérents entre eux** :

| Artefact | Titre | Description | Rôle | `update_description` |
|---|---|---|---|---|
| `programs/workspace/src/lib.rs` | 80 | 500 | 32 | présente |
| `src/idl/buildpact.json` | — | — | — | présente |
| `src/lib/onchainLimits.ts` (`PROGRAM_UPGRADED = true`) | 80 | 500 | 32 | activée |

L'IDL expose bien les 9 instructions du source, `update_description`
incluse (discriminant `[192,56,16,166,212,219,112,142]`), ainsi que
l'événement `DescriptionUpdated`. Son type `Project` place `creator` en
premier champ, ce qui confirme au passage l'offset 8..40 sur lequel
reposent les Edge Functions.

**Ce que cette cohérence ne prouve pas.** Ces trois fichiers vivent dans le
dépôt. Ils peuvent être parfaitement d'accord entre eux tout en décrivant
un binaire qui n'est pas celui en ligne — le champ `address` d'un IDL est
purement déclaratif, et `PROGRAM_UPGRADED` est un booléen écrit à la main.
Le commentaire de `onchainLimits.ts` mentionne un upgrade le 28/08
(signature `67Vmcg4F6Fg…NB8ufam`), mais un commentaire n'est pas une preuve.

Si le binaire en ligne était en réalité l'ancien, deux symptômes
apparaîtraient : `MigratePactButton` échouerait sur une instruction inconnue
du dispatcher, et surtout l'utilisateur remplirait jusqu'à 500 octets de
description avant de se prendre un `InvalidParameter` (6005) **au moment de
signer** — le pire moment.

Seule la chaîne tranche : `node scripts/idl-check.mjs` sonde le binaire
déployé par simulation, sans clé privée ni transaction. Il vérifie la
présence de l'instruction, puis la valeur **réelle** de `MAX_DESC_LEN` — une
description de 400 octets refusée en `InvalidParameter` prouverait que la
borne en ligne vaut encore 280. Tant que ce script n'a pas tourné, le statut
est « non vérifié », ce qui n'est pas la même chose que « cassé ».

---

## 4. Frontend

- **Stack** : React 19, Vite 8, TypeScript 5.5, Tailwind 3.4, framer-motion
- **Routing** : *hash routing* maison (`src/lib/router.ts`), **pas** de
  `BrowserRouter`. Choix assumé pour un déploiement statique sans réécriture
  serveur.
- **Wallet** : `@solana/wallet-adapter` + support Mobile Wallet Adapter
- **i18n** : FR/EN maison (`src/lib/i18n/`), FR par défaut

### Pages

| Route | Fichier | Rôle |
|---|---|---|
| `#/` (déconnecté) | `LandingPage.tsx` | Vitrine |
| `#/` (connecté) | `DashboardPage.tsx` | Mes pacts, création |
| `#/marketplace` | `MarketplacePage.tsx` | Projets ouverts |
| `#/builders` | `BuildersPage.tsx` | Annuaire des profils |
| `#/pacts` | `PactsPage.tsx` | Liste étendue |
| `#/pact/:pda` | `PactPublicPage.tsx` | Fiche publique partageable |
| `#/profil` | `MonProfilPage.tsx` | Profil, inbox contact, **sessions chat**, dashboard en **grille libre** (voir ci-dessous) |
| `#/treasury` | `TreasuryPage.tsx` | Vault, distribution, export |
| `#/about`, `#/docs` | `AboutPage`, `DocsPage` | Contenu statique |

### Dashboard profil — grille libre (`FreeGrid`, 19/09)

`MonProfilPage.tsx` n'est plus un empilement fixe de blocs : le formulaire de
profil et les panneaux (pacts & gains, contact, chat, progression, quêtes,
wallet) sont tous des items d'une même grille `FreeGrid.tsx`
(`react-grid-layout`), déplaçables et redimensionnables au pixel. Layout
persisté en `localStorage`, scopé par wallet — chaque builder retrouve SA
disposition ; un profil neuf part de l'arrangement par défaut (repris de
l'agencement validé par l'équipe).

⚠️ Un bug de configuration antérieur (breakpoint `lg: 640` jamais atteint
dans une grille confinée à une colonne étroite) a laissé des layouts
corrompus en `localStorage` chez certains utilisateurs — blocs à `w:1`,
grille visuellement écrasée. `FreeGrid.tsx` détecte désormais et purge ces
entrées invalides (largeur sauvegardée < `minW`) au chargement, sans perdre
le reste de la disposition personnalisée.

### Thème d'accent (19/09)

Deux axes indépendants (`data-theme` × `data-mode`, voir `DOSSIER_TECHNIQUE.md`
§0) : cinq palettes sélectionnables — `violet` (défaut Solana), `cyan`,
`aurum` (or), `atelier` (ivoire/encre, clair fixe), et **`nova`** (magenta
électrique + lime, nouvelle palette vive) — plus `coral`, retirée du menu
mais toujours valide pour les profils qui l'ont déjà choisie. Mode
clair/sombre général en cours de renforcement visuel (glow/`glass-panel`
pensés pour du noir à l'origine).

---

## 5. Backend Supabase — projet `xkznmflyiilgmxhvgega`

### 5.1 Modèle de sécurité

Le principe, appliqué partout : **aucune table n'accepte d'écriture publique.**
Toute écriture passe par une Edge Function qui prouve l'identité par
signature ed25519, puis écrit avec la clé `service_role`. Le champ « auteur »
est **toujours** renseigné par le serveur à partir du wallet dont la
signature vient d'être vérifiée — jamais depuis un champ envoyé par le client.

C'était loin d'être le cas au départ. L'audit a trouvé des policies
`INSERT with check (true)` sur cinq tables, ce qui permettait à n'importe qui
de poster sous le wallet d'autrui, y compris celui du founder. Ces policies
ont toutes été fermées (voir §5.3).

### 5.2 Edge Functions

| Fonction | Rôle | Preuve exigée |
|---|---|---|
| `chat-moderate` | Chat : post, delete, revoke | Session signée (24 h) / signature unitaire |
| `project-write` | pact_events, updates, candidatures, médias | Vérification on-chain ou signature unitaire |
| `open-roles` | Rôles recherchés | Signature + founder on-chain |
| `update-profile` | Profil builder | Signature |
| `vault` | Lecture vault | — |
| `contact` | Formulaire de contact | — |

Toutes sont déployées avec `verify_jwt: false` : l'authentification est
faite par signature Solana, pas par JWT Supabase. Il n'y a pas de comptes
utilisateurs au sens Supabase Auth.

### 5.3 Tables

| Table | Écriture | Lecture |
|---|---|---|
| `project_chat_messages` | `chat-moderate` | publique |
| `chat_session_revocations` | `chat-moderate` (service_role seul) | **aucune** |
| `pact_events` | `project-write` (tx vérifiée on-chain) | publique |
| `project_updates` | `project-write` (signature) | publique |
| `role_interests` | `project-write` (signature) | restreinte |
| `project_media` | `project-write` (signature + founder) | publique |
| `project_open_roles` | `open-roles` | publique |
| `builder_profiles` | `update-profile` | publique |
| `builder_contact_requests` | `contact` | restreinte |
| `builder_ratings`, `project_documents` | verrouillées | publique |

### 5.4 Sessions de chat

Signer chaque message était sûr mais imposait un popup wallet par message —
inutilisable. Le compromis retenu : le wallet signe **une fois** un jeton de
session valable 24 h, scopé à **un projet**.

Ce que ça coûte, et qui est assumé : le jeton est un *bearer token* en
`localStorage`. Qui le lit peut publier sous ce wallet. Trois garde-fous
bornent le dégât :

1. **Scope projet** — un jeton volé ne pollue qu'un seul chat.
2. **Rate limit** — 10 messages/minute par wallet.
3. **Révocation serveur** — table `chat_session_revocations`, modèle *cutoff*.

Le modèle cutoff mérite une explication, parce qu'il n'est pas le premier
réflexe. On stocke « toute session signée avant cet instant est refusée »,
pas l'empreinte des jetons révoqués. Raison : celui qui révoque est sur un
**autre appareil** que celui compromis — il n'a pas le jeton à blacklister.
Un cutoff couvre les jetons qu'on ne connaît pas. Bonus : une ligne par
wallet, la table ne grossit jamais.

Deux arbitrages associés, tous deux load-bearing :

- **Tolérance de 60 s** sur le cutoff. Le cutoff est en heure serveur, le
  timestamp de session en heure client. Sans marge, un utilisateur dont la
  pendule retarde re-signe un jeton daté « avant » sa propre révocation :
  rejeté, re-signé, rejeté — popup en boucle sans issue. Le prix : un jeton
  volé signé dans la minute précédant la révocation y survit.
- **Échec fermé** sur la lecture du cutoff. Si la requête échoue, le message
  est refusé (503) plutôt qu'accepté. Traiter la panne comme « pas de
  révocation » ressusciterait des jetons que l'utilisateur croit morts.

À la déconnexion du wallet, `useChatSessionCleanup` efface les jetons locaux.
Ce hook **ne peut pas** révoquer côté serveur : révoquer exige une signature,
et le wallet vient précisément de partir. Limite structurelle, pas un oubli.

---

## 6. Clés et artefacts

| Fichier | Contenu | Statut |
|---|---|---|
| `contracts/target/wallet/wallet.json` | Autorité d'upgrade (devnet) | présent |
| `contracts/target/wallet/id.json` | Copie du précédent, nom attendu par Anchor | présent |
| `contracts/target/idl/workspace.json` | Copie de l'IDL | présent |
| `src/idl/buildpact.json` | IDL utilisé par le frontend | présent |
| `contracts/target/deploy/workspace-keypair.json` | Keypair du **programme** | **absent** |

Sur le keypair du programme, autant être direct : il est absent et
**irrécupérable** — une clé privée ne se déduit pas d'une adresse publique.
La bonne nouvelle est qu'il n'est **pas nécessaire** : il ne sert qu'au
premier déploiement, qui a déjà eu lieu. Les upgrades ultérieurs
n'engagent que l'autorité d'upgrade, présente dans `wallet.json`.

Le seul scénario qui casserait est un redéploiement *à la même adresse* après
suppression du programme. Il n'est pas atteignable ici.

`scripts/keys-check.mjs` dérive les pubkeys des keypairs présents et les
compare à `Anchor.toml` et à `PROGRAM_ID`, pour vérifier la cohérence sans
avoir à faire confiance à un commentaire.

> ⚠️ `wallet.json` est une **clé privée en clair, versionnée**. C'est
> acceptable pour du devnet et seulement pour ça. Avant tout passage en
> mainnet, cette clé doit être sortie du dépôt et considérée comme brûlée.

---

## 7. Configuration

`.env` (les variables `VITE_*` sont **publiques**, elles finissent dans le
bundle — ne jamais y mettre de `service_role`) :

```
VITE_SOLANA_RPC_URL=...
VITE_PROGRAM_ID=9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ
VITE_SUPABASE_URL=https://xkznmflyiilgmxhvgega.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Les deux variables Supabase manquaient ; elles sont désormais présentes dans
`.env`. La conséquence de leur absence n'était pas une erreur mais un
silence : `isRemoteEnabled` retombait à `false` et **toute** la couche
Supabase se désactivait — profils vides, chat absent, activité muette, sans
le moindre message.

⚠️ Vite ne lit `.env` **qu'au démarrage**. Après toute modification, il faut
arrêter et relancer `npm run dev` — un rechargement du navigateur ne suffit
pas, et c'est la cause n°1 de « j'ai pourtant mis la variable ».

En production (Vercel ou équivalent), `.env` n'est pas déployé : les mêmes
variables doivent être saisies dans les réglages du projet, puis un nouveau
build déclenché.

---

## 8. Ce qui reste ouvert

- **Bucket de stockage** : les fichiers médias sont poussés directement avec
  la clé anon. La table `project_media` est protégée, le bucket ne l'est pas
  encore — on peut écraser `<pda>/logo.png`. Correctif : policies sur
  `storage.objects` restreignant l'écriture, ou upload via Edge Function.
- **Décalage IDL / programme** — voir §3.
- **Membership non vérifiée** sur `project_updates` : la signature prouve le
  wallet, pas l'appartenance au projet. L'auteur affiché est donc toujours
  exact, mais un tiers peut publier une update sous son propre nom.
- **Pas de tests d'intégration** sur les Edge Functions.

Détail et priorisation : `FEUILLE_DE_ROUTE.md`.
