// src/components/wizard/PactStep1.tsx
// ═══════════ ÉTAPE 1 — IDENTITÉ ═══════════
// Extrait tel quel de CreatePactWizard.tsx, aucune logique modifiée :
// tous les calculs (suggested, effectiveShare, descWillTruncate…) restent
// dans le composant parent, cette vue ne fait que les afficher.

import MediaPicker from '../MediaPicker';
import { mediaEnabled } from '../../lib/media';
import { ROLE_GROUPS } from '../../lib/roles';
import { MAX_OPEN_ROLES } from '../../lib/openRoles';
import { PLATFORM_WALLET, inputCls, labelCls, hintCls } from './wizardShared';

interface Props {
  // Signature alignée sur celle exposée par useLanguage() (LanguageContext).
  // Avec Record<string, unknown>, le `t` du contexte n'était pas assignable
  // (contravariance des paramètres sous strictFunctionTypes) → erreur de build.
  t: (key: string, params?: Record<string, string | number>) => string;
  stages: readonly { id: string; label: string }[];

  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;

  setLogoFile: (f: File | null) => void;
  setBannerFile: (f: File | null) => void;

  stage: string;
  onStage: (id: string) => void;
  seedAmount: string;
  setSeedAmount: (v: string) => void;

  selectedRoles: string[];
  toggleRole: (id: string) => void;
  customRole: string;
  setCustomRole: (v: string) => void;
  addCustomRole: () => void;
  customRoles: string[];
  removeCustomRole: (r: string) => void;

  wantedRoles: string[];
  toggleWantedRole: (label: string) => void;
  wantedCustomRole: string;
  setWantedCustomRole: (v: string) => void;
  addWantedCustomRole: () => void;

  effectiveShare: number;
  suggested: number;
  remainingForMembers: number;
  cap: number;
  isGreedy: boolean;
  onShareChange: (v: number) => void;
  onResetShare: () => void;

  descWillTruncate: boolean;
  descBytesUsed: number;
  /** Octets encore disponibles sur les 800 (pitch + étape + rôles + seed). */
  descBytesLeft: number;

  loading: boolean;
  onCreate: () => void;
}

