// src/pages/premium/PremiumWalletPanel.tsx
// ═══════════════════════════════════════════════════════════════════
// Panneau « Wallet » du profil premium : solde SOL, tokens SPL / Token-2022
// détenus, et les dernières transactions du wallet.
//
// Dernière « perdue » de l'inventaire /v1 : ce panneau n'existait que dans
// `components/WalletPanel.tsx`, habillé en `glass-panel` + `text-ink-*` +
// `bg-black/20` (donc invisible tel quel sur l'ivoire premium) et monté
// uniquement par `MonProfilPage`.
//
// Volontairement non filtré à BuildPact, comme le legacy : la vue filtrée est
// la chronique de `lib/gamification.ts`, rendue par PremiumQuests. Filtrer ici
// aussi donnerait deux listes qui divergent.
//
// Source : `useConnection()`, donc le RPC personnalisé des Paramètres s'il est
// renseigné, repli devnet public. Aucun service tiers. Pas de rotation
// d'endpoint ici : `useConnection()` est figé au montage de l'app.
//
// Deux écarts assumés avec le legacy, tous deux dans le sens de la vérité :
//   1. si les DEUX lectures de tokens échouent, on le DIT. Le legacy fusionnait
//      les échecs en `[]` et affichait « aucun token détenu » — soit
//      exactement le mensonge qu'une base muette ne devrait pas produire.
//      Un seul échec reste silencieux : le `allSettled` sert précisément à
//      garder les tokens de l'autre programme (un nœud ancien peut rejeter
//      Token-2022 tout en servant SPL).
//   2. le solde illisible s'affiche « — », jamais 0 : `getBalance` renvoie un
//      nombre, donc un 0 affiché serait une affirmation, pas une absence.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { explorerAddressUrl, explorerTxUrl, formatAddress, formatSol } from '../../lib/pacts';
import { useLanguage } from '../../lib/i18n/LanguageContext';

const HISTORY_LIMIT = 12;

const CARD: React.CSSProperties = {
  background: 'var(--p-bg)',
  border: '1px solid var(--p-line)',
  borderRadius: 'var(--p-radius-xs)',
};

interface TokenHolding {
  mint: string;
  amount: number;
  /** Deux standards = deux programmes distincts : un compte de l'un
   *  n'apparaît jamais dans la réponse de l'autre. La clé de liste reste donc
   *  unique même si un même mint ne peut vivre que sous un seul programme. */
  program: 'spl' | 'token2022';
}

interface TxRow {
  signature: string;
  /** `null` quand le RPC ne fournit pas blockTime (transaction trop ancienne
   *  pour le ledger du nœud) — on affiche « — » plutôt qu'une date inventée. */
  createdAt: number | null;
  success: boolean;
}

