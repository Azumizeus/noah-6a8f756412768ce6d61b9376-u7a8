// src/components/wizard/PactStep3.tsx
// ═══════════ ÉTAPE 3 — FINALISATION ═══════════
// Extrait tel quel de CreatePactWizard.tsx, aucune logique modifiée.

import QrCode from '../QrCode';
import TxLink from './TxLink';

interface Props {
  // Même signature que useLanguage().t — voir PactStep1 pour le pourquoi.
  t: (key: string, params?: Record<string, string | number>) => string;
  memberSigs: { wallet: string; sig: string }[];
  shareUrl: string;
  canNativeShare: boolean;
  linkCopied: boolean;
  onCopyShareLink: () => void;
  onNativeShare: () => void;
  onCloseAndReturn: () => void;
}

export default function PactStep3({
  t,
  memberSigs,
  shareUrl,
  canNativeShare,
  linkCopied,
  onCopyShareLink,
  onNativeShare,
  onCloseAndReturn,
}: Props) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-white">{t('createWizard.membersRegistered')}</p>

      {memberSigs.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-canvas-900/60 p-3 text-left">
          <p className="mb-1 text-[11px] font-semibold text-ink-300">
            {t('createWizard.addMemberTxLabel')}
          </p>
          {memberSigs.map((m) => (
            <TxLink key={m.sig} sig={m.sig} label={`${m.wallet.slice(0, 4)}…${m.wallet.slice(-4)}`} />
          ))}
        </div>
      )}

      <p className="text-sm text-ink-300">{t('createWizard.nextStepsIntro')}</p>
      <div className="rounded-lg border border-accent-violet/25 bg-violet-500/10 p-3 text-left text-[11px] leading-snug text-ink-300">
        <strong className="text-white">{t('createWizard.nextActionsHeading')}</strong>
        <br />
        {t('createWizard.nextAction1')}
        <br />
        {t('createWizard.nextAction2')}
        <br />
        {t('createWizard.nextAction3')}
      </div>

      {/* Lien de partage direct — la fiche publique #/pact/:pda, lecture seule,
          où chaque membre approuve avec SON wallet sans toucher au wizard créateur. */}
      {shareUrl && (
        <div className="glass-panel flex flex-col gap-3 rounded-lg border border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 text-left">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">
              {t('createWizard.shareLinkLabel')}
            </p>
            <p className="truncate rounded border border-white/10 bg-canvas-900/60 px-2 py-1.5 font-mono text-[11px] text-ink-300">
              {shareUrl}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCopyShareLink}
                className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-ink-300 hover:border-accent-violet/40 hover:text-white"
              >
                {linkCopied ? t('common.linkCopied') : t('common.copyLink')}
              </button>
              {canNativeShare && (
                <button
                  type="button"
                  onClick={onNativeShare}
                  className="inline-flex h-9 items-center rounded-lg border border-white/10 px-3 text-xs text-ink-300 hover:border-accent-violet/40 hover:text-white"
                >
                  {t('createWizard.shareButton')}
                </button>
              )}
            </div>
          </div>
          <div className="mx-auto shrink-0 rounded-xl bg-white p-2 sm:mx-0">
            <QrCode value={shareUrl} size={88} />
          </div>
        </div>
      )}

      {/* ⚠️ Pas de bouton "Finaliser" ici : juste après add_member, TOUS les
          nouveaux membres ont approved=false (seul le créateur est
          auto-approuvé à la création). finalize() exige 100% d'approbations
          (NotAllApproved côté programme) — donc essayer maintenant échoue à
          coup sûr et redemande une signature pour rien. Le vrai bouton
          Finaliser vit sur la page Pacts (PactCard), qui suit en live les
          approbations on-chain et ne s'active QUE quand tout le monde a dit
          oui — inutile de dupliquer cette logique ici. */}
      <div className="rounded-lg border border-white/10 bg-canvas-900/40 p-3 text-left text-[11px] leading-snug text-ink-300">
        {t('createWizard.finalizeNote')}
      </div>

      <button
        type="button"
        onClick={onCloseAndReturn}
        className="w-full rounded-xl border border-white/10 py-3.5 text-sm font-medium text-ink-200 transition hover:border-accent-violet/40 hover:text-white"
      >
        {t('createWizard.closeAndReturn')}
      </button>
    </div>
  );
}
