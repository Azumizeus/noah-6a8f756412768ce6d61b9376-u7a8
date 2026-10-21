# Descriptions des pacts — diagnostic et textes prêts à coller (21/10/2026)

> Symptôme : « la description ne s'affiche plus / il manque du contenu, j'avais
> rempli en FR et EN, il n'y a que 1-2 phrases » et « on ne peut pas créer de
> pact ». **Ce n'est pas un bug d'affichage : c'est la limite on-chain (800
> octets) qui a été atteinte, et elle a été atteinte différemment selon
> l'époque.**

## 1. Ce que dit la chaîne (mesuré, pas supposé)

| Pact | Description on-chain | Ce qui s'est passé |
|---|---|---|
| Nexus Markdown Unicode | 280 octets | tronquée : `…laissait un octet de tête orphelin invalide. Résultat : l` |
| Seeker : Nexus Agent OS | 280 octets | tronquée : `…👑 Founder / 💻 Lead Dev / 🎨 UX/U` |
| Nexus Code : Health | 280 octets | tronquée : `…exécuter des commandes shell et gérer le version` |
| Seeker Strike: Genesis Protocol | 208 octets | ✅ **complète** |
| 🎛️ SEEKER MONITOR | 500 octets | ⚠️ **dupliquée** : le texte packé est écrit deux fois (`…annoncé)\n\n[🤝 Les deux] Seeker Monitor…`), coupée à 500 |
| Café | 178 octets | pact de test, sans description |

**Borne réelle du programme déployé** (sonde par simulation, devnet) :

```
800 octets → passe la vérification de longueur
801 octets → InvalidParameter (6005)
```

→ La borne est **exactement 800 octets UTF-8**, et c'est bien celle que
l'app applique (`MAX_DESC_LEN = 800` dans `src/lib/onchainLimits.ts`).

## 2. Pourquoi 280 et 500, et pas 800

Les pacts tronqués ont été créés **avant les upgrades du programme** :

- les 4 pacts à 280 octets → programme de l'époque où `MAX_DESC_LEN = 280`,
  et l'app **tronquait silencieusement** (`truncateUtf8`) ;
- Seeker Monitor (500) → programme à `MAX_DESC_LEN = 500`, même troncature.

Depuis, l'app **refuse** de signer au-delà de 800 (`descWillTruncate` +
garde-fou dans `handleCreate`) : c'est pourquoi « on ne peut plus créer de
pact » quand on écrit FR + EN. **C'est le bon comportement** — il remplace
une troncature muette par un refus visible. Le problème, c'est que
l'interface n'expliquait pas le budget.

## 3. Le budget réel : 800 octets pour TOUT, pas pour le pitch seul

```
[🤝 Les deux] <pitch> | Rôles créateur : <rôles> | 💰 Seed founder : <n> SOL (engagement annoncé)
```

| Partie | Octets |
|---|---|
| clé d'étape `[🤝 Les deux]` | 15 |
| séparateur ` \| Rôles créateur : ` | 21 |
| rôles du créateur | 50-70 |
| seed (` \| 💰 Seed founder : 2 SOL (engagement annoncé)`) | 48 |
| **restant pour le pitch** | **~640-700** |

Et un accent coûte 2 octets, un emoji 4. Une description FR de 600
caractères avec accents dépasse déjà le budget.

## 4. FR + EN : ce n'est pas possible on-chain, et il ne faut pas le vouloir

Le compte `Project` (programme Anchor) a **un seul champ** `description:
String` — pas de champ par langue. Il n'y a donc pas « deux versions » à
écrire.

**L'app traduit déjà à la volée** : le composant `TranslatedMessage` (avec
la table `translation_cache` et la fonction Edge `translate`) traduit le
pitch pour la langue du lecteur, avec un lien « Voir l'original ».

→ **La bonne pratique : on écrit son pitch en UNE seule langue.** L'anglais
apparaît automatiquement pour un lecteur anglophone. Les deux versions
« à la main » ne rentrent pas dans 800 octets — et n'ont jamais pu y
rentrer.

