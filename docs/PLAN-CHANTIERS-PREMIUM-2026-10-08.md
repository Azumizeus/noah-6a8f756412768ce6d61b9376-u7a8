# PLAN DES CHANTIERS PREMIUM — buildpact-75mv
**Date : 08/10/2026 · Rédigé après validation du contenu par Noah.**
**État : chantiers 0, 1, 1b, 2 et 4 FAITS (le 08/10), plus le correctif du
profil premium (§ 4bis) et la migration de la famille sociale (§ 4ter). Il ne
reste que le chantier 3 (retrait de `/v1`), qui demande une décision — voir § 5.**
Chaque chantier indique son risque : `[SÛR]` (réversible, aucune donnée perdue),
`[ACCORD]` (casse un parcours ou supprime du code tant qu'une étape précédente
n'est pas faite), `[ATTENTION]` (touche du code on-chain ou des secrets).

Repo de l'app : `Azumizeus/noah-6a8f756412768ce6d61b9376-75mv` — branche `main`.
Tout ce qui est décrit ici concerne **buildpact-75mv** (l'app). Ce journal vit lui
aussi dans le dépôt de l'app, sous `docs/` : il n'existe plus de dépôt séparé pour
la documentation.

---

## 0. Le point de départ (état vérifié le 08/10)

| Fait | Valeur vérifiée |
|---|---|
| Dernier commit de Noah récupéré | `869f0b7` (AI Update: Supabase fallback) |
| `main` au moment d'écrire | voir `ETAT-APP-2026-10-08-FR.md` § 1 — un hash recopié dans deux documents finit toujours par diverger |
| Vérifs reproductibles | `npm run typecheck` 0 · `npm run build` 0 · `npm test` **71/71** (au 08/10, correctif du profil premium compris) |
| Shell premium | 4 palettes × **2 modes** (clair/sombre), bascule dans `PremiumNav` |
| Carte projet | composant partagé `PremiumProjectCard` + logique pure `projectCardMedia` |

**Ce qui est encore en design legacy (constaté, pas un bug) :**
- `/v1/create` ouvre toujours `CreatePactPage` (ancien design), mais ce n'est
  plus le chemin par défaut : `#/create` est passé au shell premium le 08/10
  (§ 3). `/v1/create` n'est plus qu'un filet, à retirer avec le chantier 3 ;
- `/v1/profile` reste le seul accès aux réglages **propres au legacy** — c'est
  désormais le thème legacy, le décor de fond et l'intensité des halos, et rien
  d'autre : les 4 réglages qui manquaient au premium y ont été migrés le 08/10
  (voir § 2bis). Le 3c n'aura donc plus de « fonction unique » à sauver ici.

---

## 1. Chantier 0 — Versionner le garde-fou anti-push-massif · `[SÛR]` · **FAIT**

### Le problème (confirmé par Noah, puis vérifié)

Le garde-fou des 5 fichiers max était **entièrement local** :

```
✓ suivi    scripts/premium-card.test.ts
?? non suivi scripts/git-guard.mjs          ← absent du dépôt
?? non suivi scripts/git-guard.test.ts      ← absent du dépôt
 M local   package.json                     ← scripts guard:* jamais committés
```

Conséquence : sur **tout clone** (autre poste, CI, copie de Noah), ni le script
ni les scripts npm n'existent. La règle écrite après la panne du 07/10 ne
protégeait qu'une seule machine.

### Ce qui a été fait

- commit `55586b4` : `scripts/git-guard.mjs`, `scripts/git-guard.test.ts` et les
  trois scripts `guard:push` / `guard:rewrite` / `guard:install` de `package.json`
  (3 fichiers, sous la limite de 5).
- Vérifié après commit : les deux fichiers sont suivis (`git ls-files`), `npm test`
  = 35/35, et `node scripts/git-guard.mjs --range origin/main..HEAD` répond.

### Reste à faire par chaque poste (une fois par clone)

```bash
npm run guard:install     # pose le hook pre-push local
```

Le hook n'est jamais versionné par Git (il vit dans `.git/hooks/`) : c'est
pourquoi l'installation reste une commande explicite, documentée ici.

---

## 2. Chantier 1 — ⚙️ Paramètres habillés premium · `[SÛR]` · **FAIT**

**Impact UX le plus fort.** Aujourd'hui, un utilisateur du nouveau design n'a
aucun accès aux réglages : il doit taper `/v1/profile` à la main, et le panneau
s'ouvre en tokens **legacy sombres** sur un shell clair ou sombre — incohérent.

### Contenu livré

1. Entrée ⚙️ dans `src/pages/premium/PremiumNav.tsx` — et le panneau monté
   **dans la nav**, avec le bouton. `PremiumNav` est le seul point commun aux
   10 pages premium : une page ajoutée demain hérite du réglage sans câblage.
2. Panneau **nouveau** : `src/pages/premium/PremiumSettings.tsx`, habillé
   uniquement en tokens `--p-*` (zéro classe Tailwind, zéro `--accent-violet`),
   donc conforme aux 4 palettes × 2 modes sans travail supplémentaire.
3. Réglages exposés, et eux seulement :
   - apparence — mode clair/sombre (`data-appearance-mode`) **et** palette ;
   - densité d'affichage ;
   - langue FR/EN ;
   - RPC personnalisé (avec le rappel « effet après rechargement ») ;
   - affichage de l'équivalent USD.
4. **Laissé au legacy à ce stade** : `ThemeModeGrid` (thème legacy),
   `BackgroundSwitch`, `GlowStrengthSwitch`, `MockupPreviewFrame`. Les quatre
   autres réglages alors écartés ont été rattrapés le 08/10 — voir § 2bis.
5. Deux clés i18n : `theme.appearanceHeading` (`Apparence` / `Appearance`),
   ajoutée en FR **et** en EN — un titre de section, là où `theme.modeAria`
   (« Basculer mode clair/sombre ») servait de consigne, pas de titre.
6. Garde-fou de non-régression : `scripts/premium-settings.test.ts` (13 tests).
   Il impose : le montage dans la nav, l'absence de tout habillage legacy dans
   le panneau, **tous** les `var(--…)` en `--p-*` **déclarés dans
   `premium.css`**, la présence de chaque clé `t()` en FR **et** en EN, et la
   réutilisation des libs partagées (`useDensity`, `usdDisplay`, `constants`,
   `appearance`) plutôt que des clés `localStorage` recopiées.

### Vérifié dans le navigateur (session du 08/10)

- ⚙️ présent sur `#/`, `#/pacts`, `#/profile` et ouvre le panneau ;
- Échap ferme ; clic sur le fond ferme ; clic dans le panneau ne ferme pas ;
- densité passée à *Compact* et langue à *FR* : **conservées au rechargement** ;
- RPC enregistré → message + bouton *Retirer* → **clé `localStorage` purgée**
  après retrait ;
- rendu vérifié en **clair (ivory)** et en **sombre (solana)** : mêmes tokens,
  accents et rayons de la palette active ; console sans erreur ;
- `npm test` **44/44**, dont les 13 nouveaux.

### Points de vigilance (tenus)

- `ProfileSettingsModal` n'est **pas** réutilisé : il est soudé à
  l'enregistrement du profil par signature wallet et habillé en legacy. Le
  panneau premium lit/écrit les mêmes **libs** (`lib/density.ts`,
  `lib/usdDisplay.ts`, `lib/constants.ts`, `lib/appearance`), pas les mêmes
  composants — un réglage changé d'un côté est donc vu de l'autre.
- Le réglage RPC ne prend effet qu'au **rechargement** (choix documenté dans
  `lib/constants.ts`) : le panneau le dit (`settings.rpcSaved`).

### Dépendances

- **Amont : satisfait.** Repose sur `data-appearance-mode` (livré, commit `343a532`).
- **Aval : débloque le chantier 3.** La question ouverte « migrer ou abandonner
  les réglages legacy ? » a été **tranchée et exécutée** le 08/10 (§ 2bis).

---

## 2bis. Chantier 1b — Migration des réglages legacy · `[SÛR]` · **FAIT**

Commit `cfa29fd` (4 fichiers, poussé). Le panneau ⚙️ du § 2 n'exposait que 5
réglages ; un utilisateur du shell premium restait **sans aucun accès** aux
quatre autres, qui ne vivaient que dans `ProfileSettingsModal` derrière
`/v1/profile`.

| Réglage migré | Pourquoi il est valable ici |
|---|---|
| Notifications (3 préférences + abonnement push de l'appareil) | local + réel, indépendant du design |
| Aperçu grand format (logo/bannière) | **vivant dans le shell premium** : `PremiumNetwork` monte `PostCard`, qui contient `ImageHoverPreview` |
| Confidentialité du profil (masquer l'adresse wallet) | champ de profil, affiché partout — `PremiumProfil` n'offrait aucun contrôle |
| Export CSV de l'historique | local, lié au wallet, indépendant du design |

### Non migrés — décision motivée, pas un oubli

| Réglage laissé au legacy | Raison |
|---|---|
| `ThemeModeGrid` (palette × mode legacy) | le shell premium a **son propre** système d'apparence (§ 2) ; deux contrôles concurrents pour la même intention |
| `BackgroundSwitch` (décor de fond) | décor de `DashboardLayout`, qui n'existe pas côté premium |
| `GlowStrengthSwitch` (`--glow-strength`) | n'alimente **que** des `box-shadow` legacy en `--accent-violet-rgb` : il n'aurait **aucun effet visible** sur le premium — un contrôle qui ment |
| `MockupPreviewFrame` | maquette d'aperçu du thème legacy, sans objet ici |
| `TranslationStatus` | outil de mise au point du projet, pas un réglage d'utilisateur |

### Comment c'est fait

- UI **réécrite** en tokens `--p-*` (un composant legacy apporte ses classes
  Tailwind sombres) : nouveau `PremiumSwitch` en 44 × 24 — même invariant de
  pastille que `components/ToggleSwitch.tsx`, pour ne pas rejouer le bug de
  décentrage déjà corrigé là-bas.
- Logique **jamais dupliquée** : mêmes libs que le legacy — `notificationPrefs`,
  `pushNotifications`, `csvExport`, `profileRemote`, `ThemeContext`.
- Confidentialité : l'écriture **repart du profil distant** (`fetchProfile` →
  `submitProfileUpdate`), jamais d'un objet vide. Envoyer un profil partiel
  efface en base les champs omis (bannière, palette) — bug déjà rencontré ici.
- Sans wallet, le bouton d'enregistrement est **remplacé par une phrase**
  (`settings.privacyNeedsWallet`, nouvelle clé FR **et** EN) au lieu d'un
  contrôle qui échouerait en silence.
- Filet conservé de `NotificationSettings` : quoi qu'il arrive, l'interrupteur
  push ne reste jamais bloqué sur « busy ».
- Garde-fou étendu : `scripts/premium-settings.test.ts` passe de 13 à **17 tests**
  (les 4 sections présentes, les 5 libs réutilisées, la règle du profil distant,
  le filet anti-blocage).

### Vérifié dans le navigateur (08/10 au soir)

- Les 8 sections s'affichent, en **clair** et en **sombre** (captures prises) ;
- basculer l'aperçu image écrit `buildpact_preview_enabled` — **exactement la
  clé du panneau legacy**, donc les deux panneaux partagent bien l'état ;
- cocher/décocher « Approbation de membre » écrit `buildpact_notif_prefs`
  (`{"approvals":false,…}`), même clé et même forme qu'en legacy ;
- sans wallet : « Connecte ton wallet pour modifier ce réglage », et **pas** de
  bouton *Exporter* (rien à exporter) — messages d'état, jamais d'échec muet ;
- console sans erreur ; état du navigateur de test remis à zéro après coup.
- `typecheck` 0 · `npm test` **48/48** · `build` 0 · `guard:push` « 4 fichier(s)
  sur 5 » · poussé `66229f9..cfa29fd`.

### Limite connue

L'abonnement push **réel** n'a pas pu être exercé en local : `isPushSupported()`
renvoie faux sans `VITE_VAPID_PUBLIC_KEY` ni projet Supabase distant, donc le
panneau affiche « non supporté » (comportement voulu, testé). Seule la partie
locale des notifications a pu être vérifiée bout en bout.

**Détail vérifié le 08/10 au soir, pour ne pas refaire le tour :** l'infra
EXISTE déjà — `public/push-sw.js` (service worker dédié),
`supabase/functions/push/index.ts` (attend `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`), migration
`20260829150000_create_push_subscriptions.sql`. Il ne manque que la paire de
clés VAPID. Mais un abonnement réel est **impossible à produire depuis le
navigateur d'automatisation** : `Notification.permission` y vaut `denied`, et
aucun outil de l'agent ne peut l'accorder. Un test « vrai abonnement + vrai
envoi » doit donc se faire dans un **vrai navigateur**, ou contre le projet
distant une fois les secrets posés à la main.

---

## 3. Chantier 2 — Page `/create` en premium · `[ACCORD]` · **FAIT**

Commit `dcab942` (4 fichiers, poussé). Avant : on pouvait créer un compte,
mais pas un pact, dans le nouveau design — `/create` servait la page legacy,
qui s'ouvre sur un habillage sombre même en shell clair.

### Le choix qui porte tout le chantier : une peau, pas une réécriture

Le wizard (`CreatePactWizard.tsx`, 1030 lignes + `src/components/wizard/*`)
**signe des transactions**. Le réécrire était le contraire de ce qui était
demandé : sa logique devait rester identique au caractère près. Il est donc
rendu **tel quel**, dans un conteneur `.p-legacy-skin`
(`src/styles/premium.css`) qui redéclare les variables historiques avec les
valeurs de la palette premium active.

Le mécanisme tient au fait que Tailwind compile `bg-canvas-800` en
`rgb(var(--canvas-800-rgb) / <alpha-value>)` : redéclarer la variable sur un
ancêtre fait suivre **tout le sous-arbre** — surfaces, texte, accents, ombres,
modales comprises (aucune n'est portée par un portail React — vérifié).

### Ce qui a été fait

| Élément | Contenu |
|---|---|
| `src/pages/premium/PremiumCreate.tsx` (nouveau) | shell premium + en-tête (clés i18n `createWizard.*` réutilisées) + wizard enveloppé. **Aucun import d'anchor, de web3 ni de wallet** : habillage pur |
| `.p-legacy-skin` (`premium.css`) | 9 blocs (4 palettes claires, neutralité sombre, 4 palettes sombres) + remappage des couleurs sémantiques Tailwind + `.glass-panel` → panneau premium |
| `App.tsx` | `#/create` → `PremiumCreate` ; **`/v1/create` reste branché** sur la page legacy |
| `scripts/premium-create.test.ts` (nouveau, 9 tests) | périmètre, parité, peau, couverture |

### Points de conception notables

- Les valeurs de la peau sont **générées** depuis les palettes du même fichier,
  et le test les **recalcule** : une palette modifiée sans régénérer la peau
  fait échouer la suite en nommant la variable. Sans ce contrôle, la peau
  dériverait en silence et le wizard afficherait un contraste calculé pour
  l'ancien thème.
- Les couleurs sémantiques du wizard (ambre = attention, émeraude = succès,
  rouge = erreur) sont écrites en **palette Tailwind figée**, pensée pour le
  noir : sur l'ivoire premium elles disparaissent. La peau les remappe sur les
  rôles `--p-warn` / `--p-ok` / `--p-err`, et le test **relit les sources du
  wizard** pour exiger une règle par classe réellement utilisée.
- Aplats **pleins** (`bg-amber-500`, `bg-emerald-500`) laissés en Tailwind,
  exceptions documentées : vifs dans les deux modes, ils portent l'encre
  `text-ink-900`. Les remapper donnerait, en mode clair, un aplat sombre sous
  une encre sombre — illisible.
- `--ink-900-rgb` reste une encre quasi noire constante ; seul l'aplat
  d'accent reçoit du texte blanc (`.bg-accent-violet.text-ink-900`), comme le
  `.p-btn.primary` du shell premium.

### Vérifié dans le navigateur (08/10)

- `#/create` en **clair (ivory)** : en-tête premium, wizard dans un panneau
  blanc bordé, variables de peau = `247 246 243` / `85 85 95` / `76 33 196`
  (fond, texte secondaire, accent premium) ;
- bascule **sombre** faite par le **vrai** contrôle de la nav (écrit
  `buildpact.appearance.mode=dark`) : bandeaux ambre/émeraude/rouge lisibles,
  CTA blanc sur accent, aplats pleins inchangés ;
- `#/v1/create` rend toujours la page legacy, sans peau — le filet tient ;
- console sans erreur ; état du navigateur de test remis à zéro (localStorage
  vidé, mode revenu à clair).

### Limite assumée

Le wizard **à wallet connecté** n'a pas pu être parcouru en local : sans
wallet, les étapes 2 et 3 montrent « Connectez votre wallet ». La peau a donc
été vérifiée sur les **chromas réels** du wizard (bandeaux, champs, CTA,
liens, panneau), injectés avec leurs classes exactes dans le conteneur — pas
sur un parcours complet de signature.

- `typecheck` 0 · `npm test` **57/57** (9 nouveaux) · `build` 0 ·
  `guard:push` « 4 fichier(s) sur 5 » · poussé `cfa29fd..dcab942`.

### Dépendances

- Indépendant du chantier 1.
- **Précède le chantier 3** : la création de pact existe désormais des deux
  côtés, `/v1` peut être retiré sans casser le parcours principal.

---

## 4. Chantier 4 — Cohérence de la carte · `[SÛR]` · **FAIT**

Commit `42e4867` (5 fichiers, poussé). Le dégradé de repli était en dur
(`#10081c…#3E2496`) et ne suivait ni la palette ni le mode clair — il restait
violet même en thème Atelier (or) ou Solana (émeraude).

### Le constat qui a élargi le chantier

Le dégradé n'était pas à un seul endroit mais à **trois** : la carte partagée,
la fiche pact (`PremiumPact.tsx`, bandeau de 140 px) et le bandeau de profil
(`PremiumProfil.tsx`, 110 px) — exactement la divergence que le module partagé
existe pour empêcher. Les trois copient aussi le même `<img width:100%;
height:100%>`.

### Deux défauts, une seule cause par défaut

1. **Bannière carrée qui recouvre la carte** (signalé sur capture) : dans un
   bandeau `display:grid; place-items:center` haut de 96 px, un `<img
   height:100%>` voit sa hauteur résolue contre la **piste de grille** —
   elle-même calculée d'après le contenu. L'image prenait donc sa hauteur
   naturelle : une bannière 1024×1024 débordait de 208 px et masquait titre,
   description et chiffres. Correctif : l'image sort du flux
   (`bannerImageStyle()` : position absolue, inset 0) **et** le bandeau découpe
   (`overflow: hidden`).
2. **Repli hors thème** : dégradé et encre de la lettre passent aux tokens
   `--p-*`. Les teintes sont les variantes **claires** (`--p-accent-soft`,
   `--p-ok-soft`) : un aplat saturé des palettes claires (#4c21c4) écraserait
   la pastille de logo posée dessus.

### Garde-fou

`scripts/premium-card.test.ts` : le test du dégradé n'affirme plus des hex mais
l'absence de couleur littérale et la présence de tokens `--p-*` ; deux tests
couvrent le style d'image et la découpe ; un balayage relit **toutes** les
pages premium pour qu'une quatrième copie du dégradé ne repasse pas inaperçue.

### Vérifié dans le navigateur

Onglet Pacts, 4 pacts réels : bannière **96 px** exactement pour les quatre
(dont deux bannières carrées qui débordaient), `position: absolute`,
`overflow: hidden`, titre/description/chiffres visibles sur les quatre.
`typecheck` 0 · `npm test` **63/63** · `build` 0 · poussé `dcab942..42e4867`.

### Hors code (données on-chain)

Deux pacts ont une description qui **commence** par `[🤝 Les deux]` : le texte
est réellement stocké ainsi dans le champ `description` on-chain (vérifié :
`5b 1f91d …` dans le DOM), et se termine par `| Rôles créateur : 👑 …`. Ce
n'est pas un défaut d'affichage. Le créateur peut le corriger via
`updateDescription` (`EditDescriptionModal` / `MigratePactButton`), donc avec
une signature.

### Dépendance

Fait **avant le chantier 3**, pour ne pas retoucher un fichier qu'on s'apprête
à déplacer.

---

## 4bis. Correctif — le profil premium écrit enfin au serveur · `[SÛR]` · **FAIT**

Trouvé en relisant la référence, pas par un test : `PremiumProfil` demandait une
signature de wallet… puis écrivait **uniquement** dans `localStorage`
(`premiumProfilV2`). Or `PremiumBuilders` lit l'annuaire via `listAllProfiles()`
(Supabase). Un pseudo, un avatar ou une bannière modifié côté premium n'apparaissait
donc **ni dans l'annuaire des builders, ni sur un autre appareil** — seul le chemin
legacy écrivait vraiment (`submitProfileUpdate` → Edge Function `update-profile`).
Et le commentaire du composant (« le profil on-chain reprend la main à la prochaine
synchro ») décrivait une synchro qui n'existe pas dans le code : c'est exactement le
genre de phrase qui rend un document rassurant et faux.

### Ce qui a été fait

- `PremiumProfil.handleSave` écrit d'abord en **local** (la fiche se met à jour tout de
  suite, et reste lisible hors-ligne), puis appelle `submitProfileUpdate` ;
- le message signé n'est plus fabriqué par le composant : c'est le **message canonique**
  de `submitProfileUpdate` (wallet + horodatage, anti-replay), le seul que l'Edge Function
  sait vérifier. La signature demandée auparavant ne prouvait rien côté serveur ;
- le profil **distant est relu avant l'envoi** (`fetchProfile`) puis fusionné : le
  formulaire premium n'expose ni bio, ni liens, ni disponibilité, ni palette de thème, et
  `submitProfileUpdate` envoie le profil **entier** — un objet partiel les aurait effacés
  en base (même bug que § 2bis) ;
- la fusion vit dans `lib/profileForm.ts` (`mergeIntoRemoteProfile`) : logique pure,
  testable sans navigateur, comme le reste de ce module ;
- le seul champ sans équivalent direct est le **niveau** : la base stocke une map
  rôle → niveau, le formulaire premium n'en expose qu'un. Il est appliqué au rôle dont le
  niveau est affiché — c'est exactement ainsi que le formulaire s'amorce ; sans rôle
  déclaré, la map distante est laissée intacte plutôt que d'inventer une clé que rien
  n'afficherait ;
- si Supabase n'est pas configuré, le message affiché ne prétend pas que le profil est
  publié (`profile.savedLocal`) ; si l'envoi échoue, le cache local est **conservé**, le
  formulaire se rouvre et l'erreur est affichée — jamais de succès silencieux ;
- le bouton se verrouille pendant l'aller-retour, sinon un double clic envoie deux
  écritures.

### Vérifié

`npm run typecheck` 0 · `npm test` **71/71** (dont 5 nouveaux sur la fusion : champs
conservés, champ vidé en `null`, niveau appliqué au bon rôle, aucun niveau inventé) ·
`npm run build` 0. Le contrat de l'Edge Function a été relu pour l'occasion : noms de
champs et bornes identiques à ceux du portail historique, qui est déjà en service.

### Limite

Le parcours complet — signature par un wallet réel, puis relecture dans l'annuaire — n'a
pas été exécuté : il demande un wallet. C'est la seule chose qui manque pour tenir le
correctif pour prouvé de bout en bout ; le pas à pas est dans
`CHECKLIST-TEST-WALLET-2026-10-08.md`.

---

## 5. Chantier 3 — Retrait progressif de `/v1` · `[ACCORD]` · **EN DERNIER**

**Le plus gros et le plus risqué.** Le legacy n'est pas seulement de la dette :
c'est aussi le filet de sécurité et le dernier accès à deux fonctions uniques.

### étapes

| Étape | Contenu | Risque |
|---|---|---|
| 3a | Inventorier ce qui n'existe **qu'en** legacy : `MonProfilPage` (= Paramètres), `DocsPage` / `AboutPage` longues, `CreatePactPage` | `[SÛR]` |
| 3b | Migrer chaque fonction unique vers le premium (chantiers 1 et 2 couvrent les principales) | `[ACCORD]` |
| 3c | Rediriger `/v1/*` vers l'équivalent premium, puis supprimer les pages et leurs composants | `[ACCORD]` |

### Ce qui disparaîtra au 3c

Pages : `DashboardPage`, `PactsPage`, `MarketplacePage`, `DocsPage`, `AboutPage`,
`MonProfilPage`, `TreasuryPage`, `BuildersPage`, `NetworkPage`.
Composants : `DashboardLayout`, `ModeToggle`, `ThemeModeGrid`, `BackgroundSwitch`,
`GlowStrengthSwitch`, `ImagePreviewSettings`, `MockupPreviewFrame`,
`NotificationSettings`, `CsvExportButton`, et les palettes legacy de
`src/index.css` / `src/lib/theme/`.

Cette liste est un **résumé**. La liste mesurée — **52 fichiers**, obtenus par fermeture
transitive des imports, dont `PactPublicPage` qui manquait aux listes précédentes — et les
**cinq familles fonctionnelles sans équivalent premium** sont dans
`INVENTAIRE-V1-2026-10-08.md` § 5. C'est cet inventaire qui fait référence pour le 3c.

**Point vérifié avant de supprimer quoi que ce soit :** les quatre fonctions de
`NotificationSettings` / `CsvExportButton` / confidentialité / aperçu image sont
**déjà** accessibles côté premium (§ 2bis). En revanche `ImagePreviewSettings`
partage l'état `previewEnabled` avec `ThemeContext` : supprimer ce composant ne
casse rien, mais **ne pas** supprimer `ThemeContext` tant que
`ImageHoverPreview` (utilisé par `PostCard`, monté côté premium) s'en sert.

### Dépendances — bloquantes

- **Bloqué par le chantier 1** : sinon plus aucune porte vers les Paramètres.
- **Débloqué par le chantier 2** ✅ : `/create` existe désormais côté premium
  (dcab942), le retrait de `/v1` ne casse plus le parcours principal.
- **Débloqué par le chantier 4ter** ✅ : la famille sociale n'est plus un motif
  de conserver `/v1`. Il reste **deux** familles sans équivalent premium —
  la gamification (XP/badges/quêtes) et le panneau wallet — plus le lien
  « Historique ↗ » de `PremiumNav`, dont la cible est à trancher en même temps
  que la décision.

---

## 4ter. Chantier 4ter — Migration de la famille sociale · `[SÛR]` · **FAIT**

Dernier obstacle fonctionnel identifié par `INVENTAIRE-V1-2026-10-08.md` § 3 :
quatre fonctions n'existaient QUE dans le legacy — demande de contact entre
builders, notation (1 → 6 étoiles), fiche détaillée d'un builder, sessions de
chat. Les supprimer avec `/v1` aurait retiré des fonctions utilisateur, pas de
l'habillage ; les migrer est ce qui rend le retrait de `/v1` neutre.

### Ce qui a été fait

| Élément | Contenu |
|---|---|
| `PremiumStarRating.tsx` (nouveau) | étoiles — l'étoile pleine prend `--p-warn`, pas le `--accent-gold` legacy figé |
| `PremiumContactDialog.tsx` (nouveau) | demande de contact, via `sendContactRequest` de `lib/contact.ts` |
| `PremiumBuilderDetail.tsx` (nouveau) | fiche complète : bio, toutes les compétences + niveau, liens, wallet, note |
| `PremiumChatSessions.tsx` (nouveau) | liste locale des jetons + révocation serveur, via `lib/chatSession.ts` / `lib/chat.ts` |
| `PremiumBuilders.tsx` | notation, ouverture de la fiche, bouton contact — et **état d'erreur** (voir ci-dessous) |
| `PremiumProfil.tsx` | monte le panneau Sessions de chat, conditionné au wallet |
| `PremiumSwitch`-style : `--p-overlay` | voile des modales ajouté aux 4 palettes + un bloc sombre, pour ne pas câbler un `rgba()` en dur |
| `scripts/premium-social.test.ts` (nouveau, 11 tests) | composants rendus, libs partagées, zéro habillage legacy, tokens `--p-*` déclarés, clés i18n FR **et** EN |
| `scripts/premium-data-reach.test.ts` (nouveau, 7 tests) | une page premium ne convertit pas un échec de lecture en collection vide |

### Le défaut trouvé en chemin, et corrigé

`listAllProfiles()` renvoyait `[]` **aussi bien** quand l'annuaire est vide que
quand la base est injoignable : l'information était perdue avant d'atteindre
l'écran, donc aucune page ne pouvait la rattraper, et l'utilisateur lisait
« 0 builder » alors que le serveur était simplement tombé. Le patron se
retrouve dans toute lecture qui convertit un échec en collection vide
(`if (error) { …; return []; }`, `.catch(() => setX([]))`).

- `lib/profileRemote.ts` expose désormais `listAllProfilesResult()`, qui
  DISTINGUE `{ profiles: [] }` d'`{ error }` ; `listAllProfiles()` délègue et
  n'a plus de requête à elle (une seconde lecture ferait diverger les deux) ;
- `PremiumBuilders` passe par la variante qui rapporte, affiche l'échec
  (`builders.remoteOffline`, nouvelle clé FR **et** EN) et distingue
  explicitement « annuaire vide » (`builders.emptyDirectory`) d'« annuaire
  injoignable » ;
- le garde-fou interdit aux pages premium d'employer le lecteur qui avale
  l'échec, et exige une surface d'erreur (`role="alert"`) sur toute page
  branchée sur un lecteur de liste.

### Décisions de conception

- **Aucune logique dupliquée** : les composants premium appellent les mêmes
  modules que le legacy (`lib/contact.ts`, `lib/chat.ts`, `lib/chatSession.ts`),
  donc une note ou une révocation faite d'un côté est vue de l'autre.
- **Le libellé des sessions de chat vit désormais dans les dictionnaires**
  (namespace `chatSession`, FR et EN) au lieu d'un ternaire `lang === 'en'`
  dans le composant — la symétrie des deux langues est vérifiée.
- **`listAllProfiles()` n'est pas supprimée** : le legacy et le profil s'en
  servent là où une liste vide est un repli acceptable. C'est son emploi sur
  une page de RENDU qui est proscrit.

### Vérifié

`npm run typecheck` 0 · `npm test` **111/111** (92 → 111, dont 18 nouveaux) ·
`npm run build` 0 · contrôle documents **5 pages** · les six modules de la
famille se transforment sans erreur via le serveur de dev (`/src/pages/premium/*.tsx`,
HTTP 200). Les six mutations de contrôle ont été jouées et ont **chacune** fait
échouer la suite : import premium retiré, habillage legacy injecté, clé i18n
renommée d'un seul côté, `.catch(() => setProfiles([]))` réintroduit, lecteur
qui avale l'échec réemployé, `role="alert"` retiré.

### Limite

Le rendu n'a **pas** été vu dans un navigateur : le panneau d'aperçu ne s'est
pas attaché pendant cette session. Ce qui est prouvé est que les modules
compilent dans le pipeline réel de Vite et que les garde-fous tiennent ; ce qui
reste à faire à la main est le parcours de signature (noter un builder,
contacter, révoquer), qui exige un wallet réel — il est déjà pas à pas dans
`CHECKLIST-TEST-WALLET-2026-10-08.md`.

---

## 4quater. Chantier 4quater — Gamification et panneau wallet · `[SÛR]` · **FAIT**

Les deux dernières familles de `INVENTAIRE-V1-2026-10-08.md` § 3. Après ce
chantier, **aucune page premium ne pointe vers `/v1`** : la liste blanche de
`scripts/premium-v1-boundary.test.ts` est vide, et un test l'exige.

### Ce qui a été fait

| Fonction | Composant premium | Ce qu'il rend |
|---|---|---|
| Progression | `PremiumProgression` | rang (7 paliers), barre XP vers le suivant, étagère de badges débloqués **et** verrouillés avec compteur |
| Quêtes | `PremiumQuests` | 3 quêtes hebdo + réclamation signée, chronique on-chain, historique des semaines |
| Wallet | `PremiumWalletPanel` | solde SOL, tokens SPL et Token-2022, 12 dernières transactions |

Tous trois montés par `PremiumProfil`, conditionnés au wallet et écrits en
tokens `--p-*` : ils suivent donc les 4 palettes × 2 modes sans travail
dédié. Aucune mécanique n'est rejouée — `computeRank`, `BADGE_ORDER`,
`claimQuestReward` et les autres viennent de `lib/gamification.ts`, le même
module que le legacy. Une quête réclamée sur `/v1` s'affiche ici sans rien
synchroniser, et inversement.

### Les deux fonctions qui bloquaient le retrait du portail

Le lien `#/v1/profile` n'était pas décoratif : il donnait accès à l'avatar par
**fichier** et à l'**export PDF**, qui n'existaient nulle part ailleurs. Les
retirer avec le lien aurait supprimé deux fonctions utilisateur sans que rien
ne le signale. Toutes deux ont donc été migrées d'abord : upload signé via
`uploadProfileAvatar` (lib partagée, donc un avatar changé ici apparaît dans
l'annuaire), export via `window.print()` sous le même `PRINT_STYLE` que
`MonProfilPage` — l'identifiant d'impression est `#premium-profile-sheet`.

### Le défaut trouvé en chemin : six lecteurs qui avalaient l'échec

En branchant les panneaux, la même famille de bug que `listAllProfiles()` est
réapparue, six fois. Chaque lecture de gamification confondait « rien » et
« je n'ai pas pu lire » :

| Lecteur | Repli en cas d'échec | Ce que l'écran affirmait alors |
|---|---|---|
| `fetchWalletXp` | `0` | « 0 XP » à un wallet qui en a 3 000 |
| `computeBadgeProgress` | tous verrouillés | « tu n'as jamais rien fait » |
| `fetchWeeklyQuestProgress` | `done: 0` partout | « semaine vierge » |
| `fetchClaimedThisWeek` | `Set` vide | boutons « Réclamer » sur des quêtes **déjà payées** |
| `fetchWalletChronicle` | `[]` | « aucun événement » |
| `fetchQuestHistory` | `[]` | « rien pour l'instant » à quelqu'un qui a réclamé sa semaine |

Le correctif suit le patron déjà éprouvé : une variante `…Result` par lecture,
qui rapporte l'échec, et la fonction d'origine réduite à une **délégation**.
Les appelants legacy continuent de fonctionner à l'identique, et les deux
variantes ne peuvent pas diverger puisqu'il n'existe qu'une implémentation.
Un septième cas a été corrigé dans l'autre sens : `PremiumWalletPanel` ne
signale plus « aucun token détenu » quand **les deux** programmes
(SPL Token et Token-2022) échouent — c'était le seul cas où la liste vide
était un mensonge.

### Décisions de conception

- **Les jeux d'icônes sont partagés, nommément déclarés.** `RankIcons` et
  `QuestIcons` sont des SVG en `currentColor`, sans palette ni encre propre :
  les réécrire aurait dupliqué 7 rangs et 9 glyphes pour zéro token. Toute
  autre importation depuis `components/` est refusée par le garde-fou.
- **`ClaimBurst` n'est pas repris.** L'animation de particules portait
  l'habillage legacy et n'apportait aucune information.
- **La série de semaines reste silencieuse en cas d'échec.** `fetchQuestStreak`
  replie sur 0, ce qui a le même effet à l'écran que « aucune série » : la
  puce disparaît. C'est une décoration, pas une donnée financière, et c'est
  écrit dans le composant. Même arbitrage pour la rareté des badges.
- **Après une réclamation, on relit tout** au lieu de patcher l'état local :
  le serveur peut avoir versé le bonus en plus de la quête, donc l'état ne se
  devine pas, il se relit.
- **L'avatar envoyé n'est pas enregistré d'office.** L'URL renvoyée est posée
  dans le formulaire ; c'est « Enregistrer » qui persiste le profil. Une seule
  écriture signée à expliquer, et l'utilisateur voit ce qu'il envoie.
- **`profile.legacyPortal` a été retiré des deux dictionnaires.** Une clé
  orpheline est l'ombre que laisse un lien retiré.

### Garde-fou

`scripts/premium-gamification.test.ts`, et il a été prouvé en le faisant
échouer — **7 mutations, 7 échecs** :

| Mutation jouée | Résultat |
|---|---|
| panneau monté sans garde wallet | exit 1 |
| `fetchWalletXpResult` remplacé par le lecteur qui avale l'échec | exit 1 |
| couleur littérale (`rgba(...)`) injectée dans le panneau wallet | exit 1 |
| `role="alert"` retiré des quêtes | exit 1 |
| clé `gamification.offline` renommée d'un seul côté (FR) | exit 1 |
| libellé `rankLegendary` renommé d'un seul côté (EN) | exit 1 |
| variante d'origine remise à interroger la base au lieu de déléguer | exit 1 |

Le test des 7 rangs existe pour ça : les libellés sont appelés en dynamique
(`t(\`gamification.${rankKey}\`)`), donc un scan de chaînes littérales ne les
voit pas — c'est exactement par ce trou qu'une seule des deux langues
perdrait un rang.

### Vérifié

`npm run typecheck` 0 · `npm test` **133/133** (111 → 133, dont 22 nouveaux) ·
`npm run build` 0 · contrôle documents **5 pages**. Dépot remis à l'identique
après les mutations (les 7 fichiers comparés un à un).

**Et cette fois, le rendu a été vu** — pas seulement compilé. Une sonde
temporaire (supprimée depuis, dépôt propre vérifié) montait les trois panneaux
avec un wallet factice, dans l'empilement de providers de `App.tsx`, et le
navigateur a rendu, en mode clair « ivoire » :

- 3 sections, titres `Progression` / `Badges` / `Quêtes de la semaine` / `Wallet` ;
- la barre XP avec `role="progressbar"`, `aria-valuenow="0"` et son `aria-label` ;
- les 3 onglets `Quêtes` / `Chronique` / `Historique` et les compteurs de badges
  (`0/7 débloqués`, les 7 pastilles avec leur seuil) ;
- le panneau wallet, avec des **vraies** lectures RPC (soldes et tokens du
  wallet de test, obtenus en direct) ;
- `--p-canvas: #ffffff` et `--p-accent: #4c21c4` résolus : la palette claire est
  bien branchée.

Un contrôle de contraste automatisé (rapport de luminance texte/fond, en
remontant les ancêtres jusqu'à un fond opaque) a tourné dans les **deux** modes :
**aucun** problème en clair — c'est le cas où l'habillage legacy devenait
illisible — et un seul signalement en sombre, qui est un faux positif assumé de
la sonde (fond translucide traité comme opaque ; l'accent violet sur le canvas
`#17161f` est bien contrasté).

C'est aussi ce rendu qui a montré un défaut qu'aucun test ne voyait : deux
phrases du profil (`profile.emptyBio`, `profile.v2Note`) renvoyaient encore au
« portail historique », lien désormais retiré. Corrigées dans les deux langues.

### Limite

Pas de **capture d'écran** : le panneau d'aperçu ne produit pas d'images dans
cette session (« no frames »), donc le contrôle visuel est passé par le DOM et
les styles calculés, pas par le pixel. Ce n'est pas un détail cosmétique : une
couleur juste mais un décalage de mise en page ne serait pas attrapé ainsi.

Ce qui reste à faire à la main, et qu'aucune sonde ne remplace : les parcours
**signés** — réclamer une quête, envoyer un avatar par fichier, exporter le PDF,
révoquer les sessions. Ils exigent un wallet réel et sont pas à pas dans
`CHECKLIST-TEST-WALLET-2026-10-08.md`.

Enfin, le chemin d'**échec** des six lecteurs n'a pas été exercé en direct : le
backend Supabase répond dans cet environnement, donc les variantes `…Result` ont
rendu des valeurs (lecture réelle, succès) et le bandeau `role="alert"` des
panneaux n'a jamais eu à s'afficher. Ce qui est prouvé là-dessus : la délégation
de chaque `…Result` vers son socle (garde-fou + mutation M7), le fait que les
composants testent bien `'error' in r`, et la traduction de la sentinelle
(vérifiée en direct : `readErrorLabel` rend `errors.notConfigured` pour
`GAMIFICATION_OFFLINE` et `gamification.offline (…)` sinon). Le cas « base
tombée sans que `supabase` soit nul » n'a donc pas été observé à l'écran.
`PactPublicPage` n'est pas traité ici.

---

## 6. Ordre recommandé et dépendances

```
0 (garde-fou)  ✅ FAIT + poussé (55586b4)
      │
      ▼
1 (Paramètres premium)  ✅ FAIT (66229f9)
      │
      ├──► 1b (réglages legacy migrés)  ✅ FAIT (cfa29fd)
      │
2 (/create premium)    ✅ FAIT (dcab942) ──┐
                                           ├──► 3 (retrait /v1)
4 (dégradé cartes)     ✅ FAIT (42e4867) ──┤
4ter (famille sociale) ✅ FAIT (ce lot)  ──┘
```

**Ordre : 0 ✅ → 1 ✅ → 1b ✅ → 2 ✅ → 4 ✅ → 4ter ✅ → 3.** Il ne reste que le
retrait de `/v1` (chantier 3), qui demande une décision : garder `/v1` comme
porte de débogage, ou le supprimer pour de bon (et alors trancher aussi la
destination des deux familles restantes — gamification, panneau wallet — et le
lien « Historique ↗ » de `PremiumNav`).

---

## 7. Règles à ne pas casser (rappel projet)

- Push par **lots de 5 fichiers maximum** — désormais appliqué partout par le
  garde-fou versionné (chantier 0). Contournement explicite : `ALLOW_MASS_PUSH=1`.
- Deux échecs consécutifs sur le même problème → **STOP et demander**.
- Le shell premium et le legacy ont des **défauts opposés** : premium **clair**,
  legacy **sombre**. Ne jamais faire lire `data-mode` au premium ni
  `data-appearance`/`data-appearance-mode` au legacy.
- Une carte projet se modifie dans `PremiumProjectCard`, **jamais** dans les pages.

---

*Ce journal vit dans `docs/` du dépôt de l'app (`buildpact-75mv/`) et y est versionné
comme les autres documents. C'est le journal technique : la référence lisible par un
extérieur est `ETAT-APP-2026-10-08-FR.md` / `-EN.md`, qui renvoie ici pour tout ce qui est
mécanisme, numérotation ou commit. Les deux tiennent la même frontière — l'état pour tous,
le journal pour nous.*
