# Fiche d'incident — une clé RPC exposée, et les quatre contrôles qui ne l'ont pas vue

**Devnet uniquement. Rédigé le 11 octobre 2026.**

Version anglaise d'origine : [`SECURITY-INCIDENT-2026-10-11.md`](SECURITY-INCIDENT-2026-10-11.md).
Les deux sont tenues ensemble par `docs/outils/verifier-docs.mjs`, qui échoue à
la moindre différence d'empreinte, d'URL, de commande ou de nombre de sections.

Ce document existe parce que la partie intéressante d'une fuite n'est jamais la
fuite : c'est *l'endroit où elle a réussi à se cacher*. Ici, elle est restée
trois semaines dans un endroit qu'aucun contrôle de ce dépôt ne pouvait voir,
pendant que tous les contrôles annonçaient un succès.

Chaque chiffre ci-dessous a été mesuré, pas estimé, et chaque commande est
reproductible depuis un clone (section 7). **Aucune valeur n'apparaît nulle
part dans ce fichier** — une clé exposée est décrite par son empreinte
`sha256` et sa longueur, rien de plus, la même discipline que
`scripts/history-secret-scan.mjs`.

---

## 1. En un paragraphe

Une clé d'API Helius devnet, héritée de l'échafaudage initial du projet, était
servie **en clair à chaque visiteur** du site de production. Le dépôt, lui,
n'en contenait plus la moindre trace depuis des semaines, et tous les
contrôles de secrets au niveau du dépôt étaient au vert — sincèrement. La clé
vivait dans la *configuration de déploiement*, pas dans le code, et la
compilation l'a fidèlement recopiée dans le JavaScript publié.

| | |
|---|---|
| Où elle était servie | `https://buildpact-solana.vercel.app/assets/index-*.js` |
| Sous quelle forme | `https://devnet.helius-rpc.com/?api-key=…` — une occurrence, clé de 36 caractères |
| Comment elle est nommée ici | empreinte `e27f2e115ee5`, 36 car. |
| Était-elle encore vivante ? | **oui** — sonde en lecture seule `getHealth` : HTTP 200, `{"result":"ok"}` |
| Le réservoir d'où elle venait | variable de projet Vercel `VITE_RPC_ENDPOINT` (Production **et** Preview) |
| Était-elle dans le dépôt ? | **non** — dans aucun objet git, ni dans l'historique de l'un ou l'autre remote, ni dans les 21 fichiers d'environnement de cette machine |

---

## 2. Pourquoi tous les contrôles du dépôt étaient au vert — et pourquoi cela ne prouve rien

| Contrôle | Ce qu'il vérifie réellement | Pourquoi il est passé à côté |
|---|---|---|
| `secret-scan.test.ts` | qu'aucun secret n'est dans les **fichiers suivis** | la clé n'a jamais été dans un fichier suivi |
| `history-secret-scan.mjs --profond` | tous les blobs atteignables, binaires compris — **1 095/1 095 lus, 25,8 Mio, 0 trouvaille** | pas dans l'historique non plus ; l'historique a depuis été réécrit |
| `rpc-proxy.test.ts` — « aucun fichier de `src/` ne lit une variable `VITE_RPC_*` » | le chemin de **lecture** | vrai : le code avait cessé de la lire le 10 oct. (commit `80a48da`) |
| `rpc-proxy.test.ts` — « l'artefact publié ne porte aucun endpoint à clé » | le `dist/` **construit localement** | vrai pour ce dossier-là ; la production avait été construite ailleurs |
| `check:prod` | quel **commit** la production sert | il ne lisait jamais les octets servis |

**Le mécanisme, en une phrase :** Vite inline la valeur de toute variable
préfixée `VITE_` qu'il évalue au moment de la compilation. L'application a
cessé de *lire* la variable ; la variable est restée *déclarée* sur la
plateforme. Deux contrôles au vert, tous les deux honnêtes, tous les deux
portant sur la mauvaise moitié du problème.

Un contrôle qui inspecte le chemin de lecture ne voit pas la déclaration.

---

## 3. Comment elle a été trouvée

La question était simplement « la clé est-elle encore là ? ». Chaque étape y
répond d'une manière qui ne peut pas la divulguer :

1. **Tous les objets, orphelins compris** — `git cat-file --batch-all-objects --batch`,
   balayé à la recherche de `api-key=<20+ caractères>` sur 2 433 objets (y
   compris ceux laissés inatteignables par les réécritures d'historique
   précédentes) : une correspondance, et c'était une fixture de test délibérée.
2. **L'historique des deux remotes** — la valeur recherchée dans chaque
   référence distante : rien.
3. **Le disque** — tous les fichiers `.env*` sous `~/projects`, `~/.config`,
   `~/.agents` (21 fichiers) : aucun ne la portait.
