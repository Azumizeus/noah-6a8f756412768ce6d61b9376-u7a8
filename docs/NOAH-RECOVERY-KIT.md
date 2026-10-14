# BuildPact × Noah — kit de reprise et de sécurisation

> **État relevé le 14 octobre 2026.** Ce document rassemble les vérifications locales, les captures d’écran fournies et la documentation officielle Noah consultée. Les états des services peuvent évoluer. Les points non confirmés sont signalés explicitement.

## Résumé rapide

- **Dépôt de référence :** [Azumizeus/BuildPact](https://github.com/Azumizeus/BuildPact). La capture GitHub le montre **Public**, branche `main`, avec 3 commits et un déploiement Production indiqué. Utiliser ce dépôt comme référence du code BuildPact.
- **Démo principale :** [https://buildpact-solana.vercel.app/](https://buildpact-solana.vercel.app/). Un contrôle public effectué pendant le diagnostic a obtenu HTTP 200 et une page BuildPact.
- **Ancienne URL de déploiement Noah :** [https://noah-6acd96d8d87497d0afff880c-kvqd.vercel.app/](https://noah-6acd96d8d87497d0afff880c-kvqd.vercel.app/). Elle affichait `404 DEPLOYMENT_NOT_FOUND`; ne pas la distribuer.
- **Noah :** la capture montre un workspace connecté à un ancien dépôt `Azumizeus/noah-…`, branche `origin/main`, et un compteur `3↓ 1↑`. La capture ne montre pas le détail des changements. La documentation Noah ne définit pas ce compteur.
- **Consigne de sécurité :** ne pas cliquer sur **Sync Changes**, ne pas pousser depuis ce workspace Noah et ne pas faire de push depuis l’ancien clone local tant qu’il n’y a pas de comparaison explicite.
- **Clone local `buildpact-75mv` :** `origin` a été corrigé vers `https://github.com/Azumizeus/buildpact.git`; `75mv-backup` a été conservé. Aucun push n’a été effectué dans cette intervention. La copie locale a quatre changements en attente et sa branche `main` n’a pas d’upstream configuré.

## État vérifié et niveau de confiance

| Élément | Observation | Source / portée |
|---|---|---|
| Dépôt BuildPact | Public dans la capture GitHub; `main`; 3 commits; le dépôt présente le projet BuildPact. | Capture fournie le 14/10/2026. |
| Vercel production | La capture du tableau de bord montre deux entrées de déploiement `Ready`, en environnement Production, sur `main`. | Capture fournie; ne prouve pas que chaque ancienne URL de déploiement soit encore disponible. |
| URL publique principale | `buildpact-solana.vercel.app` répondait HTTP 200 pendant le diagnostic public. | Vérification publique ponctuelle; le rendu fonctionnel complet et les interactions n’ont pas été audités. |
| URL Noah/Vercel | L’URL `noah-…-kvqd.vercel.app` répondait avec la page Vercel `404 DEPLOYMENT_NOT_FOUND`. | Capture fournie et vérification publique ponctuelle. Cause exacte non établie. |
| Lien GitHub About | Une capture GitHub antérieure montrait un lien `noah-…` dans About. L’utilisateur a ensuite indiqué « c’est bon », mais aucune nouvelle capture ne confirme l’enregistrement. | Changement déclaré par l’utilisateur; lien corrigé non revérifié indépendamment. |
| Intégration GitHub Noah | Capture Noah : dépôt commençant par `Azumizeus/noah-6acd96d8d87497d0af…`, branche `origin/main`, compteur `3↓ 1↑`. | Capture fournie; le dépôt affiché est tronqué dans l’interface. |
| Sens du compteur Noah | Non documenté dans les pages officielles consultées. Les flèches ne permettent pas de déterminer avec certitude s’il s’agit de fichiers, commits ou d’autre chose. | **Inconnu** — ne pas l’interpréter comme une liste de changements. |
| État Git local | `origin` pointe sur `Azumizeus/buildpact.git`; remote `75mv-backup` conservé; `main` sans upstream; quatre changements non commités. | Vérifié dans `/Users/mickaeldunoyer/projects/seeker-nexus-dev-hub-solana/buildpact-75mv`. |

### Changements locaux en attente

Dans le clone `buildpact-75mv`, Git affichait :

- modifié : [`.gitignore`](../.gitignore)
- nouveau : [`docs/NOAH-GITHUB-CHECKUP-2026-10-13.md`](NOAH-GITHUB-CHECKUP-2026-10-13.md)
- nouveau : [`docs/SUBMISSION-KIT.md`](SUBMISSION-KIT.md)
- nouveau : [`docs/VIDEO-SCRIPT-2MIN.md`](VIDEO-SCRIPT-2MIN.md)

Ces changements n’ont pas été copiés, commités ou poussés dans le cadre du diagnostic. Le kit présent ne les modifie pas.

## Pourquoi ne pas synchroniser tout de suite

Le dépôt Noah et l’historique propre du dépôt BuildPact peuvent avoir des historiques différents. Le mémo local du 13/10 rapporte un conflit `409` après remplacement d’historique et des erreurs `503/CORS` observées à ce moment-là. Ces erreurs datées n’établissent pas l’état du service aujourd’hui, mais elles montrent que l’opération de synchronisation a déjà été problématique.

La capture la plus récente montre encore un compteur `3↓ 1↑`, sans aperçu des modifications. Une synchronisation pourrait donc modifier le mauvais dépôt ou écraser/déplacer des changements. **Ne pas cliquer pour “voir ce qui se passe”.**

## Plan sûr, étape par étape

### 1. Garder le dépôt de référence intact

- Continuer à utiliser [Azumizeus/BuildPact](https://github.com/Azumizeus/BuildPact) et la démo principale comme références partagées.
- Ne pas forcer un push, ne pas réécrire l’historique et ne pas pousser depuis `buildpact-75mv`.
- Conserver `75mv-backup` : il s’agit d’un remote de sauvegarde, pas du dépôt canonique.
- Avant de déplacer les quatre changements locaux, comparer chaque fichier au dépôt propre dans un clone frais. Les traiter séparément; ne pas recopier aveuglément `.gitignore` ni des fichiers de documentation susceptibles d’être déjà présents.

### 2. Laisser l’intégration Noah en lecture seule pour le moment

Dans le workspace Noah concerné :

- ne pas cliquer sur **Sync Changes**;
- ne pas utiliser **Disconnect** comme tentative de changer le dépôt;
- ne pas demander à Noah de cloner ou réécrire le dépôt;
- ne pas fournir de capture d’écran comme instruction de modification du code.

La page Noah documente comment connecter GitHub, voir le dépôt et changer de **branche**. Elle documente aussi que **Disconnect**, dans les paramètres globaux `Settings → Integration → GitHub`, retire l’accès GitHub de Noah sans supprimer les dépôts. Elle **ne documente pas** la procédure pour remplacer le dépôt associé à un projet déjà relié. Une déconnexion globale peut affecter l’accès Noah d’autres projets; ne pas la faire sans savoir précisément ce qu’elle impacte.

### 3. Obtenir une procédure Noah confirmée avant tout rattachement

Contacter le support Noah ou suivre leurs instructions écrites et demander explicitement :

1. comment rattacher le workspace existant à `Azumizeus/BuildPact` sans créer un autre dépôt;
2. si l’opération conserve le contenu du workspace et quelle direction de synchronisation prévaut;
3. comment examiner les éléments derrière `3↓ 1↑` avant une synchronisation;
4. si la liaison GitHub est par projet ou globale et quels autres projets seraient touchés par **Disconnect**;
5. comment récupérer/exporter le workspace de façon non destructive avant toute opération.

Ne procéder qu’après confirmation du dépôt cible, de la branche (`main`) et du sens de transfert. Si Noah ne peut pas montrer un diff fiable, garder le workspace déconnecté de toute écriture et utiliser le dépôt GitHub canonique comme source.

### 4. Corriger les liens publics et vérifier

- Dans GitHub `Azumizeus/BuildPact → About → ⚙️`, vérifier que le lien est `https://buildpact-solana.vercel.app/`. L’utilisateur a déclaré que c’était corrigé, mais cette modification n’a pas été revérifiée dans l’interface.
- Vérifier dans le README que la démo et le dépôt pointent vers les URL canoniques.
- Réserver l’ancienne URL `noah-…vercel.app` à l’investigation historique; ne pas la donner au jury.
- Le tableau de bord Vercel demande une session authentifiée; son état détaillé n’a pas été inspecté par l’agent.

## Références utiles

- [Documentation Noah — GitHub](https://docs.trynoah.ai/integrations/github) — connexion, choix de branche, mise à jour automatique et déconnexion; pas de procédure documentée de remplacement du dépôt déjà lié.
- [Documentation Noah — Bienvenue](https://docs.trynoah.ai/getting-started/welcome)
- [Dépôt GitHub BuildPact](https://github.com/Azumizeus/BuildPact)
- [Démo principale](https://buildpact-solana.vercel.app/)
- [Tableau de bord Vercel BuildPact](https://vercel.com/azumizeus-projects/buildpact/deployments) — nécessite une connexion.

## Règles à retenir

1. **BuildPact GitHub est la source canonique; Noah n’est pas autorisé à la remplacer par une synchronisation non inspectée.**
2. **`3↓ 1↑` n’est pas expliqué officiellement : inconnu tant qu’un diff réel n’est pas visible.**
3. **Ne pas pousser l’historique de l’ancien clone vers le dépôt propre.**
4. **Ne jamais remettre une clé ou un `.env` dans le dépôt, dans Noah, dans Vercel, ni dans ce kit.**
5. **Une capture d’écran ou un état observé le 14/10/2026 n’est pas une garantie que l’état actuel soit identique.**
