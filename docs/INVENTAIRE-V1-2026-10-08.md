# 🔎 CHANTIER 3a — INVENTAIRE DE CE QUI N'EXISTE QU'EN `/v1`

> Mesuré le 08/10/2026 sur `buildpact-75mv` · commit `5a6d9f6` · **aucune
> suppression n'a été faite** : ce document est une étape d'inventaire, pas un
> chantier exécuté.

---

## 1. Méthode (reproductible, pas une impression)

L'inventaire n'est pas une relecture à l'œil : c'est la fermeture transitive des
imports, calculée depuis les points d'entrée de chaque famille de routes.

- Entrées **premium** : les 11 pages de `src/pages/premium/` référencées par
  `App.tsx` (`PremiumDashboard`, `PremiumMarketplace`, `PremiumPacts`,
  `PremiumBuilders`, `PremiumTreasury`, `PremiumPact`, `PremiumProfil`,
  `PremiumNetwork`, `PremiumDocs`, `PremiumAbout`, `PremiumCreate`).
- Entrées **legacy** : les 11 pages servies uniquement sous `/v1/*`
  (`DashboardPage`, `PactsPage`, `CreatePactPage`, `MarketplacePage`,
  `DocsPage`, `AboutPage`, `PactPublicPage`, `MonProfilPage`, `TreasuryPage`,
  `BuildersPage`, `NetworkPage`).
- Communs, exclus du calcul parce qu'atteignables des deux côtés : `App.tsx`,
  `SeekerNexusBadge`, `ErrorBoundary`, `lib/router.ts`, `lib/ThemeContext.tsx`.
- Un fichier est « exclusif à `/v1` » s'il est atteignable depuis une entrée
  legacy et **jamais** depuis une entrée premium.

Copie du calcul : `node` + parcours récursif des imports relatifs
(`from './x'`, résolution `.ts` / `.tsx` / `index.*`). Résultat :

```
atteignables premium : 93 · legacy : 126 · legacy-exclusif : 52
```

**Limite assumée** : un import résolu dynamiquement ou construit à la volée
échapperait au calcul. Vérification croisée faite sur les 52 (recherche du nom
du composant dans tout `pages/premium/`) : aucun n'est utilisé côté premium.

---

## 2. Les 52 fichiers exclusifs à `/v1`

### 2.1 Les 11 pages

`DashboardPage`, `PactsPage`, `CreatePactPage`, `MarketplacePage`, `DocsPage`,
`AboutPage`, `PactPublicPage`, `MonProfilPage`, `TreasuryPage`, `BuildersPage`,
`NetworkPage`.

⚠️ Le document de référence liste 10 pages à supprimer et **oublie
`PactPublicPage`** : c'est le rendu legacy de `#/v1/pact/<pda>`, et le seul
chemin vers l'explorateur de vault/rôles de l'ancien design.

### 2.2 Les composants (38)

`AddMemberModal`, `BackgroundSwitch`, `BadgeShelf`, `BuilderDetailModal`,
`ChatSessionsPanel`, `ClaimBurst`, `ContactModal`, `CsvExportButton`,
`CustomRpcSettings`, `DashboardLayout`, `DemoKit`, `DensitySwitch`,
`EditDescriptionModal`, `EditMediaModal`, `FreeGrid`, `GlowStrengthSwitch`,
`ImagePreviewSettings`, `InfoTooltip`, `LanguageSwitch`, `MarketplaceCard`,
`MockupPreviewFrame`, `ModeToggle`, `NotificationSettings`, `PactCard`,
`ProfileSettingsModal`, `QuestBoard`, `QuestIcons`, `StarRating`, `StatsCard`,
`ThemeModeGrid`, `ToggleSwitch`, `TranslationStatus`, `UsdToggleSettings`,
`WalletPanel`, `XpBar`, `pact/OrbitalCapTable`, `pact/PactTimeline`,
`pact/VaultShareGauge`.

### 2.3 Les modules de logique (3)

`lib/contact.ts`, `lib/exportTreasury.ts`, `lib/seen.ts`.

**Le compte doit tomber juste** : 11 pages + 38 composants + 3 modules = **52**,
le total annoncé au § 1. Si tu retrouves un autre chiffre dans un document, c'est
celui-là qu'il faut corriger.

---

## 3. Lecture fonctionnelle — qu'est-ce qui manque vraiment au premium ?

Un fichier exclusif n'est pas toujours une **fonction** perdue : beaucoup de
composants legacy ont un équivalent premium réécrit. Ce tableau sépare les deux
cas. La colonne « premium ? » a été vérifiée par recherche du nom du composant
dans `pages/premium/` **et** par lecture de la page premium correspondante.

