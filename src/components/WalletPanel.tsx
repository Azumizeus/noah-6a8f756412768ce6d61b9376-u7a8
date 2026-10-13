// src/components/WalletPanel.tsx
// ═══════════════════════════════════════════════════════════════════
// Carte « Wallet » du dashboard Profil — solde SOL, tokens SPL détenus,
// et les dernières transactions BRUTES du wallet.
//
// Volontairement non filtré à BuildPact : la vue filtrée existe déjà
// (Chronicle de gamification.ts). Ce panneau est le complément « vue
// wallet générale » ; les dupliquer ferait deux listes qui divergent.
//
// Source : useConnection() — la connexion du ConnectionProvider, donc
// RPC_ENDPOINT, donc le RPC personnalisé des Paramètres s'il est
// renseigné (constants.ts le met en tête de READ_RPC_ENDPOINTS), repli
// devnet public sinon. Aucun service tiers.
//
// Deux program ids interrogés (SPL Token + Token-2022) : ce sont deux
// programmes distincts, un compte de l'un n'apparaît jamais dans la
// réponse de l'autre. D'où 2 appels, lancés en parallèle et fusionnés.
//
// ⚠️ Pas de rotation d'endpoint ici, contrairement aux lectures qui
// passent par anchor.ts : `useConnection()` est figé au montage de
// l'app. Un 429 du devnet public se traduit donc par « — » et une liste
// vide, pas par un basculement automatique. C'est acceptable pour un
// panneau de dashboard (rien de transactionnel n'en dépend) mais ça
// explique un affichage vide alors que le wallet a bien des fonds.
//
// Historique plafonné à 12 signatures, sans pagination : le devnet
// public est partagé et rate-limité. `getSignaturesForAddress` suffit
// (1 appel) — on NE fait PAS de getParsedTransaction par ligne, ce qui
// coûterait 12 appels de plus à chaque ouverture pour afficher un
// détail que le lien Explorer donne déjà.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { formatAddress, formatSol, explorerTxUrl, explorerAddressUrl } from '../lib/pacts';
import { resolveRegistryProfile, type RegistryTokenInfo } from '../lib/token-registry';
import { useLanguage } from '../lib/i18n/LanguageContext';

const HISTORY_LIMIT = 12;

interface TokenHolding {
  mint: string;
  amount: number;
  /** Sert à distinguer visuellement les deux standards : deux mints
   *  différents ne peuvent pas collisionner, mais un même mint ne vit
   *  que sous un seul programme — la clé de liste reste donc unique. */
  program: 'spl' | 'token2022';
}

interface TxRow {
  signature: string;
  /** blockTime converti en ms. `null` quand le RPC ne le fournit pas
   *  (transaction trop ancienne pour le ledger du nœud) — on affiche
   *  « — » plutôt qu'une date inventée. */
  createdAt: number | null;
  success: boolean;
}

interface Props {
  wallet: string;
  className?: string;
}

