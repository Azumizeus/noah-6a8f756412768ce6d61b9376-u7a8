# 🗺️ BUILDPACT — ÉTAT RÉEL DE L'APP (document de référence)

> **Vérifié le 08/10/2026** · Solana Devnet uniquement
> Ce document **remplace** les feuilles de route d'août 2026 comme référence : elles
> décrivent l'app d'AVANT le shell premium et sont conservées comme archives
> (voir « Carte des documents » à la fin).
> Toute valeur de ce document a été **lue dans le code ou mesurée** le 08/10, jamais
> recopiée d'un document précédent.

---

## 1. Ce qu'est l'app aujourd'hui

Un pacte on-chain entre builders : un projet est publié avec ses rôles et ses parts,
d'autres devs postulent, l'accord est écrit on-chain, les backers financent un
escrow, la distribution suit.

| | |
|---|---|
| Dépôt de l'app | `Azumizeus/noah-6a8f756412768ce6d61b9376-75mv` — branche `main` |
| Dernier commit de Noah récupéré | `869f0b7` (AI Update: Supabase fallback) |
| `main` au 08/10 | **`5a6d9f6`** — 12 commits au-dessus de `869f0b7`, poussé |
| Programme Anchor | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` (devnet) |
| Frais protocole | 200 bps (2 %) → `AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH` |
| Ancien programme (mort) | `266V7Jct9EVWPeHscDwBpL13251EMUyak7WR9QiT59kQ` — fermé, irrécupérable |

---

## 2. Architecture technique réelle

- **Front** : Vite + React 19 + TypeScript + Tailwind. Entrée `src/main.tsx`,
  routage par hash (`src/lib/router.ts`), une route = une page.
- **Wallet** : `@solana/wallet-adapter` avec trois adaptateurs —
  `SolanaMobileWalletAdapter` (Seed Vault / Seeker), Phantom, Solflare. Le
  `appIdentity.uri` est dérivé de `window.location.origin` : une identité figée sur une
  URL Vercel périmée casserait l'autorisation MWA (corrigé).
- **On-chain** : programme Anchor `create_project`, `add_member`, `remove_member`,
  `approve`, `finalize`, `fund`, `distribute`, `close_project`, `update_description`.
  Aucun compte administrateur modifiable : frais et portefeuille protocole sont des
  constantes compilées.
- **Hors-chaîne** : Supabase (profils, médias, discussion, coffre-fort de documents,
  annuaire, traductions) + fonctions Edge (`push`, `contact`, `network-write`,
  `quest-write`, `update-profile`, `translate`, `vault`, `project-write`,
  `chat-moderate`, `open-roles`). Règle tenue : **aucune écriture publique non
  vérifiée** — les écritures sensibles passent par une signature de portefeuille.

### Deux habillages coexistent (état intermédiaire assumé)

| | Shell premium | Legacy `/v1` |
|---|---|---|
| Routes | `#/`, `#/marketplace`, `#/pacts`, `#/builders`, `#/treasury`, `#/network`, `#/profile`, `#/docs`, `#/about`, `#/create`, `#/pact/<pda>` | `#/v1` et `#/v1/*` |
| Défaut visuel | **clair** | **sombre** |
| Thème | 4 palettes × 2 modes (`data-appearance` + `data-appearance-mode`) | thème historique (`data-theme` / `data-mode`) |
| Rôle | parcours par défaut | **filet de sécurité** pendant la migration |

⚠️ Règle à ne pas casser : ne jamais faire lire `data-mode` au premium, ni
`data-appearance` / `data-appearance-mode` au legacy. Les deux systèmes ont des
défauts opposés.

---

## 3. Ce qui a été livré le 08/10/2026

| Ce qui a changé | État | Ce que ça change pour l'utilisateur |
|---|---|---|
| Un garde-fou anti-push-massif est versionné | ✅ | la règle des 5 fichiers max existe enfin partout, pas seulement sur un poste |
| Les **Paramètres** du shell premium | ✅ | densité, RPC, langue, affichage USD, apparence — sans passer par `/v1/profile` |
| Les réglages legacy repris dans ces Paramètres | ✅ | notifications + push, aperçu d'image, confidentialité, export CSV |
| La **création de pact** dans le nouveau design | ✅ | le wizard est inchangé : le nouveau design l'habille, il ne le réécrit pas |
| Des **cartes projet cohérentes** | ✅ | bannière bornée, dégradé de repli qui suit la palette et le mode |
| Le **profil édité en premium atteint le serveur** | ✅ | un pseudo, un avatar ou une bannière modifié apparaît dans l'annuaire des builders et sur les autres appareils |

Le **comment** de ces changements — numérotation des chantiers, commits, mécanismes
internes — vit dans `PLAN-CHANTIERS-PREMIUM-2026-10-08.md`. Ce document-ci dit ce qui a
changé, pas comment : un hash de commit ou le nom d'une classe CSS ne veut rien dire pour
un lecteur qui n'est pas dans le dépôt.

