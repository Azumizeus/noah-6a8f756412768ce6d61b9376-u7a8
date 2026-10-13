# Note à Noah — purge de la clé VAPID dans l'historique

**Date : 09/10/2026 · à faire APRÈS la migration des pages premium (faite le 09/10).**

**Rôles corrigés le 09/10 (2e version).** Noah a confirmé de lui-même n'avoir
**aucun terminal** : ni `git`, ni `npm test`, ni typecheck, ni build. La version
précédente de cette note lui confiait la réécriture et le push (§ 3) — cette
attribution était **inapplicable**, pas seulement risquée. C'est **Freebuff**
qui exécute la purge : seul intervenant disposant de Git *et* capable de
relancer les tests après coup. Noah relit les fichiers du projet ; Mickaël
tient la plateforme et le Sync.

**Périmètre et vérification corrigés le 09/10 (3e version).** Cette note ne
parlait que d'**un** secret et ne vérifiait qu'**un** chemin. Un audit de tout
l'historique, lancé le même jour, en a trouvé **cinq** autres — dont une clé
d'API **encore active**. La vérification était donc condamnée à annoncer
« 0 commit fautif » après une purge qui n'aurait nettoyé qu'un fichier sur
cinq : le faux négatif silencieux que cette note dénonce, produit par son
propre périmètre. Les sections 1, 2 bis, 3.3 et 3.4 ont été refaites.

---

## 1. Ce qu'il y a à purger, et où — vérifié, pas supposé

Des valeurs réelles ont été commitées, puis retirées des fichiers de travail.
Elles restent **dans l'historique**, donc dans **tout clone déjà fait**.

| Chemin | Quoi | État | Empreinte |
|---|---|---|---|
| `docs/BILAN_BUILDPACT_290826.md` | clé privée VAPID **complète** (43 car.) — commits `8572edd` et `910aaf8` | histoire seule (retirée du fichier par `4d5cef1`) | `9485f4ab8acd` |
| `scripts/secret-scan.test.ts` (ancienne version) | les **27 premiers caractères** de la même clé, sous une valeur présentée comme « factice » | histoire seule (corrigée par `c55e645`) | `427f185c4f29` |
| `.env` | URL **Helius portant `api-key`** (36 car.) — **clé encore active**, voir § 2 bis | histoire seule (retirée par `d8aa0fa`) | `e27f2e115ee5` |
| `contracts/target/wallet/wallet.json` | fichier de keypair (tableau de 64 octets) | histoire seule | `75a7b0f50746` |
| `contracts/target/deploy/workspace-keypair.json` | keypair du programme | histoire seule | `e74524b29b25` |
| `src/lib/supabaseClient.ts` | JWT `anon` (208 car.) | **dans l'arbre de HEAD** | `aeaef35580b6` |
| `scripts/secret-scan.test.ts` (la même ancienne version) | trois jetons **factices** que les tests d'alors écrivaient en clair : un en-tête de clé privée, un jeton `ghp_`, une clé d'accès AWS | histoire seule | vues par leur forme |

Les cinq premiers sont ceux que la purge doit faire disparaître. La dernière
ligne n'est **pas** une fuite — ces trois jetons sont inventés — mais le
contrôle les signale par leur forme, et il a raison de le faire : rien ne
distingue une clé AWS factice d'une vraie, et c'est justement cette
indistinction qui rend le contrôle utile. Conséquence pratique : la purge doit
les neutraliser **aussi** (§ 3.3), sinon `check:history` ne pourra jamais
rendre 0 et la vérification restera rouge pour de faux positifs — la meilleure
façon de faire ignorer un vrai positif. Le sixième
n'est **pas** un secret, et il n'est pas à purger : le jeton `anon` d'un projet
Supabase est **public par conception** (il part dans le navigateur). Le rôle
est **décodé**, pas supposé — c'est ce qui distingue `anon` de `service_role`,
qui a exactement la même forme. Le contrôle partagé le sait et ne le signale
pas : un garde-fou qui crie sur ce qui est légitime est un garde-fou qu'on
désactive au bout de trois jours.

**Le contrôle qui établit cette liste — et qui la refera.** Un script du
dépôt, plus une incantation recopiée dans un document :

```bash
npm run check:history      # 0 = rien ; 1 = trouvailles ; 2 = balayage impossible
```