4. **La plateforme de déploiement** — `vercel env ls` a montré
   `VITE_RPC_ENDPOINT` présent en Production *et* en Preview ; la rapatrier et
   comparer son `sha256` à l'empreinte ci-dessus l'a identifiée sans
   l'afficher.
5. **L'artefact servi** — récupérer la page et ses 5 bundles, puis faire
   passer dessus les propres règles de secrets de ce dépôt
   (`analyserBundle`) : exactement une trouvaille, la clé.
6. **Une sonde de vivacité en lecture seule** — `getHealth` : HTTP 200.

Les étapes 1 à 3 sont revenues propres, les étapes 4 à 6 positives. C'est tout
l'incident en une ligne : **le dépôt n'a jamais été le problème.**

---

## 4. Ce qui a été fait, et ce qui est vérifié

| Action | État au 11 oct. 2026 |
|---|---|
| `VITE_RPC_ENDPOINT` retirée du projet Vercel (Preview **et** Production) | fait — revérifié avec `vercel env ls`, les deux cibles ont disparu |
| Même variable + l'ancienne `VITE_REACT_APP_SOLANA_RPC_URL` retirées de `.env.local` et `.env` | fait, chacune remplacée par une note expliquant pourquoi ce nom est banni quelle que soit la valeur |
| Nouveau garde-fou : `scripts/rpc-endpoint-guard.test.ts` refuse tout endpoint RPC `VITE_*` **déclaré** dans un fichier d'environnement local — les fichiers que git ignore et que `dist/` ne montre jamais | 4 cas de test, dont un qui vérifie que le détecteur est capable d'échouer |
| `npm run check:soumission` refuse désormais *avant de sonder* si une telle déclaration existe (`NE PAS DÉPOSER`, sortie 1) | fait ; l'assertion de `pre-soumission.test.ts` est passée de « signale » à « refuse » |
| `npm run check:prod` télécharge maintenant la page **et les bundles qu'elle référence** et scanne les octets servis ; la sortie **3** signifie qu'une valeur de forme secrète est servie | mesuré en vrai : sortie 3, nommant la clé par son empreinte uniquement |
| CI | la divergence de commit reste informative ; **la sortie 3 fait échouer le job** — une clé exposée n'est pas un retard de déploiement |
| `analyserBundle()` — règle de détection pour bundles minifiés, calibrée sur les 5 bundles réellement servis | 3 trouvailles pour 1 réelle → 1 trouvaille, 0 faux positif ; les deux expressions minifiées de `supabase-js` qui les causaient sont maintenant des cas de test explicites |
| `npm run check:secret` — prouve, par empreinte, si le secret amont déployé du relais (`RPC_UPSTREAM_URL`) correspond à un fichier local, sans jamais afficher la valeur | testé en vrai : fichier divergent → sortie 1 avec la commande de réparation exacte ; fichier absent → sortie 2 avec le mode d'emploi pas à pas |
| Production reconstruite depuis le même commit, la variable ayant déjà disparu — mesuré **avant** et **après** sur les octets servis | avant : `assets/index-D_0cBmr-.js`, sortie **3**, clé servie. après : `assets/index-B6Nb4E9p.js`, sortie **1**, `✓ aucune valeur de forme secrète dans ce qui est servi` |
| `npm run check:parc` — balaye **tous** les déploiements du projet, pas seulement la production : il énumère le parc (`vercel ls`, pagination comprise), lit chaque page, regroupe par nom de bundle pour ne télécharger qu'une fois un bundle identique, et échoue en sortie **3** si un bundle servi porte une valeur de forme secrète | mesuré sur le parc réel : 154 déploiements énumérés, 63 bundles distincts, 99 servant une clé des deux distinctes. C'est la question qu'un contrôle à une seule adresse ne pouvait pas poser — et celle qui a trouvé la seconde clé. Il a besoin de la CLI Vercel et d'un projet authentifié, donc il n'est délibérément **pas** dans `npm test` ni en CI |
| Les 99 déploiements porteurs d'une clé retirés du projet Vercel — mesuré **avant** et **après** | avant : 166 déploiements énumérés, 99 servant une clé. après : 55 énumérés, aucun n'en sert, `npm run check:parc` sortie **0** ; cinq adresses supprimées prises au hasard répondent **404**. La production n'a pas bougé de tout du long — HTTP **200**, même bundle `assets/index-B6Nb4E9p.js` |
| `npm run build` se termine désormais par `scripts/build-guard.mjs` : le `dist/` produit est lu fichier par fichier, et une valeur de forme secrète arrête le build — **avant** que quoi que ce soit ne parte quelque part | calibré sur le `dist/` réel : 18 fichiers lisibles, aucune trouvaille. Planter une fausse clé sous `dist/assets/` le fait échouer (sortie **3**, en nommant le fichier et l'empreinte) et il repasse au vert une fois retirée. Mêmes règles de détection que partout ailleurs : un faux positif ici bloquerait chaque build légitime |

`npm test` 340/340 · `typecheck` propre · `lint` 0 erreur.

---

## 5. Ce qui n'est délibérément *pas* affirmé

- **Révoquer est la seule chose qui tue une clé.** La retirer d'un dépôt, d'une
  variable d'environnement ou de l'historique ne la révoque pas — et
  reconstruire le site non plus. État au 11 octobre, mesuré par une sonde
  `getHealth` en lecture seule sur les valeurs réellement servies :
  `643570592694` → **HTTP 401, révoquée** ; `e27f2e115ee5` → **HTTP 200,
  encore vivante**. Il en reste une, et c'est celle de 98 déploiements.
- **Les anciens bundles ont disparu — et cela aussi a été mesuré.** Les 166
  déploiements du projet ont été énumérés et récupérés : 99 servaient une page
  dont le bundle portait une clé, répartis sur 62 bundles distincts, jusqu'au
  18 septembre. Ces 99 ont depuis été retirés. Les supprimer n'a jamais été ce
  qui ferme la fuite — **c'est la révocation** — mais cela a retiré les
  dernières copies joignables des octets, ce qui vaut pour soi.
- **Ce retrait a aussi détruit la preuve qui permettait de mesurer une clé.**
  La vivacité se mesurait *depuis les bundles servis* : `e27f2e115ee5` répondait
  HTTP **200** à la dernière lecture, faite avant la suppression des copies.
  Sans copie joignable, cette valeur ne peut plus être sondée d'ici — elle doit
  être confirmée dans le tableau de bord du fournisseur. Une mesure qui
  disparaît avec son objet est une vraie limite : elle est écrite, pas
  contournée.
- **Une seconde clé a été trouvée pendant la mesure, et elle n'avait jamais été
  signalée.** Deux clés distinctes de 36 caractères sont servies, et les deux
  ont répondu HTTP 200 à une sonde `getHealth` en lecture seule le 11 octobre :
  `e27f2e115ee5`, objet de ce document, dans 98 déploiements, et
  `643570592694`, dans un déploiement du 18 septembre. **Les deux doivent être
  révoquées.** Une fiche d'incident à une seule clé aurait laissé l'autre
  vivante, et rien dans ce dépôt ne l'aurait montré.
- **Le projet Vercel n'est relié à aucun dépôt.** `vercel project inspect`
  n'affiche aucune intégration Git : les déploiements viennent d'un envoi
  local ou du tableau de bord. Ce n'est pas un défaut de sécurité en soi, mais
  c'est le mécanisme qui a rendu cet incident possible — un build peut porter
  une valeur que le dépôt n'a jamais contenue, et aucun contrôle qui lit le
  dépôt ne peut la voir. Cela veut aussi dire que pousser vers le dépôt ne met
  pas le site à jour. Le relier est une décision de déploiement, pas de
  sécurité ; tant qu'il ne l'est pas, rien ne garantit que ce qui est en ligne
  soit ce que dit le dépôt.
- **Les objets inatteignables du remote ne peuvent pas être énumérés** depuis un
  clone. L'historique a été réécrit, donc d'anciens objets peuvent subsister
  côté serveur jusqu'au ramasse-miettes. Inoffensifs une fois la clé révoquée ;
  invérifiables avant.
- **Le détecteur de bundles a un angle mort assumé.** Un identifiant opaque
  collé sous un nom de variable anodin (`const x = "…"`) n'est pas détectable —
  un UUID ne se distingue pas d'un hash. Le détecteur attrape les clés dans les
  URL, les littéraux entre guillemets sous des noms qui sentent le secret, les
  formats de clés connus, et les jetons `service_role` de Supabase. Il ne
  prétend pas plus.
- **Une rotation reste due** : la clé amont du relais elle-même n'a jamais
  fuité, mais elle est en place depuis des semaines. `npm run check:secret`
  comble le trou de vérification qui rendait une telle rotation invisible.

---

## 6. La leçon qui vaut plus que le correctif

Les quatre contrôles qui sont passés à côté étaient tous bien construits, et
chacun testait une propriété réelle. Le manque n'était pas un contrôle faible :
c'était une **question manquante**. Personne n'avait écrit le contrôle qui
demande *« quels octets servons-nous réellement, là, maintenant, à un
inconnu ? »* — parce que le dépôt est l'endroit où nous regardons, et que la
fuite n'était pas là.

Cette question est désormais posée par `npm run check:prod`, à chaque
exécution, et il échoue bruyamment.

---

## 7. Reproduire, en six commandes

```bash
npm run build                   # refuse de publier un dist/ qui contient une valeur de forme secrète
npm run check:history:profond   # le dépôt et tout son historique
npm run check:prod              # les octets réellement servis (sortie 3 = clé servie)
npm run check:parc              # tout le parc de déploiements, pas seulement la production
npm run check:secret            # le secret déployé du relais vs un fichier local, par empreinte
npm test                        # les garde-fous eux-mêmes, y compris leur capacité à échouer
```