**Le profil premium écrit désormais au serveur.** C'est la correction la plus importante
de la journée, et elle n'a pas l'air d'un bug : le formulaire premium demandait une
signature de wallet… puis **écrivait uniquement dans le navigateur**. Un pseudo ou un
avatar changé côté premium n'apparaissait donc ni dans l'annuaire des builders, ni sur un
autre appareil — seul le portail historique écrivait vraiment. La signature demandée ne
servait à rien après coup : elle portait un message que le serveur ne vérifiait pas.
Désormais l'enregistrement écrit d'abord en local (la fiche se met à jour tout de suite
et reste lisible hors-ligne), puis envoie le profil complet à l'Edge Function
`update-profile` avec le message canonique qu'elle sait vérifier. Le profil distant est
relu avant l'envoi, pour qu'un champ absent du formulaire premium (bio, liens,
disponibilité, palette de thème) ne soit pas effacé au passage.

**Deux corrections hors de ces changements, le 08/10.** Le sélecteur de décor de fond
proposait trois variantes « HD » dont les images n'ont jamais été committées : trois 404
en console à chaque ouverture des réglages, et des vignettes vides. Les trois options sont
retirées ; une valeur déjà stockée retombe proprement sur le défaut, et un test refuse
désormais toute référence à un fichier absent de `public/`. Par ailleurs, une bannière
**carrée** débordait de sa vignette et masquait titre, description et chiffres, tandis que
le dégradé de repli était écrit en dur à trois endroits, donc hors thème : les deux sont
corrigés, avec un test qui balaie toutes les pages premium.

---

## 4. Ce qui reste

| Ce qui reste | Raison |
|---|---|
| Retrait progressif de `/v1` | **Demande une décision** : garder `/v1` comme porte de débogage, ou le supprimer ? Le lien « Historique ↗ » de `PremiumNav` doit bouger avec. |

Débloqué : la création de pact existe désormais des deux côtés, donc retirer `/v1` ne
casse plus le parcours principal.

**Ce qui disparaîtrait est mesuré, pas estimé.** `INVENTAIRE-V1-2026-10-08.md` (§ 5)
recense les **52 fichiers** qui n'existent qu'en `/v1` — pages, composants du même nom, et
jusqu'à `PactPublicPage`, absent des listes précédentes. Le décompte n'est pas le point
qui compte pour décider : **cinq familles fonctionnelles n'ont aucun équivalent premium**.
Retirer `/v1` n'est donc pas un simple nettoyage d'habillage, même si le parcours
principal, lui, est déjà couvert côté premium.

⚠️ Un point de vigilance à ne pas manquer avant de supprimer quoi que ce soit :
`ImagePreviewSettings` partage l'état `previewEnabled` avec `ThemeContext`, et
`ImageHoverPreview` (monté côté premium par `PostCard`) s'en sert. Le composant peut
partir, **pas** `ThemeContext`.

### Réglages laissés au legacy — décision motivée, pas un oubli

`ThemeModeGrid` (thème legacy), `BackgroundSwitch` (décor de fond),
`GlowStrengthSwitch` (intensité des halos). Le shell premium a son propre système
d'apparence : les recopier créerait deux contrôles concurrents pour la même intention.
Et le halo n'alimente que des ombres legacy — il n'aurait **aucun effet visible** côté
premium : un bouton qui ment.

---

## 5. Vérifier l'app soi-même

Depuis `buildpact-75mv/` :

```bash
npm run typecheck     # tsc, doit sortir 0
npm test              # suite node --test, 66/66 au 08/10
npm run build         # typecheck + vite build
npm run guard:push    # refuse un lot de plus de 5 fichiers
npm run guard:install # à faire UNE FOIS par clone : pose le hook pre-push
```

Règles de travail :

- **Push par lots de 5 fichiers maximum** (appliqué par le garde-fou versionné) ;
  contournement explicite : `ALLOW_MASS_PUSH=1`.
- **Deux échecs consécutifs sur le même problème → STOP et demander.**
- Une carte projet se modifie dans `PremiumProjectCard`, **jamais** dans les pages.

---

## 6. Limites connues, non maquillées

| Limite | Détail vérifié |
|---|---|
| Parcours de signature non testé par un agent | Créer un pact, financer, distribuer : exigent un wallet réel. Aucun de ces parcours n'a été exécuté par un agent ; ils ont été validés à la main par Noah. |
| Abonnement push réel non exercé en local | L'infra existe (`public/push-sw.js`, `supabase/functions/push`, migration `create_push_subscriptions`). Il ne manque que la paire de clés VAPID. Un abonnement réel est **impossible** depuis un navigateur d'automatisation : `Notification.permission` y vaut `denied`, et aucun outil d'agent ne peut l'accorder. |
| Deux pacts de démonstration ont une description polluée | Le champ on-chain `description` commence littéralement par `[🤝 Les deux]`. Ce n'est **pas** un défaut d'affichage : c'est le texte stocké. Correction possible via `updateDescription` (`EditDescriptionModal`), donc avec une signature. |
| Enregistrement du profil non exercé avec un vrai wallet | L'écriture distante du profil premium est vérifiée par des tests unitaires et par le contrat de l'Edge Function (identique au portail historique, déjà en service), mais le parcours complet — signature par un wallet réel, puis relecture dans l'annuaire — n'a pas été exécuté par un agent : il demande un wallet. |
| `/v1` reste accessible | Deux habillages vivants en parallèle jusqu'au retrait. |

