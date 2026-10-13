// src/components/BrandLogo.tsx
// ═══════════════════════════════════════════════════════════════════
// Logo de marque BuildPact — icône SVG adaptée aux thèmes premium
// (ivory/atelier/nordic) via les variables CSS --p-accent.
// Icône ET wordmark renvoient au Dashboard premium (#/). La landing
// legacy (#/home) n'est plus servie : elle affichait l'ancien design sombre.
// ═══════════════════════════════════════════════════════════════════

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="BuildPact"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* Fond : encre du thème (sombre sur clair) + contour accent */}
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        fill="var(--p-ink, #0A0A18)"
        stroke="var(--p-accent, #9945FF)"
        strokeOpacity="0.55"
      />
      {/* "P" en accent du thème (violet / laiton / aqua) */}
      <path
        d="M10 22V10h6a4 4 0 0 1 0 8h-3"
        stroke="var(--p-accent, #14F195)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Point : contraste chaud constant */}
      <circle cx="22" cy="11" r="2" fill="#FFD700" />
    </svg>
  );
}

/**
 * Wordmark "BuildPact" en deux couleurs adaptées au thème :
 * "Build" reprend l'encre du contexte (var(--p-ink)) et "Pact"
 * utilise l'accent du thème actif (var(--p-accent)).
 */
export function BrandWordmark({
  fontSize = 17,
}: {
  fontSize?: number;
}) {
  return (
    <span
      style={{
        fontWeight: 800,
        letterSpacing: '-0.02em',
        fontSize,
        color: 'var(--p-ink)',
        lineHeight: 1,
      }}
    >
      Build<span style={{ color: 'var(--p-accent)' }}>Pact</span>
    </span>
  );
}

/**
 * Logo complet : icône + wordmark côte à côte.
 * Les deux renvoient au Dashboard premium (#/), pour ne plus jamais
 * déposer l'utilisateur sur l'ancien design sombre.
 */
export default function BrandLogo({
  size = 32,
  fontSize = 17,
}: {
  size?: number;
  fontSize?: number;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <a
        href="#/"
        aria-label="BuildPact — Dashboard"
        style={{ display: 'inline-flex', textDecoration: 'none', lineHeight: 0 }}
      >
        <BrandMark size={size} />
      </a>
      <a
        href="#/"
        aria-label="BuildPact — Dashboard"
        style={{ textDecoration: 'none' }}
      >
        <BrandWordmark fontSize={fontSize} />
      </a>
    </span>
  );
}