| Fonction legacy | Premium équivalent ? | Verdict |
|---|---|---|
| Création de pact (wizard) | ✅ `PremiumCreate` (peau `.p-legacy-skin`) | **Migré** |
| Paramètres (densité, RPC, langue, USD, apparence) | ✅ `PremiumSettings` | **Migré** |
| Notifications, aperçu image, confidentialité, export CSV | ✅ `PremiumSettings` | **Migré** |
| Édition du profil (pseudo, avatar, bannière, niveau) | ⚠️ `PremiumProfil` — **localStorage seulement** | **Tronqué** (voir § 4) |
| **XP, badges (24), quêtes journalières, streak** | ✅ `PremiumProgression` + `PremiumQuests` (profil) | **Migré** (09/10) |
| **Panneau Wallet** (soldes SOL + SPL, dernières transactions brutes) | ✅ `PremiumWalletPanel` (profil) | **Migré** (09/10) |
| **Sessions de chat** (liste locale + révocation globale) | ✅ `PremiumChatSessions` (profil) | **Migré** (08/10) |
| **Demandes de contact entre builders** | ✅ `PremiumContactDialog` | **Migré** (08/10) |
| **Notation des builders (1 → 6 étoiles)** | ✅ `PremiumStarRating` | **Migré** (08/10) |
| **Fiche détaillée d'un builder** | ✅ `PremiumBuilderDetail` | **Migré** (08/10) |
| **Export / audit de la trésorerie** | ⚠️ assumé : `PremiumTreasury` renvoie au legacy par le lien « Historique ↗ » | **Dépendance assumée** — `lib/exportTreasury.ts` |
| Profil modulaire (blocs déplaçables) | ❌ aucun | **Perdu** — `FreeGrid` |
| Décor de fond, thème legacy, intensité des halos | ❌ volontairement | **Décision motivée** |
| `DemoKit`, `TranslationStatus` | ❌ | **Outils internes**, pas des fonctions utilisateur |

**Le constat qui compte :** ce qui n'existe qu'en `/v1` n'est pas seulement
cosmétique. Deux familles fonctionnelles n'ont **aucun** équivalent premium :
la gamification (XP/badges/quêtes) et le panneau wallet. Les supprimer sans
migrer retirerait des fonctions réelles, pas de la dette d'habillage.

**Mise à jour du 08/10 — la famille sociale n'est plus dans cette liste.**
Quatre fonctions y figuraient (contact, notation, fiche détaillée d'un builder,
sessions de chat) : elles ont été migrées dans le shell premium
(`PremiumContactDialog`, `PremiumStarRating`, `PremiumBuilderDetail`,
`PremiumChatSessions`), câblées dans `PremiumBuilders` et `PremiumProfil`. Les
libs restent partagées avec le legacy (`lib/contact.ts`, `lib/chat.ts`,
`lib/chatSession.ts`) — une note ou une révocation faite d'un côté est vue de
l'autre. Le détail et les garde-fous sont dans
`PLAN-CHANTIERS-PREMIUM-2026-10-08.md` § 4ter.

**Mise à jour du 09/10 — les deux familles perdues sont migrées, `/v1` n'a plus d'appelant premium.**
La gamification (rang, XP, badges) est rendue par `PremiumProgression`, les
quêtes et la chronique par `PremiumQuests`, le panneau wallet par
`PremiumWalletPanel`, tous montés par `PremiumProfil`. Deux fonctions ne
tenaient pas dans ces trois panneaux et vivaient encore sous le portail
`#/v1/profile` : l'avatar par **fichier** et l'**export PDF**. Elles ont été
migrées en même temps (`uploadProfileAvatar` de `lib/profileRemote.ts`, déjà
partagée, et `window.print()` sous le même `PRINT_STYLE` que `MonProfilPage`),
puis le lien a été retiré. C'est cet ordre qui compte : retirer le lien
**avant** de migrer ces deux-là aurait supprimé deux fonctions utilisateur sans
que rien ne le signale.

Conséquence vérifiable : la liste blanche de `scripts/premium-v1-boundary.test.ts`
est désormais **vide**, et un test l'exige. Aucune page de `src/pages/premium/`
ne pointe vers `/v1`. Le détail, les garde-fous et ce qui n'a pas été vérifié
sont dans `PLAN-CHANTIERS-PREMIUM-2026-10-08.md` § 4quater.

**Ce qui reste à trancher pour `/v1` :** plus rien côté premium. Il ne reste
que la question de la porte de débogage elle-même (garder l'ancien habillage
pour comparer, ou l'éteindre), et `PactPublicPage` (voir § 5).

---

## 4. Les deux vrais problèmes trouvés en passant

### 4.1 Le profil premium n'écrit rien côté serveur

`PremiumProfil` (`src/pages/premium/PremiumProfil.tsx`) demande une signature,
puis écrit **uniquement** dans `localStorage`
(`writeStoredProfile(localStorage, myAddr, values)`, clé `premiumProfilV2`).
Le texte affiché est honnête (« ✅ Profil enregistré sur cet appareil
(localStorage) »), mais l'effet est mesurable : `PremiumBuilders` lit
`listAllProfiles()` via Supabase, donc **le pseudo, l'avatar et la bannière
modifiés en premium n'apparaissent jamais dans l'annuaire**, ni sur un autre
appareil.

Le chemin legacy (`MonProfilPage`) fait les deux : brouillon local **et**
`submitProfileUpdate` signé, qui passe par l'Edge Function `update-profile`.
Il n'existe aucune « synchro » ultérieure qui rattraperait le local : ce
commentaire du composant est faux, et c'est `PremiumSettings` (section
confidentialité) qui a la bonne approche — elle repart du profil distant et le
réécrit.

