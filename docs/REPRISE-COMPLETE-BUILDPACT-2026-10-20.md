# BuildPact — dossier complet de reprise

> **Document de reprise de référence — vérifié le 20 octobre 2026**
> Checkout : branche `main`, `HEAD`/`origin/main` à `4aa15f6`.
> Réseau du programme et des paiements testés : **Solana Devnet seulement**.
> Les services externes et états publiés doivent être revérifiés au moment d’agir.

## En bref

**BuildPact est une application Web pour formaliser l’accord d’une équipe de builders.** Un fondateur crée un pacte qui précise le projet, les rôles, les membres et les parts. Chaque membre approuve avec son wallet; quand la composition est approuvée et que les parts font 100 %, le pacte est verrouillé on-chain. Des SOL peuvent ensuite être déposés dans un vault, puis distribués par le programme selon les parts convenues.

**Pour qui ?** Fondateurs qui recrutent des coéquipiers, contributeurs qui veulent connaître leur part avant de s’engager, et backers qui veulent voir la répartition prévue avant de financer. Le public visé en premier est constitué de petites équipes Web3/Solana qui collaborent à distance.

**Pourquoi ?** Une promesse dans un chat ou un tableau est difficile à prouver et facile à contester. Un accord enregistré sur Solana rend visibles la composition, les parts approuvées, les étapes du pacte et les mouvements du vault. Cela réduit la dépendance envers un serveur ou une personne pour établir ce qui avait été convenu.

**Limites importantes :** un pacte on-chain ne remplace pas un contrat juridique, une société, un audit ou une vérification des personnes. Le programme décrit ici manipule du SOL natif; il n’offre pas de litige, d’arbitrage, de remplacement de membre ou de versements par jalons. Le déploiement documenté est Devnet : aucun essai ne vaut autorisation d’utiliser Mainnet ou de l’argent réel.

## Parcours du produit

```text
create_project → add_member → approve → finalize → fund → distribute → close_project
```

1. Le fondateur crée le pacte (`create_project`).
2. Il ajoute/retire des membres (`add_member`, `remove_member`) tant que le pacte est ouvert.
3. Chaque membre accepte avec son wallet (`approve`).
4. Le fondateur finalise (`finalize`) s’il y a au moins deux membres, que tous ont approuvé et que la somme est exactement 10 000 points de base.
5. Un financeur peut alimenter le vault en SOL (`fund`).
6. Un appelant déclenche la distribution (`distribute`) : frais de protocole 2 %, puis le reste réparti au prorata des parts, dans une transaction atomique.
7. Le fondateur ferme un pacte (`close_project`) lorsque le vault n’a plus que son rent et une poussière sous le seuil.

Le protocole ne décide pas si le travail réalisé mérite la part : il applique le pacte et les signatures enregistrés. Le flux n’est pas un système de paie ni une garantie de rendement.

## Pour la personne qui reprend : état vérifié

### État Git et commits récents

Le 20/10, `git status --short --branch` indiquait `main...origin/main` sans changements locaux affichés. `HEAD` et `origin/main` étaient à `4aa15f6`. Les opérations de push des commits avaient été vérifiées dans la session précédente; aucun commit supplémentaire n’est créé par ce document.

- `b5b41a8 — scripts: refuse ATA creation on RPC errors` : script de contrôle/création d’ATA; il ne crée un compte qu’après une erreur identifiée comme absence réelle. Une panne RPC remonte au lieu de déclencher une dépense. Option de lecture seule `--check-only`.
- `4aa15f6 — scripts: add x402 devnet pact endpoints` : serveur x402 d’exemple, API locale de lecture de pacts réels, client de paiement et décodage prudent de clé. Les lots de push ont respecté le garde-fou du dépôt.

### Vérifications et essais rapportés

Le compte rendu de la session précédente dit :

