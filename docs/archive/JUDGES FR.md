# BuildPact — le pacte des builders. La confiance, c'est du code.

**Hackathon NoahAI Nitro 02 · Devnet uniquement · [Live demo](https://buildpact-solana.vercel.app)**

---

## En une phrase

BuildPact est un Kickstarter + cap table on-chain pour les builders Solana : un founder publie une idée avec ses rôles et ses parts, des devs et des investisseurs rejoignent le pacte, l'accord se verrouille on-chain, et les fonds se distribuent automatiquement selon les parts — 2 % protocole, 98 % aux membres.

## Pourquoi maintenant

Les devs Solana travaillent déjà sur GitHub et Discord. BuildPact ne remplace pas ces outils : il ajoute la couche qui manque — la confiance et le paiement. Rôles, parts, approbation, escrow et distribution deviennent vérifiables on-chain au lieu de reposer sur un accord informel.

Un solo founder peut cadrer son idée, publier les rôles recherchés, intégrer son équipe et verrouiller l'accord sans coordonner manuellement le moindre paiement.

## Le parcours complet (testable en direct)

```
create_project → add_member → approve → finalize → fund → distribute
```

1. **Create** — le founder décrit le projet, ses rôles, sa part.
2. **Join** — les membres postulent avec leur wallet, leur rôle, leur part négociée.
3. **Finalize** — quand toutes les approbations sont réunies et que les parts totalisent 100 %, le founder verrouille le pacte on-chain.
4. **Fund** — les backers financent le vault (PDA escrow), 100 % vérifiable.
5. **Distribute** — 2 % protocole, 98 % aux membres au prorata de leur part, en une transaction.

Trois pacts réels, finalisés et fonctionnels, sont visibles dès maintenant sur le [Marketplace](https://buildpact-solana.vercel.app/#/marketplace).

## Stack

| Couche | Techno |
|---|---|
| Programme | Anchor 0.30 (CLI 0.31.1), Rust, Solana Devnet |
| Frontend | React + Vite + TypeScript, Tailwind, Wallet Adapter |
| Backend | Supabase (auth par signature de message, chat/updates Realtime) |
| Déploiement | Vercel |

## Architecture on-chain

| Élément | Valeur |
|---|---|
| Program ID | `9quyDwntXDBhNhTmrfCf7xEXVFaxYMB83BwPEUeqVoUJ` |
| Config PDA | seeds `["config"]` — `protocol_fee_bps = 200` (2 %) |
| Project PDA | seeds `["project", creator, project_id]` |
| Vault PDA | seeds `["vault", project]` |
| Réseau | Devnet uniquement (mainnet = post-hackathon) |

Chaque compte est dérivé par seeds canoniques, avec vérification signer et arithmétique checked partout — pas de calcul de parts ou de distribution qui puisse silencieusement déborder ou être falsifié côté client.

## Sécurité : une vraie faille trouvée et corrigée

Un audit interne (Claude + vulnhunter) a identifié que `protocol_wallet` — l'adresse qui reçoit les 2 % de frais — n'était pas verrouillée dans `create_project` : n'importe quel créateur aurait pu y mettre sa propre adresse et détourner les frais du protocole.

Fix : une constante `PROTOCOL_WALLET` fixée dans le programme, avec un `require!` qui rejette toute autre valeur (`InvalidProtocolWallet`, erreur 6021). Testé (le test négatif fait partie des 13/13 qui passent) et redéployé sur Devnet — le programme actuellement live intègre ce correctif.

## Tests

13/13 passent, dont le chemin nominal complet (create → members → approve → finalize → fund → distribute) et les cas de rejet : `protocol_wallet` invalide, non-créateur qui tente d'ajouter un membre ou de fermer le projet, financement d'un pacte non finalisé, fermeture d'un pacte déjà distribué. Le scénario d'attaque par dust (compte pollué de poussière) est neutralisé — le vault poussiéreux se ferme en remboursant le créateur au lieu de bloquer.

## Questions qu'on anticipe

**Un dev disparaît après avoir touché sa part ?**
V1 : le financement se fait après finalization, façon Kickstarter — le risque existe mais est visible et assumé par les backers en connaissance de cause. V2 (post-hackathon) : jalons de paiement + réputation on-chain des builders.

**Les parts sont-elles modifiables ?**
Non une fois le pacte finalisé — c'est une garantie, pas une limitation : personne ne peut réécrire l'accord après coup. Avant finalization, oui, avec ré-approbation de tous les membres.

**Et la sécurité ?**
Seeds de PDA canoniques, vérifications signer partout, arithmétique checked, faille réelle trouvée et corrigée avant la démo (voir ci-dessus).

## Ce qui n'est pas encore fait (honnêteté d'abord)

- Rotation de l'autorité d'upgrade du programme vers une clé dédiée (prévue post-hackathon).
- V2 : jalons de paiement, réputation on-chain, remplacement de membre.
- Mainnet : volontairement hors scope, Devnet uniquement jusqu'à validation complète.

---

*Devnet uniquement. Aucune donnée factice : les trois pacts visibles sur le Marketplace sont de vrais comptes on-chain, créés, approuvés et finalisés via le parcours complet du programme.*