export default function PactStep1(p: Props) {
  const { t } = p;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
        <div className="space-y-5">
          {/* NOM */}
          <div>
            <label htmlFor="pact-title" className={labelCls}>
              {t('createWizard.projectName')}
            </label>
            <input
              id="pact-title"
              className={inputCls}
              placeholder={t('createWizard.projectNamePlaceholder')}
              value={p.title}
              onChange={(e) => p.setTitle(e.target.value)}
            />
            <small className={hintCls}>{t('createWizard.projectNameHint')}</small>
          </div>

          {/* LOGO & BANNIÈRE — optionnel, améliore la visibilité pour attirer
              dons/investisseurs. Upload réel après création (voir handleCreate),
              stockage Supabase off-chain, aucune donnée mock si non renseigné. */}
          {mediaEnabled && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
              <MediaPicker
                kind="logo"
                label={t('createWizard.logoLabel')}
                hint={t('createWizard.logoHint')}
                onChange={p.setLogoFile}
              />
              <MediaPicker
                kind="banner"
                label={t('createWizard.bannerLabel')}
                hint={t('createWizard.bannerHint')}
                onChange={p.setBannerFile}
              />
            </div>
          )}

          {/* DESCRIPTION */}
          <div>
            <label htmlFor="pact-description" className={labelCls}>
              {t('createWizard.descriptionLabel')}
            </label>
            <textarea
              id="pact-description"
              className={inputCls}
              rows={3}
              placeholder={t('createWizard.descriptionPlaceholder')}
              value={p.description}
              onChange={(e) => p.setDescription(e.target.value)}
            />
            <small className={hintCls}>{t('createWizard.descriptionHint')}</small>
            {/* Compteur d'octets LIVE — le budget de 800 se partage entre le
                pitch, la clé d'étape, les rôles et le seed : sans compteur,
                l'utilisateur découvre le dépassement au moment de signer. */}
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <small className={hintCls}>{t('createWizard.descriptionOneLangHint')}</small>
              <small
                className={
                  'font-mono text-[11px] ' +
                  (p.descBytesLeft < 0 ? 'text-red-300' : p.descBytesLeft < 80 ? 'text-amber-300' : 'text-ink-400')
                }
              >
                {t('createWizard.descriptionBytes', { used: p.descBytesUsed, left: Math.max(0, p.descBytesLeft) })}
              </small>
            </div>
          </div>

          {/* TYPE DE RECHERCHE */}
          <div>
            <span id="pact-stage-label" className={labelCls}>
              {t('createWizard.stageLabel')}
            </span>
            <small className={hintCls}>{t('createWizard.stageHint')}</small>
            <div role="group" aria-labelledby="pact-stage-label" className="mt-1 flex gap-2">
              {p.stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => p.onStage(s.id)}
                  className={
                    'flex-1 rounded-lg border px-2 py-2 text-xs transition-colors ' +
                    (p.stage === s.id
                      ? 'border-accent-violet/50 bg-violet-500/15 text-white'
                      : 'border-white/10 text-ink-300 hover:text-white')
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* SEED FOUNDER (informatif) */}
          <div>
            <label htmlFor="pact-seed-amount" className={labelCls}>
              {t('createWizard.seedLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="pact-seed-amount"
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                placeholder="0"
                value={p.seedAmount}
                onChange={(e) => p.setSeedAmount(e.target.value)}
              />
              <span className="whitespace-nowrap text-xs text-ink-400">SOL</span>
            </div>
            <small className={hintCls}>{t('createWizard.seedHint')}</small>
          </div>
        </div>

        <div className="space-y-5">
          {/* TES RÔLES (multi-sélection, groupés) */}
          <div>
            <span id="pact-roles-label" className={labelCls}>
              {t('createWizard.rolesLabel')}
            </span>
            <small className={hintCls}>{t('createWizard.rolesHint')}</small>

            {ROLE_GROUPS.map((group) => (
              <div key={group.category} className="mt-2">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">
                  {group.category}
                </p>
                <div role="group" aria-labelledby="pact-roles-label" className="flex flex-wrap gap-2">
                  {group.roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => p.toggleRole(r.id)}
                      className={
                        'rounded-full border px-3 py-1 text-xs transition-colors ' +
                        (p.selectedRoles.includes(r.id)
                          ? 'border-accent-violet/60 bg-violet-500/20 text-white'
                          : 'border-white/10 text-ink-300 hover:text-white')
                      }
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Rôle custom */}
            <div className="mt-3 flex gap-2">
              <input
                className={inputCls}
                placeholder={t('createWizard.customRolePlaceholder')}
                value={p.customRole}
                onChange={(e) => p.setCustomRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    p.addCustomRole();
                  }
                }}
              />
              <button
                type="button"
                onClick={p.addCustomRole}
                className="whitespace-nowrap rounded border border-accent-violet/40 bg-violet-500/10 px-3 text-xs text-accent-violet hover:bg-violet-500/20"
              >
                {t('createWizard.addRole')}
              </button>
            </div>
            {p.customRoles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.customRoles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => p.removeCustomRole(r)}
                    className="rounded-full border border-accent-neon/50 bg-emerald-500/15 px-3 py-1 text-xs text-white"
                  >
                    {r} ✕
                  </button>
                ))}
              </div>
            )}

            {p.selectedRoles.length === 0 && p.customRoles.length === 0 && (
              <small className="mt-1 block text-[11px] text-red-400">
                {t('createWizard.selectAtLeastOneRole')}
              </small>
            )}
          </div>

          {/* RÔLES RECHERCHÉS — ce que le founder veut recruter. OPTIONNEL,
              affiché publiquement (Marketplace, fiche pact, modale Postuler).
              Stocké off-chain (project_open_roles) après la création — voir
              handleCreate : la description on-chain (280 octets) ne peut pas
              contenir cette liste en plus du pitch + rôles founder + seed. */}
          <div>
            <span id="pact-wanted-roles-label" className={labelCls}>
              {t('createWizard.wantedRolesLabel')}
              <span className="ml-2 text-[11px] font-normal text-ink-400">
                {p.wantedRoles.length}/{MAX_OPEN_ROLES}
              </span>
            </span>
            <small className={hintCls}>{t('createWizard.wantedRolesHint')}</small>

            {ROLE_GROUPS.map((group) => (
              <div key={group.category} className="mt-2">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">
                  {group.category}
                </p>
                <div
                  role="group"
                  aria-labelledby="pact-wanted-roles-label"
                  className="flex flex-wrap gap-2"
                >
                  {group.roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => p.toggleWantedRole(r.label)}
                      disabled={
                        !p.wantedRoles.includes(r.label) && p.wantedRoles.length >= MAX_OPEN_ROLES
                      }
                      className={
                        'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 ' +
                        (p.wantedRoles.includes(r.label)
                          ? 'border-accent-neon/60 bg-emerald-500/20 text-white'
                          : 'border-white/10 text-ink-300 hover:text-white')
                      }
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Rôle recherché custom */}
            <div className="mt-3 flex gap-2">
              <input
                className={inputCls}
                placeholder={t('createWizard.wantedCustomRolePlaceholder')}
                value={p.wantedCustomRole}
                onChange={(e) => p.setWantedCustomRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    p.addWantedCustomRole();
                  }
                }}
              />
              <button
                type="button"
                onClick={p.addWantedCustomRole}
                disabled={p.wantedRoles.length >= MAX_OPEN_ROLES}
                className="whitespace-nowrap rounded border border-accent-neon/40 bg-emerald-500/10 px-3 text-xs text-accent-neon hover:bg-emerald-500/20 disabled:opacity-40"
              >
                {t('createWizard.addRole')}
              </button>
            </div>
            {p.wantedRoles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {p.wantedRoles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => p.toggleWantedRole(r)}
                    className="rounded-full border border-accent-neon/50 bg-emerald-500/15 px-3 py-1 text-xs text-white"
                  >
                    {r} ✕
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TA PART — avec suggestion */}
          <div>
            <label htmlFor="pact-my-share" className={labelCls}>
              {t('createWizard.myShareLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="pact-my-share"
                type="number"
                min={0}
                max={100}
                className={inputCls}
                value={p.effectiveShare}
                onChange={(e) => p.onShareChange(Number(e.target.value))}
              />
              <button
                type="button"
                onClick={p.onResetShare}
                className="whitespace-nowrap rounded border border-accent-violet/40 bg-violet-500/10 px-3 py-2 text-xs text-accent-violet hover:bg-violet-500/20"
              >
                {t('createWizard.suggested', { n: p.suggested })}
              </button>
            </div>

            <div className="mt-2 rounded-lg border border-accent-violet/25 bg-violet-500/10 p-3 text-[11px] leading-snug text-ink-300">
              💡{' '}
              <strong className="text-white">
                {t('createWizard.suggestedNote', { n: p.suggested })}
              </strong>
              {t('createWizard.suggestedBody', {
                count: p.selectedRoles.length + p.customRoles.length,
              })}
              <br />
              {t('createWizard.remainingNote', { n: p.remainingForMembers })}
            </div>

            {p.isGreedy && (
              <div className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-[11px] leading-snug text-amber-300">
                ⚠️ <strong>{t('createWizard.greedyWarning', { n: p.effectiveShare })}</strong>{' '}
                {t('createWizard.greedyBody', {
                  cap: p.cap,
                  target:
                    p.stage === 'invest' ? t('createWizard.investors') : t('createWizard.devs'),
                  suggested: p.suggested,
                })}
              </div>
            )}

            <div className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-3 text-[11px] leading-snug text-emerald-300">
              🧮 <strong>{t('createWizard.simulationLabel')}</strong>{' '}
              {t('createWizard.simulationBody', { amount: (p.effectiveShare / 10).toFixed(2) })}
            </div>
          </div>

          {/* WALLET PROTOCOLE — FIXE */}
          <div>
            <p className={labelCls}>{t('createWizard.platformWalletLabel')}</p>
            <div className="flex items-center gap-2 rounded border border-white/10 bg-canvas-900/60 p-2">
              <span className="flex-1 truncate font-mono text-[11px] text-ink-400">
                {PLATFORM_WALLET}
              </span>
              <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-ink-400">
                {t('createWizard.platformWalletFixed')}
              </span>
            </div>
            <small className={hintCls}>{t('createWizard.platformWalletHint')}</small>
          </div>
        </div>
      </div>

      {p.descWillTruncate && (
        <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-[11px] leading-snug text-red-300">
          ⚠️ <strong>{t('createWizard.descTruncateWarning', { used: p.descBytesUsed })}</strong>{' '}
          {t('createWizard.descTruncateBody')}
        </div>
      )}

      <button
        type="button"
        onClick={p.onCreate}
        disabled={
          p.loading ||
          !p.title ||
          (p.selectedRoles.length === 0 && p.customRoles.length === 0) ||
          // ⚠️ La description trop longue DOIT bloquer la création : au-delà
          // de la borne on-chain, le texte part tronqué au milieu d'un mot
          // (cf. avertissement rouge juste au-dessus). Avant ce fix, le
          // bouton restait actif malgré l'alerte — CreatePactWizard.tsx:400.
          p.descWillTruncate
        }
        // CTA principal → violet (restype v3, 21/09) — le vert néon reste
        // réservé aux confirmations de mouvements de SOL.
        className="w-full rounded-xl bg-accent-violet py-3.5 text-sm font-bold text-ink-900 transition hover:opacity-90 disabled:opacity-50"
      >
        {p.loading ? t('createWizard.creating') : t('createWizard.createButton')}
      </button>
    </div>
  );
}
