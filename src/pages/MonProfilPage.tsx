// src/pages/MonProfilPage.tsx
// ═══════════════════════════════════════════════════════════════════
// Page profil builder : édition du profil (signé via wallet, écrit par
// l'Edge Function update-profile — voir profileRemote.ts), + "Mes pacts" et
// "Mes gains" lus directement on-chain (aucune donnée inventée).
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { DashboardLayout, FadeInUp } from '../components/DashboardLayout';
import AppWalletButton from '../components/AppWalletButton';
import EmptyState from '../components/EmptyState';
import { AVAILABILITY_META, SKILL_LEVEL_META, SKILL_LEVELS, emptyProfile, loadProfile, saveProfile } from '../lib/profile';
import type { BuilderProfile, SkillLevel } from '../lib/profile';
import { fetchProfileDetailed, submitProfileUpdate, uploadProfileAvatar, isRemoteEnabled } from '../lib/profileRemote';
import { ROLE_GROUPS, ALL_ROLES } from '../lib/roles';
import { useProjects } from '../hooks/useProjects';
import { formatSol, formatAddress } from '../lib/pacts';
import { fetchContactRequestsFor, fetchRatingSummaries, markContactSeenNow } from '../lib/contact';
import type { ContactRequest } from '../lib/contact';
import StarRating from '../components/StarRating';
import ChatSessionsPanel from '../components/ChatSessionsPanel';
import FreeGrid from '../components/FreeGrid';
import { useLanguage } from '../lib/i18n/LanguageContext';
import ProfileSettingsModal from '../components/ProfileSettingsModal';
import TranslatedMessage from '../components/TranslatedMessage';
// Point d'entrée gamification — jamais monté nulle part avant ce collage,
// ni ici ni chez by7b (gamification.ts, quest-write, QuestBoard existaient
// déjà mais n'étaient atteignables depuis aucun écran). GAMIFICATION_PLAN.md
// §3 destinait précisément ce panneau à la page Profil.
import XpBar from '../components/XpBar';
import BadgeShelf from '../components/BadgeShelf';
import QuestBoard from '../components/QuestBoard';
import WalletPanel from '../components/WalletPanel';

const inputCls = 'w-full rounded-lg border border-white/10 bg-black/30 p-2.5 text-sm text-white focus:border-accent-violet/50 focus:outline-none';
// `emptyProfile` vivait ici en local ; il est maintenant dans lib/profile.ts
// (une seule définition pour toute l'app — les champs de BuilderProfile sont
// requis, une copie oubliée ne compilerait plus).
function roleLabel(id: string): string { return ALL_ROLES.find((r) => r.id === id)?.label ?? id; }
function skillLabelWithLevel(id: string, levels: Record<string, SkillLevel>, t: (key: string) => string): string {
  const lvl = levels[id];
  return lvl ? `${roleLabel(id)} — ${t(SKILL_LEVEL_META[lvl].labelKey)}` : roleLabel(id);
}

// Astuce CSS classique "n'imprimer qu'un seul élément" : tout est masqué en
// impression SAUF #profile-print-area — évite de toucher DashboardLayout
// (sidebar/nav) juste pour cette page. Pas de dépendance PDF ajoutée :
// window.print() -> "Enregistrer en PDF" du navigateur suffit pour un CV rapide.
const PRINT_STYLE = `@media print {
  body * { visibility: hidden !important; }
  #profile-print-area, #profile-print-area * { visibility: visible !important; }
  #profile-print-area {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    padding: 32px;
    color: #111;
    background: #fff;
  }
}`;

type SyncState = 'idle' | 'saving' | 'success' | 'error';
type ViewMode = 'view' | 'edit';