**Conséquence** : la signature demandée par `PremiumProfil` ne sert de rien
au-delà de la porte d'entrée (elle n'est envoyée à personne). Soit on branche
l'écriture distante (correctif), soit on retire la demande de signature (moins
bien : c'est la preuve de possession).

### 4.2 Le lien « Historique ↗ » de `PremiumNav` est une dépendance, pas un ornement

`PremiumTreasury` délègue explicitement export et audit à la page legacy par ce
lien. Retirer `/v1` casse donc l'export de trésorerie tant que le bouton d'export
n'est pas monté côté premium. Le lien et la décision doivent bouger ensemble —
c'est déjà écrit dans le plan, mais pas dans l'inventaire de suppression.

---

## 5. Recommandation motivée — garder ou supprimer ?

**Recommandation : ne pas supprimer `/v1` maintenant. Le garder comme porte de
débogage, avec une date de péremption et un objectif chiffré.**

Trois raisons, dans l'ordre de poids :

1. **Le filet a une valeur réelle et immédiate.** Les parcours de signature
   (créer, financer, approuver, distribuer) n'ont **jamais** été exécutés par un
   agent ; ils ne sont validés qu'à la main. Supprimer le legacy supprime la
   seule version du parcours que Noah a réellement testée avant de savoir si la
   version premium tient. La checklist wallet est justement le test qui doit
   trancher — pas l'inverse.
2. **Ce qui disparaît n'est pas de la dette.** Deux familles fonctionnelles
   n'ont aucun équivalent premium (§ 3) — la famille sociale en est sortie le
   08/10, par migration. Supprimer `/v1` sans migrer les deux restantes, c'est
   retirer des fonctions utilisateur pour faire propre dans l'arborescence — le
   mauvais échange. À l'inverse, supprimer `/v1` **après** migration est un
   bénéfice net : une seule source par intention, plus de coordonnée à tenir à
   jour en double.
3. **Le coût de garder est faible et connu.** `/v1` est isolé par le routeur
   (préfixe de hash), donc invisible dans la navigation. Le risque n'est pas la
   coexistence, c'est la **dérive** : un correctif appliqué d'un seul côté. Ce
   risque est déjà matérialisé une fois (le dégradé recopié à trois endroits,
   chantier 4) ; il est contenu par les tests premium existants.

### Ce qui doit être vrai avant de supprimer (critères de sortie)

- [ ] Checklist wallet déroulée : création, `fund`, `approve`, `remove_member`,
      `distribute` réussies depuis le shell premium
- [ ] Écriture distante du profil branchée sur `PremiumProfil` (§ 4.1) — sinon
      on perd aussi la dernière version qui écrit vraiment au serveur
- [ ] Export de trésorerie monté côté premium (§ 4.2)
- [x] Les 2 familles perdues (gamification, panneau wallet) sont **migrées**
      côté premium le 09/10 — voir `PLAN-CHANTIERS-PREMIUM` § 4quater. La
      liste blanche des liens `/v1` est vide et un test l'exige.
- [x] Famille sociale (contact, notation, fiche builder, sessions de chat)
      migrée côté premium le 08/10 — voir `PLAN-CHANTIERS-PREMIUM` § 4ter
- [ ] `PactPublicPage` tranché (garder un rendu legacy de la fiche pacte, ou
      assumer que seul le rendu premium existe)

### Si la décision est « supprimer »

Ordre sans casse : (1) migrer ou assumer les 5 familles ; (2) rediriger
`/v1/*` vers l'équivalent premium (`window.location.hash = '#/…'`) et laisser ce
filet **une semaine** en production — les anciens liens partagés et les favoris
passent encore ; (3) seulement ensuite retirer les pages, leurs composants et
les palettes legacy de `src/index.css` / `src/lib/theme/`. Les 52 fichiers de
§ 2 sont la liste de contrôle de l'étape 3.

### Si la décision est « garder »

Alors il faut au minimum : (a) écrire dans le plan que `/v1` est une **porte de
débogage**, pas un second produit ; (b) ne jamais y porter un correctif sans le
porter aussi côté premium — c'est la seule règle qui empêche la dérive ;
(c) ajouter un test qui échoue si une page legacy redevient la cible d'un lien de
la navigation premium, hors le lien « Historique ↗ » assumé.
