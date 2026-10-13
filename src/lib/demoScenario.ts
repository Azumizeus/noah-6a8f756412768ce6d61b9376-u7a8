// src/lib/demoScenario.ts
// ═══════════════════════════════════════════════════════════════════
// SCÉNARIO DE DÉMONSTRATION — le parcours complet create → fund →
// distribute, rejouable SANS WALLET et SANS RÉSEAU.
//
// ── Pourquoi ce module existe ───────────────────────────────────────
// Deux raisons, dans cet ordre :
//
//  1. Tourner la vidéo de 3 minutes ne doit dépendre d'aucune signature.
//     Le test wallet réel (docs/CHECKLIST-TEST-WALLET-2026-10-08.md) est à
//     0/20 : chaque geste de signature reste non vérifié, et un popup qui
//     ne s'ouvre pas en plein enregistrement coûte une prise entière.
//  2. Montrer l'ENCHAÎNEMENT, qui est l'argument du projet (create →
//     add_member → approve → finalize → fund → distribute, 2 % de frais
//     protocole, 98 % aux membres). Rejouer six signatures devant les
//     juges prendrait la moitié du temps imparti.
//
// ── Ce que ce module N'EST PAS ──────────────────────────────────────
// Ce n'est pas une simulation de la chaîne : aucune transaction, aucun
// appel RPC, aucun wallet. Les adresses et signatures produites ici sont
// FICTIVES et déterministes — deux exécutions donnent exactement la même
// sortie, ce qui rend le rejeu stable à l'écran (une signature qui change
// à chaque prise ferait douter de ce qu'on montre). L'interface DOIT dire
// qu'il s'agit d'un rejeu scripté, et c'est le rôle de PremiumDemo.tsx.
//
// ── Pourquoi tout est pur ───────────────────────────────────────────
// Aucun import : ni React, ni constants.ts (qui tire web3.js et
// import.meta.env). C'est ce qui permet à scripts/demo-scenario.test.ts de
// vérifier le partage 2 % / 98 % sous Node, alors que c'est exactement la
// règle qui, fausse, ferait dire n'importe quoi à la vidéo.
//
// ⚠️ La règle de partage est celle du PROGRAMME (`distribute`, déduite du
// vault entier) : frais = 2 % des lamports, net réparti au prorata des bps
// avec troncature entière PAR MEMBRE — la même opération que
// distributeWithReceipt() dans anchor.ts. Arrondir ici au SOL près
// afficherait des montants qui ne tombent juste nulle part on-chain.
// ═══════════════════════════════════════════════════════════════════

/** Base d'entiers : 10 000 = 100 %. Même échelle que TOTAL_BPS côté app. */
export const TOTAL_BPS = 10_000;

/** Frais protocole, en points de base (2 %). Cf. distributeWithReceipt(). */
export const FRAIS_BPS = 200;

/** Lamports par SOL — évite de dépendre de web3.js pour une constante. */
const LAMPORTS_PAR_SOL = 1_000_000_000;

/** Alphabet base58 (sans 0, O, I, l) — pour des adresses crédibles. */
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export type EtapeId = 'create' | 'add_member' | 'approve' | 'finalize' | 'fund' | 'distribute';

export interface ParticipantDemo {
  pseudo: string;
  /** Rôle tel qu'il est stocké on-chain (chaîne libre, cf. addMember). */
  role: string;
  shareBps: number;
  /** Adresse FICTIVE, déterministe. */
  wallet: string;
  /** Le créateur est le seul à pouvoir finaliser (contrainte on-chain). */
  createur?: boolean;
}

export interface PaiementDemo {
  pseudo: string;
  wallet: string;
  shareBps: number;
  amountSol: number;
}

export interface EtapeDemo {
  id: EtapeId;
  /** Nom d'instruction du programme, tel qu'il apparaît dans l'IDL. */
  instruction: string;
  /** Pseudo du signataire (« protocole » quand personne ne signe). */
  signataire: string;
  /**
   * Paramètres du libellé i18n (`demo.step.<id>`). Données seulement : le
   * module ne contient AUCUNE phrase, sinon le rejeu resterait en français
   * dans la vidéo anglaise.
   */
  params: Record<string, string | number>;
  /** Signature FICTIVE, déterministe (88 caractères base58). */
  signature: string;
  /** Variation du vault provoquée par l'étape, en SOL (négatif = sortie). */
  deltaVaultSol: number;
  /** Paiements sortants — uniquement sur `distribute`. */
  paiements?: PaiementDemo[];
}

