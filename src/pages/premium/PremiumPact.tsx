// src/pages/premium/PremiumPact.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — fiche publique d'un pact (#/pact/<pda>).
// Reprend mécaniquement les appels on-chain de la fiche legacy :
//  • approve(program, publicKey, pda) — lib/anchor ;
//  • actions.runFund / runFinalize / runDistribute — usePactActions ;
//  • TxBanner, ChatBox, VaultPanel (composants rodés).
// NOTE anti-régression : tout changement de signature on-chain se fait
// ICI et DANS PactCard en même temps, ou pas du tout.
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import TranslatedMessage from '../../components/TranslatedMessage';
import { useWallet } from '@solana/wallet-adapter-react';
import type { AnchorProvider, Program } from '@coral-xyz/anchor';
import { useAnchorProgram, usePublicPact, usePactActions, useProjects } from '../../hooks/useProjects';
import { approve } from '../../lib/anchor';
import { formatAddress, formatSol, parseTxError, type ChainPact } from '../../lib/pacts';
import { displayPitch } from '../../lib/pitch';
import { useProjectMedia } from '../../hooks/useProjectMedia';
import { TxBanner } from '../../components/TxBanner';
import ChatBox from '../../components/ChatBox';
import VaultPanel from '../../components/VaultPanel';
import PremiumNav from './PremiumNav';
// Média de bannière : mêmes résolveurs que la carte projet partagée. Le
// dégradé de repli et le style de l'image étaient recopiés ici (avec les
// hex du thème sombre) — voir chantier 4 dans le plan.
import {
  bannerFallbackGradient,
  bannerFallbackInk,
  bannerImageStyle,
} from './projectCardMedia';
import '../../styles/premium.css';

interface Props {
  pda?: string;
}

