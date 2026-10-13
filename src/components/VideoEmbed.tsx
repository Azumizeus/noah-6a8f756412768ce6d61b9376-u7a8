// src/components/VideoEmbed.tsx
// ═══════════════════════════════════════════════════════════════════
// Vidéo de présentation founder — embed responsive 16:9 d'un lien YouTube/
// Loom/Vimeo (voir toEmbedUrl dans lib/media.ts). Rendu volontairement
// séparé de PactCard : PactCard sert aussi dans une grille (PactsPage) où
// charger un <iframe> par carte serait lourd — ce composant n'est monté
// que sur la fiche publique unique (PactPublicPage), la vitrine démo.
// ═══════════════════════════════════════════════════════════════════
import { toEmbedUrl } from '../lib/media';

interface Props {
  url: string | null | undefined;
  title?: string;
}

export default function VideoEmbed({ url, title = 'Vidéo de présentation du projet' }: Props) {
  if (!url) return null;
  const embedUrl = toEmbedUrl(url);
  if (!embedUrl) return null;

  return (
    <div className="glass-panel overflow-hidden rounded-2xl border border-white/5 p-0">
      <div className="relative w-full pt-[56.25%]">
        <iframe
          src={embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </div>
  );
}
