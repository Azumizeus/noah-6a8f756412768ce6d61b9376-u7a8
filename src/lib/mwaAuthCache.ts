// src/lib/mwaAuthCache.ts
//
// Cache d'autorisation MWA (Seed Vault / Mobile Wallet Adapter), donné à
// SolanaMobileWalletAdapter dans App.tsx.
//
// ⚠️ On NE le vide PLUS au disconnect (voir AppWalletButton.tsx) : forcer une
// nouvelle autorisation à chaque reconnexion cassait la fiabilité de signature
// — la session mise en cache et réutilisée est plus stable. Ce fichier existe
// simplement pour partager UNE SEULE instance du cache entre les endroits qui
// en ont besoin.
import { createDefaultAuthorizationResultCache } from '@solana-mobile/wallet-adapter-mobile';

export const mwaAuthCache = createDefaultAuthorizationResultCache();
