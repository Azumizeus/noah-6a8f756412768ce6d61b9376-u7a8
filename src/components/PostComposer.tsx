// src/components/PostComposer.tsx
// ═══════════════════════════════════════════════════════════════════
// Composeur du Réseau Builders : texte, image optionnelle, pact de
// référence optionnel.
//
// ⚠️ DEUX signatures wallet quand une image est jointe, pas une seule :
// uploadPostImage() signe pour obtenir son URL d'upload signée, puis
// createPost() re-signe pour écrire le post. L'image DOIT être en ligne
// avant l'insert (la colonne image_url est écrite en une passe côté Edge
// Function). Fusionner imposerait de faire écrire le post par
// `network-write` au moment de l'upload — changement de contrat serveur,
// pas de simple refacto front. Le texte d'aide sous le bouton prévient
// l'utilisateur, faute de mieux.
//
// ⚠️ Le sélecteur de pact passe par filterVisiblePacts() (voir
// src/lib/hiddenPacts.ts) : c'est PRÉCISÉMENT cette surface qui avait
// laissé réapparaître les pacts de test, parce que la liste noire était
// enfermée dans useProjects.ts. Ne jamais lister de pacts ici sans ce
// filtre, même si useProjects() le fait déjà en amont — la redondance est
// volontaire, elle rend la règle visible à l'endroit du bug.
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useRef, useState } from 'react';
import type { NetworkPost, SignMessageFn } from '../lib/network';
import { createPost, uploadPostImage, validatePostImage, MAX_POST_BODY } from '../lib/network';
import { filterVisiblePacts } from '../lib/hiddenPacts';
import { useProjects } from '../hooks/useProjects';
import { useLanguage } from '../lib/i18n/LanguageContext';

interface Props {
  myWallet: string | null;
  signMessage: SignMessageFn | undefined;
  onPosted: (post: NetworkPost) => void;
}

export default function PostComposer({ myWallet, signMessage, onPosted }: Props) {
  const { t, lang } = useLanguage();
  const { pacts } = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);

  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [linkedPda, setLinkedPda] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seconde application de la liste noire — voir en-tête.
  const selectablePacts = useMemo(
    () => filterVisiblePacts(pacts, (p) => p.pda),
    [pacts]
  );

  const canPost = Boolean(myWallet && signMessage) && body.trim().length > 0 && !busy;

  function pickFile(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    const invalid = validatePostImage(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleSubmit() {
    if (!myWallet || !signMessage || !canPost) return;
    setBusy(true);
    setError(null);

    let imageUrl: string | undefined;
    if (file) {
      const up = await uploadPostImage(myWallet, signMessage, file);
      if ('error' in up) {
        setError(up.error);
        setBusy(false);
        return;
      }
      imageUrl = up.url;
    }

    const r = await createPost(myWallet, signMessage, body, {
      imageUrl,
      linkedProjectPda: linkedPda || undefined,
    });
    setBusy(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }

    onPosted({
      id: r.id,
      authorWallet: myWallet,
      body: body.trim(),
      imageUrl: imageUrl ?? null,
      linkedProjectPda: linkedPda || null,
      createdAt: new Date().toISOString(),
      // Doit refléter ce que createPost() vient d'écrire en base, sinon
      // l'affichage optimiste traduirait un post qu'on sait déjà dans la
      // bonne langue.
      lang,
    });

    setBody('');
    setLinkedPda('');
    clearImage();
  }

  if (!myWallet || !signMessage) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-5 text-sm text-ink-400">
        {t('network.connectToPost')}
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/5 p-5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_POST_BODY))}
        placeholder={t('network.composerPlaceholder')}
        rows={3}
        className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-ink-500 focus:border-accent-violet/40 focus:outline-none"
      />

      <div className="mt-1 text-right font-mono text-[10px] text-ink-500">
        {t('network.charsLeft', { n: MAX_POST_BODY - body.length })}
      </div>

      {previewUrl && (
        <div className="relative mt-2 overflow-hidden rounded-xl border border-white/5">
          <img src={previewUrl} alt="" className="max-h-64 w-full object-cover" />
          <button
            type="button"
            onClick={clearImage}
            className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white transition hover:bg-black"
          >
            {t('network.composerImageRemove')}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-ink-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          🖼️ {t('network.composerImageAdd')}
        </button>

        {selectablePacts.length > 0 && (
          <select
            value={linkedPda}
            onChange={(e) => setLinkedPda(e.target.value)}
            disabled={busy}
            className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-ink-300 focus:border-accent-violet/40 focus:outline-none disabled:opacity-50"
          >
            <option value="">{t('network.composerLinkPact')}</option>
            {selectablePacts.map((p) => {
              const key = p.pda.toBase58();
              return (
                <option key={key} value={key}>
                  {p.title}
                </option>
              );
            })}
          </select>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canPost}
          className="btn-primary ml-auto rounded-full px-4 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('network.posting') : t('network.postButton')}
        </button>
      </div>

      {file && (
        <p className="mt-2 text-[10px] text-ink-500">{t('network.twoSignaturesHint')}</p>
      )}

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