⚠️ **Pourquoi global.** La version précédente de cette note vérifiait **un seul
chemin** (`docs/BILAN_…`) avec deux commandes écrites à la main. Elle ne
pouvait donc rien dire des quatre autres fichiers — et l'un d'eux portait une
clé vivante. Le script, lui, énumère **tous les blobs atteignables**
(`git rev-list --objects --all`) : son périmètre ne peut pas rétrécir sans
qu'on le voie, et il affiche le nombre de refs examinées pour que le lecteur
juge lui-même si le balayage était complet.

⚠️ **Pourquoi il ne peut pas divulguer.** Le rapport ne contient que des
**empreintes** (`sha256`, 12 caractères), des longueurs et des chemins. La
discipline de la section 5 est appliquée par construction, au lieu d'être
demandée à l'opérateur — et un test le vérifie (`scripts/history-secret-scan.test.ts` :
aucune sortie ne doit contenir la valeur, ni même ses 8 premiers caractères).

⚠️ **Angle mort, désormais refermable.** Par défaut, les blobs **binaires** et
ceux de plus de 256 Kio ne sont pas lus. Le rapport dit combien il en a
écartés — mesuré le 09/10 sur ce dépôt : 914 blobs trop volumineux et 1395
binaires, pour 3534 blobs lus (le décompte monte à chaque commit, c'est le
nombre qui compte, pas sa valeur). Un secret peut y dormir, notamment dans un
artefact `target/`. Pour les lire : `npm run check:history:profond` — le
résultat de ce balayage est en **section 1 bis**.

---

## 1 bis. Et dans les gros blobs et les binaires ? — balayé, mesuré, refermé

La question restait ouverte : les 914 blobs de plus de 256 Kio (1 364 Mio) et
les 1395 binaires n'étaient pas lus. Réponse obtenue le 09/10 en les lisant tous,
par un mode ajouté au script (`--profond`, `npm run check:history:profond`).

| Mesure | Valeur |
|---|---|
| Blobs lus | **5844 / 5844** — aucune exclusion |
| Octets lus | **1 480,1 Mio** |
| Durée | **2 min 07 s** (~11,6 Mio/s) |
| Budget | 2 Gio — non atteint, donc balayage complet (`tronque: false`) |
| Trouvailles du mode par défaut | 10 |
| Trouvailles du mode profond | **13** |
| Trouvailles **propres** au mode profond | **3** — et ce sont trois faux positifs |

**Réponse : aucun secret ne dort dans les gros blobs ni dans les binaires de ce
dépôt.** Les trois trouvailles que seul le mode profond voit sont la **même**
valeur de 20 caractères (`empreinte 01e148b272d0`), dans trois artefacts compilés
de la caisse Rust `pbkdf2` (`libpbkdf2-*.rmeta`, `*.rlib`). Identification faite
en local : c'est un identifiant de son propre code de documentation, du type
`Pbkdf2.hash_password` — pas une valeur à nous. Rien n'a été perdu au passage :
la comparaison des deux listes ne montre **aucune** trouvaille présente dans un
mode et absente de l'autre, hormis ces trois-là.

