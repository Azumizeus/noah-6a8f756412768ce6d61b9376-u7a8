# ✅ CHECKLIST — TEST RÉEL AVEC WALLET CONNECTÉ

> Rédigé le 08/10/2026 · app `buildpact-75mv` · **Solana Devnet uniquement**
> À dérouler quand un wallet réel est sous la main. Aucun agent n'a exécuté ces
> parcours : ils signent des transactions, et un navigateur d'automatisation ne
> peut ni autoriser MWA ni approuver une signature. Cette checklist est donc le
> seul moyen de valider la partie qui compte.

---

## 0. Avant de commencer

| Point | Valeur attendue |
|---|---|
| Réseau du wallet | **Devnet** (pas Mainnet — l'app n'écrit que sur devnet) |
| Solde | ≥ 0,05 SOL devnet pour créer un pact + payer les loyers |
| Commit testé | noter le hash de `main` (aujourd'hui `5a6d9f6`) |
| URL | `https://seeker-game.vercel.app` ou `npm run dev` en local |
| Explorer | `https://explorer.solana.com/?cluster=devnet` |

**Deux wallets, dans l'idéal** (A = créateur, B = membre). Un seul suffit pour
créer, mais l'ajout de membre et l'approbation ne se testent vraiment qu'à deux.

**À chaque étape, noter :** l'adresse du wallet, la signature de transaction
(base58), et une capture. Une signature sans capture ne se rejoue pas.

---

## 1. Connexion et identité de l'app (MWA)

1. Ouvrir l'app **sans** wallet connecté → le shell premium doit s'afficher
   (pas d'écran vide, pas de page sombre legacy).
2. Connecter le wallet A.
   - [ ] La demande d'autorisation affiche **BuildPact** avec l'URL réelle de la
     page (`window.location.origin`).
   - [ ] Refuser une première fois → l'app reste utilisable, pas de boucle de
     reconnexion.
   - [ ] Accepter → l'adresse apparaît dans la barre de navigation.
3. Actualiser la page.
   - [ ] La reconnexion est automatique et ne redemande pas d'autorisation.
   - [ ] Déconnecter puis reconnecter → toujours pas de double demande.

⚠️ **Point suspect à confirmer ici** : la console affiche
`Phantom was registered as a Standard Wallet. The Wallet Adapter for Phantom can
be removed from your app.` — l'app enregistre nous-mêmes `PhantomWalletAdapter`
alors que Phantom s'auto-enregistre. Sans effet visible constaté jusqu'ici, mais
c'est la première chose que ce test doit trancher : la connexion Phantom
fonctionne-t-elle, et une seule entrée s'affiche-t-elle dans la modale ?

- [ ] Un seul « Phantom » dans la modale de sélection (pas de doublon)
- [ ] Connexion Phantom réussie, signature demandée une seule fois

---

## 2. Création d'un pact de bout en bout

Chemin : `#/create` (shell premium) — c'est le parcours par défaut.

| Étape | Action | Attendu |
|---|---|---|
| 1 | Renseigner titre, description, logo, bannière | Aperçu immédiat, pas de débordement de bannière (chantier 4) |
| 2 | Choisir les rôles et les parts | **Total visible et égal à 100 %** ; parts > 100 % refusées |
| 3 | Ajouter un membre (wallet B) | Wallet B apparaît en « en attente » |
| 4 | **Finaliser / créer** | Une signature demandée, **une seule** |

- [ ] Le message de signature contient bien le libellé BuildPact et l'action
- [ ] La transaction est confirmée (`logs` visibles dans la console, pas d'erreur
      `custom program error`)
- [ ] Après création, redirection vers `#/pacts?mine=1` et **le pact y apparaît**

**Vérification on-chain (obligatoire)** — ouvrir la signature dans l'Explorer :

- [ ] Le programme appelé est `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ`
- [ ] L'instruction est `create_project`
- [ ] La PDA du pacte est bien celle que l'app affiche ensuite

Créer un pact sert aussi de référence : **noter la PDA**. Toutes les étapes
suivantes s'y réfèrent.

---

## 2bis. Enregistrement du profil depuis le shell premium

Le 08/10, l'enregistrement du profil premium écrit désormais **côté serveur**
(avant, il n'écrivait que dans le navigateur). C'est le seul correctif de la
journée dont la preuve demande un wallet : les tests unitaires couvrent la fusion
des champs, pas la signature.

1. Ouvrir `#/profile`, cliquer **Modifier**, changer le pseudo (et si possible
   l'avatar ou la bannière), puis enregistrer.
2. Approuver la signature demandée par le wallet.

- [ ] Le message proposé à la signature est le message canonique de BuildPact
      (`Wallet: …` + `Timestamp: …`) — et non l'ancien texte
      « BuildPact — Mise à jour du profil : … »
- [ ] L'app affiche « Profil enregistré — il apparaît maintenant dans l'annuaire
      des builders »
- [ ] `#/builders` : le **nouveau** pseudo/avatar/bannière apparaît (recharger la
      page, pour être sûr que ce n'est pas le cache)
- [ ] Depuis un **autre appareil ou navigateur**, se connecter avec le même
      wallet → le changement est là : c'est ce que « distant » veut dire
- [ ] La **bio, les liens, la disponibilité et la palette de thème** du profil
      sont intacts : le formulaire premium ne les expose pas, l'enregistrement ne
      doit pas les effacer au passage
- [ ] **Refuser** la signature une fois : aucun succès n'est affiché, et
      l'annuaire ne change pas (pas de succès mensonger)

---

## 3. Signature des autres chemins (le vrai risque)

Un test « création OK » ne prouve pas les autres instructions. Dérouler ces
quatre-là, chacune produisant **sa propre signature** :

1. **Financer** (`fund`) avec le wallet A — [ ] montant débité, trésorerie du
   pact créditée, Explorer montre l'instruction `fund`
2. **Approbation** (`approve`) — [ ] avec B après que A a finalisé ; l'état du
   membre passe de « en attente » à « approuvé »
3. **Retirer un membre** (`remove_member`) — [ ] tant que le membre est en
   attente ; refusé si le membre est déjà approuvé
4. **Distribuer** (`distribute`) — [ ] réservé au créateur ; les parts sont
   réellement transférées (vérifier les soldes **avant / après**, pas seulement
   le message de succès)

- [ ] Aucune transaction « fantôme » : chaque clic qui prétend écrire on-chain
      produit bien une signature dans la console du wallet
- [ ] Une signature refusée dans le wallet n'écrit rien et affiche un message
      dans l'app (pas de succès mensonger)

---

## 4. Correction de la description on-chain (les deux pacts pollués)

Deux pacts de démonstration ont un champ `description` qui **commence
littéralement** par `[🤝 Les deux]` — c'est le texte stocké on-chain, pas un
défaut d'affichage. Le créateur peut le corriger.

1. Ouvrir la fiche du pact concerné.
2. Ouvrir `EditDescriptionModal` (bouton de correction de description).
3. Saisir une description propre → signer.

- [ ] Une signature est demandée (`update_description`)
- [ ] Reconnexion / actualisation : la **nouvelle** description s'affiche
- [ ] Explorer : l'instruction `update_description` est bien présente
- [ ] L'ancien texte n'apparaît plus nulle part (carte, fiche, annuaire)

⚠️ Corriger ces deux-là **écrit sur devnet** : le contenu actuel est perdu.
Le noter avant (copier le texte) si on veut le garder quelque part.

---

## 5. Ce que ce test doit trancher (les points ouverts)

| # | Question | Comment on tranche |
|---|---|---|
| 1 | La connexion MWA affiche-t-elle une identité stable après redéploiement ? | Le nom/URL affiché dans la demande d'autorisation doit être celui de la page ouverte, pas une URL Vercel périmée |
| 2 | Faut-il retirer `PhantomWalletAdapter` ? | Si Phantom fonctionne et n'apparaît qu'une fois, oui — sans risque. Sinon, laisser tel quel |
| 3 | Le profil modifié en premium est-il écrit côté serveur ? | **Oui depuis le 08/10** (correctif § 4bis du plan). Après enregistrement, ouvrir `#/builders` → le pseudo/avatar doit avoir changé. Attendu : **changé**. Si l'annuaire ne bouge pas, noter l'erreur affichée par l'app : la signature a été acceptée mais l'Edge Function a refusé l'écriture |

---

## 6. Résultat du test (à remplir)

```
Commit testé      :
Wallet A / B      :
Date              :
Pact créé (PDA)   :
Signatures notées :

Étape 1 connexion ........ OK / ÉCHEC  (détail)
Étape 2 création ......... OK / ÉCHEC  (détail)
Étape 2bis profil ........ OK / ÉCHEC  (détail)
Étape 3 signatures ....... OK / ÉCHEC  (détail)
Étape 4 description ...... OK / ÉCHEC  (détail)

Bloquant rencontré :
Capture / log brut :
```

**Règle** : deux échecs consécutifs sur la même étape → on arrête et on
diagnostique, on ne réessaie pas une troisième fois à l'aveugle.

---

## 7. Ce que cette checklist ne couvre pas

- **Abonnement push réel** : impossible depuis un navigateur d'automatisation
  (`Notification.permission` y vaut `denied`). Il manque en plus la paire de
  clés VAPID. À tester dans un vrai navigateur, une fois les secrets posés.
- **Mainnet** : hors périmètre, l'app est devnet.