export interface ScenarioDemo {
  projectId: string;
  title: string;
  pitch: string;
  /** Adresse FICTIVE du compte projet (PDA). */
  pda: string;
  protocolWallet: string;
  participants: ParticipantDemo[];
  etapes: EtapeDemo[];
  /** Solde du vault APRÈS chaque étape (même longueur que `etapes`). */
  soldesVaultSol: number[];
  montantFinanceSol: number;
  fraisProtocoleSol: number;
  netMembresSol: number;
  paiements: PaiementDemo[];
}

// ── Génération déterministe ──────────────────────────────────────────

/** FNV-1a 32 bits : court, sans dépendance, et suffisant pour une fiction. */
function empreinte(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Chaîne pseudo-aléatoire déterministe dans l'alphabet base58. */
function chaineDepuis(graine: string, longueur: number): string {
  let etat = empreinte(graine) || 0x9e3779b9;
  let sortie = '';
  for (let i = 0; i < longueur; i++) {
    // xorshift32 : reproductible d'un moteur JS à l'autre (contrairement à
    // Math.random, qui rendrait le rejeu différent à chaque prise).
    etat ^= etat << 13;
    etat >>>= 0;
    etat ^= etat >>> 17;
    etat ^= etat << 5;
    etat >>>= 0;
    sortie += BASE58[etat % BASE58.length];
  }
  return sortie;
}

/** Adresse fictive de 44 caractères (taille d'une adresse Solana). */
export function adresseFactice(graine: string): string {
  return chaineDepuis(`adresse:${graine}`, 44);
}

/** Signature fictive de 88 caractères (taille d'une signature Solana). */
export function signatureFactice(graine: string): string {
  return chaineDepuis(`signature:${graine}`, 88);
}

// ── Partage des fonds ────────────────────────────────────────────────

export interface PartageDemo {
  fraisProtocoleSol: number;
  netMembresSol: number;
  paiements: PaiementDemo[];
}

/**
 * Reproduit `distribute` : 2 % des lamports au portefeuille protocole, le
 * reste au prorata des bps, tronqué PAR MEMBRE (jamais en une fois après
 * coup : deux troncatures ne donnent pas le même total).
 */
export function repartirVault(vaultSol: number, participants: ParticipantDemo[]): PartageDemo {
  const brutLamports = Math.round(vaultSol * LAMPORTS_PAR_SOL);
  const fraisLamports = Math.floor((brutLamports * FRAIS_BPS) / TOTAL_BPS);
  const netLamports = brutLamports - fraisLamports;

  return {
    fraisProtocoleSol: fraisLamports / LAMPORTS_PAR_SOL,
    netMembresSol: netLamports / LAMPORTS_PAR_SOL,
    paiements: participants.map((p) => ({
      pseudo: p.pseudo,
      wallet: p.wallet,
      shareBps: p.shareBps,
      amountSol: Math.floor((netLamports * p.shareBps) / TOTAL_BPS) / LAMPORTS_PAR_SOL,
    })),
  };
}

// ── Scénario ─────────────────────────────────────────────────────────

export interface OptionsScenario {
  projectId?: string;
  title?: string;
  pitch?: string;
  montantFinanceSol?: number;
  participants?: Array<{ pseudo: string; role: string; shareBps: number; createur?: boolean }>;
}

const PARTICIPANTS_DEFAUT: NonNullable<OptionsScenario['participants']> = [
  { pseudo: 'Ada', role: 'Founder produit', shareBps: 5000, createur: true },
  { pseudo: 'Kwame', role: 'Ingénieur Solana', shareBps: 3000 },
  { pseudo: 'Sofia', role: 'Design & growth', shareBps: 2000 },
];

/**
 * Construit le scénario complet, prêt à être rejoué image par image.
 *
 * Le vault est vide, puis financé d'un coup, puis vidé par `distribute` :
 * le dernier solde vaut donc 0, ce que le test vérifie — un rejeu qui
 * laisserait 12 SOL dans le vault après une distribution raconterait une
 * autre histoire que le programme.
 */
export function construireScenarioDemo(options?: OptionsScenario): ScenarioDemo {
  const projectId = options?.projectId ?? 'buildpact-demo';
  const title = options?.title ?? 'Atlas — carte solaire pour les lycées';
  const pitch =
    options?.pitch ?? 'Atlas équipe les lycées d’un tableau de bord énergétique, ouvert et vérifiable.';
  const montantFinanceSol = options?.montantFinanceSol ?? 12;

  const base = options?.participants ?? PARTICIPANTS_DEFAUT;
  const createur = base.find((p) => p.createur) ?? base[0];
  if (!createur) throw new Error('Un scénario de démo a besoin d’au moins un participant.');

  const participants: ParticipantDemo[] = base.map((p) => ({
    pseudo: p.pseudo,
    role: p.role,
    shareBps: p.shareBps,
    wallet: adresseFactice(`participant:${projectId}:${p.pseudo}`),
    ...(p.createur ? { createur: true } : {}),
  }));
  const createurWallet = participants.find((p) => p.createur)!.wallet;

  const pda = adresseFactice(`projet:${projectId}:${createurWallet}`);
  const protocolWallet = adresseFactice(`protocole:${projectId}`);
  const partage = repartirVault(montantFinanceSol, participants);

  const etapes: EtapeDemo[] = [];
  let solde = 0;
  const soldesVaultSol: number[] = [];

  const ajouter = (etape: Omit<EtapeDemo, 'signature'>) => {
    solde = Math.round((solde + etape.deltaVaultSol) * LAMPORTS_PAR_SOL) / LAMPORTS_PAR_SOL;
    soldesVaultSol.push(solde);
    etapes.push({
      ...etape,
      signature: signatureFactice(`${projectId}:${etapes.length}:${etape.instruction}`),
    });
  };

  ajouter({
    id: 'create',
    instruction: 'create_project',
    signataire: createur.pseudo,
    params: { titre: title, shares: `${createur.shareBps / 100}%`, createur: createur.pseudo },
    deltaVaultSol: 0,
  });

  for (const p of participants.filter((x) => !x.createur)) {
    ajouter({
      id: 'add_member',
      instruction: 'add_member',
      signataire: createur.pseudo,
      params: { membre: p.pseudo, role: p.role, shares: `${p.shareBps / 100}%` },
      deltaVaultSol: 0,
    });
  }

  for (const p of participants.filter((x) => !x.createur)) {
    ajouter({
      id: 'approve',
      instruction: 'approve',
      signataire: p.pseudo,
      params: { membre: p.pseudo },
      deltaVaultSol: 0,
    });
  }

  ajouter({
    id: 'finalize',
    instruction: 'finalize',
    signataire: createur.pseudo,
    params: { titre: title },
    deltaVaultSol: 0,
  });

  ajouter({
    id: 'fund',
    instruction: 'fund',
    signataire: 'Backer #1',
    params: { montant: montantFinanceSol, titre: title },
    deltaVaultSol: montantFinanceSol,
  });

  ajouter({
    id: 'distribute',
    instruction: 'distribute',
    signataire: 'Backer #1',
    params: { montant: montantFinanceSol, frais: partage.fraisProtocoleSol, n: participants.length },
    deltaVaultSol: -montantFinanceSol,
    paiements: partage.paiements,
  });

  return {
    projectId,
    title,
    pitch,
    pda,
    protocolWallet,
    participants,
    etapes,
    soldesVaultSol,
    montantFinanceSol,
    fraisProtocoleSol: partage.fraisProtocoleSol,
    netMembresSol: partage.netMembresSol,
    paiements: partage.paiements,
  };
}

/** Nombre d'étapes du scénario — la barre de progression en a besoin. */
export function nombreEtapes(scenario: ScenarioDemo): number {
  return scenario.etapes.length;
}

/** Étape `index` du scénario, ou `null` si l'index sort du scénario.
 *  Le rejeu s'appuie dessus : au-delà de la dernière étape, on s'arrête au
 *  lieu de boucler (une boucle donnerait l'impression d'une chaîne qui
 *  recommence). */
export function etapeDemo(scenario: ScenarioDemo, index: number): EtapeDemo | null {
  return scenario.etapes[index] ?? null;
}
