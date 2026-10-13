// src/lib/anchor.ts
import { AnchorProvider, Program, BN, type Idl, type Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  type SendOptions,
} from '@solana/web3.js';
import idl from '../idl/buildpact.json';
import {
  PROGRAM_ID,
  PROJECT_SEED,
  VAULT_SEED,
  getRpcEndpoint,
  rotateRpc,
  getReadRpcEndpoint,
  rotateReadRpc,
  isRateLimitError,
  isMethodNotAllowedError,
  isRelayUnavailableError,
  backoffDelayMs,
} from './constants';
import type { ChainPact } from './pacts';
import type { DistributionReceipt, ProjectAccount, FetchedAccount } from '../types/pact';
import { MAX_DESC_LEN } from './onchainLimits';
import { truncateUtf8 } from './textSafety';

const MAX_RETRIES = 3;

// ═══════════════════════════════════════════════════════════════════
// TYPES DE FRONTIÈRE
//
// Ces interfaces remplacent les `any` qui traînaient dans ce fichier.
// Aucune ne cherche à décrire Anchor en entier : elles décrivent
// EXACTEMENT ce qu'on appelle, rien de plus. C'est volontaire — un type
// trop ambitieux casse au prochain bump d'Anchor, un type minimal tient.
//
// ⚠️ Les casts restants passent par `unknown`, jamais par `any`. La
// différence n'est pas cosmétique : `as any` désactive le typage pour
// TOUT ce qui découle de la valeur, `as unknown as X` force à annoncer
// une forme précise et s'arrête là.
// ═══════════════════════════════════════════════════════════════════

/**
 * Ce qu'on exige d'un wallet pour signer. Sur-ensemble volontairement
 * permissif : wallet-adapter expose `sendTransaction`, certains wallets
 * n'ont que `signTransaction` — buildAndSend() gère les deux chemins.
 */
export interface SignerWallet {
  publicKey: PublicKey | null;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  signAllTransactions?: (txs: VersionedTransaction[]) => Promise<VersionedTransaction[]>;
  sendTransaction?: (
    tx: VersionedTransaction,
    connection: Connection,
    options?: SendOptions
  ) => Promise<string>;
}

/**
 * Un builder Anchor (`program.methods.x(...).accounts(...)`).
 * On n'en utilise QUE `.transaction()` — inutile de typer le reste.
 */
interface TxBuilder {
  transaction: () => Promise<Transaction>;
}

/** Namespace de comptes du programme, typé sur notre IDL. */
interface ProjectAccountNamespace {
  project: {
    fetch: (address: PublicKey) => Promise<ProjectAccount>;
    all: () => Promise<FetchedAccount<ProjectAccount>[]>;
  };
}

/**
 * SEUL point d'accès aux comptes du programme.
 *
 * `program.account` est indexé dynamiquement par Anchor à partir de l'IDL,
 * qu'on charge en JSON à l'exécution : TypeScript ne peut pas savoir que
 * `project` existe. Le cast est confiné ici — au-delà, tout est typé.
 */
function projectAccounts(program: Program): ProjectAccountNamespace['project'] {
  return (program as unknown as { account: ProjectAccountNamespace }).account.project;
}

/** Lecture défensive d'une erreur inconnue (catch typé `unknown`). */
function errInfo(e: unknown): { message: string; name: string } {
  const o = (e ?? {}) as { message?: unknown; name?: unknown };
  return {
    message: typeof o.message === 'string' ? o.message : '',
    name: typeof o.name === 'string' ? o.name : '',
  };
}