---

## 7. Carte des documents (qui fait référence, qui est une archive)

| Document | Statut |
|---|---|
| **`ETAT-APP-2026-10-08-FR.md` / `-EN.md` (+ `.html`)** | ⭐ **RÉFÉRENCE** — à relire en premier |
| `ROADMAP-FR.md`, `ROADMAP-ENG.md` | 🗄️ Archive — feuille de route du hackathon, **une seule par langue** |
| `JUDGES-FR.md`, `JUDGES-ENG.md` | 🗄️ Archive — dossier juges, **un seul par langue** (biais d'audit du 19–20/09 inclus) |
| `buildpact-dossier-complet-v3.html` | 🗄️ Archive — dossier de présentation, postérieur au hackathon mais antérieur au shell premium |
| `archive/` | 🗄️ Archive — **tout le reste des doublons**, déplacé le 08/10 : `ROADMAP- FR.md`, `ROADMAP- FR 2.md`, `ROADMAP-FR.html`, `ROADMAP-ENG.html`, `ROADMAP-FR (1).html`, `buildpact-roadmap-v2.html`, `buildpact-roadmap-v4.html`, `JUDGES FR.md`, `JUDGES ENG.md`, `buildpact-dossier-complet.html` |
| `PLAN-CHANTIERS-PREMIUM-2026-10-08.md` | 🔧 Journal technique des chantiers premium : le « comment » (numérotation, commits, mécanismes) |
| `CHECKLIST-TEST-WALLET-2026-10-08.md` | 🔧 Checklist de test à dérouler avec un wallet réel connecté (signatures, création de pact, correction de description) |
| `INVENTAIRE-V1-2026-10-08.md` | 🔧 Chantier 3a — inventaire mesuré de ce qui n'existe qu'en `/v1` + recommandation |
| `REVUE-DOCS-REFERENCE-2026-10-08.md` | 🔧 Revue de ce document : erreurs, manques, passages trop techniques pour un lecteur extérieur |

**Aucun de ces fichiers n'est supprimé** : ils gardent la mémoire du hackathon. Ils
portent simplement un bandeau « archive » renvoyant ici.

**Une seule version vivante par famille.** Les doublons qui traînaient à la racine de
`docs/` — sept feuilles de route, deux dossiers juges, un dossier de présentation en
double — ont été **déplacés** dans `docs/archive/` le 08/10/2026 : rien n'a été effacé,
mais il n'existe plus qu'une feuille de route par langue (`ROADMAP-FR.md`,
`ROADMAP-ENG.md`) et un seul dossier juges par langue (`JUDGES-FR.md`,
`JUDGES-ENG.md`). Pourquoi ceux-là : les variantes `JUDGES FR.md` / `JUDGES ENG.md`,
arrivées le 08/10 avec l'import du dossier de travail, étaient un instantané antérieur —
elles n'ont pas la passe d'audit du 19–20/09 que portent les versions à trait d'union.

**Où ils vivent.** Tous ces documents sont dans le dossier `docs/` du **dépôt de l'app**
(`buildpact-75mv/`) — il n'y a plus qu'un seul dépôt. Les fichiers `.html`, les scripts de
contrôle et les documents d'archive ont été rapatriés du dossier de travail qui les
contenait : deux dépôts pour un seul projet, dont un qui ne pouvait pas être poussé, était
une source de divergence permanente.

### Pourquoi deux documents de référence (FR et EN) et pas un seul

Parce que les textes anglais du hackathon étaient une **fusion automatique** ligne à
ligne (français puis anglais collés), parfois faux (« damage » pour « casse »). Les
versions EN d'aujourd'hui sont rédigées, pas générées. Les `.html` sont produits depuis
les `.md` par `docs/outils/md-to-html.mjs` : une seule source par langue, donc pas de
divergence possible entre le Markdown et le HTML.

### Vérifier que les documents n'ont pas divergé

Depuis la racine de l'app (`buildpact-75mv/`) :

```bash
node docs/outils/verifier-docs.mjs   # échoue si un .html ne correspond plus à son .md
```

Le contrôle régénère chaque page en mémoire et la compare octet à octet à celle du
disque : il attrape le `.md` modifié sans régénération comme le `.html` retouché à la
main. Seules les pages qui portent la signature du générateur sont comparées — les
roadmaps d'août existent en `.md` et en `.html` sans que l'un dérive de l'autre, les
inclure produirait deux fausses alertes.
