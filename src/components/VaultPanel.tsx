// src/components/VaultPanel.tsx
// ═══════════════════════════════════════════════════════════════════
// Vault de documents privés du projet — réservé aux membres (+ approbation
// founder). Contrairement au chat/updates (lecture publique), rien ici
// n'est visible sans signature wallet vérifiée côté serveur (voir
// lib/vault.ts + supabase/functions/vault) : le déverrouillage est une
// action explicite (bouton), pas un chargement automatique, pour ne pas
// déclencher une popup de signature au simple affichage de la page.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { ChainMember } from '../lib/pacts';
import { formatAddress } from '../lib/pacts';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { vaultDocUrl } from '../lib/router';
import {
  listVaultDocuments,
  uploadVaultDocument,
  reviewVaultDocument,
  vaultEnabled,
  groupVaultVersions,
  type VaultDocument,
} from '../lib/vault';

interface Props {
  projectPda: string;
  members: ChainMember[];
  creatorWallet: string;
  /** ?doc=<id> de l'URL — scrolle et surligne ce document une fois le vault déverrouillé. */
  focusDocId?: number | null;
  /** Appelé après un déverrouillage réussi — sert à marquer le vault "vu" (lib/seen.ts). */
  onUnlocked?: () => void;
}

const STATUS_STYLE: Record<VaultDocument['status'], string> = {
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
  approved: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400',
  changes_requested: 'border-red-400/30 bg-red-400/10 text-red-400',
};