- `npm test` : **395 tests réussis**;
- `npm run build` : réussi (typecheck + Vite build + build guard);
- garde-fou de lots de push : réussi pour les lots envoyés;
- avertissements lint et avertissements Vite de compatibilité navigateur/taille de bundles persistants;
- x402 test : challenge HTTP 402, puis réponse 200 après paiement;
- x402 API réelle : challenge, règlement, puis six pacts lus on-chain. La route API est en lecture seule;
- deux règlements Devnet confirmés, **0,001 USDC chacun** : [transaction du test](https://explorer.solana.com/tx/3EuLFLcrQyDZdqMzEd13SW9YBoMYfJD5xuGmUGSD1S4W96gBmaUypVmqVwQbKKwuHSRCPtC38FetjDg4GXi1e4vz?cluster=devnet) et [transaction API](https://explorer.solana.com/tx/2dHx36ULZ6CiSNns9MYu8gdFBwCD1kQjmyVeYy2nGCtJepqjvgxHZFg61q5v2zLAbHHTcBmutUnZ6WuGCrUAGXBB?cluster=devnet).

Les serveurs de test ont été arrêtés. Ces paiements ont accédé à des serveurs locaux via x402/Devnet; cela ne prouve ni que les scripts soient déployés comme service, ni qu’ils soient reliés au frontend, monitorés ou prêts pour la production. Ces essais ne financent pas le vault BuildPact et ne testent pas sa distribution SOL.

Les anciennes suppressions de deux HTML signalées dans un compte rendu antérieur ont été préservées alors; vérifier l’état de ce checkout avant une opération Git. Le statut local consulté le 20/10 n’affichait aucune différence, mais aucun historique externe de ces suppressions n’est inféré ici.

## Architecture : carte rapide

```text
Navigateur React/TypeScript/Vite
  ├─ wallet-adapter : signature des utilisateurs et transactions Solana
  ├─ appels RPC via fonction Edge Supabase (relais)
  └─ Supabase Data API / Realtime pour les fonctions sociales autorisées

Solana Devnet : programme Anchor/Rust — pactes, approbations, vault SOL,
distribution et événements

Supabase : Postgres/RLS + fonctions Edge Deno — profils, médias, chat,
activité, candidatures, notifications, traductions et relais RPC

Scripts Node autonomes : outils x402 Devnet et diagnostic/préparation ATA
```

### Frontend et routes

- Entrée et assemblage : [`src/main.tsx`](../src/main.tsx), [`src/App.tsx`](../src/App.tsx).
- Routage hash : [`src/lib/hashRoute.ts`](../src/lib/hashRoute.ts), [`src/lib/router.ts`](../src/lib/router.ts); URLs partageables de forme `#/…`, sans rewrite serveur.
- Client programme/IDL : [`src/lib/anchor.ts`](../src/lib/anchor.ts), [`src/lib/pacts.ts`](../src/lib/pacts.ts), [`src/idl/buildpact.json`](../src/idl/buildpact.json).
- RPC et relais : [`src/lib/constants.ts`](../src/lib/constants.ts), [`supabase/functions/rpc/index.ts`](../supabase/functions/rpc/index.ts).
- Écritures signées : [`src/lib/projectWrite.ts`](../src/lib/projectWrite.ts), [`src/lib/profileRemote.ts`](../src/lib/profileRemote.ts).
- Langues : `src/lib/i18n/`; apparence : `src/lib/ThemeContext.tsx`, `src/lib/theme.ts` et `src/lib/theme/palettes.ts`.
- Les routes actuelles déclarées dans `src/App.tsx` comprennent `#/`, `#/marketplace`, `#/pacts`, `#/create`, `#/pact/<pda>`, `#/demo`, `#/docs`, `#/profile`, `#/treasury`, `#/builders`, `#/network`, `#/about` et `#/dashboard`. Le shell historique `/v1/*` reste aussi présent. Ne pas le retirer sans décision et inventaire des usages.

### Programme Anchor

- Source : [`programs/workspace/src/lib.rs`](../programs/workspace/src/lib.rs); configuration [`Anchor.toml`](../Anchor.toml), Anchor 0.31.1, Devnet.
- Program ID : `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`.
- PDA projet : seeds `"project"`, créateur, identifiant; PDA vault : `"vault"`, PDA projet.
- Limites relevées dans le code : 8 membres; total 10 000 bps; ID 20 octets; titre 80; description **800**; rôle 32. Les chaînes sont bornées en octets UTF-8.
- Frais compilés : 200 bps = 2 %, destinataire fixé dans le programme. Pas de compte de configuration mutable selon la source actuelle.
- Source des instructions : `create_project`, `update_description`, `add_member`, `remove_member`, `approve`, `finalize`, `fund`, `distribute`, `close_project`.
- Les paiements du vault sont des transferts SOL natifs. Les deux essais x402, eux, ont payé de l’USDC Devnet pour accéder à une ressource HTTP : deux systèmes distincts.
- **Point critique** : cohérence source/IDL ne prouve pas l’identité du binaire déjà déployé. Utiliser `node scripts/idl-check.mjs` avant de conclure que les limites et instructions sont celles du programme en ligne.

### Supabase et sécurité des écritures

Les Edge Functions présentes incluent `assistant-chat`, `chat-moderate`, `contact`, `network-write`, `open-roles`, `project-write`, `push`, `quest-write`, `rpc`, `translate`, `update-profile` et `vault`. Le modèle observé dans les fonctions de mutation est de vérifier une signature ed25519 de wallet (format, action, fraîcheur et propriétaire) ou une transaction on-chain avant une écriture avec `service_role`. Le serveur ne doit pas faire confiance à un champ d’auteur libre fourni par le navigateur.

À retenir :

- une clé `service_role` contourne RLS : chaque chemin avant cette clé est une frontière de sécurité;
- CORS protège le navigateur, ce n’est pas une authentification;
- formats de messages signés et parseurs doivent rester synchronisés; ne pas relâcher les regex d’action;
- les limites en mémoire des fonctions ne sont pas nécessairement des quotas globaux persistants;
- protéger les objets Storage séparément des lignes de métadonnées;
- migrations présentes dans Git ne prouvent pas qu’elles ont été appliquées au projet distant;
- tester sur un environnement isolé, pas par des écritures exploratoires dans les données utilisateurs.

### Scripts récents x402 et ATA

| Commande | Usage | Précautions |
|---|---|---|
| `npm run x402:test -- --port=4021` | Serveur échantillon local, route `GET /api/pacts-test`. Sans règlement, doit renvoyer 402. | Échantillon statique; ne touche pas le vault. |
| `npm run x402:api -- --port=4022` | Serveur local `GET /api/pacts`, lecture RPC de comptes du programme, décodage via IDL, cache 15 s. | Route read-only, RPC peut échouer; les erreurs ne doivent pas exposer une URL avec secret. |
| `npm run x402:pay -- --url=http://127.0.0.1:4021/api/pacts-test` | Client x402. Clé depuis `SVM_PRIVATE_KEY` en base58 ou `--keypair=…`. | Clé locale uniquement, Devnet uniquement, ne jamais l’afficher ni la coller dans un chat/journal. Vérifier destinataire et montant avant paiement. |
| `npm run setup:atas -- --check-only` | Vérifie des ATAs sans transaction. | Sans `--check-only`, le script peut faire payer la création par un keypair local. Confirmer réseau, mint, propriétaire et wallet. Défaut Devnet. |

Le réseau x402 est codé comme Solana Devnet, avec prix par défaut de 0,001 USD et `payTo` correspondant au portefeuille protocole. Les scripts sont autonomes; aucune intégration de paiement x402 dans les pages React n’a été établie par les vérifications rapportées.

## Points techniques à préserver

1. **Parts** : calcul entier sécurisé; `finalize` exige exactement 10 000 bps, tous les membres approuvés et au moins deux membres.
2. **Immutabilité de l’accord** : opérations de composition et description refusées après finalisation.
3. **Destination des frais** : portefeuille protocole constant; l’argument historique de `create_project` existe pour la compatibilité, mais est comparé à la constante.
4. **Distribution** : comptes membres restants et leurs clés doivent correspondre à la liste on-chain; fee et paiements calculés avec arithmétique vérifiée; émission d’événements après opérations.
5. **Fermeture** : `close_project` contrôle le solde du vault quel que soit l’état, pour éviter de balayer des fonds transférés directement au PDA.
6. **Texte** : les limites sont en octets UTF-8, pas en nombre de caractères; ne pas remplacer par `String.length`.
7. **RPC** : aucune clé privée ou clé RPC privilégiée dans le bundle `VITE_*`. Le relais serveur est décrit dans `.env.example`; les valeurs d’environnement ne doivent pas être copiées dans cette documentation.
8. **Wallet** : une signature ou transaction est toujours déclenchée par une action explicite; aucune signature silencieuse au chargement.

## Reprise locale et commandes

Depuis la racine du dépôt :

```bash
git status --short --branch
npm ci
npm run typecheck
npm test
npm run build
npm run lint
npm run check:soumission
npm run check:prod
```

`npm test` porte sur les tests Node de logique et de garde-fous; ce n’est pas une suite d’intégration complète des Edge Functions ou un test wallet. `npm run build` couvre typecheck, build Vite et build guard; il ne prouve pas que Vercel sert le commit attendu. `check:soumission` teste les sondes du RPC/IDL/CORS depuis la configuration du poste. `check:prod` examine l’URL servie configurée, à date et à portée limitées. Les commandes Vercel `check:parc`/`check:origine` nécessitent accès approprié. `anchor test` exige les outils Anchor/Rust et une configuration de validator compatible.

Pour les tests de l’app, vérifier d’abord les serveurs/listeners déjà présents avant de choisir un port. Pour tout paiement, valider Devnet, wallet de test, montant, mint et adresse avant de signer. Pour les secrets, ne jamais les imprimer et ne jamais considérer une purge Git comme une révocation fournisseur.

## Ce qui reste à faire — par priorité

Les notes des 8, 12, 13 et 15 octobre contiennent des états de Vercel, GitHub, Supabase et de clés parfois contradictoires. Les tâches ci-dessous demandent une vérification **live**; ce ne sont pas des déclarations que l’état ancien est toujours vrai.

### P0 — avant la prochaine démonstration

1. Vérifier le dépôt canonique GitHub, la branche, l’URL de démo, le projet Vercel effectivement connecté et le commit servi. Les documents historiques ne donnent pas tous le même nom de dépôt.
2. Relancer `npm test`, `npm run build`, `npm run check:soumission` et `npm run check:prod`; noter commit, date, codes retour et limites. Ne pas masquer un code d’échec par un pipe.
3. Ouvrir le site dans un vrai navigateur : pages principales, chargement des données, réseau/console, responsive, erreurs et repli RPC. Un build réussi n’est pas un test UI.
4. Dérouler le parcours wallet sur Devnet avec des wallets de test : créer, ajouter, approuver, finaliser, financer, distribuer et fermer; vérifier chaque transaction sur l’explorer. Éviter les pacts de démonstration existants sans sauvegarde/plan de restauration.
5. Vérifier chez les fournisseurs la révocation/rotation des clés historiques RPC et inspecter les variables de déploiement et bundles servis au moyen des contrôles sans révéler les valeurs. La suppression d’une variable ou d’un commit ne révoque pas une clé exposée.

### P1 — fiabilisation et sécurité

6. Comparer les migrations locales avec le schéma/RLS distant réellement appliqué; revoir CORS, authorization par projet/fondateur, fonctions Edge, rate limits, Storage et données personnelles.
7. Ajouter une suite d’intégration des Edge Functions : signature fausse/expirée/rejouée, wallet non autorisé, PDA tiers, panne RPC/DB, pré-vol navigateur et isolation entre wallets.
8. Mettre en place des comptes et projet Supabase de test; séparer données de démo et données utilisateurs; ne pas automatiser avec un wallet personnel.
9. Trancher le statut de `/v1`; inventorier routes, fonctions et préférences consommées avant migration ou suppression.
10. Mesurer les avertissements ESLint/Vite (chunks, compatibilité navigateurs, taille) et fixer un budget justifié au lieu de supprimer des avertissements à l’aveugle.

### P2 — décisions produit avant exploitation publique

11. Décider si l’API x402 reste un exemple, est intégrée à l’app ou devient une offre publique. Les endpoints testés sont locaux : une offre publique exigerait hébergement, disponibilité du facilitateur/RPC, quotas, anti-abus, observabilité, gestion d’erreurs, tarification et support.
12. Décider le modèle d’actifs : SOL uniquement ou aussi USDC/SPL. L’ATA script est un utilitaire distinct, pas une intégration SPL du vault.
13. Concevoir jalons, départ/remplacement d’un membre, annulation, fonds non réclamés et litiges; cela modifie le contrat économique/on-chain.
14. Ne préparer Mainnet qu’après audit indépendant, multisig/gestion de l’autorité d’upgrade, stratégie de clés, tests économiques, alertes, procédure d’incident et revue juridique.

### Décisions à faire par le propriétaire

- BuildPact reste-t-il un prototype Devnet/hackathon ou devient-il un service maintenu ?
- L’API x402 doit-elle être mise en production, intégrée à l’app ou rester une démonstration ?
- Le vault doit-il un jour gérer USDC/SPL, ou rester en SOL ?
- Quel shell et quelle documentation conserver : legacy `/v1`, archives, mises à jour multilingues ?
- Qui assume conservation des clés, support, conformité et réponse aux incidents en production ?

## Règles de reprise et gestion des secrets

- Commencer chaque session par `git status --short --branch`; ne pas écraser, stasher, committer ou pousser le travail d’autrui.
- Ne pas force-push, réécrire l’historique, déployer ou effectuer un paiement Mainnet sans demande explicite.
- `.env*`, keypairs, seeds, tokens de session et secrets de plateforme ne vont jamais dans Git, un chat ou un rapport.
- Toute variable `VITE_*` est publique après compilation. Une clé de service ne doit jamais y être placée.
- Les anciens fichiers peuvent citer une configuration de keypair/RPC différente; comparer aux sources et `.env.example` actuels, ne pas restaurer une clé issue d’une note.
- Pour un résultat externe, séparer clairement code lu, test automatisé, requête publique, transaction Devnet et vérification de production.

## Documents du dépôt à interpréter avec leur date

- [`README.md`](../README.md) : présentation générale; relire les chiffres et statuts avant de les republier.
- [`RESUME_PROJET.md`](../RESUME_PROJET.md) et [`DOSSIER_TECHNIQUE.md`](../DOSSIER_TECHNIQUE.md) : documentation riche mais ancienne; notamment, le dossier technique annonce une description à 500 alors que le source actuel annonce 800, et plusieurs sections de RPC/keys doivent être confrontées au code.
- [`docs/ETAT-APP-2026-10-08-FR.md`](ETAT-APP-2026-10-08-FR.md) : instantané du 08/10, pas un état courant.
- [`docs/CHECKLIST-DERNIERE-LIGNE-2026-10-12.md`](CHECKLIST-DERNIERE-LIGNE-2026-10-12.md) : journal daté du 12/10; certaines sections « reste à faire » étaient déjà obsolètes ensuite.
- [`docs/NOAH-GITHUB-CHECKUP-2026-10-13.md`](NOAH-GITHUB-CHECKUP-2026-10-13.md), [`docs/NOAH-RECOVERY-KIT.md`](NOAH-RECOVERY-KIT.md), [`docs/SUBMISSION-KIT.md`](SUBMISSION-KIT.md) : notes de migration/hackathon; plusieurs noms de dépôts, états de production et liens ne concordent pas entre eux. Vérifier GitHub/Vercel directement avant tout usage.
- [`docs/INVENTAIRE-V1-2026-10-08.md`](INVENTAIRE-V1-2026-10-08.md), [`docs/REVUE-DOCS-REFERENCE-2026-10-08.md`](REVUE-DOCS-REFERENCE-2026-10-08.md) : analyses historiques.
- [`docs/README.md`](README.md) : index général de documentation.

Pour les pages Markdown/HTML couplées, suivre le générateur [`docs/outils/md-to-html.mjs`](outils/md-to-html.mjs) et vérifier les paires avec [`docs/outils/verifier-docs.mjs`](outils/verifier-docs.mjs); ne pas éditer à la main un HTML généré.

## Glossaire

- **Pacte** : accord BuildPact sur les membres, rôles et parts d’un projet.
- **Bps / points de base** : 10 000 bps = 100 %; 200 bps = 2 %.
- **PDA** : adresse Solana déterministe dérivée de seeds et d’un programme.
- **Vault** : compte PDA qui reçoit ici des SOL avant distribution.
- **ATA** : Associated Token Account pour un propriétaire et un mint SPL.
- **IDL** : schéma Anchor permettant au client d’encoder/décoder instructions et comptes.
- **Edge Function** : fonction serveur Supabase exécutée en Deno.
- **x402** : protocole HTTP de paiement par challenge 402; dans les scripts actuels, exemples Devnet autonomes.

---

# Revue du 20/10/2026 au soir — ce qui a été vérifié, et ce qui reste

> Complète les P0 ci-dessus. Tout ce qui suit a été **mesuré** le 20/10 au soir
> (état live, pas documentaire). Les corrections de code et de docs sont **locales,
> non poussées** (push = GO explicite du propriétaire).

## P0 — état au 20/10 au soir

| # | Tâche | Résultat |
|---|---|---|
| 1 | Repo canonique, branche, prod servie | Repo `Azumizeus/noah-6a8f756412768ce6d61b9376-u7a8`, **public**, `main`, HEAD = `origin/main` = `4aa15f6`. **Prod = `8f5e17d` → 2 commits d'écart** (les 2 commits manqués sont `scripts/` seulement : `b5b41a8` + `4aa15f6` ; les correctifs de sécurité `2752f7a` et `8f5e17d` **sont bien en prod**). Fix : redéployer Vercel depuis `main`. |
| 2 | `npm test` / `build` / `check:soumission` / `check:prod` | `npm test` = **395/395**. `npm run build` = vert (typecheck 0 erreur, lint 0 erreur / 35 warnings, build-guard : aucun secret dans le bundle). `check:soumission` = **« Prêt à déposer »** (3/3 sondes : JSON-RPC rendu par le relais, 9 comptes du programme, 6 pacts décodables, pré-vol CORS accepté). `check:prod` = **écart de 2 commits** (voir ligne 1). |
| 3 | Parcours navigateur réel | 12 routes répondent 200. `#/demo` s'affiche en 8 étapes sans wallet (FR/EN, chronologie, parts, vault). `#/marketplace` et `#/pacts` lisent la chaîne via le relais (`POST functions/v1/rpc` → 200) et affichent des données réelles (4 pacts, 0,3127 SOL cumulés, 1 open / 3 finalized). `#/create` affiche le wizard et demande le wallet (attendu). Landing **390 px (iPhone)** : propre, stats réelles. **Une seule erreur console**, à chaque chargement : `wallet-standard:app-ready event could not be dispatched` (librairie wallet-standard tierce, `solana-wallet-*.js`) — sans impact fonctionnel, mais visible par un juge qui ouvre la console. |
| 4 | Parcours wallet complet sur devnet | **NON FAIT** — exige des wallets de test dont l'emploi n'a pas été validé dans cette session. Chemin prévu : `create_project → add_member → approve → finalize → fund → distribute → close_project` sur devnet, chaque tx vérifiée sur l'explorer. **Ne pas toucher aux pacts de démonstration existants** (4 pacts visibles sur le Marketplace) sans plan de restauration. |
| 5 | Clés historiques / secrets | `check:history:profond` : **537 blobs lus, 16,7 Mio, rien trouvé**. `check:helius` : **aucune clé Helius dans l'historique**. `check:secret` : **indéterminé** — la comparaison serveur exige `SUPABASE_PROJECT_REF` *et* l'accès CLI à Supabase ; le secret `RPC_UPSTREAM_URL` n'a pas pu être confirmé présent. À revérifier avec un accès authentifié. |

## Le « point critique » de ce dossier est levé

`node scripts/idl-check.mjs` (20/10) :

- programme déployé, owner `BPFLoaderUpgradeab1e11111111111111111111111`, authority `8eui3v5xoSwoGHeLXrYQv7TMfvY2hSrJeBoHCFQzB4j6` = celle de `~/.config/solana/id.json` → **le programme n'est pas figé** ;
- binaire de **311 301 octets**, construit le 2026-09-21 ;
- 6 comptes `Project` décodables sur 9 ;
- l'instruction `update_description` (marqueur du build du 27/08) est **présente dans le binaire déployé** ;
- sonde à 400 octets **acceptée** → borne déployée ≥ 400, donc **800** ;
- `src/lib/onchainLimits.ts` et le programme déployé sont **alignés**.

→ La source livrée au jury et le binaire en ligne décrivent le même programme.

## Un chiffre faux dans la documentation (corrigé)

La documentation annonçait « **24/24** » tests on-chain. Le recomptage du 20/10 donne :

- `tests/workspace.ts` → **27/27**
- `tests/load-and-migration.ts` → **16/16**
- **total 43/43** (`npx ts-mocha -p ./tsconfig.anchor.json -t 1000000 "tests/**/*.ts"`)

Corrigé dans : `README.md`, `docs/SUBMISSION-KIT.md`, `docs/JUDGES-ENG.md`, `docs/FICHE-PRODUIT-BUILDPACT.md`, `docs/ROADMAP-{FR,ENG}.md`.

## Un piège de reproductibilité (build SBF)

`anchor build` échoue sur cette machine :

```
error: rustc 1.79.0-dev is not supported by the following packages:
  indexmap@2.13.1 requires rustc 1.82
  proc-macro-crate@3.5.0 requires rustc 1.82.0
  workspace@0.1.0 requires rustc 1.84.0
```

Le toolchain Solana installé embarque rustc 1.79, alors que le `Cargo.lock` figé
( inchangé depuis `def8726`) exige ≥ 1.84. **Un juge qui clone le dépôt ne peut pas
construire le programme** avec le toolchain par défaut.

Contournement qui fonctionne (vérifié le 20/10) :

```bash
cd programs/workspace
PATH="$HOME/.local/share/solana/install/releases/stable-*/solana-release/bin:$PATH" \
RUSTUP_TOOLCHAIN=1.89.0-x86_64-apple-darwin \
  cargo build-sbf
cp programs/workspace/target/deploy/workspace.so target/deploy/workspace.so
```

Décision à prendre : **exiger un Solana CLI plus récent** (Agave ≥ 2.3 avec rustc ≥ 1.84)
et le documenter dans le README, ou **figer les versions de dépendances** compatibles
avec rustc 1.79. La première option est la moins risquée pour le code.

## Patches locaux préparés le 20/10 au soir (non poussés)

- `README.md` : encadré « Judges — start here » (lien du parcours **sans wallet**, pacts réels, Program ID, IDL, notes EN/FR) ; section « Repository layout » qui explique `src/pages/premium/` (tier NOAH, routes `/v1/*`) vs le produit jugé ; `cp .env.example .env.local` dans les instructions ; encadré d'avertissement « **n'utilisez pas `anchor test` ici** » (le `[provider]` pointe sur devnet et l'authority est la clé live → un déploiement écraserait le programme en prod) ; « 43/43 » ; licence MIT.
- `LICENSE` (nouveau) : MIT, Copyright 2026 Mickael Dunoyer.
- `package.json` : `name: buildpact` (au lieu de `node-solana-starter-app`), `version 0.1.0`, `description`, `license: MIT`, `author`, `homepage`, `repository`, `keywords`.
- `docs/SUBMISSION-KIT.md` : état vérifié du 20/10, cases de checklist corrigées, section sur `x402` (service local, non déployé → **ne pas l'annoncer comme une fonctionnalité**),section sur le piège `anchor test`, réponses pièges à jour.
- `docs/VIDEO-SCRIPT-2MIN.md` : **Colosseum exige deux vidéos** (présentation 2-3 min **et** démo produit ≤ 3 min) + storyboard prêt à enregistrer pour la vidéo de présentation.
- `docs/JUDGES-{ENG,FR}.md` : en-tête « Colosseum » (l'ancien en-tête annonçait « NoahAI Nitro 02 ») + liens démo sans wallet ; « 43/43 ».
- `docs/DEMO-SCRIPT.md`, `docs/FICHE-PRODUIT-BUILDPACT.md`, `docs/ROADMAP-{FR,ENG}.md` : cohérence.
- `DOSSIER_TECHNIQUE.md` : `MAX_DESC_LEN` = **800** (le document annonçait 500).

Côté GitHub (déjà appliqué, sans code) : `description` vérifiée, **10 topics** posés
(`solana, anchor, devnet, escrow, web3, buildpact, solana-program, react, typescript, hackathon`),
`homepage` vérifiée, **`vars.PROD_URL`** posée.

## Ce qui ne dépend que du propriétaire

1. **Ajouter `VERCEL_TOKEN`** dans Settings → Actions du dépôt : le job planifié
   « contrôle quotidien » échoue depuis le 15/10 **faute de jeton**, pas à cause du code.
   Le contrôle de provenance et le contrôle de parc sont donc **inertes** (le job échoue
   volontairement : « un contrôle qui n'a rien mesuré ne doit pas ressembler à un contrôle
   qui a validé »). Sans lui, le badge du dépôt reste rouge.
2. **Redéployer Vercel depuis `main`** (écart de 2 commits, `scripts/` seul — cosmétique
   mais le contrôle de provenance le signale).
3. **Filmer les deux vidéos** (`docs/VIDEO-SCRIPT-2MIN.md`).
4. **Valider le parcours wallet complet** sur devnet (P0-4) avec des wallets de test.
5. **Décider du sort de `/v1`** (tier NOAH dans le dépôt) : le README l'explique désormais,
   mais le shell legacy reste présent.
6. **Trancher le sort de l'API x402** : exemple local, intégration à l'app, ou offre publique.
7. Décider si le dépôt doit être **renommé** (`Azumizeus/BuildPact` : les anciennes URL sont
   en 404 et le nom actuel `noah-…` brouille le signal pour un juge qui ne connaît pas NOAH).
   Renommer casserait le lien Vercel ↔ GitHub si l'intégration n'est pas rejouée.

---

# Correctifs du 20/10 au soir — 3 bugs d'affichage, trouvés et corrigés

> Les trois sont **corrigés en local, non poussés**. Chaque correctif a un
> test de non-régression (ou une preuve visuelle) — détail sous chaque point.

## 1. La fiche d'un pact ne montrait ni titre, ni description, ni vault

**Symptôme** : depuis le marketplace (« Voir la fiche »), la page du pact
s'ouvrait sur la bannière puis passait **directement aux actions on-chain**.
Le titre du pact, sa description et le bloc vault/membres étaient
**invisibles**. Signalé comme « la description n'affiche plus ».

**Cause** : `bannerImageStyle()` (`src/pages/premium/projectCardMedia.ts`)
renvoie `{ position:'absolute', inset:0, width:'100%', height:'100%' }`.
Une image en `absolute` est dimensionnée sur son **bloc de référence** — le
plus proche ancêtre positionné. Sur la fiche pact
(`src/pages/premium/PremiumPact.tsx`), le conteneur de bannière (140 px) était
`position: static` : le bloc de référence remontait jusqu'à la **carte**
(`position: relative`), et l'image s'étalait donc sur **toute la carte**.
Le `overflow: hidden` du bandeau ne la-recoupait pas (la découpe ne s'applique
qu'aux descendants dont le bloc de référence est le bandeau lui-même).

Résultat : la bannière passait **par-dessus** le titre, la description et le
bloc vault/membres. Le commentaire de `projectCardMedia.ts` documente
déjà ce piège — il avait été corrigé pour les **cartes** le 08/10
(`PremiumProjectCard` a bien `position:'relative'`), **pas pour la fiche**.

**Correctif** : `position: 'relative'` sur le conteneur de bannière de
`PremiumPact.tsx` (une ligne). `PremiumProfil.tsx` était déjà correct.

**Preuve** : page de test `dist/cstest.html` (deux cartes côte à côte,
avant/après) → à gauche l'image recouvre tout, à droite le titre, la
description et `VAULT / MEMBRES` sont visibles.

**Non-régression** : `scripts/banner-containment.test.ts` — lit les sources et
exige que tout conteneur hébergeant `bannerImageStyle()` soit
`position: 'relative'`. Le test **échoue** si on retire le correctif
(vérifié : il passe avec, il échoue sans).

## 2. Le profil s'affichait vide, il fallait le refaire

**Symptôme** : « mon profil n'est plus accessible, je dois le refaire » —
la page Profil affichait `—` et « No bio yet », alors que le profil est
toujours dans l'annuaire des builders.

**Cause** : `PremiumProfil.tsx` lisait **uniquement** le localStorage
(`loadProfile(myAddr) ?? emptyProfile(myAddr)`). Le localStorage n'est
qu'un cache d'appareil : vidé (ou absent sur un autre appareil), le profil
affichait vide — alors que la ligne serveur (`builder_profiles`) existait
toujours, et c'est elle que lit l'annuaire.

**Correctif** : la source de vérité est le serveur.
`fetchProfile(myAddr)` est relancé au montage ; en repli du cache local, et
le remote est **recaché** en local (`saveProfile`) pour que les deux
soient d'accord. Le profil s'affiche de nouveau (pseudo, bio, avatar,
bannière, niveau) sans rien ressaisir.

## 3. Le dashboard n'avait pas les vues du marketplace

**Symptôme** : « le marketplace a plusieurs façons d'afficher les pacts,
il faut pareil dans le dashboard ».

**État** : `PremiumMyDashboard.tsx` listait les pacts dans une simple `<ul>`
(titre + adresse + pastille) : **aucune description**, et **aucun** choix de
densité — alors que le marketplace propose grandes cartes / petites cartes /
liste dense / tableau.

**Correctif** : le dashboard utilise désormais **exactement** les mêmes
composants et les mêmes quatre vues que le marketplace :
`ViewToggle` + `PremiumProjectCard` (grandes / petites), `PactListRow`
(liste dense), tableau (colonnes pact / statut / vault / membres / rôle), et
`NumberedPagination`. Le pitch du pact s'affiche désormais dans les cartes.
Clé i18n `v2.myDashboard.myProjectsHeading` ajoutée en FR et EN.

## État de la branche après les correctifs

- `npm test` : **397/397** (395 + 2 garde-fous banner)
- `npm run typecheck` : 0 erreur · `npm run lint` : 0 erreur (35 warnings)
- `npm run build` : vert, aucun secret dans le bundle
- Suite on-chain : inchangée (43/43)

**Pour voir les correctifs en production**, il faut : push + redéploiement
Vercel. Le profil et le dashboard ne sont pas des patchs d'UI réversibles
sans déploiement : tant que la prod tourne sur `8f5e17d`, les trois bugs
sont visibles.
