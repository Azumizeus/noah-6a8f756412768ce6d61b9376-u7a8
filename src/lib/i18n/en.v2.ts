// src/lib/i18n/en.v2.ts
// ═══════════════════════════════════════════════════════════════════
// Namespace `v2` — English strings for the premium shell. Mirrors
// fr.v2.ts key for key (same shape, same placeholders).
// ═══════════════════════════════════════════════════════════════════
export const enV2 = {
  dashboard: {
    eyebrow: 'Revenue share protocol · Solana devnet',
    titleLine1: 'Your commitment,',
    titleLine2: 'live on-chain',
    subtitle:
      'Every pact below is an account actually allocated on the network — its PDA, member signatures and vault are verifiable on Solscan.',
    statFunds: 'Funds raised',
    statFundsSub: 'Cumulative vaults · {{n}} pact(s)',
    statRecruiting: 'Recruiting',
    statRecruitingSub: 'Shares available',
    statFunding: 'Seeking funds',
    statFundingSub: 'Finalized vaults',
    registryCount: '{{n}} pact(s) in the registry',
    pillFunds: 'Funds',
    pillRecruiting: 'Recruiting',
    kAllocated: 'Allocated',
    kAvailable: 'Available',
    kMembers: 'Members',
    kCreator: 'Creator',
    thPact: 'Pact',
    thStatus: 'Status',
    thVault: 'Vault',
    listMetaMembers: '{{n}} members',
  },
  pacts: {
    statVaults: 'Cumulative vaults',
    statVaultsSub: '{{n}} pact(s)',
    statOpen: 'Open',
    statOpenSub: 'Recruiting / in creation',
    statFinalized: 'Finalized',
    statFinalizedSub: 'Ready to receive funds',
    pillOpen: 'Open',
    pillFunds: 'Funds',
    managePact: 'Manage pact →',
  },
  marketplace: {
    statRemaining: 'Available',
    thCreator: 'Creator',
  },
  profile: {
    titleLine1: 'My profile',
    titleLine2: 'in the registry',
  },
  treasury: {
    footnote: '{{amount}} SOL cumulative — 98% to members, 2% to the protocol.',
  },
};