export default function PremiumPact({ pda }: Props = {}) {
  const { t, lang } = useLanguage();
  const pdaFromHash = (typeof window !== 'undefined' && window.location.hash.match(/\/v2\/pact\/([1-9A-HJ-NP-Za-km-z]{32,44})/))?.[1] ?? null;
  const pactData = usePublicPact(pda ?? pdaFromHash ?? null);
  const pact = pactData.pact;
  // Pitch libre seulement : `pact.description` porte aussi la clé d'étape et
  // les marqueurs internes du wizard, jamais destinés au visiteur.
  const pitchText = displayPitch(pact?.description);
  const { connected, publicKey } = useWallet();
  const program = useAnchorProgram();
  const { refresh } = useProjects();
  const { media, refresh: refreshMedia } = useProjectMedia();
  const actions = usePactActions(refresh);

  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSig, setApproveSig] = useState<string | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundError, setFundError] = useState<string | null>(null);

  const myAddr = publicKey?.toBase58();
  const me = useMemo(
    () => (pact && myAddr ? pact.members.find((m) => m.wallet.toBase58() === myAddr) : undefined),
    [pact, myAddr]
  );
  const shareTotal = useMemo(
    () => (pact ? pact.members.reduce((s, m) => s + m.shareBps, 0) : 0),
    [pact]
  );
  const isOpen = pact ? pact.status !== 'active' : false;
  const approvedCount = pact ? pact.members.filter((m) => m.approved).length : 0;
  const canApprove = !!connected && !!me && !!me.approved === false && !!pact;
  const canFinalize = !!connected && isOpen && approvedCount === (pact?.members.length ?? 0) && parseInt(String(shareTotal), 10) === 10000;

  async function runApprove() {
    if (!publicKey || !pact) return;
    setApproveBusy(true);
    setApproveError(null);
    try {
      const sig = await approve(program as unknown as Program, publicKey, pact.pda);
      setApproveSig(sig);
      // L'historique de la chaîne est la source unique : un jour un listener
      // rafraîchira automatiquement ; ici la fiche relit via refetch sur
      // navigation (même convention que la fiche legacy).
      window.location.hash = `#/pact/${pact.pda.toBase58()}`;
    } catch (e: unknown) {
      setApproveError(parseTxError(e));
    } finally {
      setApproveBusy(false);
    }
  }

  async function onFund() {
    if (!pact) return;
    const n = Number(fundAmount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      setFundError(t('v2.pact.fundInvalid'));
      return;
    }
    setFundError(null);
    await actions.runFund(pact, n);
  }

  if (pactData.loading) {
    return (
      <div className="p-page">
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px' }}>
          <PremiumNav active="" />
          <p role="status" style={{ marginTop: 20, color: 'var(--p-ink2)', fontSize: 14 }}>{t('v2.pact.loading')}</p>
        </div>
      </div>
    );
  }

  if (pactData.error || !pact) {
    return (
      <div className="p-page">
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px' }}>
          <PremiumNav active="" />
          <p role="alert" style={{ padding: 16, borderRadius: 12, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', color: 'var(--p-err)', fontSize: 13, marginTop: 20 }}>
            {pactData.error ?? t('v2.pact.notFound')}
          </p>
        </div>
      </div>
    );
  }

  const mediaEntry = media.get(pact.pda.toBase58());

  // ═══ Présentation longue, hors chaîne (FR + EN) ═══
  // Le pitch on-chain est plafonné à 800 octets et se verrouille à la
  // création : c'est la promesse du produit (le pact ne change plus).
  // Mais la présentation longue — celle que le founder a écrite en français
  // ET en anglais — vit dans `project_media.about_text` / `about_text_en`
  // (4 000 caractères, modifiable même après finalisation, écriture
  // signée). Elle existait déjà, mais n'était affichée que par les pages
  // legacy `/v1` : les pages premium (celles en ligne) l'ignoraient — d'où
  // des descriptions qui semblaient amputées alors que le texte long était
  // bien enregistré. 21/10 : on l'affiche.
  const aboutForLang =
    lang === 'en'
      ? mediaEntry?.aboutTextEn || mediaEntry?.aboutText
      : mediaEntry?.aboutText || mediaEntry?.aboutTextEn;

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/" />

        {actions.txState && <TxBanner state={actions.txState} onDismiss={actions.clearTxState} />}

        {/* En-tête du pact — hyper léger, tout est clic */}
        <div
          style={{
            position: 'relative',
            borderRadius: 'var(--p-radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--p-line)',
            boxShadow: 'var(--p-shadow)',
            background: 'var(--p-canvas)',
          }}
        >
          <div
            style={{
              // ⚠️ `position: relative` INDISPENSABLE — c'est le bloc de
              // référence de l'image de bannière (voir bannerImageStyle :
              // position absolute + inset 0 + height 100%). Sans lui, le
              // containing block de l'image remontait jusqu'à la carte
              // (position: relative), l'image couvrait donc TOUTE la carte —
              // et le titre, la description et le bloc vault/membres
              // passaient dessous, invisibles. Constaté le 20/10 : sur la
              // fiche d'un pact, le titre et le pitch disparaissaient alors
              // que la bannière était chargée. Même correctif que les
              // cartes (PremiumProjectCard, ligne 76).
              position: 'relative',
              height: 140,
              background: bannerFallbackGradient(isOpen),
              display: 'grid',
              placeItems: 'center',
              color: bannerFallbackInk(isOpen),
              fontWeight: 800,
              fontSize: 34,
              fontFamily: 'monospace',
              // La bannière est haute de 140 px et centrée en grille : sans
              // découpe, une image carrée la déborderait et passerait sur le
              // titre du pact (même cause que sur les cartes).
              overflow: 'hidden',
            }}
          >
            {mediaEntry?.bannerUrl ? (
              <img src={mediaEntry.bannerUrl} alt="" style={bannerImageStyle()} />
            ) : (
              pact.title.charAt(0).toUpperCase()
            )}
          </div>

          <div style={{ padding: '18px 22px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                {mediaEntry?.logoUrl ? (
                  <img src={mediaEntry.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid var(--p-line)', objectFit: 'cover' }} />
                ) : (
                  <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--p-accent-soft)', color: 'var(--p-accent)', fontWeight: 800 }}>
                    {pact.title.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--p-ink)' }}>{pact.title}</h1>
                  <p style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, color: 'var(--p-ink3)', marginTop: 2 }}>
                    {formatAddress(pact.pda.toBase58())}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={'p-pill ' + (isOpen ? 'warn' : 'ok')} style={{ fontSize: 11 }}>
                  {isOpen ? t('v2.pact.statusOpen') : t('v2.pact.statusVault')}
                </span>
                <a
                  href={`https://solscan.io/account/${pact.pda.toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-btn ghost"
                  style={{ flex: '0 0 auto', padding: '0 14px', display: 'inline-flex', alignItems: 'center', minHeight: 34 }}
                >
                  Solscan ↗
                </a>
              </div>
            </div>

            {pitchText && (
              <p style={{ fontSize: 13.5, color: 'var(--p-ink2)', lineHeight: 1.7, marginTop: 14 }}>
                <TranslatedMessage text={pitchText} />
              </p>
            )}

            {/* Présentation longue (FR/EN) — hors chaîne, modifiable après
                finalisation. Le pitch on-chain reste au-dessus : c'est lui
                qui est signé et vérifiable par un tiers. */}
            {aboutForLang && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--p-line)' }}>
                <h3
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: 'var(--p-ink3)',
                    margin: '0 0 8px',
                  }}
                >
                  {lang === 'en' ? 'About this project' : 'À propos du projet'}
                </h3>
                <p style={{ fontSize: 13.5, color: 'var(--p-ink2)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {aboutForLang}
                </p>
              </div>
            )}

            {/* Partage — la donnée les membres du founder */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 16 }}>
              <div className="p-kv">
                <div className="b"><span className="k">{t('v2.pact.vault')}</span><span className="v">{pact.status === 'active' ? `${formatSol(pact.vaultBalanceSol)} SOL` : '—'}</span></div>
                <div className="b"><span className="k">{t('v2.pact.members')}</span><span className="v">{String(pact.members.length)}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions on-chain — mêmes appels que la fiche legacy */}
        <section style={{ marginTop: 20, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', padding: 20, boxShadow: 'var(--p-shadow)' }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--p-ink3)' }}>
            {t('v2.pact.actions')}
          </h2>

          {/* Approbation */}
          <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {connected ? (
              me ? (
                me.approved ? (
                  <span className="p-pill ok" style={{ fontSize: 11 }}>
                    {t('v2.pact.approved')}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={runApprove}
                      disabled={approveBusy}
                      className="p-btn primary"
                      style={{ maxWidth: 260, minHeight: 40 }}
                    >
                      {approveBusy ? '…' : t('v2.pact.approve')}
                    </button>
                    <a
                      href={approveSig ? `https://solscan.io/tx/${approveSig}?cluster=devnet` : '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: approveSig ? 'inline' : 'none', fontSize: 11.5, textDecoration: 'none', color: 'var(--p-ok)', fontWeight: 600 }}
                    >
                      tx ↗
                    </a>
                  </>
                )
              ) : (
                <span style={{ fontSize: 12.5, color: 'var(--p-ink3)' }}>
                  {t('v2.pact.membersOnly')}
                </span>
              )
            ) : (
              <span style={{ fontSize: 12.5, color: 'var(--p-ink3)' }}>
                {t('v2.pact.connectWallet')}
              </span>
            )}
          </div>
          {approveError && (
            <p style={{ fontSize: 12, color: 'var(--p-err)', marginTop: 8 }}>{approveError}</p>
          )}

          {/* Financement (finalisé seulement) */}
          {(!isOpen) && (
            <>
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder={t('v2.pact.fundPlaceholder')}
                  aria-label={t('v2.pact.fundAria')}
                  style={{
                    flex: 1,
                    minWidth: 220,
                    borderRadius: 'var(--p-radius-xs)',
                    border: '1px solid var(--p-line)',
                    background: 'var(--p-panel)',
                    padding: '10px 14px',
                    fontSize: 13,
                    color: 'var(--p-ink)',
                    minHeight: 38,
                  }}
                />
                <button
                  type="button"
                  onClick={onFund}
                  disabled={actions.busyAction === 'fund'}
                  className="p-btn primary"
                  style={{ maxWidth: 200, minHeight: 40, flex: '0 0 auto' }}
                >
                  {actions.busyAction === 'fund' ? '…' : t('v2.pact.fund')}
                </button>
              </div>
              {fundError && <p style={{ fontSize: 12, color: 'var(--p-err)', marginTop: 6 }}>{fundError}</p>}
            </>
          )}

          {/* Finalisation (open et robuste) */}
          {isOpen && (
            <button
              type="button"
              onClick={() => pact && actions.runFinalize(pact)}
              disabled={actions.busyAction === 'finalize'}
              className="p-btn primary"
              style={{ maxWidth: 260, marginTop: 16, minHeight: 40 }}
            >
              {actions.busyAction === 'finalize' ? '…' : t('v2.pact.finalize', { approved: approvedCount, total: pact.members.length })}
            </button>
          )}
        </section>

        {/* Membres — part réel on-chain (bps → %) */}
        <section style={{ marginTop: 18, background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-lg)', overflow: 'hidden', boxShadow: 'var(--p-shadow)' }}>
          <h2 style={{ fontSize: 11, fontWeight: 650, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--p-ink3)', padding: '14px 18px', borderBottom: '1px solid var(--p-line)', margin: 0 }}>
            {t('v2.pact.participants', { pct: Math.round(shareTotal / 100) })}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--p-line)' }}>
                {[t('v2.pact.thWallet'), t('v2.pact.thRole'), t('v2.pact.thShare'), t('v2.pact.thApproved')].map((h) => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--p-ink3)', padding: '10px 16px', fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pact.members.map((m) => (
                <tr key={m.wallet.toBase58()} style={{ borderBottom: '1px solid var(--p-line)' }}>
                  <td style={{ padding: '11px 16px', fontFamily: 'ui-monospace,monospace', fontSize: 11.5, color: 'var(--p-ink2)' }}>
                    <a href={`https://solscan.io/account/${m.wallet.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer" style={{ color: 'var(--p-accent)', textDecoration: 'none', fontWeight: 600 }}>
                      {formatAddress(m.wallet.toBase58())}
                    </a>
                    {m.wallet.toBase58() === myAddr && <span style={{ fontSize: 10, color: 'var(--p-ok)', marginLeft: 6 }}>{t('v2.pact.you')}</span>}
                  </td>
                  <td style={{ padding: '11px 16px', color: 'var(--p-ink)' }}>{m.role}</td>
                  <td style={{ padding: '11px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--p-ink2)' }}>{(m.shareBps / 100).toFixed(2)} %</td>
                  <td style={{ padding: '11px 16px' }}>
                    {m.approved ? <span className="p-pill ok">✓</span> : <span className="p-pill" style={{ background: 'var(--p-bg)', color: 'var(--p-ink3)' }}>…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Discussion & Vault — composants legacy. La peau réécrit leur
            encre (text-white / text-ink-*) pour le fond clair du shell. */}
        <div className="p-legacy-skin" style={{ marginTop: 20, display: 'grid', gap: 20 }}>
          <ChatBox projectPda={pact.pda.toBase58()} creatorWallet={pact.creator.toBase58()} />
          <VaultPanel projectPda={pact.pda.toBase58()} members={pact.members} creatorWallet={pact.creator.toBase58()} />
        </div>

        {/* une seule fois : refresh Média après upload */}
        <button
          type="button"
          onClick={refreshMedia}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
