// src/lib/i18n/fr.v2.ts
// ═══════════════════════════════════════════════════════════════════
// Namespace `v2` — chaînes du shell premium (nouveau design).
//
// Ces textes étaient écrits en FRANÇAIS EN DUR dans PremiumDashboard,
// PremiumPacts, PremiumMarketplace, PremiumTreasury et PremiumProfil :
// le bouton EN changeait bien l'interface, mais ces libellés restaient
// francophones. Ils vivent ici (et non dans fr.ts) parce qu'ajouter un
// namespace à fr.ts/en.ts n'est plus praticable — voir le commentaire
// d'enregistrement dans translations.ts.
// ═══════════════════════════════════════════════════════════════════
export const frV2 = {
  dashboard: {
    eyebrow: 'Revenue share protocol · Solana devnet',
    titleLine1: 'Votre engagement,',
    titleLine2: 'actif sur la chaîne',
    subtitle:
      'Chaque pact ci-dessous est un compte réellement alloué sur le réseau — son PDA, ses signatures de membres et son vault sont vérifiables sur Solscan.',
    statFunds: 'Fonds mobilisés',
    statFundsSub: 'Vaults cumulés · {{n}} pact(s)',
    statRecruiting: 'Recrutent',
    statRecruitingSub: 'Parts à pourvoir',
    statFunding: 'Cherchent des fonds',
    statFundingSub: 'Vaults finalisés',
    registryCount: '{{n}} pact(s) au registre',
    pillFunds: 'Fonds',
    pillRecruiting: 'Recrute',
    kAllocated: 'Attribué',
    kAvailable: 'À pourvoir',
    kMembers: 'Membres',
    kCreator: 'Créateur',
    thPact: 'Pact',
    thStatus: 'Statut',
    thVault: 'Vault',
    listMetaMembers: '{{n}} membres',
  },
  pacts: {
    statVaults: 'Vaults cumulés',
    statVaultsSub: '{{n}} pact(s)',
    statOpen: 'Ouverts',
    statOpenSub: 'Recrutent / en création',
    statFinalized: 'Finalisés',
    statFinalizedSub: 'Prêts à recevoir des fonds',
    pillOpen: 'Ouvert',
    pillFunds: 'Fonds',
    managePact: 'Gérer le pact →',
  },
  marketplace: {
    statRemaining: 'Pourvoir',
    thCreator: 'Créateur',
  },
  profile: {
    titleLine1: 'Mon profil',
    titleLine2: 'au registre',
  },
  treasury: {
    footnote: '{{amount}} SOL cumulés — 98 % pour les membres, 2 % pour le protocole.',
  },
};
