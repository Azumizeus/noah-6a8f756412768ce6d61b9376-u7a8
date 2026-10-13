// src/hooks/useProjects.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { BN, type Program } from '@coral-xyz/anchor';
import {
  getProgram, getProvider, getReadonlyProgram, findVaultPda,
  fetchAllProjects, fetchProject, distribute, fund, finalize,
} from '../lib/anchor';
import { parseTxError, type ChainPact } from '../lib/pacts';
import type { ProjectAccount } from '../types/pact';
import { logPactEvent, fetchMoneyEvents } from '../lib/activity';
import { triggerPushNotification } from '../lib/pushNotifications';
import { filterVisiblePacts } from '../lib/hiddenPacts';
import { useLanguage } from '../lib/i18n/LanguageContext';

/** Program Anchor : wallet réel si connecté, readonly sinon */
export function useAnchorProgram(): Program {
  const { publicKey, signTransaction, signAllTransactions, sendTransaction } = useWallet();
  return useMemo(() => {
    if (publicKey && signTransaction && signAllTransactions) {
      // On propage aussi sendTransaction : sur mobile (Seed Vault/MWA), c'est la
      // méthode native sign-and-send du wallet-adapter — bien plus fiable que
      // signTransaction() + envoi manuel, qui provoquait des échecs de signature
      // ("Missing signature for public key") sur Seeker. Voir buildAndSend().
      return getProgram(getProvider({ publicKey, signTransaction, signAllTransactions, sendTransaction }));
    }
    return getReadonlyProgram();
  }, [publicKey, signTransaction, signAllTransactions, sendTransaction]);
}

// La liste a été DÉPLACÉE dans src/lib/hiddenPacts.ts.
//
// Elle était privée à ce fichier, donc invisible et inaccessible pour toute
// nouvelle surface d'affichage : c'est exactement ainsi que des pacts de
// test sont réapparus dans le sélecteur de pact de référence des posts.
// Une règle métier globale n'a pas sa place dans le détail d'un hook.
// Voir le commentaire d'en-tête de hiddenPacts.ts.

/**
 * Convertit un compte Project brut en ChainPact.
 *
 * Extrait de useProjects() ET de usePublicPact() : les deux faisaient le
 * MÊME mapping, dupliqué à l'identique. Une divergence entre les deux copies
 * aurait produit un pact qui s'affiche différemment selon qu'on arrive par
 * la grille ou par son lien public — un bug quasi impossible à reproduire
 * sans savoir que la duplication existe.
 */
function toChainPact(
  pda: PublicKey,
  p: ProjectAccount,
  vaultLamports: number,
  viewer: PublicKey | null
): ChainPact {
  const vaultBalanceSol = vaultLamports / LAMPORTS_PER_SOL;
  const me = viewer ? p.members.find((m) => m.wallet.equals(viewer)) : undefined;
  const myShareBps = me?.shareBps ?? 0;

  return {
    pda,
    projectId: p.projectId,
    title: p.title,
    description: p.description,
    creator: p.creator,
    members: p.members.map((m) => ({
      wallet: m.wallet,
      role: m.role,
      shareBps: m.shareBps,
      approved: m.approved,
    })),
    // Enum Anchor : `{ pending: {} }` ou `{ finalized: {} }` — voir
    // ProjectStatus dans src/types/pact.ts.
    status: 'finalized' in p.status ? 'active' : 'pending',
    protocolWallet: p.protocolWallet,
    vaultBalanceSol,
    myShareBps,
    myClaimableSol: (vaultBalanceSol * 0.98 * myShareBps) / 10_000,
  };
}

/** Charge TOUS les projets on-chain + balances des vaults (1 seul appel RPC batch) */
export function useProjects() {
  const program = useAnchorProgram();
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [pacts, setPacts] = useState<ChainPact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const raw = await fetchAllProjects(program);
        const vaultPdas = raw.map((r) => findVaultPda(r.publicKey)[0]);
        const vaultInfos = await connection.getMultipleAccountsInfo(vaultPdas);

        const mapped: ChainPact[] = raw.map((r, i) =>
          toChainPact(r.publicKey, r.account, vaultInfos[i]?.lamports ?? 0, publicKey)
        );

        if (!cancelled) setPacts(filterVisiblePacts(mapped, (p) => p.pda));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [program, connection, publicKey, nonce]);

  return { pacts, loading, error, refresh };
}