*Cette règle est désormais écrite dans l'interface* (voir §6).

## 5. Textes prêts à coller (FR, vérifiés au byte près)

Chaque ligne ci-dessous est le **pitch libre** à mettre dans le champ
« Description » du wizard, ou dans `EditDescriptionModal` pour un pact
existant. Budget vérifié par `scripts/_tmp_budget.mjs` (somme réelle,
UTF-8).

### Seeker : Nexus Agent OS — 432/800 ✅
```
Seeker Nexus OS est un cockpit IA multi-agents local-first : 26 agents locaux, mémoire persistante, orchestration par rôles. Il tourne sur Mac, mobile et navigateur, sans compte ni serveur. Pour entrepreneurs, créatifs et juristes : vos documents, vos mails et vos fichiers deviennent une mémoire consultable et actionnable.
```

### Nexus Code : Health — 441/800 ✅
```
Nexus Code est un agent de codage IA open source (MIT) : il lit, modifie et exécute le code, en terminal, en application de bureau ou en extension d'IDE. Il comprend le dépôt, propose des patchs, lance les tests et garde l'historique de chaque modification. Pour des équipes qui veulent livrer vite sans perdre la main sur leur code.
```

### Seeker Strike: Genesis Protocol — 207/800 ✅ (déjà correct, ne rien changer)
```
Mobile Game Space Shooter For Seeker Mobile
```

### 🎛️ SEEKER MONITOR — 509/800 ✅ (remplace la version dupliquée)
```
Seeker Monitor est une application native de monitoring système et d'optimisation temps réel pour la musique assistée par ordinateur : elle surveille CPU, mémoire, audio et latence, détecte les ruptures et propose les réglages qui rendent la session fluide. Open source, installable en un clic, aucune donnée envoyée ailleurs.
```

## 6. Ce qui peut être corrigé, et où

| Pact | Statut | Action possible |
|---|---|---|
| Seeker : Nexus Agent OS | **finalisé** | 🔒 `update_description` **refuse** (AlreadyFinalized) : l'accord est verrouillé, c'est le principe du produit. La description tronquée est **définitive sur devnet**. |
| Nexus Code : Health | **finalisé** | 🔒 idem |
| Seeker Strike | finalisé | ✅ rien à faire (208 octets, complet) |
| Seeker Monitor | **ouvert** | ✅ **réécritable** via `EditDescriptionModal` → coller le texte du §5 |
| Nexus Markdown Unicode, Café | finalisé | pactes de test — sans objet |

### La voie pour les pacts verrouillés

Trois options, par ordre de coût :

1. **Ne rien faire** (acceptable pour le hackathon) : le marketplace affiche
   une description courte mais lisible, et le dossier de soumission (README,
   vidéo, docs) porte l'histoire complète. Le principe « l'accord est
   verrouillé on-chain » reste demonstrated.
2. **Description longue hors chaîne** (le vrai correctif produit) : la
   description *courte* reste on-chain (vérifiable, immuable, 800 octets),
   et le texte long **FR + EN** vit dans Supabase (`builder_profiles` /
   `project_media` / nouvelle table `project_descriptions`), affiché par
   l'app à côté de l'on-chain. C'est ce qui rendrait possible « j'écris en
   FR et en EN » — et ce serait un vrai plus produit à présenter.
3. **Recréer les pacts** : on perd l'historique, les parts approuvées et le
   vault (~0,2 SOL). ❌ à ne pas faire.

## 7. Correctifs d'interface livrés le 21/10

- `PactStep1` : **compteur d'octets en direct** sous la description
  (`432/800 octets · 368 restants`), rouge quand c'est dépassé, ambre à
  moins de 80 octets.
- `PactStep1` : rappel explicite **« écris ton pitch en UNE seule langue :
  l'app le traduit pour chaque lecteur »**.
- `descTruncateBody` (FR/EN) : le message explique que les 800 octets
  couvrent pitch + étape + rôles + seed, et qu'un accent coûte 2 octets.
- `CreatePactWizard` : nouveau `descBytesLeft` (budget restant réel).