export function getProvider(wallet: SignerWallet): AnchorProvider {
  // Liste d'ÉCRITURE : nœud dédié en premier. C'est lui qui fait atterrir les
  // transactions de façon fiable (blockhash frais, propagation rapide) — le
  // devnet public reste en repli.
  const connection = new Connection(getRpcEndpoint(), 'confirmed');
  return new AnchorProvider(connection, wallet as unknown as Wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
}

export function getProgram(provider: AnchorProvider): Program {
  return new Program(idl as unknown as Idl, provider);
}

export function getReadonlyProgram(): Program {
  // Liste de LECTURE : nœud dédié en premier depuis le 20/09 — Helius
  // répond de nouveau à `getProgramAccounts` en base64 (vérifié en curl),
  // alors que le devnet public est passé en 429 quasi permanent. Le
  // devnet public reste en repli (voir constants.ts pour l'historique).
  const connection = new Connection(getReadRpcEndpoint(), 'confirmed');
  // Wallet factice : aucune écriture ne passe par ce provider, mais Anchor
  // en exige un. Les deux méthodes rendent la transaction telle quelle.
  const dummyWallet: SignerWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as unknown as Wallet, {
    commitment: 'confirmed',
  });
  return new Program(idl as unknown as Idl, provider);
}

export function findProjectPda(creator: PublicKey, projectId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROJECT_SEED), creator.toBuffer(), Buffer.from(projectId)],
    PROGRAM_ID
  );
}

export function findVaultPda(project: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), project.toBuffer()],
    PROGRAM_ID
  );
}

// ═══════════════════════════════════════════════════════════════════
// Helper central : envoie une transaction avec blockhash FRAIS + retry
// Fix "block height exceeded" :
//  - blockhash fetché au DERNIER moment, juste avant signature
//  - skipPreflight dès le 1er essai (gagne des secondes critiques)
//  - confirmation par POLLING de signature (pas blockhash-strategy)
//    → ne déclenche plus de faux "block height exceeded"
// ═══════════════════════════════════════════════════════════════════

async function confirmBySignature(
  connection: Connection,
  sig: string,
  lastValidBlockHeight: number
): Promise<void> {
  const start = Date.now();
  const TIMEOUT_MS = 60_000;

  while (Date.now() - start < TIMEOUT_MS) {
    const res = await connection.getSignatureStatus(sig, {
      searchTransactionHistory: true,
    });
    const st = res?.value;

    if (st?.err) {
      throw new Error(`Transaction échouée on-chain : ${JSON.stringify(st.err)}`);
    }
    if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') {
      return;
    }

    if (!st) {
      const h = await connection.getBlockHeight('confirmed');
      if (h > lastValidBlockHeight) {
        throw new Error("Blockhash expiré — la transaction n'a pas été prise en compte. Réessaie.");
      }
    }

    await new Promise((r) => setTimeout(r, 1200));
  }

  throw new Error("Timeout de confirmation. Vérifie la signature sur l'explorer devnet.");
}

