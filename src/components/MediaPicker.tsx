// src/components/MediaPicker.tsx
//
// Sélecteur d'image local (logo ou bannière) pour l'étape 1 du wizard.
//
// Comme QrCode, ce composant était importé par PactStep1 sans exister dans
// le projet — un import non résolu suffit à faire échouer le chargement de
// toute l'application, pas seulement du wizard.
//
// ── Ce que ce composant NE fait pas ──────────────────────────────────────
// Il n'uploade rien. Il remonte simplement un objet File au parent via
// `onChange`. L'upload réel se produit après la création du pact, dans
// handleCreate → uploadMediaFile (lib/media.ts) — parce que le chemin de
// stockage est indexé par le PDA du projet, qui n'existe pas encore au
// moment où l'utilisateur choisit son image.
//
// Ce découplage n'est pas cosmétique : depuis la fermeture du bucket
// (28/08), l'upload exige une URL signée émise par l'Edge Function, donc
// une signature wallet. Garder ce composant purement local évite de lui
// faire porter une dépendance au wallet pour un simple choix de fichier.

import { useEffect, useRef, useState } from 'react';
import { hintCls, labelCls } from './wizard/wizardShared';

interface Props {
  /** Détermine le format d'aperçu : carré pour un logo, 16:9 pour une bannière. */
  kind: 'logo' | 'banner';
  label: string;
  hint?: string;
  /** Image déjà enregistrée côté serveur — sert d'aperçu initial tant que
   *  l'utilisateur n'a pas choisi de nouveau fichier (cas EditMediaModal). */
  initialUrl?: string | null;
  onChange: (file: File | null) => void;
}

/** Garde-fou local. Supabase Storage refuse au-delà, mais bien plus tard. */
const MAX_BYTES = 2 * 1024 * 1024;

export default function MediaPicker({ kind, label, hint, initialUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // URL.createObjectURL réserve de la mémoire jusqu'à révocation explicite.
  // Sans ce cleanup, chaque changement d'image en fuit une — invisible en
  // démo, mais c'est le genre de détail qui traîne jusqu'en production.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = (file: File | null) => {
    setError(null);

    if (!file) {
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      onChange(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Format non supporté — choisis une image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image trop lourde (2 Mo maximum).');
      return;
    }

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    onChange(file);
  };

  const isLogo = kind === 'logo';
  // Aperçu affiché : le fichier fraîchement choisi s'il existe, sinon
  // l'image déjà en ligne. `preview` gagne toujours — c'est l'intention la
  // plus récente de l'utilisateur.
  const shownPreview = preview ?? initialUrl ?? null;

  return (
    <div>
      <span className={labelCls}>{label}</span>

      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={
            'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed ' +
            'border-white/15 bg-canvas-800/60 text-[10px] text-ink-400 transition-colors ' +
            'hover:border-accent-violet/50 hover:text-white ' +
            (isLogo ? 'h-16 w-16' : 'h-16 w-28')
          }
        >
          {shownPreview ? (
            <img src={shownPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>Choisir</span>
          )}
        </button>

        {preview && (
          <button
            type="button"
            onClick={() => handleFile(null)}
            className="text-[11px] text-ink-400 underline underline-offset-2 transition-colors hover:text-white"
          >
            Retirer
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      {hint && <small className={hintCls}>{hint}</small>}
      {error && <small className="mt-1 block text-[11px] text-red-400">{error}</small>}
    </div>
  );
}
