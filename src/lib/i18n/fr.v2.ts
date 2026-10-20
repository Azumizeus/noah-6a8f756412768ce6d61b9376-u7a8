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
    loadingRegistry: 'Chargement du registre…',
    emptyRegistry: 'Aucun pact pour l’instant.',
  },
  myDashboard: {
    eyebrow: 'Ton wallet · Solana devnet · Bêta',
    titleLine1: 'Ton',
    titleLine2: 'tableau de bord',
    subtitle:
      'Les pacts que tu as créés ou rejoints, lus sur le devnet. C’est une bêta : rien ici n’est sur le mainnet, et les soldes sont du SOL de test.',
    connectTitle: 'Connecte un wallet pour ouvrir ton tableau de bord',
    connectBody:
      'La page d’accueil est le registre public. Cette vue ne liste que les pacts liés au wallet connecté.',
    browse: 'Voir le registre',
    emptyTitle: 'Aucun pact pour ce wallet',
    emptyBody: 'Crées-en un, ou rejoins un pact depuis le marketplace. Rien ici n’est simulé.',
    create: 'Créer un pact',
    marketplace: 'Ouvrir le marketplace',
    statMine: 'Tes pacts',
    statVault: 'Bloqué dans tes vaults',
    loading: 'Chargement de tes pacts…',
    youCreator: 'Créateur',
    youMember: 'Membre',
    myProjectsHeading: 'Tes pacts',
  },
  notFound: {
    eyebrow: 'Devnet · Bêta',
    title: 'Cette page n’existe pas',
    body: 'Cette adresse n’est pas une page BuildPact. Le registre n’a pas changé — ce n’est pas une liste de pacts vide.',
    home: 'Retour au registre',
  },
  pact: {
    statusOpen: 'Ouvert',
    statusVault: 'Vault actif',
    vault: 'Vault',
    members: 'Membres',
    actions: 'Actions on-chain',
    approved: 'Ton approbation est enregistrée on-chain',
    approve: 'Approuver mon pact',
    membersOnly: 'Les actions sont réservées aux wallets signataires de ce pact.',
    connectWallet: 'Connecte un wallet pour interagir.',
    fundPlaceholder: 'SOL à déposer (ex. 0,05)',
    fundAria: 'Montant en SOL à déposer',
    fund: 'Financer le vault',
    fundInvalid: 'Montant invalide.',
    finalize: 'Finaliser ({{approved}}/{{total}})',
    participants: 'Participants · {{pct}} % attribués',
    thWallet: 'Wallet',
    thRole: 'Rôle',
    thShare: 'Part',
    thApproved: 'Approuvé',
    you: '(toi)',
    notFound: 'Pact introuvable.',
    loading: 'Chargement de ce pact…',
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
    footnote: '{{amount}} SOL bloqués on-chain en ce moment. Une distribution enverrait 98 % aux membres et 2 % au protocole.',
  },
};
