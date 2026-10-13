# 🧐 REVUE DES DOCUMENTS DE RÉFÉRENCE (FR + EN)

> 08/10/2026 · relu en entier : `ETAT-APP-2026-10-08-FR.md`,
> `ETAT-APP-2026-10-08-EN.md`, `PLAN-CHANTIERS-PREMIUM-2026-10-08.md`.
> **Une seule correction a été appliquée d'office** (une erreur factuelle, § 1).
> Tout le reste est proposé : rien n'est modifié tant qu'on ne l'a pas validé.

---

## 1. Erreur factuelle — corrigée

| # | Où | Ce qui était écrit | Réel mesuré le 08/10 |
|---|---|---|---|
| E1 | `ETAT` FR § 5 et EN § 5 | `npm test` **63/63** | **66/66** (les 3 tests du correctif des fonds HD) |

C'est le seul point où le document était **faux** au sens strict. Corrigé dans
les deux langues, et les `.html` ont été régénérés.

---

## 2. Incomplet — un manque fonctionnel non documenté

### I1 · Le profil modifié en premium ne part jamais au serveur

Le document présente le profil comme livré (« Profil builder sécurisé :
`signMessage`, avatar, niveau de compétence, mode aperçu/édition et export PDF »
dans les acquis, et `PremiumProfil` rangé du côté premium). Ce qui se passe
réellement :

- `PremiumProfil` demande une signature puis écrit **uniquement** dans
  `localStorage` (`premiumProfilV2`) ;
- `PremiumBuilders` lit l'annuaire via `listAllProfiles()` (Supabase) ;
- donc : un pseudo ou un avatar changé dans le shell premium **n'apparaît pas
  dans l'annuaire**, ni sur un autre appareil ;
- seul le chemin legacy (`MonProfilPage`) écrit vraiment, via
  `submitProfileUpdate` → Edge Function `update-profile`.

Le commentaire du composant (« le profil on-chain reprend la main à la prochaine
synchro ») décrit une synchro qui **n'existe pas dans le code**. C'est
précisément le genre de phrase qui rend un document rassurant et faux.

**Proposition** : ajouter une ligne en § 6 « Limites connues » — c'est une
limite réelle et vérifiée, pas une nuance. Et en faire un critère de sortie du
chantier 3 (voir `INVENTAIRE-V1-2026-10-08.md` § 5).

### I2 · La liste de suppression de `/v1` est incomplète

`ETAT` § 4 annonce 10 pages et une liste de composants ; l'inventaire mesuré
(fermeture transitive des imports) en trouve **52 fichiers**, dont
`PactPublicPage` — absent de la liste — et 29 composants supplémentaires
(`XpBar`, `BadgeShelf`, `QuestBoard`, `WalletPanel`, `ChatSessionsPanel`,
`ContactModal`, `StarRating`, `BuilderDetailModal`, `FreeGrid`, …).

Plus gênant que le décompte : **cinq familles fonctionnelles n'ont aucun
équivalent premium** et le document ne le dit pas. Un lecteur extérieur comprend
aujourd'hui que retirer `/v1` est un nettoyage d'habillage. C'en est aussi un,
mais pas seulement.

**Proposition** : remplacer la liste de § 4 par un renvoi à
`INVENTAIRE-V1-2026-10-08.md`, et y ajouter la phrase « ce qui n'existe qu'en
`/v1` comprend cinq familles fonctionnelles sans équivalent premium ».

### I3 · Le plan des chantiers affiche un état d'avant le dernier commit

`PLAN-CHANTIERS` § 0 : « `main` après les chantiers livrés = **`42e4867`**
(11 commits au-dessus de `869f0b7`) », « 28 fichiers changés ». Le dépôt est à
**`5a6d9f6`** (12 commits, 31 fichiers). Le plan est donc périmé d'un commit —
pas faux au moment où il a été écrit, mais c'est le premier chiffre qu'un lecteur
vérifie.

**Proposition** : soit mettre les deux lignes à jour, soit — mieux — écrire
« `main` au 08/10 : voir `ETAT`, § 1 » et ne plus dupliquer le hash dans deux
documents. Un hash recopié à deux endroits divergera toujours.

---

