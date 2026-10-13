import type { PublicKey } from '@solana/web3.js';

export type { ChainPact as Pact } from '../lib/pacts';

export type PactAction = 'distribute' | 'fund' | 'finalize' | null;

// ═══ Forme BRUTE des comptes on-chain (sortie Anchor désérialisée) ═══
//
// Anchor ne peut pas typer `program.account.project.fetch()` : notre IDL est
// importé en JSON à l'exécution, pas généré en type TypeScript. Sans ces
// interfaces, chaque lecture de compte retombait sur `any` et se propageait
// dans tout le mapping (9 occurrences dans useProjects.ts).
//
// Le cast reste nécessaire UNE fois, à la frontière, dans anchor.ts. Le
// gain n'est pas cosmétique : `p.projetcId` (faute de frappe) compilait
// silencieusement et rendait `undefined` à l'écran. Maintenant il échoue.
//
// ⚠️ Ces interfaces décrivent le programme déployé. Si lib.rs change un
// champ, TypeScript ne le saura pas — c'est un contrat tenu à la main.
// Toute modification du compte Project doit être répercutée ici.

export interface OnchainMember {
  wallet: PublicKey;
  role: string;
  shareBps: number;
  approved: boolean;
}

/**
 * Les enums Anchor arrivent en objet à UNE seule clé : `{ pending: {} }` ou
 * `{ finalized: {} }`. D'où le test `'finalized' in p.status` un peu partout
 * dans le code — ce n'est pas une astuce, c'est la seule lecture possible.
 */
export type ProjectStatus =
  | { pending: Record<string, never> }
  | { finalized: Record<string, never> };

export interface ProjectAccount {
  projectId: string;
  title: string;
  description: string;
  creator: PublicKey;
  members: OnchainMember[];
  status: ProjectStatus;
  protocolWallet: PublicKey;
}

/** Enveloppe rendue par `program.account.<x>.all()`. */
export interface FetchedAccount<T> {
  publicKey: PublicKey;
  account: T;
}

// ═══ Reçu de distribution (split déterministe calculé off-chain) ═══
export interface DistributionPayout {
  wallet: string;   // base58
  shareBps: number;
  amountSol: number;
}

export interface DistributionReceipt {
  signature: string;
  grossSol: number;   // vault avant distribution
  netSol: number;     // montant réparti entre les membres
  feeSol: number;     // frais protocole (2%)
  payouts: DistributionPayout[];
  executedAt: number; // timestamp ms
}
