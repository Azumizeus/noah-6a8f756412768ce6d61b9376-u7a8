// src/pages/premium/PremiumProfil.tsx
// ═══════════════════════════════════════════════════════════════════
// V2 premium — Profil : fiche de VUE (read-only) par défaut.
// Le bouton « Modifier » ouvre le formulaire (pseudo, avatar, bannière,
// niveau) ; enregistrer demande une signature du wallet et écrit DEUX FOIS :
// en localStorage (cache de cet appareil, lisible hors-ligne) ET côté serveur
// via l'Edge Function `update-profile`, qui vérifie la signature. C'est la
// seule façon pour le changement d'apparaître dans l'annuaire des builders
// (`PremiumBuilders` lit Supabase) et sur les autres appareils — avant, la
// signature était demandée puis jetée, et rien ne quittait l'appareil.
// Le message signé n'est plus fabriqué ici : c'est le message canonique de
// `submitProfileUpdate` (wallet + horodatage, anti-replay), le seul que le
// serveur sait vérifier.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { loadProfile, saveProfile, AVAILABILITY_META, SKILL_LEVEL_META, SKILL_LEVELS, emptyProfile, type BuilderProfile, type SkillLevel } from '../../lib/profile';
import { readStoredProfile, writeStoredProfile, bootEditForm, commitEditForm, mergeIntoRemoteProfile, type EditableProfile } from '../../lib/profileForm';
import { fetchProfile, submitProfileUpdate, uploadProfileAvatar, isRemoteEnabled } from '../../lib/profileRemote';
import { ALL_ROLES } from '../../lib/roles';
import { useLanguage } from '../../lib/i18n/LanguageContext';
import PremiumNav from './PremiumNav';
// Bandeau d'identité : le dégradé de repli venait d'être recopié ici avec ses
// hex de thème sombre (chantier 4). Un profil n'a pas de statut de
// recrutement : on prend la teinte d'accent, celle du pact qui recrute.
import { bannerFallbackGradient, bannerImageStyle } from './projectCardMedia';
// Sessions de chat : la liste des jetons de CE navigateur et la révocation
// globale. C'était l'une des fonctions « perdues » de l'inventaire /v1 —
// elle vivait dans `MonProfilPage` (legacy) et n'avait aucun équivalent ici.
import PremiumChatSessions from './PremiumChatSessions';
// Les trois fonctions qui restaient derrière le portail /v1 (progression/XP
// et badges, quêtes et chronique, panneau wallet) sont désormais ici, en
// tokens --p-*. Le portail `#/v1/profile` n'avait plus de raison d'être : il
// ne lui restait que deux fonctions, l'avatar par FICHIER et l'export PDF,
// toutes deux migrées ci-dessous — c'est ce qui permet de retirer le lien
// sans retirer de fonction.
import PremiumProgression from './PremiumProgression';
import PremiumQuests from './PremiumQuests';
import PremiumWalletPanel from './PremiumWalletPanel';
import '../../styles/premium.css';

// Astuce CSS classique « n'imprimer qu'un seul élément » — la même que
// `MonProfilPage` (legacy), reprise telle quelle pour que l'export PDF donne
// le même résultat des deux côtés. Tout est masqué en impression SAUF
// #premium-profile-sheet. Aucune dépendance PDF ajoutée : window.print() puis
// « Enregistrer en PDF » du navigateur suffit, et c'était l'une des deux
// seules fonctions qui justifiaient encore de renvoyer vers /v1.
const PRINT_STYLE = `@media print {
  body * { visibility: hidden !important; }
  #premium-profile-sheet, #premium-profile-sheet * { visibility: visible !important; }
  #premium-profile-sheet {
    display: block !important;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    padding: 28px;
    border: 0;
    box-shadow: none;
  }
}`;

// Les 4 champs éditables et leur logique (lecture/écriture/amorçage) vivent
// dans lib/profileForm.ts — extraits ici pour être testables sans navigateur.
// Ce composant ne fait plus que les brancher sur l'état React et localStorage.