## 3. Trop technique pour un lecteur extérieur

Le document est excellent pour Noah. Pour un lecteur qui arrive de l'extérieur
(investisseur, jury, nouveau dev), trois passages demandent une clé de lecture
qu'il n'a pas :

| # | Passage | Pourquoi c'est un mur | Proposition |
|---|---|---|---|
| T1 | § 3 « Chantier 2 — comment » (`.p-legacy-skin`, manière dont Tailwind compile `bg-canvas-800`) | suppose qu'on sait ce qu'est Tailwind et une variable CSS | garder ici la phrase « la création de pact a été **habillée**, pas réécrite », et déplacer le mécanisme en annexe ou dans le `PLAN` |
| T2 | § 3 « Chantier 4 — le vrai défaut trouvé » (hauteur résolue contre la piste de grille) | c'est un post-mortem de bug, pas un état de l'app | une ligne : « une bannière carrée débordait de sa vignette et masquait le texte — corrigé, sans couleur en dur » ; le récit complet dans le `PLAN` |
| T3 | Numérotation « chantiers 0, 1, 1b, 2, 3, 4 » et hashes de commit partout | « chantier 1b » n'existe que dans nos notes ; un hash ne veut rien dire hors du dépôt | garder la numérotation **dans** le plan, la retirer du document de référence ; dans la référence, nommer les choses par leur effet (« les Paramètres », « la création de pact ») |

Ce n'est pas un reproche de fond : c'est le signe que le document sert deux
publics à la fois. La solution n'est pas de le simplifier, c'est de trancher :
**`ETAT` = état lisible par un extérieur ; `PLAN` = journal technique.** Les
deux existent déjà, il suffit de tenir la frontière.

---

## 4. Ce qui est très bien et ne doit pas bouger

À signaler, parce que c'est plus rare que le reste :

- § 1 et § 2 donnent des **valeurs vérifiées** (programme, frais, réseau,
  adaptateurs), pas des intentions ;
- § 6 « Limites connues, non maquillées » : trois limites nommées, dont deux
  impossibilités techniques assumées (push depuis un navigateur d'automatisation,
  signatures non testées par un agent). C'est ce qui rend le reste crédible ;
- § 7 sépare explicitement **référence** et **archives**, avec la raison de
  garder les archives. Un lecteur ne se demande plus quel document croire ;
- la section sur les **deux habillages** et la règle « ne jamais faire lire
  `data-mode` au premium » : c'est la note la plus utile du document, celle qui
  évite le bug au prochain qui touche au thème.

---

## 5. Erreurs de forme relevées

| # | Où | Détail |
|---|---|---|
| F1 | `PLAN` § 5 puis § 6 | le titre « Chantier 3 » est en `###` sous une section `## 4` — la hiérarchie des titres décroche à cet endroit |
| F2 | `PLAN` § 4 fin | la ligne `---## 4. Chantier 4 …` colle un séparateur et un titre sans saut de ligne (visible dans le Markdown brut) |
| F3 | `ETAT` § 7 | `PLAN-CHANTIERS-PREMIUM-2026-10-08.md` est décrit « hors git » : c'est vrai *chez nous*, mais le plan ci-dessous (§ 6) propose de le versionner — les deux phrases devront dire la même chose |

---

## 6. Ce que je propose de faire, et qui attend ton accord

1. **Déjà fait** : corriger 63/63 → 66/66 dans les deux langues (E1).
2. **Attend ton accord** : ajouter la limite I1 (profil premium non écrit côté
   serveur) au § 6 de la référence, FR et EN.
3. **Attend ton accord** : remplacer la liste de suppression du § 4 par un renvoi
   à l'inventaire, et y mentionner les cinq familles perdues.
4. **Attend ton accord** : dégraisser les passages T1/T2/T3 du document de
   référence (le contenu va dans le `PLAN`, rien n'est perdu).
5. **Attend ton accord** : corriger F1/F2/F3 au passage.

Dis-moi lesquels tu valides — je les applique par lots, et je régénère les
`.html` à chaque fois (`node outils/md-to-html.mjs`), puis je relance
`node outils/verifier-docs.mjs` pour prouver qu'aucun Markdown et son HTML ne
divergent.
