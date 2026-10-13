// src/components/EditMediaModal.tsx
// ═══════════════════════════════════════════════════════════════════
// Modale founder-only pour ajouter/remplacer le logo et la bannière d'un
// projet APRÈS sa création — même style que AddMemberModal (bg-[#0d0d15],
// border-purple-500/30). Pas de transaction on-chain.
//
// ⚠️ Une SIGNATURE wallet est désormais requise, y compris pour l'upload du
// FICHIER lui-même (migration 20260828190000 a fermé l'écriture publique du
// bucket) : le serveur vérifie la signature PUIS, on-chain, que le
// signataire est le founder, avant d'émettre une URL d'upload signée.
//
// Tout — logo, bannière, vidéo, à-propos — s'enregistre avec UNE SEULE
// signature wallet, réutilisée pour chaque appel (voir lib/media.ts) :
// signer une fois par champ aurait donné jusqu'à quatre popups d'affilée
// pour une seule sauvegarde.
// ═══════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  uploadMediaFile,
  saveProjectMedia,
  signMediaWrite,
  validateVideoUrl,
  validateAboutText,
  type ProjectMediaPatch,
} from '../lib/media';
import MediaPicker from './MediaPicker';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface Props {
  projectPda: string;
  projectTitle: string;
  currentLogoUrl?: string | null;
  currentBannerUrl?: string | null;
  currentVideoUrl?: string | null;
  currentAboutText?: string | null;
  currentAboutTextEn?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditMediaModal({
  projectPda,
  projectTitle,
  currentLogoUrl,
  currentBannerUrl,
  currentVideoUrl,
  currentAboutText,
  currentAboutTextEn,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useLanguage();
  const { publicKey, signMessage } = useWallet();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState(currentVideoUrl ?? '');
  const [aboutText, setAboutText] = useState(currentAboutText ?? '');
  const [aboutTextEn, setAboutTextEn] = useState(currentAboutTextEn ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const videoChanged = videoUrl.trim() !== (currentVideoUrl ?? '').trim();
  const videoError = videoChanged ? validateVideoUrl(videoUrl) : null;
  const aboutChanged = aboutText.trim() !== (currentAboutText ?? '').trim();
  const aboutError = aboutChanged ? validateAboutText(aboutText) : null;
  const aboutEnChanged = aboutTextEn.trim() !== (currentAboutTextEn ?? '').trim();
  const aboutEnError = aboutEnChanged ? validateAboutText(aboutTextEn) : null;

  const handleSave = async () => {
    if (!logoFile && !bannerFile && !videoChanged && !aboutChanged && !aboutEnChanged) {
      onClose();
      return;
    }
    if (videoError || aboutError || aboutEnError) {
      setError(videoError || aboutError || aboutEnError);
      return;
    }
    if (!publicKey || !signMessage) {
      setError("Connecte un wallet capable de signer un message pour enregistrer.");
      return;
    }
    setSaving(true);
    setError(null);

    // 0) Une signature pour tout le flux — réutilisée pour chaque upload de
    // fichier ET pour l'enregistrement final (voir lib/media.ts).
    const signed = await signMediaWrite(publicKey.toBase58(), projectPda, signMessage);
    if ('error' in signed) {
      setSaving(false);
      setError(signed.error);
      return;
    }

    // 1) Fichiers vers le bucket, chacun autorisé par la même signature.
    const patch: ProjectMediaPatch = {};
    if (logoFile) {
      const r = await uploadMediaFile(projectPda, logoFile, 'logo', signed);
      if ('error' in r) {
        setSaving(false);
        setError(`Logo : ${r.error}`);
        return;
      }
      patch.logoUrl = r.url;
    }
    if (bannerFile) {
      const r = await uploadMediaFile(projectPda, bannerFile, 'banner', signed);
      if ('error' in r) {
        setSaving(false);
        setError(`Bannière : ${r.error}`);
        return;
      }
      patch.bannerUrl = r.url;
    }
    // Chaîne vide volontaire = effacement côté serveur (retirer une vidéo).
    if (videoChanged) patch.pitchVideoUrl = videoUrl.trim();
    if (aboutChanged) patch.aboutText = aboutText.trim();
    if (aboutEnChanged) patch.aboutTextEn = aboutTextEn.trim();

    // 2) Une seule écriture signée pour l'ensemble des champs — même
    // signature que les uploads du dessus.
    const saved = await saveProjectMedia(
      projectPda,
      patch,
      { wallet: publicKey.toBase58(), signMessage },
      signed
    );

    setSaving(false);
    if ('error' in saved) {
      setError(saved.error);
      return;
    }
    setDone(true);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d0d15] border border-purple-500/30 rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{t('editMedia.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          {t('editMedia.project')} <span className="text-purple-400">{projectTitle}</span>
        </p>

        <div className="space-y-4">
          <MediaPicker
            kind="logo"
            label={t('editMedia.logoLabel')}
            hint={t('editMedia.logoHint')}
            initialUrl={currentLogoUrl}
            onChange={setLogoFile}
          />
          <MediaPicker
            kind="banner"
            label={t('editMedia.bannerLabel')}
            hint={t('editMedia.bannerHint')}
            initialUrl={currentBannerUrl}
            onChange={setBannerFile}
          />

          <div>
            <label htmlFor="pitch-video-url" className="mb-1 block text-sm font-medium text-white">
              {t('editMedia.videoLabel')}
            </label>
            <input
              id="pitch-video-url"
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder={t('editMedia.videoPlaceholder')}
              className="w-full rounded-lg border border-purple-500/30 bg-black/50 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {t('editMedia.videoHint')}
            </p>
            {videoChanged && videoError && (
              <p className="mt-1 text-[11px] text-red-400">{videoError}</p>
            )}
          </div>

          <div>
            <label htmlFor="about-text" className="mb-1 block text-sm font-medium text-white">
              À propos du projet — Français
            </label>
            <textarea
              id="about-text"
              value={aboutText}
              onChange={(e) => setAboutText(e.target.value)}
              placeholder="Décris ton projet en détail : contexte, roadmap, pourquoi investir..."
              maxLength={4000}
              rows={6}
              className="w-full resize-y rounded-lg border border-purple-500/30 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {aboutText.length}/4000 caractères — affiché quand l'app est en français.
            </p>
            {aboutChanged && aboutError && (
              <p className="mt-1 text-[11px] text-red-400">{aboutError}</p>
            )}
          </div>

          <div>
            <label htmlFor="about-text-en" className="mb-1 block text-sm font-medium text-white">
              About the project — English
            </label>
            <textarea
              id="about-text-en"
              value={aboutTextEn}
              onChange={(e) => setAboutTextEn(e.target.value)}
              placeholder="Describe your project in detail: context, roadmap, why invest..."
              maxLength={4000}
              rows={6}
              className="w-full resize-y rounded-lg border border-purple-500/30 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {aboutTextEn.length}/4000 characters — shown when the app is in English. Leave empty to fall back to the French version.
            </p>
            {aboutEnChanged && aboutEnError && (
              <p className="mt-1 text-[11px] text-red-400">{aboutEnError}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {done && (
          <div className="mt-3 bg-accent-neon/10 border border-accent-neon/30 rounded-lg p-3 text-sm text-accent-neon">
            {t('editMedia.saved')}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm font-medium"
            disabled={saving}
          >
            {done ? t('editMedia.close') : t('editMedia.cancel')}
          </button>
          {!done && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!logoFile && !bannerFile && !videoChanged && !aboutChanged && !aboutEnChanged)}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? t('editMedia.saving') : t('editMedia.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