**Ce que le mode profond fait, et pourquoi il a fallu resserrer une règle.**
Il lit les binaires en extrayant leurs plages de texte imprimable — un secret
compilé dans un bundle reste du texte — et découpe chaque blob en fenêtres de
1 Mio qui se recouvrent de 64 Kio, pour qu'une valeur à cheval sur deux fenêtres
ne passe pas entre les mailles (c'est testé).

Première version, mesurée : **843 trouvailles**, dont **831** venaient de la
seule règle de *forme* (« jeton long sur une ligne qui nomme un secret »)
appliquée aux `.rcgu.o` de `target/` — des symboles mangled de Rust et des
chaînes de débogage. Un rapport où 98 % des lignes sont du bruit ne se lit pas :
on l'ignore, et le vrai signal part avec. La règle de forme est donc **désactivée
dans les binaires** (`strict: true`), où elle n'a aucun sens — une « ligne » y est
une plage de texte arbitraire, pas une ligne. Les règles **structurelles**
(format de clé connu, JWT, `NOM=valeur`, identifiants d'URL) restent actives
dans les binaires : une clé compilée dans un bundle reste `API_KEY=valeur`, donc
elle est vue. Après resserrement : **13 trouvailles**, et la comparaison avec la
liste d'avant montre que **zéro** trouvaille non issue de la règle de forme a
disparu.

⚠️ **Coût, dit franchement.** Deux minutes pour 1,5 Gio, et une lecture
totale : ce n'est pas un contrôle à lancer à chaque commit, c'est celui qu'on
lance **avant une purge, après un changement de structure du dépôt, ou pour
répondre une fois pour toutes** à « et les gros fichiers ? ». Le contrôle courant
(`npm run check:history`) reste en secondes.

⚠️ **Ce que le mode profond ne voit toujours pas.** Un secret **chiffré** ou
**compressé** (archive, `.zip`, `.gz`) ne s'y lit pas ; un secret encodé en
base64 *et* dépourvu de mot sensible à proximité peut passer ; et une valeur à
laquelle `FORMATS_CONNUS` ne ressemble pas reste invisible, comme partout
ailleurs. Le mode profond referme l'angle mort de la TAILLE et du BINAIRE — pas
celui de l'ENCODAGE.

⚠️ **Deux pièges vérifiés, à garder en tête pour tout contrôle d'historique.**

- `git log -S'VAPID_PRIVATE_KEY' -- <fichier>` renvoie `4d5cef1` et `910aaf8`
  — deux résultats, dont **un faux positif et un oubli** : il liste `4d5cef1`,
  le correctif qui a justement *retiré* la valeur, et il **ne liste pas**
  `8572edd`, qui la contient bel et bien (son parent `910aaf8` l'avait déjà,
  donc le nombre d'occurrences n'a pas changé). `-S` répond à « le nombre
  d'occurrences a-t-il changé ? », pas à « ce commit contient-il le secret ? ».
- Un motif écrit à la main peut ne pas attraper sa propre cible. **Mesuré** :
  le motif `VAPID_PRIVATE_KEY\s*\|\s*` + valeur du § 3.3 précédent matchait
  **zéro** occurrence de la ligne visée (le nom y est entre backticks, donc
  `\s*` tombe sur un caractère qu'il n'attend pas). Il ne l'aurait pas
  détecté en silence — la vérification, elle, aurait bien crié — mais la
  réécriture n'aurait rien purgé. Les motifs du § 3.3 ont été **testés** sur
  les blobs réels avant d'être écrits ici, pas déduits.

⚠️ Ces fichiers sont, pour la plupart, **toujours suivis** aujourd'hui : ne les
supprime pas, il faut **réécrire l'historique**. Supprimer un fichier ne retire
rien de l'historique — c'est même ce qui a créé cette liste.

---

## 2. La clé VAPID est morte — prouvé, plus affirmé

**Statut : clos le 09/10, sur preuve.** La paire a été régénérée le 08/10. Ce
n'est pas une déclaration recopiée du `BILAN` : voici ce qui l'établit, et de
quoi le refaire.

| Contrôle | Résultat |
|---|---|
| La paire d'époque (`910aaf8`) est-elle une vraie paire ? | oui — la privée **dérive** exactement sa publique (P-256) : la valeur trouvée dans l'historique n'est pas un leurre |
| Paire d'époque vs paire actuelle (`.env.vapid` / `.env.local`) ? | **non identiques** — empreintes `9485f4ab8acd` / `dc894214ec35` contre `e22129e2028e` / `2584c1b801e0` |
| Ce que Supabase sert réellement (`supabase secrets list`) | digests `e22129e2…` et `2584c1b8…` — ceux de la paire **actuelle** |
| Contrôle automatisé | `npm run check:vapid` → `✓` des deux côtés |

La méthode tient en une ligne : ne jamais comparer des **valeurs**, comparer des
**empreintes** (`sha256`, 12 premiers caractères). Une empreinte ne divulgue pas
ce qu'elle résume, et le digest que rend `supabase secrets list` est le même
calcul — c'est précisément ce qui permet de comparer sans jamais afficher un
secret. Le script `scripts/vapid-check.mjs` applique cette règle aux deux sens :
il recalcule la publique depuis la privée locale (donc il détecte une paire
incohérente, pas seulement une paire différente), et il compare les empreintes à
ce que le serveur sert. Il rend **2**, jamais 0, quand il ne peut pas conclure :
ne pas pouvoir vérifier n'est pas réussir.

⚠️ « Morte » a un sens plus étroit qu'il n'y paraît : la privée d'époque **signe
encore** un JWT VAPID valide. Ce qui est mort, c'est son **usage** — il lui
faudrait un abonnement push dont la clé d'application est l'ancienne publique,
donc une ligne de `push_subscriptions` créée **avant le 08/10**, table fermée en
type écriture publique et lisible seulement par le `service_role`. La clé seule
n'envoie rien : il manque `endpoint`, `p256dh` et `auth`.

Conclusion : **pas un incident, de l'hygiène.** La purge reste utile — un secret
lisible par quiconque clone le dépôt — mais rien n'est urgent, et le calendrier
peut suivre celui du support plutôt que de le forcer.

---

## 2 bis. La clé d'API Helius, elle, répond encore — mesuré le 09/10

⚠️ **Trouvée par l'audit global, pas par la relecture.** Le `.env` de
l'historique ne contenait pas qu'un jeton `anon` : la variable d'URL RPC
portait une clé d'API Helius de 36 caractères, logée **dans l'adresse
elle-même** (empreinte `e27f2e115ee5`). Ni le nom de la variable ni la forme
« NOM = valeur » ne la désignaient : c'est cette trouvaille qui a fait ajouter
une règle dédiée aux secrets passés en paramètre d'URL.

| Contrôle | Résultat |
|---|---|
| Sonde `getHealth` sur l'hôte de l'historique — lecture seule, aucun crédit consommé | **HTTP 200, `result: ok`** |
| Verdict | la clé est **ACTIVE** : ce n'est pas un résidu inerte |

La sonde ne recopie jamais la clé : elle est lue depuis l'historique, gardée en
mémoire, et toute sortie est nettoyée par remplacement avant affichage. Ce qui
sort, c'est un code HTTP et une empreinte — de quoi décider, pas de quoi se
faire voler.

### Identifier LAQUELLE révoquer — `npm run check:helius`

Un audit qui masque tout ne permet pas de révoquer la bonne clé : un tableau de
bord de fournisseur affiche des clés tronquées. D'où un outil distinct,
`scripts/helius-key-audit.mjs`, qui répond aux trois questions de l'opération :

| Question | Réponse mesurée le 09/10 |
|---|---|
| **Quelle clé ?** | empreinte `e27f2e115ee5`, 36 car., **indice `bc8ce800…`** |
| **Où est-elle ?** | historique : 3 blobs `.env` (`97f62b5`, `d1f3df0`, `02f3ca3`) — et **le `.env` d'aujourd'hui sur le disque**, qui est ignoré par git |
| **Ailleurs sur le disque ?** | recherche sur `~/projects` : **aucun autre produit ne la porte** |
| **Répond-elle encore ?** | **oui** — `getHealth` → HTTP 200, `{"result":"ok"}` |

> ### Mise à jour du 11/10/2026 — où elle n'était pas, et où elle était
>
> Le tableau ci-dessus décrit l'état du 09/10. Depuis, **l'historique a été
> réécrit** (le commit de purge `d8aa0fa` n'existe même plus) et le `.env`
> d'aujourd'hui ne la porte plus. Mesuré le 11/10 : la valeur **entière** est
> introuvable dans les **2 433 objets** du dépôt — orphelins compris —, dans
> l'historique local comme dans celui des deux distants, et le balayage
> profond (1 095 blobs, binaires compris) sort à **0 trouvaille**.
>
> Ce qui signifie que la ligne « et **le `.env` d'aujourd'hui sur le disque** »
> n'était plus vraie. Mais la clé, elle, **répondait toujours** : elle était
> restée à deux endroits qu'aucun contrôle ne regardait —
>
> | Où | État mesuré | Action |
> |---|---|---|
> | Variable **`VITE_RPC_ENDPOINT`** du projet Vercel (Production + Preview) | la clé, empreinte `e27f2e115ee5` | **retirée le 11/10/2026** (`vercel env rm`) |
> | **Bundle de production** (`buildpact-solana.vercel.app/assets/index-*.js`) | la clé en clair ; `getHealth` → **HTTP 200** | attend la révocation |
>
> La cause est celle que ce document ne pouvait pas encore voir : le code avait
> cessé de lire la variable (`80a48da`), mais Vite incruste la valeur d'une
> variable `VITE_` **évaluée au build** — et la variable était restée posée sur
> la plateforme. `VITE_RPC_ENDPOINT` a donc aussi été retiré de `.env.local`,
> avec une garde qui refuse désormais la déclaration dans un fichier
> d'environnement local (`scripts/rpc-endpoint-guard.test.ts`).
>
> **Rien de tout cela ne remplace la révocation** : elle seule éteint la clé.

L'indice est le SEUL endroit de tout ce dispositif qui affiche un fragment de
secret, et il est délibéré : 8 caractères sur 36 servent à reconnaître la clé
dans une liste, pas à s'en servir. Il n'est affiché que sur demande explicite
(`--indice`), jamais écrit sur disque, jamais dans un rapport. L'audit
d'historique, lui, continue de ne montrer que des empreintes — les deux règles
ne se contredisent pas, elles répondent à deux questions différentes.

⚠️ **Un piège corrigé dans cet outil, et il vaut d'être noté :** sa première
version plafonnait la lecture à 512 Mio. Elle a rendu « aucune clé trouvée »
alors que la clé était dans l'historique — le budget s'épuisait avant d'atteindre
les blobs qui la portent. Un plafond silencieux produit une réponse fausse, pas
une réponse partielle. Il borne désormais la mémoire par lots (`loterParTaille`)
au lieu de borner la couverture, et un budget atteint rend **2**, jamais 0.

**À faire, dans cet ordre :**

1. **Révoquer la clé** dans le tableau de bord Helius, et en créer une neuve si
   le projet s'en sert encore. Une purge d'historique ne dévalide rien : elle
   retire la valeur du dépôt, pas le droit d'appeler l'API.
2. Poser la nouvelle valeur **hors dépôt** : `.env.local` (ignoré par git), ou
   un secret de plateforme pour ce qui s'exécute côté serveur.
3. Vérifier qu'aucun autre clone, ni la copie de la plateforme, ne la porte
   encore — c'est exactement ce que la section 4 organise.
4. Alors seulement, purger l'historique (section 3).

Le point 1 est le seul qui soit **urgent** : tant que la clé répond,
l'historique est une **voie d'accès**, pas une gêne.

---

## 2 ter. « Cette clé n'est dans aucun de mes projets » — mesuré le 09/10

Question posée par Mickaël : l'indice affiché en section 2 bis (8 caractères,
l'identifiant de révocation, pas la clé) ne correspond à **aucune** clé
de son tableau de bord Helius. Les mesures ci-dessous ne dépendent pas d'un
tableau de bord : elles se refont en trois commandes.

| Contrôle | Résultat |
|---|---|
| Clés Helius présentes sur ce Mac (`.env*` sous `projects`, `.secrets`, `.config`, `.agents`) | **une seule**, et c'est celle-ci |
| Dans quel fichier ? | `buildpact-75mv/.env` **uniquement** — « présente ailleurs sur le disque » : rien |
| Même valeur que dans l'historique ? | **oui** — empreinte `e27f2e115ee5`, et l'hôte est le **même** (`devnet.helius-rpc.com`, blob `02f3ca3`) |
| Origine du fichier | `.env` daté du **19/09 02:19**, même horodatage que `public/*` : il vient de l'échafaudage initial, il n'a pas été créé à la main plus tard |

**Le contrôle qui tranche — et qui manquait.** Une clé « qui répond » pouvait
vouloir dire « l'endpoint répond à tout le monde ». Comparaison faite sur
`devnet.helius-rpc.com`, même méthode `getHealth` :

| Sonde | Réponse |
|---|---|
| sans clé | **HTTP 401** `Unauthorized` |
| clé bidon (`00000000-0000-0000-…`) | **HTTP 401** `Unauthorized` |
| **la clé du `.env`** | **HTTP 200** `{"result":"ok"}` — et `getEpochInfo` rend un slot réel |

Conclusion : ce n'est **pas** un leurre et ce n'est **pas** un endpoint ouvert.
La clé est **réellement acceptée par Helius**. Une clé bidon est refusée : la
différence entre les deux lignes ci-dessus est le résultat, pas le bruit.

**Ce que ça implique si elle est absente de tes projets.** Une clé d'API Helius
appartient à un **compte** (et s'y liste par projet). Une clé valide qu'on ne
trouve dans **aucun** de ses projets n'est pas une clé qu'on a oubliée : c'est
une clé qui appartient à **quelqu'un d'autre** — l'échafaudage ou la plateforme
l'a livrée avec le `.env`, et elle vient de leur compte. Le point 1 de la liste
ci-dessus change alors de nature :

1. **On ne peut pas révoquer une clé qu'on ne possède pas.** Le geste utile
   n'est pas « révoquer », c'est **remplacer** : créer une clé **devnet** dans
   *ton* projet Helius et la poser dans `.env.local` (ignoré par git).
   L'ancienne valeur cesse d'être utilisée par l'application à ce moment-là —
   pas au moment de la purge.
2. **Ce qui reste vrai malgré tout** : tant que la valeur est dans
   l'historique, elle est **publiée**. Purger reste utile même si on ne peut
   pas la révoquer — on ne ferme pas l'accès d'un tiers, on arrête de
   l'afficher.
3. **À demander, tant qu'on y est** : d'où vient le `.env` d'origine, et si une
   clé devnet a été partagée pour d'autres produits du même échafaudage. Une
   clé partagée entre plusieurs projets explique très bien « elle répond mais
   elle n'est nulle part chez moi » — et elle se remplace, elle ne se révoque
   pas.

⚠️ **Ce que cette section ne dit pas** : *à qui* appartient la clé. Ni Helius
ni ce dépôt ne le disent, et deviner (« c'est celle de Noah », « c'est un
reste ») serait une affirmation sans mesure. Ce qui est mesuré : elle est
unique sur ce disque, identique à celle de l'historique, et **vivante**.

---

## 3. Procédure (exécutant : Freebuff — Noah ne peut pas)

**Pourquoi pas Noah.** Constaté le 09/10, de sa part : aucune commande Git
(`clone`, `log`, `fetch`, `filter-repo`, `push`, `merge`), aucune commande de
vérification (`npm test`, typecheck, build), aucun SHA visible. Ces commandes
ne lui sont pas seulement déconseillées, elles lui sont **inapplicables**. Ce
qu'il peut porter : relire les fichiers et y chercher la forme d'une clé. Utile,
mais insuffisant — le secret est dans l'**historique**, pas dans les fichiers
actuels, et c'est précisément ce qu'il ne peut pas voir. La preuve reste celle
de la section 3.4.

**Précondition — la réponse du support trynoah (§ 7, étape 2).** Ne pas
forcer-pousser avant de savoir si la plateforme peut être rattachée au dépôt
réécrit.

⚠️ **Qui est qui, parce que le raccourci prête à confusion.** *Noah* est une
personne : elle relit les fichiers, elle n'a pas de terminal, et **lui parler
ne fait rien au dépôt** (§ 5, question tranchée). *Trynoah* est la plateforme
sur laquelle vit sa copie du projet ; son *support* est le service client de
cette plateforme. C'est à **lui** qu'on pose la seule question qui reste :
comment un projet encore rattaché à l'**ancien** historique se rattache-t-il à
un dépôt réécrit (ré-import, reconnexion) ? La réponse n'est pas une
formalité : c'est ce qui décide si la purge tient ou si le prochain **Sync** la
annule (§ 5). Sa copie du projet est restée sur l'**ancien** historique ; si son Sync
ne sait que le repousser, la purge sera annulée au premier Sync, par un bouton
au lieu d'un `merge` — le mécanisme de `2953751` (§ 5).

```bash
# 3.1 — travailler sur une copie NEUVE : une copie ancienne réinjecte les
#       objets qu'on veut faire disparaître dès le premier fetch.
git clone <url-du-depot> buildpact-purge
cd buildpact-purge && npm run guard:install      # pose le hook pre-push local

# 3.2 — contrôle AVANT réécriture : le garde-fou exige un contournement
#       explicite, pour qu'une réécriture ne soit jamais un accident.
ALLOW_HISTORY_REWRITE=1 node scripts/git-guard.mjs --rewrite

# 3.3 — réécrire l'historique, en TROIS gestes qui se complètent.
#       Les motifs ne contiennent PAS les valeurs : ils décrivent leur FORME,
#       donc ils restent vrais même si les valeurs avaient changé. Ils ont été
#       testés sur les blobs réels avant d'être écrits ici (§ 1).

# (a) les deux keypairs : ils sont sous contracts/target/, déjà traité par
#     le script d'allègement de l'historique.
bash scripts/purge-target-from-history.sh

# (b) le .env historique : retiré de tout l'historique. Le fichier reste
#     ignoré sur disque, personne n'en a besoin dans l'historique.
git filter-repo --force --path .env --invert-paths

# (c) les lignes porteuses de valeurs, réécrites en place.
#     ⚠ Les motifs décrivent une FORME, jamais une valeur. Le quatrième est
#     écrit avec -{5} au lieu des cinq tirets de l'en-tête : le littéral ferait
#     échouer `npm test` sur CETTE note (le contrôle des fichiers suivis la
#     lit comme les autres). Un document qui explique comment purger ne doit
#     pas être lui-même un incident.
#     ⚠ Les trois derniers motifs ne sont pas décoratifs : MESURÉ sur les
#     blobs réels, sans eux il reste 3 trouvailles dans l'ancien fichier de
#     test, et la vérification de 3.4 ne peut alors jamais rendre 0.
cat > motifs.txt <<'EOF'
regex:`VAPID_PRIVATE_KEY`\s*\|\s*`[A-Za-z0-9_-]{30,}`==>`VAPID_PRIVATE_KEY` | **valeur retirée de l'historique**
regex:`VAPID_PUBLIC_KEY`\s*\|\s*`[A-Za-z0-9_-]{30,}`==>`VAPID_PUBLIC_KEY` | **valeur retirée de l'historique**
regex:VAPID_PRIVATE_KEY='[A-Za-z0-9_+/=-]{20,}'==>VAPID_PRIVATE_KEY='<valeur retirée de l'historique>'
regex:-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}==>-{5}BEGIN CLE PRIVEE DE TEST (retirée de l'historique)-{5}
regex:ghp_[A-Za-z0-9]{20,}==>ghp_<jeton de test retiré de l'historique>
regex:AKIA[0-9A-Z]{10,}==>AKIA<clé de test retirée de l'historique>
EOF
git filter-repo --force --replace-text motifs.txt
rm motifs.txt          # filet : ce fichier ne doit pas être committé

# 3.4 — vérifier, GLOBALEMENT. C'est le seul contrôle autoritaire : il regarde
#       tous les blobs atteignables, pas un fichier choisi d'avance.
npm run check:history
#       Attendu : « ✓ Rien trouvé », code de sortie 0.
#       Sortie 1 → il reste des valeurs : la liste masquée dit lesquelles.
#       Sortie 2 → le balayage n'a pas pu se faire. Ce n'est PAS un succès.
#
#       ⚠ Ce qui a été testé, et ce qui ne l'est pas. La purge elle-même n'est
#       pas testable : elle réécrit tout l'historique. Ce qui l'a été : les six
#       motifs de (c), appliqués aux DEUX blobs réels hors de git, puis relus
#       par le contrôle — 0 trouvaille. C'est une simulation, pas une garantie :
#       elle valide les motifs, pas le passage de git-filter-repo sur le dépôt
#       entier. La vérification de 3.4 reste le seul juge.

# 3.5 — pousser : réécriture assumée, donc force-push AVEC bail
git push --force-with-lease origin main
```

`--force-with-lease` et **pas** `--force` : si quelqu'un a poussé entre-temps,
le push est refusé au lieu d'écraser son travail.

## 4. Après le force-push — côté Mickaël (et tout autre clone)

Un clone existant **garde les anciens objets en local**, même après un `fetch`.
Un `git pull --rebase` ne les retire pas et peut même les remettre en jeu.

```bash
# la seule méthode fiable : repartir d'un clone neuf
mv buildpact-75mv buildpact-75mv.old
git clone <url-du-depot> buildpact-75mv
cd buildpact-75mv && npm install && npm run guard:install
npm run check:history        # doit rendre « ✓ Rien trouvé » (code 0)
# vérifier AVANT de supprimer l'ancien clone
```

Et **surtout** : ne pas se contenter d'un `git fetch` dans l'ancien clone. Il
conserve les objets réécrits dans son propre dépôt jusqu'à ce qu'il soit
effacé ou que son `gc` les ait éliminés — donc, tant qu'il existe, la clé y est
encore lisible.

## 5. Ce qu'il ne faut PAS faire

- **Ne pas pousser depuis deux endroits.** Une seule personne réécrit et pousse ;
  les autres récupèrent. Deux force-push concurrents, et c'est l'incident du
  07/10 qui recommence (faux conflits en masse sur le clone resté en arrière).
- **Ne pas réécrire depuis un clone ancien.** Il contient les objets à purger.
- **Ne pas rattacher l'ancien historique.** Ni `merge -s ours`, ni merge de la
  branche d'avant le retrait « pour permettre le fast-forward des clones ».
  Ce geste **annule la purge** : il rend de nouveau atteignables les commits qui
  portent la clé. Ce n'est pas une crainte théorique, c'est déjà arrivé dans ce
  dépôt : `2953751` (« Reunification : rattache l'ancien historique (avant
  retrait de la cle) pour permettre le fast-forward des clones ayant travaille
  dessus ») a exactement remis en jeu `8572edd` et `910aaf8`. Après une purge, un
  clone en retard se remet à niveau par un **clone neuf** (section 4), jamais
  par un rattachement.
  ⚠️ `scripts/git-guard.mjs --rewrite` conseille ce rattachement : c'est un
  remède pour débloquer des clones après une réécriture **accidentelle**, et il
  est destructeur après une purge de secret. Les deux cas ne se ressemblent pas,
  même si la même commande les répare.
- **Ne pas lancer le Sync de la plateforme après la purge.** Même mécanisme que
  le point précédent, autre main : la copie trynoah est restée sur l'ancien
  historique, et un Sync qui le repousse ressuscite `8572edd` et `910aaf8`. Ce
  n'est à contourner ni par Mickaël ni par Noah : le rattachement au dépôt purgé
  se demande au **support trynoah** (ré-import / reconnexion), et se fait
  **avant** le force-push de 3.5 — d'où la précondition en tête de section 3.
- **Parler à Noah est sans effet sur le dépôt — vérifié.** La question qu'il a
  posée (une conversation avec lui crée-t-elle un commit côté plateforme, même
  sans modification de fichier ?) a une réponse : **non**. Aucune demande qui
  lui est adressée ne fait donc avancer l'ancienne copie, et le silence radio
  qu'on aurait pu prescrire serait de la superstition. Le seul vecteur côté
  plateforme reste le **Sync** (point précédent), et lui seul se traite avec le
  support.
- **Ne pas remplacer la purge par un `git rm`.** Les fichiers doivent rester ;
  c'est leur histoire qui doit être nettoyée.
- **Ne jamais lancer une commande qui AFFICHE une des valeurs.** Le terminal,
  l'historique du shell et les logs sont des fichiers suivis par personne et
  relus par tout le monde. `npm run check:history` est fait pour ça : il ne peut
  pas les divulguer, même en cas d'échec.
- **Ne pas révoquer en dernier.** L'ordre est : révoquer (§ 2 bis), puis purger.
  Une purge est longue, se planifie et peut échouer ; une clé vivante n'attend
  pas.
- **Ne pas recopier une valeur** dans un ticket, un chat ou un nouveau document.
  Cette note ne les contient volontairement pas, et le script non plus.

## 6. Garde-fous en place qui restent valables après

- `scripts/secret-scan.test.ts` — échoue si un secret en clair apparaît dans un
  fichier **suivi**. Il ne voit pas l'historique : c'est le trou que la purge
  ferme, et que `history-secret-scan` couvre.
- `scripts/secret-rules.mjs` — les motifs de détection, **écrits une fois** et
  utilisés par les deux contrôles ci-dessus. Deux copies d'une même liste de
  motifs finissent par diverger : l'historique serait alors jugé propre selon
  des règles que le contrôle de l'arbre a déjà renforcées.
- `scripts/history-secret-scan.mjs` (`npm run check:history`) — balaie **tout
  l'historique**, en n'imprimant que des empreintes. Code 0 / 1 / 2, et 2 n'est
  pas un succès.
- `scripts/vapid-check.mjs` (`npm run check:vapid`) — compare la paire VAPID
  locale à celle que Supabase sert réellement, **par empreintes**. Refait le
  contrôle qui, à la main, avait produit la rotation du 08/10.
- `scripts/git-guard.mjs --rewrite` — refuse une réécriture non déclarée.
- `scripts/git-guard.mjs --range` — refuse un push de plus de 5 fichiers.

## 7. Ordre retenu

1. ✅ **Migration des pages premium** (famille sociale) — faite le 09/10.
2. ⏳ **Traiter la clé Helius** (§ 2 bis et 2 ter) — **c'est la seule tâche
   urgente**, et elle ne dépend de personne. « Traiter » = **révoquer** si la
   clé est dans tes projets Helius, **remplacer** sinon (elle est acceptée par
   Helius mais absente de tes projets ⇒ elle est à quelqu'un d'autre, on ne la
   révoque pas) : dans les deux cas, une clé neuve dans `.env.local`.
3. ⏳ **Support trynoah : comment le projet se rattache-t-il à un dépôt dont
   l'historique a été réécrit** (ré-import / reconnexion) ? C'est la seule
   question qui reste — celle du commit par conversation est tranchée (**non**,
   § 5). À obtenir **avant** l'étape 5 : si la plateforme ne sait que repousser
   l'ancien historique, la purge sera annulée au prochain Sync (§ 5).
4. ⏳ **Mickaël : un dernier Sync** — pour que rien de ce qui a été modifié sur
   la plateforme n'existe uniquement là-bas. Ensuite, plus personne ne touche
   aux fichiers jusqu'à la fin.
5. ⏳ **Freebuff : purge + un seul force-push + vérification** (section 3),
   avec `npm run check:history` comme preuve. Noah ne peut pas exécuter cette
   étape : il n'a pas de terminal (§ 3).
6. ⏳ **Mickaël + support : rattacher la plateforme au dépôt purgé**, sans Sync
   intermédiaire. Parler à Noah reste sans effet sur le dépôt (§ 5) : c'est le
   Sync qu'il faut retenir, pas les échanges.
7. ⏳ **Noah : relire les fichiers**, une fois le rattachement confirmé — il
   cherche la forme d'une clé, ne corrige rien lui-même. La preuve sur
   l'historique, elle, reste du côté de Freebuff (section 3.4).