export function VaultPanel({ projectPda, members, creatorWallet, focusDocId, onUnlocked }: Props) {
  const { publicKey, signMessage } = useWallet();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const myAddr = publicKey?.toBase58();
  const iAmMember = !!myAddr && (myAddr === creatorWallet || members.some((m) => m.wallet.toBase58() === myAddr));
  const iAmFounder = !!myAddr && myAddr === creatorWallet;

  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [supersedingId, setSupersedingId] = useState<number | null>(null);
  const [supersedingTitle, setSupersedingTitle] = useState<string>('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const uploadFormRef = useRef<HTMLDivElement>(null);

  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = async () => {
    if (!myAddr) return;
    if (!signMessage) {
      setError(t('errors.signMessageUnsupported'));
      return;
    }
    setUnlocking(true);
    setError(null);
    const r = await listVaultDocuments(myAddr, projectPda, signMessage);
    setUnlocking(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setDocuments(r.documents);
    setUnlocked(true);
    onUnlocked?.();
  };

  // Lien direct #/pact/<pda>?doc=<id> — scroll + surlignage temporaire une fois
  // le vault déverrouillé et les documents chargés (nécessite toujours d'être
  // membre + de signer, le lien seul ne donne accès à rien).
  useEffect(() => {
    if (!unlocked || !focusDocId) return;
    const el = document.getElementById(`vault-doc-${focusDocId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [unlocked, focusDocId, documents]);

  // Désactivation du vault : retour possible UNIQUEMENT après tous les
  // hooks (fix rules-of-hooks 19/09 — l'appel conditionnel de useEffect
  // violait le contrat React).
  if (!vaultEnabled) return null;


  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!myAddr || !signMessage || !file) return;
    setUploading(true);
    setError(null);
    const r = await uploadVaultDocument(
      myAddr, projectPda, signMessage, file, title || file.name,
      supersedingId ?? undefined
    );
    setUploading(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setTitle('');
    setSupersedingId(null);
    setSupersedingTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  };

  const startNewVersion = (doc: VaultDocument) => {
    setSupersedingId(doc.id);
    setSupersedingTitle(doc.title);
    setTitle(doc.title);
    uploadFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleReview = async (documentId: number, status: 'approved' | 'changes_requested') => {
    if (!myAddr || !signMessage) return;
    setReviewBusy(true);
    setError(null);
    const r = await reviewVaultDocument(myAddr, projectPda, signMessage, documentId, status, reviewNote);
    setReviewBusy(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setReviewingId(null);
    setReviewNote('');
    load();
  };

  return (
    <div className="glass-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-sans text-sm font-semibold text-white">{t('vault.heading')}</h3>
        {unlocked && (
          <button
            type="button"
            onClick={load}
            className="text-[11px] text-ink-400 transition hover:text-white"
          >
            {t('vault.refresh')}
          </button>
        )}
      </div>

      {!myAddr ? (
        <p className="text-[11px] text-ink-500">{t('vault.connectPrompt')}</p>
      ) : !iAmMember ? (
        <p className="text-[11px] text-ink-500">{t('vault.notMember')}</p>
      ) : !unlocked ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-400">{t('vault.lockedDesc')}</p>
          <button
            type="button"
            onClick={load}
            disabled={unlocking}
            className="w-full rounded-lg bg-accent-violet px-3 py-2 text-xs font-medium text-ink-900 transition hover:bg-accent-violet/90 disabled:opacity-50"
          >
            {unlocking ? t('vault.unlocking') : t('vault.unlock')}
          </button>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-xs text-ink-400">{t('vault.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {groupVaultVersions(documents).map(({ latest: doc, history }) => (
                <li
                  key={doc.id}
                  id={`vault-doc-${doc.id}`}
                  className={`rounded-lg border p-3 transition-colors ${focusDocId === doc.id ? 'border-accent-violet/60 bg-violet-500/10' : 'border-white/5 bg-black/20'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{doc.title}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {t('vault.uploadedBy')} <span className="font-mono">{formatAddress(doc.uploaderWallet)}</span>
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[doc.status]}`}>
                      {doc.status === 'pending' ? t('vault.statusPending') : doc.status === 'approved' ? t('vault.statusApproved') : t('vault.statusChanges')}
                    </span>
                  </div>

                  {doc.founderNote && (
                    <p className="mt-2 rounded-lg bg-white/5 p-2 text-[11px] text-ink-300">
                      <span className="text-ink-400">{t('vault.founderNoteLabel')}</span> {doc.founderNote}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-accent-neon underline-offset-2 hover:underline"
                      >
                        {t('vault.open')}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(vaultDocUrl(projectPda, doc.id));
                          setCopiedId(doc.id);
                          setTimeout(() => setCopiedId((v) => (v === doc.id ? null : v)), 2000);
                        } catch {
                          /* clipboard indisponible — non bloquant */
                        }
                      }}
                      className="text-[11px] text-ink-400 underline-offset-2 hover:text-white hover:underline"
                    >
                      {copiedId === doc.id ? t('common.linkCopied') : t('vault.copyLink')}
                    </button>
                    {iAmFounder && (
                      <button
                        type="button"
                        onClick={() => setReviewingId(reviewingId === doc.id ? null : doc.id)}
                        className="text-[11px] text-ink-400 underline-offset-2 hover:text-white hover:underline"
                      >
                        {reviewingId === doc.id ? t('common.cancel') : `${t('vault.approve')} / ${t('vault.requestChanges')}`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startNewVersion(doc)}
                      className="text-[11px] text-ink-400 underline-offset-2 hover:text-white hover:underline"
                    >
                      {t('vault.newVersion')}
                    </button>
                    {history.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedHistoryId(expandedHistoryId === doc.id ? null : doc.id)}
                        className="text-[11px] text-ink-400 underline-offset-2 hover:text-white hover:underline"
                      >
                        {expandedHistoryId === doc.id ? t('vault.hideHistory') : t('vault.showHistory', { n: history.length })}
                      </button>
                    )}
                  </div>

                  {expandedHistoryId === doc.id && history.length > 0 && (
                    <ul className="mt-2 space-y-1.5 border-t border-white/5 pt-2">
                      {history.map((h) => (
                        <li key={h.id} id={`vault-doc-${h.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2 py-1.5 text-[11px]">
                          <span className="min-w-0 truncate text-ink-400">
                            {h.title} · <span className="font-mono">{formatAddress(h.uploaderWallet)}</span>
                          </span>
                          {h.url && (
                            <a href={h.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-accent-neon underline-offset-2 hover:underline">
                              {t('vault.open')}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {iAmFounder && reviewingId === doc.id && (
                    <div className="mt-2 space-y-1.5 border-t border-white/5 pt-2">
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder={t('vault.reviewNotePlaceholder')}
                        maxLength={500}
                        rows={2}
                        className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleReview(doc.id, 'approved')}
                          disabled={reviewBusy}
                          className="flex-1 rounded-lg bg-emerald-500/15 px-2 py-1.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {reviewBusy ? t('vault.reviewing') : t('vault.approve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReview(doc.id, 'changes_requested')}
                          disabled={reviewBusy}
                          className="flex-1 rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] font-medium text-red-400 transition hover:bg-red-500/25 disabled:opacity-50"
                        >
                          {reviewBusy ? t('vault.reviewing') : t('vault.requestChanges')}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div ref={uploadFormRef} className="space-y-1.5 border-t border-white/5 pt-3">
            {supersedingId != null && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-accent-violet/30 bg-accent-violet/10 px-2.5 py-1.5 text-[11px] text-white">
                <span className="min-w-0 truncate">{t('vault.supersedingBanner', { title: supersedingTitle })}</span>
                <button
                  type="button"
                  onClick={() => { setSupersedingId(null); setSupersedingTitle(''); setTitle(''); }}
                  className="shrink-0 text-ink-400 underline-offset-2 hover:text-white hover:underline"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
            <label htmlFor="vault-title" className="sr-only">{t('vault.uploadTitleLabel')}</label>
            <input
              id="vault-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('vault.uploadTitlePlaceholder')}
              maxLength={120}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-ink-500 focus:border-accent-violet/50 focus:outline-none"
            />
            <input
              ref={fileInputRef}
              type="file"
              className="w-full text-[11px] text-ink-400 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-white"
            />
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full rounded-lg bg-accent-violet px-3 py-2 text-xs font-medium text-ink-900 transition hover:bg-accent-violet/90 disabled:opacity-50"
            >
              {uploading ? t('vault.uploading') : t('vault.upload')}
            </button>
            <p className="text-[10px] text-ink-500">{t('vault.maxSizeHint')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default VaultPanel;
