// src/lib/i18n/fr.walletPanel.ts
// Namespace `walletPanel` du dictionnaire FR — carte Wallet du dashboard
// Profil (WalletPanel.tsx).
//
// Fichier séparé, et pas un bloc ajouté dans fr.ts, pour une raison
// mécanique : fr.ts dépasse la limite de taille de l'outil d'édition, il
// n'est plus modifiable par patch. Même contrainte qui avait déjà fait
// sortir le namespace `settings` (fr.settings.ts). L'assemblage se fait
// dans translations.ts, qui est devenu de fait la racine de composition
// des dictionnaires — c'est là qu'on enregistre un nouveau namespace
// extrait, pas dans fr.ts.
//
// Doit rester en miroir de en.walletPanel.ts, clé pour clé : une clé
// présente d'un seul côté ne lève aucune erreur, t() renvoie la clé brute
// et l'écran affiche « walletPanel.noTokens » — mais uniquement dans la
// langue qui l'a perdue, donc le cas que personne ne teste.
import type { Dict } from './types';

export const frWalletPanel: Dict = {
  heading: 'Wallet',
  viewOnExplorer: 'Voir sur Explorer ↗',
  solBalance: 'Solde SOL',
  tokensHeading: 'Tokens détenus',
  noTokens: 'Aucun autre token SPL détenu sur ce wallet (devnet).',
  // Distinct de `noTokens` : ici on n'a PAS pu lire, donc on ne peut pas
  // affirmer que le wallet ne détient rien. Sert au cas où SPL Token et
  // Token-2022 échouent tous les deux.
  tokensError: "Impossible de lire les tokens détenus pour le moment.",
  historyHeading: 'Dernières transactions',
  noHistory: 'Aucune transaction trouvée pour ce wallet.',
  historyError: "Impossible de charger l'historique pour le moment.",
  invalidWallet: 'Adresse de wallet illisible.',
  viewMoreOnSolscan: 'Voir plus sur Solscan ↗',
};
