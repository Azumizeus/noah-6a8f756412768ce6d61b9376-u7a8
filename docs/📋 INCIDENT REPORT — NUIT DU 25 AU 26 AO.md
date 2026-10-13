📋 INCIDENT REPORT — NUIT DU 25 AU 26 AOÛT 2026
BuildPact — Repo 6cec → tentative migration by7b — Échec de soumission NOAH Hackathon 02
Deadline hackathon : 26 août 2026, 12:00
Document rédigé : 26 août 2026, ~4h30 (fin de nuit, à chaud)
Statut final : Candidature non soumise dans les règles du hackathon (obligation de tout faire dans NOAH). Projet techniquement fonctionnel et sauvegardé, mais hors délai de compétition.

1. CONTEXTE — ÉTAT AVANT LA NUIT DU 25/08

Repo actif jusqu'alors : AzumiZeus/noah-6a84b80564b5bc4377d7dcd3-6cec (privé)
Program Solana déployé et fonctionnel : 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ (Devnet)
Frontend prod : https://buildpact-solana.vercel.app / https://buildpact-hazel.vercel.app
Projet en état avancé : marketplace, profils builders, chat, vault documents, annuaire, audit A11y WCAG AA fait, plusieurs vulnérabilités de sécurité déjà trouvées et corrigées lors d'un audit interne (protocol fee wallet hardcodé notamment).
Le projet tournait normalement, historique de dev très riche depuis plusieurs jours (voir CERVEAU PROJET).


2. DÉCLENCHEUR DE LA CRISE

Un audit de sécurité automatisé NOAH AI a été lancé sur le programme Rust/Anchor dans la nuit du 25 au 26/08.
Cet audit a trouvé et fait corriger 2 vulnérabilités réelles sur le programme :
Trouvaille #2 : "Locked Funds Due to Inability to Close Finalized Projects" — un pact finalisé ne pouvait jamais être fermé, gelant le loyer et la poussière de lamports pour toujours. Fix : autoriser la fermeture si le vault ne contient plus que de la poussière sous un seuil DUST_TOLERANCE_LAMPORTS.
Trouvaille #1 : "Unprotected Vault Closure for Open Projects" — le contrôle anti-vidage du vault était enfermé dans un if status == Finalized, ce qui permettait à un créateur de contourner la vérification en envoyant un transfert SOL natif direct vers le PDA vault d'un pact encore Open, puis de le balayer via close_project. Fix : le seuil de poussière s'applique désormais à tous les statuts, plus de trou de sécurité selon l'état du pact.


Ces fixes ont nécessité des changements sur lib.rs, donc potentiellement un nouveau build/déploiement du programme.


3. LA PANNE GITHUB / SYNC (cœur de la crise)

À un moment de la nuit, le lien entre le projet NOAH et le repo GitHub 6cec a cassé — impossible de push le code corrigé depuis NOAH vers GitHub.
Confusion et allers-retours importants pour comprendre l'ampleur du problème :
Vérification que le fichier lib.rs corrigé n'existait dans aucune version locale ni backup — confirmé : jamais eu ce fichier en local, uniquement dans NOAH.
Doute et clarification sur le fait qu'aucune invention/hallucination de fichier n'avait eu lieu — le fichier corrigé existait bel et bien, mais uniquement côté NOAH, inaccessible en push.


Décision prise faute de mieux : récupérer manuellement le contenu du lib.rs corrigé (copier-coller brut depuis l'interface NOAH) pour ne pas perdre le travail de l'audit de sécurité.


4. RÈGLE DU HACKATHON DÉCOUVERTE TROP TARD (le coup fatal)

Prise de conscience, avec environ 1h restante avant deadline, que le règlement du hackathon impose que tout le développement soit fait dans NOAH — un simple push manuel du code vers GitHub en contournant l'outil ne suffit pas / risque la disqualification.
Décision de tenter une migration en catastrophe :
Créer une nouvelle conversation projet NOAH dans le bon mode.
Demander à NOAH de produire un document de migration complet (contexte, code intégral frontend + backend, spécifications du programme, IDL, adresses, commandes de déploiement) pour ré-informer un nouvel environnement de zéro.
Projet destination identifié : nouveau repo by7b (remplaçant 6cec).


Consigne critique posée à ce moment : ne surtout pas régénérer le Program ID 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ, déjà déployé sur devnet avec de vrais pacts on-chain — un nouveau keypair de programme aurait fait perdre tout l'historique réel et forcé une recréation live devant les juges.
Une demande annexe a émergé pendant la préparation du document de migration : profiter du changement pour passer la limite de description d'un pact de 280 à 500 caractères. Identifié comme risqué à ce stade (implique probablement un changement de space on-chain sur le compte Project, donc un redéploiement de programme, pas juste un changement frontend) — mis de côté, non fait, jugé trop dangereux à moins d'1h de la deadline.


5. VERDICT — ABANDON

À 38 minutes de la deadline, constat que la migration complète (nouveau repo by7b, re-création de l'environnement NOAH, redéploiement éventuel) ne pouvait matériellement pas être bouclée à temps proprement.
Décision assumée d'abandonner la soumission du hackathon NOAH 02, plutôt que de forcer une action risquée en urgence (ex. casser le déploiement du programme en le modifiant à la va-vite).
Le projet lui-même n'est pas perdu : programme Solana toujours déployé et fonctionnel sur devnet, frontend Vercel opérationnel, code sécurisé par un audit ayant trouvé et corrigé deux vraies vulnérabilités critiques.


6. ÉTAT FINAL DES REPOS (à date de rédaction)
Copier le tableau


Repo
Statut



AzumiZeus/noah-...-6cec
Ancien repo. Contient l'historique de dev jusqu'à l'audit de sécurité. Lien NOAH↔GitHub cassé en cours de nuit.


by7b
Nouveau repo tenté en urgence pour migration post-audit. Non finalisé / non confirmé opérationnel au moment de l'abandon.


⚠️ Point à trancher au réveil, à froid : lequel des deux repos contient réellement la version la plus à jour et sécurisée du lib.rs (avec les 2 fixes de l'audit) ? Le contenu corrigé existait confirmé côté interface NOAH (copié-collé dans le presse-papier pendant la nuit) — à vérifier where il a atterri exactement.

7. LEÇONS / POINTS À CLARIFIER AVANT DE REPRENDRE

Comprendre la cause racine de la panne de sync GitHub↔NOAH cette nuit-là — bug d'infra NOAH (comme l'incident du 22/08 déjà documenté pour le déploiement de programme) ou action/config locale qui a cassé le lien ?
Vérifier l'intégrité du programme on-chain actuel : le programme déployé à 9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ contient-il déjà les 2 fixes de sécurité (si un déploiement a eu lieu cette nuit), ou est-il resté sur l'ancienne version vulnérable (si seul le code source local/NOAH a été modifié sans déploiement) ? C'est la question de sécurité n°1 à trancher avant toute reprise.
Ne plus jamais faire d'audit de sécurité majeur pendant la nuit précédant une deadline — trop de risque de découvrir un problème critique sans le temps de le corriger et redéployer proprement.
Le changement 280→500 caractères reste une bonne idée produit, à faire calmement, avec le temps de recalculer space, tester, et gérer la migration des comptes Project déjà existants.
Clarifier une fois pour toutes la règle exacte du hackathon sur le lien NOAH↔GitHub (tout faire dans NOAH = quoi précisément : uploads via NOAH uniquement ? interdiction de coller du code manuellement même en cas de bug d'infra ?).