function MesPactsEtGains() {
  const { t } = useLanguage();
  const { pacts, loading, error } = useProjects();
  const { publicKey } = useWallet();
  const myAddr = publicKey?.toBase58();

  const myPacts = pacts.filter((p) => p.myShareBps > 0 || p.creator.toBase58() === myAddr);
  const totalClaimable = myPacts.reduce((sum, p) => sum + p.myClaimableSol, 0);

  if (loading) {
    return <div className="glass-panel h-40 animate-pulse rounded-2xl" aria-hidden="true" />;
  }

  // ⚠️ Audit 19/09 : une erreur RPC ne doit JAMAIS ressembler à un solde
  // vide ("0 SOL réclamable") — sur une donnée financière c'est trompeur.
  // État erreur distinct : on masque les balances (on ne sait pas qu'elles
  // valent 0) et on affiche le message réseau.
  if (error) {
    return (
      <div className="glass-panel p-5">
        <h2 className="mb-1 font-sans text-lg font-semibold text-white">{t('profile.myPactsHeading')}</h2>
        <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {t('common.rpcErrorPrefix')} {error}
        </p>
        <p className="mt-2 text-xs text-ink-400">{t('profile.myPactsErrorHint')}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5">
      <h2 className="mb-1 font-sans text-lg font-semibold text-white">{t('profile.myPactsHeading')}</h2>
      <p className="mb-4 text-xs text-ink-400">{t('profile.myPactsSubtitle')}</p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/5 bg-black/20 p-3">
          <p className="text-xs text-ink-400">{t('profile.myPactsCount')}</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-white">{myPacts.length}</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-black/20 p-3">
          <p className="text-xs text-ink-400">{t('profile.myPactsClaimable')}</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-accent-neon">{formatSol(totalClaimable)} SOL</p>
        </div>
      </div>

      {myPacts.length === 0 ? (
        <p className="text-xs text-ink-400">{t('profile.myPactsEmpty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {myPacts.map((p) => (
            <li key={p.pda.toBase58()} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-sm">
              <a href={`#/pact/${p.pda.toBase58()}`} className="min-w-0 truncate text-white underline-offset-2 hover:text-accent-neon hover:underline">
                {p.title}
              </a>
              <span className="shrink-0 font-mono text-xs text-ink-400">
                {(p.myShareBps / 100).toFixed(2)}% · <span className="text-accent-neon">{formatSol(p.myClaimableSol)} SOL</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Panneau "Progression" — rang + XP + étagère de badges, regroupés dans un
// seul bloc FreeGrid plutôt que deux : ce sont deux vues du même total XP
// (computeRank côté XpBar, computeBadgeProgress côté BadgeShelf), les
// séparer en deux tuiles aurait juste dupliqué l'en-tête "Progression"
// sans rien apporter.
function ProgressionPanel({ wallet }: { wallet: string }) {
  const { t } = useLanguage();
  return (
    <div className="glass-panel p-5">
      <h2 className="mb-3 font-sans text-lg font-semibold text-white">{t('gamification.sectionHeading')}</h2>
      <XpBar wallet={wallet} className="mb-4" />
      <BadgeShelf wallet={wallet} />
    </div>
  );
}

type SignFn = (message: Uint8Array) => Promise<Uint8Array>;

// ⚠️ Ne JAMAIS appeler signMessage automatiquement dans un useEffect au
// montage : plusieurs wallets (Solflare notamment) refusent ou affichent un
// popup vide/instable quand la demande de signature n'est pas déclenchée
// directement par un clic utilisateur — d'où le bug "1 fois sur 2" au
// simple fait d'ouvrir la page Profil. On exige donc un clic explicite
// ("Déverrouiller"), exactement comme VaultPanel.
function ContactInbox({ wallet, signMessage }: { wallet: string; signMessage?: SignFn }) {
  const { t } = useLanguage();
  const [requests, setRequests] = useState<ContactRequest[] | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!signMessage) { setError(t('errors.signMessageUnsupported')); return; }
    setUnlocking(true);
    setError(null);
    const r = await fetchContactRequestsFor(wallet, signMessage);
    setUnlocking(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setRequests(r);
    // Ouvrir la boîte = "je viens de voir mes demandes" — marque tout vu
    // tout de suite (pas de distinction lu/non-lu par demande individuelle).
    markContactSeenNow(wallet);
  };

  if (requests === null) {
    return (
      <div className="glass-panel p-5">
        <h2 className="mb-1 font-sans text-lg font-semibold text-white">{t('contact.inboxHeading')}</h2>
        <p className="mb-4 text-xs text-ink-400">{t('contact.inboxSubtitle')}</p>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={handleUnlock}
          disabled={unlocking}
          className="w-full rounded-lg border border-accent-violet/30 bg-violet-500/10 py-2 text-xs font-medium text-white transition hover:bg-violet-500/20 disabled:opacity-50"
        >
          {unlocking ? t('contact.inboxUnlocking') : t('contact.inboxUnlock')}
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5">
      <h2 className="mb-1 font-sans text-lg font-semibold text-white">{t('contact.inboxHeading')}</h2>
      <p className="mb-4 text-xs text-ink-400">{t('contact.inboxSubtitle')}</p>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-xs text-ink-400">{t('contact.inboxEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-ink-400">{formatAddress(r.fromWallet)}</span>
                <span className="shrink-0 text-[10px] text-ink-500">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {r.roleText && (
                <p className="mb-1 text-[11px] font-medium text-accent-violet">{t('contact.inboxRoleLabel')} {r.roleText}</p>
              )}
              <p className="text-xs text-ink-200">
                <TranslatedMessage text={r.message} sourceLang={r.lang} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MonProfilPage() {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  // Dernier profil confirmé enregistré côté serveur — sert de référence pour
  // le mode "aperçu" et pour annuler une édition en cours sans perdre la
  // version sauvegardée. null = jamais encore enregistré (profil tout neuf).
  const [savedProfile, setSavedProfile] = useState<BuilderProfile | null>(null);
  const [myRating, setMyRating] = useState<{ avgStars: number; ratingCount: number } | null>(null);
  const [mode, setMode] = useState<ViewMode>('edit');
  const [sync, setSync] = useState<SyncState>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Panneau de réglages (thème, densité, RPC, USD, export CSV). Monté ici
  // uniquement — c'est le seul point d'entrée vers ProfileSettingsModal
  // dans toute l'app pour l'instant.
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ouverture directe via `#/v1/profile?settings=1` : c'est le lien que pose
  // le bandeau de santé RPC du shell legacy quand il propose « Configurer un
  // RPC ». Sans ce paramètre, le bouton aurait déposé l'utilisateur sur son
  // profil sans ouvrir le champ qu'il annonce — un clic qui ne tient pas sa
  // promesse, précisément au moment où quelque chose est cassé.
  useEffect(() => {
    const veutReglages = () => {
      const brut = window.location.hash.replace(/^#/, '');
      const i = brut.indexOf('?');
      if (i === -1) return false;
      return new URLSearchParams(brut.slice(i + 1)).get('settings') === '1';
    };
    if (veutReglages()) setSettingsOpen(true);
    const surHash = () => {
      if (veutReglages()) setSettingsOpen(true);
    };
    window.addEventListener('hashchange', surHash);
    return () => window.removeEventListener('hashchange', surHash);
  }, []);

  // Chargement : Supabase d'abord, fallback localStorage (cache offline / brouillon)
  useEffect(() => {
    if (!publicKey) { setProfile(null); setSavedProfile(null); return; }
    const wallet = publicKey.toBase58();
    setSync('idle');
    let cancelled = false;
    (async () => {
      const res = await fetchProfileDetailed(wallet);
      if (cancelled) return;
      if (res.status === 'error') {
        // ⚠️ Audit 19/09 : réseau en panne ≠ profil inexistant. On reste en
        // aperçu du cache local (lecture seule) — on ne force JAMAIS le mode
        // édition, et le bouton Annuler reste disponible. Message affiché si
        // l'utilisateur ouvre le formulaire (bloc sync===error existant).
        const local = loadProfile(wallet) ?? emptyProfile(wallet);
        setProfile(local);
        if (local.pseudo.trim() !== '') {
          setSavedProfile(local);
          setMode('view');
        } else {
          setSavedProfile(null);
          setMode('view');
        }
        setSync('error');
        setSyncError(t('profile.remoteOfflineWarning'));
        return;
      }
      const remote = res.profile;
      const hasSavedProfile = !!remote && remote.pseudo.trim() !== '';
      const loaded = remote ?? loadProfile(wallet) ?? emptyProfile(wallet);
      setProfile(loaded);
      setSavedProfile(hasSavedProfile ? remote : null);
      // Un profil jamais sauvegardé s'ouvre direct en édition — rien à
      // "prévisualiser" ; un profil déjà enregistré s'ouvre en aperçu.
      setMode(hasSavedProfile ? 'view' : 'edit');
      // Lecture publique (vue agrégée), pas de signature nécessaire.
      const summaries = await fetchRatingSummaries([wallet]);
      if (!cancelled) setMyRating(summaries.get(wallet) ?? null);
    })();
    return () => { cancelled = true; };
  }, [publicKey]);

  return (
    <DashboardLayout walletSlot={<AppWalletButton />}>
      <FadeInUp>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-accent-violet">{t('profile.eyebrow')}</p>
            <h1 className="mt-1 font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t('profile.titleLine1')} <span className="text-accent-violet">{t('profile.titleLine2')}</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-300">
              {t('profile.subtitle')}
            </p>
          </div>
          {publicKey && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-ink-200 transition hover:border-accent-violet/40 hover:text-white"
            >
              {t('profile.settingsButton')}
            </button>
          )}
        </header>
      </FadeInUp>

      {!publicKey ? (
        <FadeInUp>
          <EmptyState
            title={t('profile.connectTitle')}
            description={t('profile.connectDesc')}
            ctaLabel={t('profile.connectCta')}
            onCta={() => { window.location.hash = '#/pacts'; }}
          />
        </FadeInUp>
      ) : !profile ? (
        <FadeInUp><div className="glass-panel h-64 animate-pulse rounded-2xl" aria-hidden="true" /></FadeInUp>
      ) : (
        <>
          <style>{PRINT_STYLE}</style>

          <div id="profile-print-area" className="hidden">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {profile.avatarUrl && (
                <img src={profile.avatarUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              )}
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{profile.pseudo || '—'}</h1>
                <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#555', margin: '2px 0 0' }}>{publicKey.toBase58()}</p>
              </div>
            </div>

            {profile.bio && <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>{profile.bio}</p>}

            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('profile.skills')}</h2>
            <p style={{ fontSize: 12, marginBottom: 20 }}>
              {profile.skills.length ? profile.skills.map((id) => skillLabelWithLevel(id, profile.skillLevels, t)).join(' · ') : '—'}
            </p>

            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('profile.availability')}</h2>
            <p style={{ fontSize: 12, marginBottom: 20 }}>
              {AVAILABILITY_META[profile.availability].emoji} {t(AVAILABILITY_META[profile.availability].labelKey)}
            </p>

            {Object.entries(profile.links).some(([, v]) => v) && (
              <>
                <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('profile.links')}</h2>
                <ul style={{ fontSize: 12, marginBottom: 20, paddingLeft: 18 }}>
                  {Object.entries(profile.links).filter(([, v]) => v).map(([k, v]) => (
                    <li key={k}>{k}: {v}</li>
                  ))}
                </ul>
              </>
            )}

            <p style={{ fontSize: 10, color: '#888', marginTop: 28, borderTop: '1px solid #ddd', paddingTop: 8 }}>
              BuildPact · {new Date().toLocaleDateString()}
            </p>
          </div>

          <FreeGrid
            pageKey="profile-sidebar"
            wallet={publicKey?.toBase58() ?? null}
            items={[
              {
                id: 'profileCard',
                // 19/09 — le formulaire de profil devient lui aussi un item
                // FreeGrid (déplaçable/redimensionnable comme les autres),
                // au lieu d'un bloc fixe à côté. Bouton "Exporter en PDF"
                // remonté ici (il n'a plus de colonne dédiée) ; FadeInUp
                // retiré comme pour tous les items (conflit de transform
                // avec le positionnement absolu de react-grid-layout — voir
                // commentaire plus bas sur la grille).
                content: (
                  <>
                    <div className="flex justify-end p-2 pb-0">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 transition hover:border-accent-violet/40 hover:text-white"
                      >
                        {t('profile.exportPdf')}
                      </button>
                    </div>
                    {mode === 'view' && savedProfile ? (
                <div className="glass-panel p-5">
                  {sync === 'success' && (
                    <p className="mb-3 text-sm text-emerald-300">{t('profile.saveSuccess')}</p>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
                        {savedProfile.avatarUrl ? (
                          <img src={savedProfile.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl text-ink-500">
                            {savedProfile.pseudo.trim().charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div>
                        <h2 className="font-sans text-lg font-semibold text-white">{savedProfile.pseudo}</h2>
                        <span className="mt-0.5 inline-block rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-300">
                          {AVAILABILITY_META[savedProfile.availability].emoji} {t(AVAILABILITY_META[savedProfile.availability].labelKey)}
                        </span>
                        {myRating && myRating.ratingCount > 0 && (
                          <div className="mt-1">
                            <StarRating value={myRating.avgStars} count={myRating.ratingCount} />
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProfile(savedProfile); setMode('edit'); setSync('idle'); }}
                      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 transition hover:border-accent-violet/40 hover:text-white"
                    >
                      {t('profile.editButton')}
                    </button>
                  </div>

                  {savedProfile.bio && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-300">{savedProfile.bio}</p>
                  )}

                  {savedProfile.skills.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-1.5 text-xs font-semibold text-white">{t('profile.skills')}</p>
                      <div className="flex flex-wrap gap-2">
                        {savedProfile.skills.map((id) => (
                          <span key={id} className="rounded-full border border-accent-violet/40 bg-violet-500/10 px-3 py-1 text-xs text-white">
                            {skillLabelWithLevel(id, savedProfile.skillLevels, t)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.entries(savedProfile.links).some(([, v]) => v) && (
                    <div className="mt-4">
                      <p className="mb-1.5 text-xs font-semibold text-white">{t('profile.links')}</p>
                      <ul className="space-y-1">
                        {Object.entries(savedProfile.links).filter(([, v]) => v).map(([k, v]) => (
                          <li key={k} className="text-xs text-ink-300">
                            <span className="text-ink-500">{k}:</span> {v}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                    ) : (
                <form
                className="glass-panel space-y-4 p-5"
                onSubmit={async (event: FormEvent) => {
                  event.preventDefault();
                  if (!profile.pseudo.trim() || profile.skills.length < 1 || !publicKey) return;
                  if (!signMessage) {
                    setSync('error');
                    setSyncError(t('profile.noSignMessage'));
                    return;
                  }
                  setSync('saving');
                  setSyncError(null);
                  const toSave = { ...profile, wallet: publicKey.toBase58(), updatedAt: Date.now() };
                  saveProfile(toSave); // brouillon local (cache offline), pas la source de vérité
                  const r = await submitProfileUpdate(publicKey.toBase58(), signMessage, toSave);
                  if ('error' in r) {
                    setSync('error');
                    setSyncError(r.error);
                  } else {
                    setSync('success');
                    setSavedProfile(toSave);
                    setProfile(toSave);
                    setMode('view');
                  }
                }}
              >
                <div>
                  <p className="text-xs font-semibold text-white">{t('profile.avatarLabel')}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/30">
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg text-ink-500">
                          {profile.pseudo.trim().charAt(0).toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[11px] text-ink-400">{t('profile.avatarSteps')}</p>
                      <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="w-full text-[11px] text-ink-400 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-white" />
                      <button
                        type="button"
                        onClick={async () => {
                          const file = avatarInputRef.current?.files?.[0];
                          if (!file || !publicKey) return;
                          if (!signMessage) { setSync('error'); setSyncError(t('profile.noSignMessage')); return; }
                          setAvatarUploading(true);
                          const r = await uploadProfileAvatar(publicKey.toBase58(), signMessage, file);
                          setAvatarUploading(false);
                          if ('error' in r) { setSync('error'); setSyncError(r.error); return; }
                          setProfile({ ...profile, avatarUrl: r.url });
                          if (avatarInputRef.current) avatarInputRef.current.value = '';
                        }}
                        disabled={avatarUploading}
                        className="mt-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-ink-300 transition hover:border-accent-violet/40 hover:text-white disabled:opacity-50"
                      >
                        {avatarUploading ? t('profile.avatarUploading') : t('profile.avatarChoose')}
                      </button>
                      <p className="mt-1 text-[10px] text-ink-500">{t('profile.avatarHint')}</p>
                    </div>
                  </div>
                </div>

                <label className="block text-xs font-semibold text-white">
                  {t('profile.pseudo')}
                  <input className={inputCls + ' mt-1'} maxLength={24} value={profile.pseudo} onChange={(e) => { setProfile({ ...profile, pseudo: e.target.value }); setSync('idle'); }} />
                </label>

                <label className="block text-xs font-semibold text-white">
                  {t('profile.bio')}
                  <textarea className={inputCls + ' mt-1'} rows={4} maxLength={280} value={profile.bio} onChange={(e) => { setProfile({ ...profile, bio: e.target.value }); setSync('idle'); }} />
                  <span className="text-[11px] text-ink-400">{profile.bio.length}/280</span>
                </label>

                <div>
                  <p className="text-xs font-semibold text-white">{t('profile.skills')}</p>
                  {ROLE_GROUPS.map((group) => (
                    <div className="mt-2" key={group.category}>
                      <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">{group.category}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.roles.map((role) => (
                          <button
                            type="button"
                            key={role.id}
                            onClick={() => {
                              const selected = profile.skills.includes(role.id);
                              const skills = selected ? profile.skills.filter((x) => x !== role.id) : [...profile.skills, role.id];
                              const skillLevels = { ...profile.skillLevels };
                              if (selected) {
                                // Skill retirée : son niveau n'a plus de sens, on nettoie.
                                delete skillLevels[role.id];
                              } else if (!skillLevels[role.id]) {
                                // Nouvelle skill : niveau par défaut "confirmé".
                                skillLevels[role.id] = 'confirme';
                              }
                              setProfile({ ...profile, skills, skillLevels });
                              setSync('idle');
                            }}
                            className={`rounded-full border px-3 py-1 text-xs transition ${profile.skills.includes(role.id) ? 'border-accent-violet/60 bg-violet-500/20 text-white' : 'border-white/10 text-ink-300 hover:text-white'}`}
                          >
                            {role.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {profile.skills.length < 1 && <p className="mt-1 text-[11px] text-red-400">{t('profile.skillsRequired')}</p>}

                  {profile.skills.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
                      <p className="text-[11px] font-semibold text-ink-300">{t('profile.skillLevelsHeading')}</p>
                      {profile.skills.map((id) => (
                        <div key={id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-ink-200">{roleLabel(id)}</span>
                          <div className="flex gap-1.5">
                            {SKILL_LEVELS.map((lvl) => (
                              <button
                                type="button"
                                key={lvl}
                                onClick={() => {
                                  setProfile({ ...profile, skillLevels: { ...profile.skillLevels, [id]: lvl } });
                                  setSync('idle');
                                }}
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${(profile.skillLevels[id] ?? 'confirme') === lvl ? 'border-accent-neon/60 bg-emerald-500/15 text-white' : 'border-white/10 text-ink-400 hover:text-white'}`}
                              >
                                {t(SKILL_LEVEL_META[lvl].labelKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-white">{t('profile.links')}</p>
                  <div className="mt-2 space-y-2">
                    {(['github', 'twitter', 'portfolio'] as const).map((link) => (
                      <input
                        key={link}
                        className={inputCls}
                        placeholder={link}
                        // type="text" et pas "url" : un handle comme "@pseudo"
                        // n'est pas une URL valide au sens strict du navigateur.
                        // Avec type="url", le navigateur bloquait TOUT le
                        // formulaire silencieusement (popup "Veuillez saisir
                        // une URL") avant même que le clic sur "Enregistrer"
                        // ne déclenche la demande de signature — d'où
                        // l'impression que "signer ne fait rien". Rien côté
                        // serveur n'exige un format URL strict (update-profile
                        // stocke la chaîne telle quelle).
                        type="text"
                        value={profile.links[link] ?? ''}
                        onChange={(e) => { setProfile({ ...profile, links: { ...profile.links, [link]: e.target.value } }); setSync('idle'); }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-white">{t('profile.availability')}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(Object.entries(AVAILABILITY_META) as Array<[BuilderProfile['availability'], { emoji: string; labelKey: string }]>).map(([id, meta]) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() => { setProfile({ ...profile, availability: id }); setSync('idle'); }}
                        className={`rounded-lg border px-3 py-2 text-xs transition ${profile.availability === id ? 'border-emerald-400 bg-emerald-500/15 text-white' : 'border-white/10 text-ink-300 hover:text-white'}`}
                      >
                        {meta.emoji} {t(meta.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  {savedProfile && (
                    <button
                      type="button"
                      onClick={() => { setProfile(savedProfile); setMode('view'); setSync('idle'); }}
                      className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-ink-300 transition hover:text-white"
                    >
                      {t('profile.cancelEdit')}
                    </button>
                  )}
                  <button
                    className="flex-1 rounded-lg bg-accent-neon py-2.5 text-sm font-bold text-ink-900 transition hover:opacity-90 disabled:opacity-50"
                    type="submit"
                    disabled={sync === 'saving'}
                  >
                    {sync === 'saving' ? t('profile.saving') : t('profile.saveButton')}
                  </button>
                </div>

                {sync === 'success' && (
                  <p className="text-sm text-emerald-300">{t('profile.saveSuccess')}</p>
                )}
                {sync === 'error' && (
                  <p className="text-sm text-red-400">
                    {t('profile.saveErrorPrefix')} {syncError} {!isRemoteEnabled && `(${t('errors.notConfigured')})`}
                  </p>
                )}
              </form>
                    )}
                  </>
                ),
                defaultLayout: { x: 0, y: 0, w: 12, h: 20, minW: 6, minH: 12 },
              },
              {
                id: 'pacts',
                content: <MesPactsEtGains />,
                // 19/09 — defaultLayout de tous les blocs remplacé par
                // l'arrangement choisi manuellement par l'utilisateur (grille
                // pleine largeur, 2 colonnes de 6 par endroits), décalé de
                // +20 pour laisser la place à profileCard au-dessus.
                // Uniquement la valeur de DÉPART pour un profil qui n'a
                // encore jamais sauvegardé de layout perso (loadLayout()
                // dans FreeGrid.tsx ne lit ces valeurs QUE si rien n'existe
                // déjà en localStorage pour ce wallet) — un utilisateur qui
                // a déjà personnalisé sa grille garde SA disposition,
                // inchangée (profileCard y compris).
                defaultLayout: { x: 0, y: 37, w: 6, h: 8, minW: 4, minH: 4 },
              },
              ...(publicKey
                ? [
                    {
                      id: 'contact',
                      content: <ContactInbox wallet={publicKey.toBase58()} signMessage={signMessage} />,
                      defaultLayout: { x: 6, y: 20, w: 6, h: 9, minW: 4, minH: 4 },
                    },
                    {
                      id: 'chat',
                      content: <ChatSessionsPanel wallet={publicKey.toBase58()} />,
                      defaultLayout: { x: 0, y: 29, w: 12, h: 8, minW: 4, minH: 4 },
                    },
                    {
                      id: 'progression',
                      content: <ProgressionPanel wallet={publicKey.toBase58()} />,
                      defaultLayout: { x: 0, y: 20, w: 6, h: 9, minW: 4, minH: 5 },
                    },
                    {
                      id: 'quests',
                      content: <QuestBoard wallet={publicKey.toBase58()} />,
                      defaultLayout: { x: 0, y: 51, w: 12, h: 12, minW: 4, minH: 6 },
                    },
                    {
                      id: 'wallet',
                      content: <WalletPanel wallet={publicKey.toBase58()} />,
                      defaultLayout: { x: 6, y: 37, w: 6, h: 14, minW: 4, minH: 7 },
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}

      {/* `profile` est passé au modal : son "Enregistrer" joint donc le
          brouillon en cours (pseudo/bio non encore sauvegardés) au thème,
          en UNE seule signature. onSaved resynchronise les deux états pour
          que l'aperçu ne réaffiche pas la version d'avant. */}
      {settingsOpen && (
        <ProfileSettingsModal
          onClose={() => {
            setSettingsOpen(false);
            // Refermer doit AUSSI retirer `?settings=1`, sinon un
            // rechargement rouvrirait le panneau qu'on vient de fermer.
            // `replaceState` et pas `location.hash` : écrire le hash relance
            // un `hashchange`, qui rouvrirait le panneau dans la foulée.
            const brut = window.location.hash.replace(/^#/, '');
            if (!brut.includes('settings=1')) return;
            const i = brut.indexOf('?');
            const chemin = i === -1 ? brut : brut.slice(0, i);
            const params = new URLSearchParams(i === -1 ? '' : brut.slice(i + 1));
            params.delete('settings');
            const requete = params.toString();
            window.history.replaceState(null, '', `#${chemin}${requete ? `?${requete}` : ''}`);
          }}
          profile={profile}
          onSaved={(saved) => {
            setProfile(saved);
            setSavedProfile(saved);
          }}
        />
      )}
    </DashboardLayout>
  );
}