export function WalletPanel({ wallet, className }: Props) {
  const { t, lang } = useLanguage();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenHolding[] | null>(null);
  // Option A (API Tokens officielle) : nom/symbole/logo par mint.
  // Vide sans VITE_TOKENS_API_KEY — l'affichage garde les adresses.
  const [names, setNames] = useState<Record<string, RegistryTokenInfo | null>>({});
  const namesCache = useRef<Record<string, RegistryTokenInfo | null>>({});
  const [history, setHistory] = useState<TxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `cancelled` plutôt qu'un AbortController : web3.js n'expose pas de
    // signal d'annulation sur ces méthodes. On ne peut pas empêcher la
    // requête d'aboutir, seulement ignorer sa réponse — ce qui suffit à
    // éviter qu'une réponse lente d'un wallet précédent n'écrase l'état
    // du wallet courant.
    let cancelled = false;
    setSolBalance(null);
    setTokens(null);
    setHistory(null);
    setError(null);
    namesCache.current = {};
    setNames({});

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(wallet);
    } catch {
      // Adresse illisible : on ne lance aucune requête, sinon le
      // constructeur throw pendant l'effet et fait tomber la page.
      setTokens([]);
      setHistory([]);
      setError(t('walletPanel.invalidWallet'));
      return;
    }

    connection
      .getBalance(pubkey)
      .then((lamports) => {
        if (!cancelled) setSolBalance(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        /* silencieux : la ligne affiche « — », pas un bandeau d'erreur */
      });

    type ParsedAccount = { account: { data: unknown } };
    const readHoldings = (value: ParsedAccount[], program: TokenHolding['program']) =>
      value
        .map((acc) => {
          const info = (acc.account.data as { parsed?: { info?: Record<string, unknown> } })
            .parsed?.info;
          const tokenAmount = info?.tokenAmount as
            | { uiAmountString?: string; uiAmount?: number }
            | undefined;
          return {
            mint: String(info?.mint ?? ''),
            amount: Number(tokenAmount?.uiAmountString ?? tokenAmount?.uiAmount ?? 0),
            program,
          };
        })
        // Les comptes à 0 restent ouverts après avoir tout envoyé : les
        // afficher remplirait la carte de lignes vides.
        .filter((h) => h.mint && h.amount > 0);

    // allSettled et non all : un RPC peut très bien servir SPL Token et
    // rejeter Token-2022 (nœud ancien, filtre de programme non reconnu).
    // Avec `all`, cet échec-là effacerait AUSSI les tokens SPL, qui sont
    // le cas courant — on afficherait une liste vide pour un wallet qui
    // détient bien des tokens. Chaque appel est donc pris pour ce qu'il
    // rapporte, indépendamment de l'autre.
    Promise.allSettled([
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
    ]).then(([spl, t22]) => {
      if (cancelled) return;
      const merged: TokenHolding[] = [
        ...(spl.status === 'fulfilled' ? readHoldings(spl.value.value, 'spl') : []),
        ...(t22.status === 'fulfilled' ? readHoldings(t22.value.value, 'token2022') : []),
      ];
      setTokens(merged);
    });

    connection
      .getSignaturesForAddress(pubkey, { limit: HISTORY_LIMIT })
      .then((sigs) => {
        if (cancelled) return;
        setHistory(
          sigs.map((s) => ({
            signature: s.signature,
            createdAt: s.blockTime ? s.blockTime * 1000 : null,
            success: !s.err,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setError(t('walletPanel.historyError'));
      });

    return () => {
      cancelled = true;
    };
    // `t` est volontairement hors deps : il change à chaque bascule de
    // langue et relancerait les 3 requêtes RPC pour un simple changement
    // de libellé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, wallet]);

  useEffect(() => {
    // Enrichissement nom/logo via l'API Tokens (Option A).
    // Sans clé : aucune requête, cache vide, adresses tronquées affichées.
    // En PROD la clé passe par le relais Supabase Edge (cf. .env.example),
    // jamais en clair dans le bundle (règle check:secret).
    const apiKey = import.meta.env.VITE_TOKENS_API_KEY as string | undefined;
    if (!apiKey?.trim() || !tokens || tokens.length === 0) return;
    const apiBase =
      (import.meta.env.VITE_TOKENS_API_URL as string | undefined)?.trim() || undefined;
    let cancelled = false;
    void (async () => {
      const missing = tokens.filter((tok) => !(tok.mint in namesCache.current));
      if (missing.length === 0) return;
      const resolved = await Promise.all(
        missing.map(async (tok) => ({
          mint: tok.mint,
          info: await resolveRegistryProfile(
            tok.mint,
            apiKey,
            apiBase ? { apiBase } : undefined,
          ),
        })),
      );
      if (cancelled) return;
      for (const { mint, info } of resolved) namesCache.current[mint] = info;
      setNames({ ...namesCache.current });
    })();
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const timeLabel = (ms: number | null): string => {
    if (ms === null) return '—';
    return new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={'glass-panel p-5 ' + (className ?? '')}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-sans text-lg font-semibold text-white">{t('walletPanel.heading')}</h2>
        <a
          href={explorerAddressUrl(wallet)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-ink-500 underline decoration-dotted hover:text-ink-300"
        >
          {t('walletPanel.viewOnExplorer')}
        </a>
      </div>

      <div className="mb-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wider text-ink-400">
          {t('walletPanel.solBalance')}
        </p>
        <p className="mt-1 font-mono text-xl tabular-nums text-white">
          {solBalance != null ? formatSol(solBalance) : '—'}{' '}
          <span className="text-accent-violet">SOL</span>
        </p>
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-400">
          {t('walletPanel.tokensHeading')}
        </p>
        {tokens === null ? (
          <div className="space-y-1.5" aria-hidden="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-ink-500">{t('walletPanel.noTokens')}</p>
        ) : (
          <ul className="space-y-1.5">
            {tokens.map((tok) => {
              const meta = names[tok.mint];
              return (
                <li
                  key={`${tok.program}:${tok.mint}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs"
                >
                  <a
                    href={explorerAddressUrl(tok.mint)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-mono text-ink-400 hover:text-ink-200"
                    title={meta?.name ? `${meta.name} (${tok.mint})` : tok.mint}
                  >
                    {meta?.imageUrl ? (
                      <img src={meta.imageUrl} alt="" className="h-4 w-4 rounded-full" />
                    ) : null}
                    {meta?.symbol ?? formatAddress(tok.mint)}
                  </a>
                <span className="flex items-center gap-2">
                  {tok.program === 'token2022' && (
                    <span
                      className="rounded border border-white/10 px-1 py-px text-[9px] uppercase tracking-wide text-ink-500"
                      title="Token-2022"
                    >
                      2022
                    </span>
                  )}
                  <span className="font-mono tabular-nums text-white">{tok.amount}</span>
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-400">
          {t('walletPanel.historyHeading')}
        </p>
        {error && <p className="mb-2 text-[11px] text-red-400">{error}</p>}
        {history === null ? (
          <div className="space-y-1.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs text-ink-500">{t('walletPanel.noHistory')}</p>
        ) : (
          <ul className="space-y-1">
            {history.map((row) => (
              <li key={row.signature}>
                <a
                  href={explorerTxUrl(row.signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] transition hover:bg-white/5"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={
                        'h-1.5 w-1.5 shrink-0 rounded-full ' +
                        (row.success ? 'bg-accent-neon' : 'bg-red-400')
                      }
                      aria-hidden="true"
                    />
                    <span className="font-mono text-ink-400">{formatAddress(row.signature)}</span>
                  </span>
                  <span className="text-ink-500">{timeLabel(row.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <a
          href={`https://solscan.io/account/${wallet}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11px] text-accent-violet underline decoration-dotted hover:text-accent-violet/80"
        >
          {t('walletPanel.viewMoreOnSolscan')}
        </a>
      </div>
    </div>
  );
}

export default WalletPanel;