export default function PremiumWalletPanel({ wallet }: { wallet: string }) {
  const { t, lang } = useLanguage();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<TokenHolding[] | null>(null);
  const [history, setHistory] = useState<TxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `cancelled` plutôt qu'un AbortController : web3.js n'expose pas de signal
    // d'annulation sur ces méthodes. On ne peut pas empêcher la requête
    // d'aboutir, seulement ignorer sa réponse — ce qui suffit à éviter qu'une
    // réponse lente du wallet précédent n'écrase l'état du wallet courant.
    let cancelled = false;
    setSolBalance(null);
    setTokens(null);
    setHistory(null);
    setError(null);

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(wallet);
    } catch {
      // Adresse illisible : on ne lance AUCUNE requête (le constructeur
      // lèverait pendant l'effet et ferait tomber la page). Les deux listes
      // sont posées à vide POUR QUE les squelettes s'arrêtent, et l'erreur
      // affichée dit pourquoi — vider sans le dire serait le bug visé par
      // premium-data-reach.
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
        // Non bloquant et volontairement muet : la ligne affiche « — », qui
        // veut déjà dire « je ne sais pas ». Un bandeau d'erreur pour ce seul
        // chiffre serait disproportionné, et surtout il ne ferait pas
        // disparaître l'ambiguïté.
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

    // `allSettled` et non `all` : un nœud peut très bien servir SPL Token et
    // rejeter Token-2022 (programme non reconnu). Avec `all`, cet échec-là
    // effacerait AUSSI les tokens SPL — on afficherait une liste vide pour un
    // wallet qui détient bien des tokens.
    Promise.allSettled([
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
    ]).then(([spl, t22]) => {
      if (cancelled) return;
      // Les deux programmes muets : on ne sait pas ce que détient ce wallet.
      // C'est le seul cas où la liste vide serait un mensonge, donc le seul
      // qui mérite une erreur — un seul échec laisse l'autre lecture parler.
      if (spl.status === 'rejected' && t22.status === 'rejected') {
        setTokens([]);
        setError(t('walletPanel.tokensError'));
        return;
      }
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
    // `t` est volontairement hors deps : il change à chaque bascule de langue
    // et relancerait les 3 requêtes RPC pour un simple changement de libellé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, wallet]);

  const timeLabel = (ms: number | null): string => {
    if (ms === null) return '—';
    return new Date(ms).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const subHeading: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 650,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
    color: 'var(--p-ink3)',
    margin: '0 0 8px',
  };

  return (
    <section
      style={{
        marginTop: 22,
        padding: '18px 20px',
        background: 'var(--p-canvas)',
        border: '1px solid var(--p-line)',
        borderRadius: 'var(--p-radius-lg)',
        boxShadow: 'var(--p-shadow)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--p-ink)', margin: 0 }}>
          {t('walletPanel.heading')}
        </h2>
        <a
          href={explorerAddressUrl(wallet)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--p-ink3)' }}
        >
          {t('walletPanel.viewOnExplorer')}
        </a>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--p-err)',
            background: 'var(--p-bg)',
            border: '1px solid var(--p-err)',
            borderRadius: 'var(--p-radius-xs)',
            padding: '8px 12px',
            margin: '12px 0 0',
          }}
        >
          {error}
        </p>
      )}

      <div style={{ ...CARD, padding: '10px 14px', marginTop: 14 }}>
        <p style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--p-ink3)', margin: 0 }}>
          {t('walletPanel.solBalance')}
        </p>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--p-font-display)', fontSize: 20, color: 'var(--p-ink)' }}>
          {solBalance !== null ? formatSol(solBalance) : '—'}{' '}
          <span style={{ color: 'var(--p-accent)', fontSize: 13 }}>SOL</span>
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={subHeading}>{t('walletPanel.tokensHeading')}</p>
        {tokens === null ? (
          <Skeleton rows={2} height={30} />
        ) : tokens.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--p-ink3)', margin: 0 }}>{t('walletPanel.noTokens')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tokens.map((tok) => (
              <li
                key={`${tok.program}:${tok.mint}`}
                style={{
                  ...CARD,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '7px 12px',
                  fontSize: 11.5,
                }}
              >
                <a
                  href={explorerAddressUrl(tok.mint)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tok.mint}
                  style={{ fontFamily: 'var(--p-font-display)', color: 'var(--p-ink2)' }}
                >
                  {formatAddress(tok.mint)}
                </a>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {tok.program === 'token2022' && (
                    <span
                      title="Token-2022"
                      style={{
                        fontSize: 9,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        padding: '1px 5px',
                        borderRadius: 4,
                        border: '1px solid var(--p-line)',
                        color: 'var(--p-ink3)',
                      }}
                    >
                      2022
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--p-font-display)', color: 'var(--p-ink)' }}>{tok.amount}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={subHeading}>{t('walletPanel.historyHeading')}</p>
        {history === null ? (
          <Skeleton rows={3} height={26} />
        ) : history.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--p-ink3)', margin: 0 }}>{t('walletPanel.noHistory')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.map((row) => (
              <li key={row.signature}>
                <a
                  href={explorerTxUrl(row.signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '6px 10px',
                    fontSize: 11.5,
                    borderRadius: 'var(--p-radius-xs)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 6,
                        height: 6,
                        flexShrink: 0,
                        borderRadius: 99,
                        // Vert = succès, rouge = échec : la seule information
                        // que porte la pastille, donc elle doit rester lisible
                        // dans les 8 combinaisons palette × mode.
                        background: row.success ? 'var(--p-ok)' : 'var(--p-err)',
                      }}
                    />
                    <span style={{ fontFamily: 'var(--p-font-display)', color: 'var(--p-ink2)' }}>
                      {formatAddress(row.signature)}
                    </span>
                  </span>
                  <span style={{ color: 'var(--p-ink3)' }}>{timeLabel(row.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <a
          href={`https://solscan.io/account/${wallet}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: 'var(--p-accent)' }}
        >
          {t('walletPanel.viewMoreOnSolscan')}
        </a>
      </div>
    </section>
  );
}

function Skeleton({ rows, height }: { rows: number; height: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ height, ...CARD }} />
      ))}
    </div>
  );
}