export default function PremiumProfil() {
  const { t } = useLanguage();
  const { publicKey, signMessage: walletSignMessage } = useWallet();
  const myAddr = publicKey?.toBase58() ?? '';

  // Profil lu on-chain / local (cache offline)
  //
  // ⚠️ 20/10 : la page ne lisait QUE le localStorage. Un cache vidé (ou
  // simplement absent sur un autre appareil) affichait un profil vide — alors
  // que la ligne serveur (`builder_profiles`) existait toujours et que le
  // profil restait visible dans l'annuaire des builders. La SOURCE DE VÉRITÉ
  // est le serveur ; le localStorage n'est qu'un cache. On lit donc les deux :
  // le cache d'abord (rendu instantané, hors-ligne), le serveur en repli et en
  // rafraîchissement, et le remote est recaché pour que les deux restent
  // d'accord.
  const [remoteProfile, setRemoteProfile] = useState<BuilderProfile | null>(null);
  useEffect(() => {
    if (!myAddr || !isRemoteEnabled) {
      setRemoteProfile(null);
      return;
    }
    let cancelled = false;
    fetchProfile(myAddr).then((p) => {
      if (cancelled) return;
      setRemoteProfile(p);
      // Le remote devient le cache local : sans cela, la page resterait
      // « vide » à chaque rechargement tant que le cache n'est pas repeuplé.
      if (p && !loadProfile(myAddr)) saveProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [myAddr]);

  const profile: BuilderProfile = useMemo(() => {
    const local = loadProfile(myAddr);
    if (local) return local;
    return remoteProfile ?? emptyProfile(myAddr);
  }, [myAddr, remoteProfile]);

  // Ce qui est enregistré : stockage local d'abord, sinon la chaîne.
  const saved = useMemo<EditableProfile>(() => {
    const stored = myAddr ? readStoredProfile(localStorage, myAddr) : null;
    const levelFromChain = (Object.keys(profile.skillLevels) as SkillLevel[]).find((k) => profile.skillLevels[k]) ?? null;
    return {
      pseudo: stored?.pseudo || profile.pseudo || '',
      avatarUrl: stored?.avatarUrl || profile.avatarUrl || '',
      bannerUrl: stored?.bannerUrl || profile.bannerUrl || '',
      skillLevel: stored?.skillLevel ?? levelFromChain,
    };
  }, [myAddr, profile]);

  // Dernier enregistrement de la session : prioritaire sur `saved` le temps
  // que le profil on-chain se rafraîchisse. Remis à zéro au changement de
  // wallet, sinon le profil du wallet précédent resterait affiché.
  const [justSaved, setJustSaved] = useState<EditableProfile | null>(null);
  useEffect(() => { setJustSaved(null); }, [myAddr]);
  const displayed = justSaved ?? saved;

  const [isEditing, setIsEditing] = useState(false);
  // États du formulaire : vides tant qu'il est fermé, amorcés par startEdit().
  const [editingPseudo, setEditingPseudo] = useState('');
  const [editingAvatarUrl, setEditingAvatarUrl] = useState('');
  const [editingBannerUrl, setEditingBannerUrl] = useState('');
  const [editingSkillLevel, setEditingSkillLevel] = useState<SkillLevel | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Enregistrement serveur en cours : le bouton se verrouille le temps de
  // l'aller-retour, sinon un double clic envoie deux écritures.
  const [isSaving, setIsSaving] = useState(false);
  // Upload d'avatar par FICHIER (et pas seulement par URL) : c'était l'une des
  // deux seules fonctions qui n'existaient que sous /v1. Le fichier part vers
  // `uploadProfileAvatar` (lib/profileRemote), le même appel signé que le
  // legacy — donc un avatar changé ici apparaît dans l'annuaire, et
  // inversement.
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ----- Ouverture du formulaire -----
  // Amorce le formulaire à l'OUVERTURE, pas à l'initialisation du composant :
  // au premier rendu le wallet n'est pas encore connecté, donc `profile` est
  // vide et les champs s'ouvraient blancs.
  const startEdit = () => {
    const form = bootEditForm(displayed);
    setEditingPseudo(form.pseudo);
    setEditingAvatarUrl(form.avatarUrl);
    setEditingBannerUrl(form.bannerUrl);
    setEditingSkillLevel(form.skillLevel);
    setStatus(null);
    setIsEditing(true);
  };

  // ----- Enregistrement -----
  const handleSave = async () => {
    const values: EditableProfile = commitEditForm({
      pseudo: editingPseudo,
      avatarUrl: editingAvatarUrl,
      bannerUrl: editingBannerUrl,
      skillLevel: editingSkillLevel,
    });

    // 1. Valider que le pseudo n'est pas vide
    if (!values.pseudo) {
      setStatus(t('profile.pseudoRequired'));
      return;
    }

    // 2. Le wallet est indispensable : c'est lui qui signe l'écriture
    //    distante. Pas de repli « signature factice » — un wallet incapable
    //    de signer doit faire échouer l'enregistrement, pas le simuler.
    if (!myAddr || !walletSignMessage) {
      setStatus(t('profile.noSignMessage'));
      return;
    }

    // 3. Cache local d'abord : la fiche se met à jour tout de suite, et le
    //    profil reste lisible hors-ligne même si le serveur est injoignable.
    writeStoredProfile(localStorage, myAddr, values);
    setJustSaved(values);
    setIsEditing(false);

    // 4. Écriture DISTANTE — c'est elle qui rend le changement visible dans
    //    l'annuaire des builders et sur les autres appareils.
    if (!isRemoteEnabled) {
      // Serveur non configuré (poste sans Supabase) : on le DIT, plutôt que
      // d'annoncer un succès qui ne quitte pas l'appareil.
      setStatus(t('profile.savedLocal'));
      return;
    }

    setIsSaving(true);
    setStatus(t('profile.saving'));
    try {
      // On repart du profil DISTANT courant, jamais d'un objet bâti avec les
      // seuls champs du formulaire : `submitProfileUpdate` envoie le profil
      // entier, donc un objet partiel effacerait en base les champs non
      // édités ici (bio, liens, disponibilité, palette de thème).
      const base = (await fetchProfile(myAddr)) ?? emptyProfile(myAddr);
      const r = await submitProfileUpdate(
        myAddr,
        // Signature du message canonique fabriqué par `submitProfileUpdate`
        // (wallet + horodatage) : le seul que l'Edge Function sait vérifier.
        walletSignMessage,
        mergeIntoRemoteProfile(base, values)
      );
      if ('error' in r) {
        // L'échec distant n'annule pas le cache local, mais il doit se voir :
        // sinon l'utilisateur croit son profil publié dans l'annuaire. On
        // rouvre le formulaire pour qu'il puisse réessayer.
        setStatus(r.error);
        setIsEditing(true);
        return;
      }
      setStatus(t('profile.savedRemote'));
    } catch {
      setStatus(t('profile.saveFailed'));
      setIsEditing(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Restaure les valeurs enregistrées : le formulaire partageait son état
    // avec la fiche, donc une saisie abandonnée restait affichée après
    // l'annulation.
    const saved = bootEditForm(displayed);
    setEditingPseudo(saved.pseudo);
    setEditingAvatarUrl(saved.avatarUrl);
    setEditingBannerUrl(saved.bannerUrl);
    setEditingSkillLevel(saved.skillLevel);
    setStatus(null);
    setIsEditing(false);
  };

  // ----- Formatage niveau compétence -----
  function formatSkillLevel(level: string | null): string {
    if (!level) return t('profile.skillLevelNone'); // clé i18n optionnelle
    const meta = SKILL_LEVEL_META[level as keyof typeof SKILL_LEVEL_META];
    return meta ? t(meta.labelKey) : level;
  }

  return (
    <div className="p-page">
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '28px 24px 96px', position: 'relative' }}>
        <PremiumNav active="#/profile" />

        <p className="p-eyebrow">{t('profile.eyebrow')}</p>
        <h1 style={{ fontFamily: 'var(--p-font-display)', fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, marginTop: 10 }}>
          {t('v2.profile.titleLine1')} <span style={{ color: 'var(--p-accent)' }}>{t('v2.profile.titleLine2')}</span>.
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--p-ink3)', marginTop: 8 }}>{myAddr ? format(myAddr) : '—'}</p>

        <style>{PRINT_STYLE}</style>

        {/* Bandeau d'identité — bannière réelle si disponible. `id` fixé pour
            l'impression : c'est la seule zone visible sur le PDF (PRINT_STYLE). */}
        <article id="premium-profile-sheet" className="p-card" style={{ marginTop: 22 }}>
          <div
            style={{
              height: 110,
              position: 'relative',
              background: bannerFallbackGradient(true),
              // Ici le parent est en flux normal et non en grille : l'image
              // remplissait déjà la boîte. La découpe est posée quand même,
              // pour que le cas « bannière carrée » ne dépende pas du hasard
              // de la mise en page du parent.
              overflow: 'hidden',
            }}
          >
            {isEditing ? (
              /* Aperçu live de la valeur en cours de saisie */
              editingBannerUrl && (
                <img src={editingBannerUrl} alt="" style={bannerImageStyle()} />
              )
            ) : (
              displayed.bannerUrl && (
                <img src={displayed.bannerUrl} alt="" style={bannerImageStyle()} />
              )
            )}
          </div>
          <div className="body" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Champ avatar (éditable ou display) */}
              {isEditing ? (
                <input
                  type="text"
                  value={editingAvatarUrl || ''}
                  onChange={(e) => setEditingAvatarUrl(e.target.value)}
                  style={{
                    width: 60, height: 60, borderRadius: 99, border: '1px solid var(--p-line)',
                    display: 'grid', placeItems: 'center', background: editingAvatarUrl ? 'var(--p-accent-soft)' : 'var(--p-canvas)',
                    color: 'var(--p-ink)', fontSize: 12, fontWeight: 700, marginTop: -34, boxShadow: 'var(--p-shadow)',
                  }}
                  placeholder="URL image"
                  aria-label="Avatar URL"
                />
              ) : displayed.avatarUrl ? (
                <img
                  src={displayed.avatarUrl}
                  alt=""
                  style={{
                    width: 60, height: 60, borderRadius: 99, border: '1px solid var(--p-line)', objectFit: 'cover', marginTop: -34, boxShadow: 'var(--p-shadow)',
                  }}
                />
              ) : (
                <span
                  style={{
                    width: 60, height: 60, borderRadius: 99,
                    display: 'grid', placeItems: 'center',
                    background: 'var(--p-accent-soft)', color: 'var(--p-accent)', fontWeight: 800, fontSize: 22, marginTop: -34, boxShadow: 'var(--p-shadow)',
                  }}
                >
                  {(isEditing ? editingPseudo : displayed.pseudo).trim().charAt(0).toUpperCase() || '?' }
                </span>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
                <span className={'p-pill ' + (profile.availability === 'open' ? 'ok' : 'warn')} style={{ fontSize: 10.5 }}>
                  {t(AVAILABILITY_META[profile.availability].labelKey)}
                </span>
                {displayed.skillLevel && (
                  <span className="p-pill" style={{ fontSize: 10.5, background: 'var(--p-bg)', color: 'var(--p-ink2)' }}>
                    {t('profile.skillLevel')} · {formatSkillLevel(displayed.skillLevel)}
                  </span>
                )}
                {profile.links.github && (
                  <a href={profile.links.github} target="_blank" rel="noreferrer" className="p-pill" style={{ background: 'var(--p-bg)', color: 'var(--p-ink2)', textDecoration: 'none' }}>GitHub ↗</a>
                )}
                {profile.links.portfolio && (
                  <a href={profile.links.portfolio} target="_blank" rel="noreferrer" className="p-pill" style={{ background: 'var(--p-bg)', color: 'var(--p-ink2)', textDecoration: 'none' }}>Portfolio ↗</a>
                )}
              </div>
            </div>

            {/* Formulaire d'édition */}
            {isEditing && (
              <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--p-canvas)', border: '1px solid var(--p-line)', borderRadius: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--p-ink3)', marginBottom: 8 }}>
                  {t('profile.editForm')} {/* clé i18n optionnelle */}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--p-ink2)', marginBottom: 4 }}>{t('profile.pseudo')} {isEditing && <span style={{ color: 'var(--p-err)'}}>*</span>}</label>
                    <input
                      type="text"
                      value={editingPseudo}
                      onChange={(e) => setEditingPseudo(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid var(--p-line)', borderRadius: 6, background: 'var(--p-canvas)', color: 'var(--p-ink)',
                      }}
                      aria-label="Pseudo"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--p-ink2)', marginBottom: 4 }}>{t('profile.avatar')}:</label>
                    <input
                      type="text"
                      value={editingAvatarUrl || ''}
                      onChange={(e) => setEditingAvatarUrl(e.target.value)}
                      style={{
                        width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid var(--p-line)', borderRadius: 6, background: 'var(--p-canvas)', color: 'var(--p-ink)',
                      }}
                      aria-label="URL avatar"
                    />
                  </div>
                </div>

                {/* Avatar par fichier — l'autre fonction qui ne vivait que
                    sous /v1. Elle est placée dans le formulaire d'édition
                    (comme en legacy) : un upload est une écriture signée,
                    pas une action de consultation. */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--p-ink2)', marginBottom: 4 }}>
                    {t('profile.avatarLabel')}
                  </label>
                  <p style={{ fontSize: 10.5, color: 'var(--p-ink3)', margin: '0 0 6px' }}>{t('profile.avatarSteps')}</p>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ fontSize: 11, color: 'var(--p-ink2)' }}
                  />
                  <button
                    type="button"
                    disabled={avatarUploading}
                    onClick={async () => {
                      const file = avatarInputRef.current?.files?.[0];
                      if (!file) return;
                      if (!myAddr || !walletSignMessage) {
                        setStatus(t('profile.noSignMessage'));
                        return;
                      }
                      setAvatarUploading(true);
                      const r = await uploadProfileAvatar(myAddr, walletSignMessage, file);
                      setAvatarUploading(false);
                      if ('error' in r) {
                        setStatus(r.error);
                        return;
                      }
                      // L'URL renvoyée n'est PAS enregistrée en profil : on la
                      // pose dans le formulaire pour que l'utilisateur voie ce
                      // qu'il envoie, et c'est « Enregistrer » qui persiste le
                      // profil (une seule écriture signée à expliquer).
                      setEditingAvatarUrl(r.url);
                      if (avatarInputRef.current) avatarInputRef.current.value = '';
                      setStatus(t('profile.avatarUploaded'));
                    }}
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--p-ink2)',
                      background: 'transparent',
                      border: '1px solid var(--p-line)',
                      borderRadius: 99,
                      padding: '5px 12px',
                      cursor: avatarUploading ? 'wait' : 'pointer',
                      opacity: avatarUploading ? 0.6 : 1,
                    }}
                  >
                    {avatarUploading ? t('profile.avatarUploading') : t('profile.avatarChoose')}
                  </button>
                  <p style={{ fontSize: 10.5, color: 'var(--p-ink3)', marginTop: 4 }}>{t('profile.avatarHint')}</p>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--p-ink2)', marginBottom: 4 }}>{t('profile.banner')}:</label>
                  <input
                    type="text"
                    value={editingBannerUrl || ''}
                    onChange={(e) => setEditingBannerUrl(e.target.value)}
                    style={{
                      width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid var(--p-line)', borderRadius: 6, background: 'var(--p-canvas)', color: 'var(--p-ink)',
                    }}
                    aria-label="URL banner"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--p-ink2)', marginBottom: 4 }}>{t('profile.skillLevel')}:</label>
                  <select
                    style={{
                      width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid var(--p-line)', borderRadius: 6, background: 'var(--p-canvas)', color: 'var(--p-ink)',
                      appearance: 'none',
                    }}
                    value={editingSkillLevel ?? ''}
                    onChange={(e) => setEditingSkillLevel((e.target.value || null) as SkillLevel | null)}
                  >
                    <option value="">{t('profile.skillLevelNone')}</option>
                    {/* Valeurs = SkillLevel de lib/profile.ts. Les options
                        précédentes (beginner/intermediate/expert) n'en étaient
                        pas : la valeur enregistrée n'était donc jamais
                        réaffichée, et un niveau valide ne pouvait pas être
                        choisi. */}
                    {SKILL_LEVELS.map((level) => (
                      <option key={level} value={level}>{t(SKILL_LEVEL_META[level].labelKey)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Données affichage normal (hors édition) */}
            {!isEditing && (
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--p-ink)' }}>{displayed.pseudo || '—'}</h2>
                <p style={{ fontSize: 13, color: 'var(--p-ink2)', lineHeight: 1.7, marginTop: 6 }}>
                  {/* Le pseudo était affiché à la place de la bio */}
                  {profile.bio || t('profile.emptyBio')}
                </p>

                {profile.skills.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {profile.skills.map((id: string) => (
                      <span key={id} style={{ fontSize: 11, fontWeight: 600, color: 'var(--p-ink2)', border: '1px solid var(--p-line)', borderRadius: 99, padding: '4px 10px' }}>
                        {ALL_ROLES.find((r) => r.id === id)?.label ?? id}
                        {profile.skillLevels[id] && <span style={{ color: 'var(--p-ink3)' }} > {formatSkillLevel(profile.skillLevels[id])}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Message d'état : validation, signature refusée, succès */}
            {status && (
              <p role="status" style={{ fontSize: 12, color: 'var(--p-ink2)', marginTop: 10 }}>{status}</p>
            )}

            {/* Boutons d'action */}
            <div className="p-actions" style={{ marginTop: 14 }}>
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--p-accent-ink, #fff)',
                      background: 'var(--p-accent)', border: 'none', borderRadius: 99, padding: '8px 16px',
                      cursor: isSaving ? 'wait' : 'pointer', opacity: isSaving ? 0.6 : 1,
                      marginRight: 6,
                    }}
                  >
                    {isSaving ? t('profile.saving') : t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    style={{
                      fontSize: 12, fontWeight: 550, color: 'var(--p-ink2)', background: 'transparent', border: '1px solid var(--p-line)', borderRadius: 99, padding: '8px 16px', cursor: 'pointer',
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <>
                  {/* Bouton d'entrée du formulaire : sans lui, tout l'éditeur
                      ci-dessus était inatteignable (setIsEditing(true)
                      n'était appelé nulle part). */}
                  <button
                    type="button"
                    onClick={startEdit}
                    disabled={!myAddr}
                    title={!myAddr ? t('profile.connectTitle') : undefined}
                    style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--p-accent-ink, #fff)',
                      background: 'var(--p-accent)', border: 'none', borderRadius: 99, padding: '8px 16px',
                      cursor: myAddr ? 'pointer' : 'not-allowed', opacity: myAddr ? 1 : 0.5,
                      marginRight: 6, WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {t('profile.editButton')}
                  </button>
                  {/* Export PDF — reprend `window.print()` du legacy sous le
                      même nom, donc plus besoin d'aller le chercher sous /v1
                      (voir PRINT_STYLE plus haut pour l'isolation à
                      l'impression). */}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{
                      fontSize: 12, fontWeight: 550, color: 'var(--p-ink2)',
                      background: 'transparent', border: '1px solid var(--p-line)',
                      borderRadius: 99, padding: '8px 16px', cursor: 'pointer',
                    }}
                  >
                    {t('profile.exportPdf')}
                  </button>
                </>
              )}
            </div>
          </div>
        </article>

        {/* Sessions de chat — seulement avec un wallet : sans adresse, la
            liste porterait sur le wallet de personne, et la révocation
            demanderait une signature impossible à produire. */}
        {myAddr && <PremiumChatSessions wallet={myAddr} />}

        {/* Progression / quêtes / wallet — les trois dernières fonctions du
            legacy. Montées seulement avec un wallet : sans adresse, elles
            liraient les données de personne, et la réclamation d'une quête
            demanderait une signature impossible à produire. */}
        {myAddr && <PremiumProgression wallet={myAddr} />}
        {myAddr && <PremiumQuests wallet={myAddr} />}
        {myAddr && <PremiumWalletPanel wallet={myAddr} />}

        {/* Editorial */}
        <p style={{ fontSize: 11.5, color: 'var(--p-ink3)', marginTop: 14, textAlign: 'center', maxWidth: 640, marginInline: 'auto' }}>
          {t('profile.v2Note')}
        </p>
      </div>
    </div>
  );
}

function format(addr: string): string {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}