// ═══════════════════════════════════════════════════════════════════
// Page publique #/pact/:pda — DOIT fonctionner sans wallet connecté.
// Réutilise getReadonlyProgram() (déjà utilisé par useProjects() quand
// aucun wallet n'est branché) pour charger UN SEUL projet par son PDA.
// ═══════════════════════════════════════════════════════════════════

export function usePublicPact(pdaBase58: string | null) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [pact, setPact] = useState<ChainPact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!pdaBase58) {
      setPact(null);
      setLoading(false);
      setError('Adresse de pact invalide.');
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const pda = new PublicKey(pdaBase58 as string);
        const program = getReadonlyProgram();
        const p = await fetchProject(program, pda);
        const [vaultPda] = findVaultPda(pda);
        const vaultInfo = await connection.getAccountInfo(vaultPda);

        const mapped = toChainPact(pda, p, vaultInfo?.lamports ?? 0, publicKey);

        if (!cancelled) setPact(mapped);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [pdaBase58, connection, publicKey]);

  return { pact, loading, error };
}

export interface TxState {
  kind: 'success' | 'error';
  text: string;
  sig?: string;
}

/** Actions on-chain partagées par Dashboard et Pacts */
export function usePactActions(refresh: () => void) {
  const program = useAnchorProgram();
  const { publicKey, signMessage } = useWallet();
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'distribute' | 'fund' | 'finalize' | null>(null);
  const [txState, setTxState] = useState<TxState | null>(null);

  const runDistribute = useCallback(async (pact: ChainPact) => {
    if (!publicKey) return;
    setBusyId(pact.pda.toBase58());
    setBusyAction('distribute');
    setTxState(null);
    try {
      const sig = await distribute(
        program, publicKey, pact.pda, pact.protocolWallet,
        pact.members.map((m) => m.wallet),
      );
      setTxState({ kind: 'success', text: t('txMessages.distributeSuccess', { amount: pact.vaultBalanceSol.toFixed(4), n: pact.members.length }), sig });
      refresh();
    } catch (e) {
      setTxState({ kind: 'error', text: parseTxError(e) });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }, [program, publicKey, refresh, t]);

  const runFund = useCallback(async (pact: ChainPact, amountSol: number) => {
    if (!publicKey) return;
    setBusyId(pact.pda.toBase58());
    setBusyAction('fund');
    setTxState(null);
    try {
      const lamports = new BN(Math.round(amountSol * LAMPORTS_PER_SOL));
      const sig = await fund(program, publicKey, pact.pda, lamports);
      setTxState({ kind: 'success', text: t('txMessages.fundSuccess', { amount: amountSol, title: pact.title }), sig });
      logPactEvent({ projectPda: pact.pda.toBase58(), kind: 'fund', actor: publicKey.toBase58(), amountSol, txSig: sig });
      // Push best-effort, même logique que l'approve dans PactCard.tsx : le
      // financement a déjà réussi, la notification ne doit jamais le faire
      // échouer ni même le ralentir visiblement pour l'utilisateur.
      if (signMessage) {
        const actorWallet = publicKey.toBase58();
        triggerPushNotification({
          actorWallet,
          projectPda: pact.pda.toBase58(),
          type: 'funding',
          wallets: pact.members.map((m) => m.wallet.toBase58()).filter((w) => w !== actorWallet),
          title: 'BuildPact',
          body: `${amountSol} SOL reçus sur « ${pact.title} »`,
          url: `/#/pact/${pact.pda.toBase58()}`,
          signMessage,
        }).catch(() => {
          /* best-effort — voir commentaire ci-dessus */
        });
      }
      refresh();
    } catch (e) {
      setTxState({ kind: 'error', text: parseTxError(e) });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }, [program, publicKey, signMessage, refresh, t]);

  const runFinalize = useCallback(async (pact: ChainPact) => {
    if (!publicKey) return;

    // ═══ GARDE FRONT : seul le founder peut finaliser ═══
    if (!pact.creator.equals(publicKey)) {
      setTxState({
        kind: 'error',
        text: t('txMessages.onlyCreatorCanFinalize'),
      });
      return;
    }

    setBusyId(pact.pda.toBase58());
    setBusyAction('finalize');
    setTxState(null);
    try {
      const sig = await finalize(program, publicKey, pact.pda);
      setTxState({ kind: 'success', text: t('txMessages.finalizeSuccess', { title: pact.title }), sig });
      logPactEvent({ projectPda: pact.pda.toBase58(), kind: 'finalize', actor: publicKey.toBase58(), txSig: sig });
      refresh();
    } catch (e) {
      setTxState({ kind: 'error', text: parseTxError(e) });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }, [program, publicKey, refresh, t]);

  // Permet de fermer manuellement le bandeau du haut (bouton × dans TxBanner).
  // (voir aussi useTreasury() plus bas dans ce fichier)
  // Nécessaire aussi parce que Distribuer (géré en local dans PactCard, via
  // son propre reçu) ne passe jamais par ce hook — sans ce clear manuel, un
  // vieux message Fund/Finalize resterait affiché indéfiniment au-dessus
  // d'un reçu de distribution plus récent.
  const clearTxState = useCallback(() => setTxState(null), []);

  return { busyId, busyAction, txState, runDistribute, runFund, runFinalize, clearTxState };
}

// ═══════════════════════════════════════════════════════════════════
// TRÉSORERIE — données 100% réelles, aucune valeur inventée.
//
//  - TVL : solde live des vaults (1 appel RPC batch, exact, on-chain)
//  - Flux récents : lus dans `pact_events` (Supabase), pas reconstruits
//    depuis la chaîne
//  - Distribué : somme des sorties de vault sur la fenêtre affichée
//
// ⚠️ CHANGEMENT MAJEUR — pourquoi on ne scanne plus la chaîne ici.
//
// La version précédente appelait, pour CHAQUE vault, getSignaturesForAddress
// puis un getParsedTransaction par signature : ~90 requêtes RPC à chaque
// ouverture de la page, pour 6 pacts. Deux murs se dressaient :
//
//  1. le nœud dédié refusait getProgramAccounts (-32401), donc la liste des
//     pacts partait sur le devnet public — depuis le 20/09 Helius répond
//     de nouveau à cet appel (base64), et c'est lui qui sert les lectures.
//  2. le devnet public throttlait (429) bien avant la fin de la boucle — le
//     retry interne de web3.js lui-même s'épuisait (500ms→1s→2s→4s) avant
//     d'abandonner.
//
// Ce n'était donc pas un bug de code mais un plafond d'infrastructure :
// aucun backoff ne peut inventer de la capacité RPC. La bonne réponse
// n'était pas d'ajouter des rustines côté client mais de supprimer le
// besoin — `pact_events` enregistre déjà chaque fund/distribute avec son
// montant, au moment de la transaction. Le Treasury refabriquait donc à
// grands frais une donnée déjà stockée.
//
// La chaîne reste la source de vérité : chaque flux affiché porte son
// `tx_sig`, cliquable vers l'explorer. Cette table n'est qu'un index.
// ═══════════════════════════════════════════════════════════════════

export interface TreasuryFlow {
  signature: string;
  label: string;
  projectTitle: string;
  amountSol: number; // signé : + = entrée dans le vault, − = sortie
  when: number | null; // unix seconds (blockTime), null si indisponible
}

export interface TreasurySummary {
  totalValueLockedSol: number;
  distributedRecentSol: number;
  pendingClaimsSol: number;
  flows: TreasuryFlow[];
  loading: boolean;
  error: string | null;
}

const MAX_FLOWS_SHOWN = 10;
/** Fenêtre lue dans pact_events : large, car on filtre ensuite les pacts cachés. */
const EVENTS_WINDOW = 60;

export function useTreasury(): TreasurySummary {
  const program = useAnchorProgram();
  const { connection } = useConnection();
  const { t } = useLanguage();
  const INSTRUCTION_LABELS: Record<string, string> = {
    Fund: t('txMessages.instrFund'),
    Distribute: t('txMessages.instrDistribute'),
    CreateProject: t('txMessages.instrCreateProject'),
    Finalize: t('txMessages.instrFinalize'),
    AddMember: t('txMessages.instrAddMember'),
    RemoveMember: t('txMessages.instrRemoveMember'),
    Approve: t('txMessages.instrApprove'),
    CloseProject: t('txMessages.instrCloseProject'),
  };
  const [state, setState] = useState<TreasurySummary>({
    totalValueLockedSol: 0,
    distributedRecentSol: 0,
    pendingClaimsSol: 0,
    flows: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        // ─── ① Liste des pacts + TVL live : 2 appels RPC, pas un de plus ───
        const raw = await fetchAllProjects(program);
        // Même filtre que useProjects() — sinon les pacts de test (ex: "Café")
        // remontent dans le TVL et le flux "Recent flows" du Treasury public,
        // visible par les juges (voir audit UI/UX du 24/08).
        const projects = filterVisiblePacts(raw, (r) => r.publicKey);
        const vaultPdas = projects.map((r) => findVaultPda(r.publicKey)[0]);

        // Index pda → titre, pour nommer les flux sans re-scanner quoi que ce soit.
        const titleByPda = new Map<string, string>(
          projects.map((r) => [r.publicKey.toBase58(), r.account.title || 'Projet'])
        );

        const vaultInfos = vaultPdas.length
          ? await connection.getMultipleAccountsInfo(vaultPdas)
          : [];
        const tvlLamports = vaultInfos.reduce((s, info) => s + (info?.lamports ?? 0), 0);
        const totalValueLockedSol = tvlLamports / LAMPORTS_PER_SOL;
        // 2% protocole prélevé à la distribution → 98% du TVL actuel est réclamable par les membres.
    // ⚠️ Source de vérité de la quote-part : le facteur 0.98 est appliqué ICI
    // (branch myClaimableSol l.76) et dans useTreasury — un seul calcul, partout
    // cohérent (audit 19/09 : Profil affichait 2% de trop vs Treasury).
        const pendingClaimsSol = totalValueLockedSol * 0.98;

        // ─── ② Flux : une seule requête Supabase, zéro RPC ───
        const events = await fetchMoneyEvents(EVENTS_WINDOW);

        const flows: TreasuryFlow[] = events
          // Un événement dont le pact n'existe plus (ou est masqué) n'a pas à
          // remonter : le titre serait vide et le montant fausserait le total.
          .filter((e) => titleByPda.has(e.projectPda))
          .map((e) => {
            const amount = e.amountSol ?? 0;
            return {
              signature: e.txSig,
              label:
                e.kind === 'fund'
                  ? INSTRUCTION_LABELS.Fund
                  : INSTRUCTION_LABELS.Distribute,
              projectTitle: titleByPda.get(e.projectPda) as string,
              // Le signe porte le sens du mouvement : un financement entre dans
              // le vault, une distribution en sort. La table stocke un montant
              // absolu, c'est ici qu'on l'oriente.
              amountSol: e.kind === 'fund' ? Math.abs(amount) : -Math.abs(amount),
              when: Math.floor(new Date(e.createdAt).getTime() / 1000),
            };
          });

        const distributedRecentSol = flows
          .filter((f) => f.amountSol < 0)
          .reduce((s, f) => s + Math.abs(f.amountSol), 0);

        if (!cancelled) {
          setState({
            totalValueLockedSol,
            distributedRecentSol,
            pendingClaimsSol,
            flows: flows.slice(0, MAX_FLOWS_SHOWN),
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
      }
    }

    load();
    // ⚠️ Audit 19/09 : le Treasury était figé après le premier mount — pas
    // de refresh. Un rafraîchissement toutes les 45 s + au retour de l'onglet
    // garde les chiffres à jour sans marteler le RPC (poll léger).
    const REFRESH_MS = 45_000;
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, connection, t]); // `t` inclus : re-traduit les labels de flux au changement de langue

  return state;
}