// ⚠️ Certains wallets mobiles (Phantom sur Seeker notamment) peuvent ne
// JAMAIS résoudre la promesse de signTransaction/sendTransaction si leur pont
// interne (estimation des frais, session MWA) se bloque — le popup reste
// affiché indéfiniment côté utilisateur, et notre code reste bloqué sur le
// `await` sans jamais atteindre le catch/retry. On force un timeout dur pour
// pouvoir abandonner proprement et relancer une tentative fraîche.
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function buildAndSend(
  program: Program,
  txBuilder: TxBuilder
): Promise<string> {
  const provider = program.provider as AnchorProvider;
  const wallet = provider.wallet as unknown as SignerWallet;

  if (!wallet?.publicKey || (!wallet?.sendTransaction && !wallet?.signTransaction)) {
    throw new Error('Wallet non connecté ou incapable de signer.');
  }

  // Capturé APRÈS le garde : TypeScript ne conserve pas le narrowing d'une
  // propriété à travers la boucle et les closures ci-dessous.
  const owner: PublicKey = wallet.publicKey;

  let lastError: unknown = null;
  let sentSig: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ⚠️ BUG FIX : la connection doit être recréée à CHAQUE tentative, pas
      // une seule fois avant la boucle. Avant ce fix, rotateRpc() (appelé
      // plus bas quand isRateLimitError() détecte un 429) changeait bien
      // l'endpoint retourné par getRpcEndpoint(), mais l'objet `connection`
      // utilisé pour TOUTES les tentatives suivantes restait celui créé au
      // tout début — donc la rotation ne servait jamais à rien dans le même
      // appel, et un RPC saturé (devnet public sous charge, cas fréquent
      // pendant le hackathon) faisait échouer les 3 tentatives sur le MÊME
      // endpoint congestionné, redemandant une signature à chaque fois =
      // effet "boucle infinie de signature" observé avec Backpack.
      const connection = new Connection(getRpcEndpoint(), 'confirmed');

      // ① Construire la tx via Anchor (pas de RPC, instantané) — on ne récupère
      // que les instructions, on ne garde PAS l'objet Transaction legacy.
      const rawTx: Transaction = await txBuilder.transaction();

      // Compute budget ajouté nous-mêmes AVANT signature : empêche Phantom
      // d'injecter ses propres instructions après coup (ce qui invaliderait
      // une signature déjà obtenue sur mobile).
      const instructions = [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
        ...rawTx.instructions,
      ];

      // ② Blockhash au DERNIER moment, juste avant la signature
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed');

      // ⚠️ CRITIQUE : VersionedTransaction (v0), PAS Transaction legacy.
      // Le code source officiel de @solana-mobile/wallet-adapter-mobile
      // (adapter.ts, sendTransaction() ET signTransaction()) appelle
      // `transaction.serialize()` sur la transaction AVANT qu'elle soit
      // signée, pour l'envoyer au wallet. Sur une Transaction legacy,
      // serialize() vérifie par défaut que toutes les signatures sont
      // présentes et lève "Signature verification failed. Missing
      // signature" — AVANT même que Seed Vault ait pu signer. C'est un bug
      // confirmé de leur adapter sur les transactions legacy.
      // VersionedTransaction.serialize() n'a pas ce garde-fou : elle
      // sérialise sans exiger de signature complète, donc l'adapter ne
      // plante plus. Solflare gère ça correctement en interne, d'où le
      // fait qu'il marchait déjà sans ce fix.
      const messageV0 = new TransactionMessage({
        payerKey: owner,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();

      const vtx = new VersionedTransaction(messageV0);

      let sig: string;

      const WALLET_TIMEOUT_MS = 45_000;
      const timeoutMsg = "Le wallet n'a pas répondu à temps (45s). Réessaie — appuie plus vite sur Confirmer.";

      if (typeof wallet.sendTransaction === 'function') {
        sig = await withTimeout(
          wallet.sendTransaction(vtx, connection, { skipPreflight: true, maxRetries: 5 }),
          WALLET_TIMEOUT_MS,
          timeoutMsg
        );
        sentSig = sig;
      } else if (typeof wallet.signTransaction === 'function') {
        // ═══ REPLI : wallets ne supportant que signTransaction (rare) ═══
        const signed = (await withTimeout(
          wallet.signTransaction(vtx),
          WALLET_TIMEOUT_MS,
          timeoutMsg
        )) as VersionedTransaction;

        const idx = signed.message.staticAccountKeys.findIndex((k) => k.equals(owner));
        const mySig = idx >= 0 ? signed.signatures[idx] : null;
        const isZeroed = !mySig || mySig.every((b) => b === 0);
        if (isZeroed) {
          throw new Error(
            "Le wallet n'a pas signé la transaction (timeout Seed Vault/MWA probable). Réessaie."
          );
        }

        const raw = signed.serialize();
        sentSig = await connection.sendRawTransaction(raw, {
          skipPreflight: true,
          maxRetries: 5,
        });
        sig = sentSig;
      } else {
        throw new Error('Wallet non connecté ou incapable de signer.');
      }

      // ④ Confirmation par polling de signature (robuste)
      await confirmBySignature(connection, sig, lastValidBlockHeight);

      return sig;
    } catch (e: unknown) {
      lastError = e;
      const { message: msg, name: errName } = errInfo(e);
      const lowerMsg = msg.toLowerCase();

      // ═══ Garde anti double-dépense (fix 19/09, audit lot 2) ═══
      // Si une transaction a DÉJÀ été envoyée au réseau et qu'on arrive ici
      // sur un timeout de confirmation non fatal, il est possible que la tx
      // originale confirme juste après. Retenter sans vérifier = risque de
      // `fund` en double. Avant TOUTE nouvelle tentative, re-vérifier le
      // statut de la signature précédente : si elle est (ou devient)
      // confirmée, c'est le résultat à retourner.
      if (sentSig) {
        // `connection` (récupérée du RPC en rotation) est définie dans le
        // `try` — hors de portée ici. Le provider Anchor expose la même
        // connexion et reste dans la portée de la fonction.
        const res = await provider.connection.getSignatureStatus(sentSig, {
          searchTransactionHistory: true,
        });
        const st = res?.value;
        if (st) {
          if (st.err) throw e;
          if (
            st.confirmationStatus === 'processed' ||
            st.confirmationStatus === 'confirmed' ||
            st.confirmationStatus === 'finalized'
          ) {
            return sentSig;
          }
        }
      }

      // ═══ Cas DÉFINITIFS : jamais de retry (le refus était volontaire, ou
      // pas de wallet du tout — retenter ne changera rien) ═══
      const isFatal =
        lowerMsg.includes('user rejected') ||
        lowerMsg.includes('wallet non connecté') ||
        lowerMsg.includes('rejected the request') ||
        // ⚠️ Ajouté le 22/08 : une transaction REFUSÉE ON-CHAIN (require!() qui
        // échoue côté programme, ex. InvalidParameter/6005) est déterministe —
        // retenter avec un nouveau blockhash donnera exactement la même erreur.
        // Avant ce fix, ça redemandait une signature à Phantom jusqu'à 3 fois
        // de suite, chacune affichant l'avertissement "échec de la simulation"
        // — donnant l'impression d'une boucle infinie pour un bug qui aurait dû
        // s'afficher clairement dès la première tentative.
        lowerMsg.includes('transaction échouée on-chain') ||
        errName === 'WalletSignTransactionError' ||
        errName === 'WalletNotConnectedError';

      if (isFatal) throw e;

      // Deux causes à la rotation des ÉCRITURES, deux traitements :
      //  - throttle (429) : on tourne ET on attend, la fenêtre de
      //    limitation doit retomber ;
      //  - relais injoignable (404/503 du relais, réseau coupé) : on tourne
      //    IMMÉDIATEMENT — un 404 ne se résorbe pas en 300 ms, et attendre
      //    devant un relais absent, c'est du temps perdu en pleine démo.
      if (isRateLimitError(e) || isRelayUnavailableError(e)) {
        // Le motif est journalisé (constants.ts) : « relais injoignable » et
        // « nœud saturé » ne se réparent pas de la même façon, et le bandeau
        // de santé les présente différemment à l'utilisateur.
        rotateRpc(isRelayUnavailableError(e) ? 'relais-injoignable' : 'throttle');
        if (isRateLimitError(e)) await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      // ⚠️ Politique inversée : on RETENTE PAR DÉFAUT, sauf cas définitif
      // ci-dessus. Les wallets mobiles (Phantom Android via MWA, Seed Vault)
      // remontent des messages génériques et imprévisibles ("Unexpected error",
      // coupures de pont WebView/MWA en plein milieu du round-trip) qu'aucune
      // liste de mots-clés ne peut couvrir à l'avance. Comme chaque tentative
      // repart avec un blockhash frais, retenter est sans risque de double
      // dépense (la tx précédente, si elle n'a pas atteint le réseau, est
      // simplement abandonnée).
      if (attempt === MAX_RETRIES) throw e;

      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════
// INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════

export async function createProject(
  program: Program,
  creator: PublicKey,
  projectId: string,
  title: string,
  description: string,
  creatorRole: string,
  creatorShareBps: number,
  protocolWallet: PublicKey
) {
  const [projectPda] = findProjectPda(creator, projectId);

  const builder = program.methods
    .createProject(projectId, title, description, creatorRole, creatorShareBps, protocolWallet)
    .accounts({ project: projectPda, creator, systemProgram: SystemProgram.programId });

  const tx = await buildAndSend(program, builder);
  return { tx, projectPda };
}

export async function addMember(
  program: Program,
  creator: PublicKey,
  projectPda: PublicKey,
  wallet: PublicKey,
  role: string,
  shareBps: number
) {
  const builder = program.methods
    .addMember(wallet, role, shareBps)
    .accounts({ project: projectPda, creator });

  return buildAndSend(program, builder);
}

export async function removeMember(
  program: Program,
  creator: PublicKey,
  projectPda: PublicKey,
  memberWallet: PublicKey
) {
  const builder = program.methods
    .removeMember(memberWallet)
    .accounts({ project: projectPda, creator });

  return buildAndSend(program, builder);
}

/**
 * update_description — ajoutée par l'upgrade du 27/08 (sig 67Vmcg4F…).
 *
 * Double usage, et c'est le même appel dans les deux cas :
 *
 *  1. Corriger la description d'un pact existant.
 *  2. MIGRER un vieux pact. Un compte Project créé avant l'upgrade reste
 *     alloué à son ancienne taille — `realloc` ne se déclenche qu'au moment
 *     où une instruction écrit dedans. Réécrire la MÊME description suffit
 *     donc à agrandir le compte : l'opération est idempotente côté données,
 *     mais pas côté allocation. C'est exactement ce que fait
 *     MigratePactButton.
 *
 * `creator` est writable ET signer : le realloc consomme du rent, prélevé
 * sur lui. Un membre non-creator sera rejeté on-chain (contrainte
 * `relations: ["project"]` dans l'IDL).
 *
 * La troncature UTF-8 est appliquée ici plutôt que dans l'appelant : le
 * programme mesure en OCTETS, et une description recopiée telle quelle
 * depuis un ancien pact peut déjà être à la limite. Sans ce garde-fou, la
 * migration échouerait en InvalidParameter (6005) — l'erreur la plus
 * opaque du lot, puisque l'utilisateur n'a rien tapé lui-même.
 */
export async function updateDescription(
  program: Program,
  creator: PublicKey,
  projectPda: PublicKey,
  description: string
) {
  const safe = truncateUtf8(description, MAX_DESC_LEN);

  const builder = program.methods
    .updateDescription(safe)
    .accounts({
      project: projectPda,
      creator,
      systemProgram: SystemProgram.programId,
    });

  return buildAndSend(program, builder);
}

export async function approve(program: Program, member: PublicKey, projectPda: PublicKey) {
  const builder = program.methods
    .approve()
    .accounts({ project: projectPda, member });

  return buildAndSend(program, builder);
}

export async function finalize(program: Program, creator: PublicKey, projectPda: PublicKey) {
  const builder = program.methods
    .finalize()
    .accounts({ project: projectPda, creator });

  return buildAndSend(program, builder);
}

export async function fund(
  program: Program,
  funder: PublicKey,
  projectPda: PublicKey,
  amountLamports: BN
) {
  const [vaultPda] = findVaultPda(projectPda);

  const builder = program.methods
    .fund(amountLamports)
    .accounts({
      project: projectPda,
      vault: vaultPda,
      funder,
      systemProgram: SystemProgram.programId,
    });

  return buildAndSend(program, builder);
}

export async function distribute(
  program: Program,
  caller: PublicKey,
  projectPda: PublicKey,
  protocolWallet: PublicKey,
  memberWallets: PublicKey[]
) {
  const [vaultPda] = findVaultPda(projectPda);
  const remaining = memberWallets.map((w) => ({
    pubkey: w,
    isSigner: false,
    isWritable: true,
  }));

  const builder = program.methods
    .distribute()
    .accounts({
      project: projectPda,
      vault: vaultPda,
      protocolWallet,
      caller,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remaining);

  return buildAndSend(program, builder);
}

// ═══════════════════════════════════════════════════════════════════
// distribute + reçu déterministe
//  - protocolWallet lu ON-CHAIN depuis le compte projet (source de vérité)
//  - split calculé off-chain : fee = 2% du vault, net réparti au prorata bps
//  - CIPHER : remainingAccounts dans l'ordre EXACT de pact.members
//    (contrainte on-chain MemberMismatch)
// ═══════════════════════════════════════════════════════════════════

export async function distributeWithReceipt(
  program: Program,
  caller: PublicKey,
  pact: ChainPact
): Promise<DistributionReceipt> {
  // ① Source de vérité : le compte projet on-chain
  const projectAccount = await projectAccounts(program).fetch(pact.pda);
  const protocolWallet: PublicKey = projectAccount.protocolWallet;

  // ② Envoi de la transaction (même logique que distribute())
  const [vaultPda] = findVaultPda(pact.pda);
  const remaining = pact.members.map((m) => ({
    pubkey: m.wallet,
    isSigner: false,
    isWritable: true,
  }));

  const builder = program.methods
    .distribute()
    .accounts({
      project: pact.pda,
      vault: vaultPda,
      protocolWallet,
      caller,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(remaining);

  const signature = await buildAndSend(program, builder);

  // ③ Reçu déterministe (le split est calculé par le programme de façon
  //    déterministe → le reçu off-chain reflète exactement l'on-chain)
  const grossLamports = Math.round(pact.vaultBalanceSol * LAMPORTS_PER_SOL);
  const feeLamports = Math.floor((grossLamports * 200) / 10_000); // 2%
  const netLamports = grossLamports - feeLamports;

  return {
    signature,
    grossSol: grossLamports / LAMPORTS_PER_SOL,
    netSol: netLamports / LAMPORTS_PER_SOL,
    feeSol: feeLamports / LAMPORTS_PER_SOL,
    payouts: pact.members.map((m) => ({
      wallet: m.wallet.toBase58(),
      shareBps: m.shareBps,
      amountSol: Math.floor((netLamports * m.shareBps) / 10_000) / LAMPORTS_PER_SOL,
    })),
    executedAt: Date.now(),
  };
}

export async function closeProject(
  program: Program,
  creator: PublicKey,
  projectPda: PublicKey
) {
  const [vaultPda] = findVaultPda(projectPda);

  const builder = program.methods
    .closeProject()
    .accounts({ project: projectPda, vault: vaultPda, creator });

  return buildAndSend(program, builder);
}

// Lectures de comptes — toutes passent par projectAccounts() (voir en haut
// du fichier), qui est le seul endroit où le cast a lieu.

export async function fetchProject(
  program: Program,
  projectPda: PublicKey
): Promise<ProjectAccount> {
  return projectAccounts(program).fetch(projectPda);
}

/**
 * Scan complet du programme (`getProgramAccounts`). C'est l'appel le plus
 * fragile de l'application : coûteux côté nœud, donc soit bridé (Helius :
 * -32401), soit throttlé (devnet public : 429 sous charge).
 *
 * Deux cas d'échec, deux traitements :
 *  - méthode refusée → inutile d'attendre, le refus est permanent sur cet
 *    endpoint : on tourne immédiatement ;
 *  - throttle → on tourne ET on attend, avec un délai qui double. Sans ce
 *    backoff, les 3 tentatives partaient en quelques millisecondes et se
 *    faisaient rejeter par la même fenêtre de limitation.
 */
const READ_RETRIES = 3;

export async function fetchAllProjects(
  program: Program
): Promise<FetchedAccount<ProjectAccount>[]> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= READ_RETRIES; attempt++) {
    try {
      return await projectAccounts(program).all();
    } catch (e) {
      lastError = e;
      // Le relais ajoute un saut réseau (voir isRelayUnavailableError) :
      // une fonction Edge absente rend un 404 auquel il faut réagir comme à
      // un bridage de méthode — tourner, sans backoff.
      const recoverable =
        isRateLimitError(e) || isMethodNotAllowedError(e) || isRelayUnavailableError(e);
      if (!recoverable || attempt === READ_RETRIES) throw e;

      rotateReadRpc(
        isRelayUnavailableError(e)
          ? 'relais-injoignable'
          : isMethodNotAllowedError(e)
            ? 'methode-bridee'
            : 'throttle'
      );
      program = getReadonlyProgram();

      if (isRateLimitError(e)) {
        await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
      }
    }
  }

  throw lastError;
}
