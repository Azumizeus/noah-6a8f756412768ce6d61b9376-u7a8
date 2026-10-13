// src/lib/i18n/en.walletPanel.ts
// `walletPanel` namespace of the EN dictionary — Wallet card of the
// Profile dashboard (WalletPanel.tsx).
//
// Separate file rather than a block inside en.ts: en.ts is past the size
// limit of the editing tool and can no longer be patched. Same constraint
// that previously extracted the `settings` namespace. Assembly happens in
// translations.ts, which is now the composition root for dictionaries.
//
// Must mirror fr.walletPanel.ts key for key — a key missing on one side
// fails silently, t() returns the raw key and the UI shows
// "walletPanel.noTokens", but only in the language that lost it.
import type { Dict } from './types';

export const enWalletPanel: Dict = {
  heading: 'Wallet',
  viewOnExplorer: 'View on Explorer ↗',
  solBalance: 'SOL balance',
  tokensHeading: 'Tokens held',
  noTokens: 'No other SPL tokens held on this wallet (devnet).',
  // Distinct from `noTokens`: here the read FAILED, so we cannot claim the
  // wallet holds nothing. Used when both SPL Token and Token-2022 fail.
  tokensError: 'Could not read the tokens held right now.',
  historyHeading: 'Recent transactions',
  noHistory: 'No transactions found for this wallet.',
  historyError: 'Could not load history right now.',
  invalidWallet: 'Unreadable wallet address.',
  viewMoreOnSolscan: 'View more on Solscan ↗',
};
