// src/lib/rpcBannerStyles.ts
// ═══════════════════════════════════════════════════════════════════
// Tables de style du bandeau de santé RPC — extraites pour être TESTABLES.
//
// Pourquoi ce module existe : le bandeau est né dans le shell premium, où
// toutes les couleurs sont des variables `--p-*`. Le monter tel quel sur les
// pages legacy `/v1` n'aurait rien affiché du tout — `/v1` ne définit aucune
// variable `--p-*`, donc `color: var(--p-ink)` tombe en héritage et
// `background: var(--p-canvas)` sur TRANSPARENT. Un bandeau invisible est
// pire que pas de bandeau : il donne l'impression d'avoir vérifié. C'est
// précisément l'erreur qu'on vient de corriger, on ne la refait pas deux
// lignes plus bas.
//
// D'où deux variantes explicites :
//   • premium → styles EN LIGNE en `var(--p-*)`, comme avant, à l'octet près ;
//   • legacy  → CLASSES Tailwind, qui lisent les variables du shell /v1
//     (`--canvas-*-rgb`, `--ink-*-rgb`, `--accent-violet-rgb`, `--text-primary-rgb`)
//     et suivent donc gratuitement ses thèmes (Aurum, Atelier, mode clair).
//
// Module PUR (aucun import) : c'est ce qui permet de le charger sous Node
// dans scripts/rpc-health.test.ts et d'y affirmer les deux règles qui
// comptent — le legacy ne référence AUCUN token `--p-*`, et le premium n'a
// pas perdu les siens.
// ═══════════════════════════════════════════════════════════════════

export type VarianteBandeau = 'premium' | 'legacy';

/** Un style en ligne, tel que React l'accepte (`style={…}`). */
export type StyleEnLigne = Record<string, string | number>;

export interface StylesBandeau {
  containerStyle: StyleEnLigne;
  containerClass: string;
  iconeStyle: StyleEnLigne;
  iconeClass: string;
  texteStyle: StyleEnLigne;
  texteClass: string;
  titreStyle: StyleEnLigne;
  titreClass: string;
  causeStyle: StyleEnLigne;
  causeClass: string;
  heureStyle: StyleEnLigne;
  heureClass: string;
  actionsStyle: StyleEnLigne;
  actionsClass: string;
  principalStyle: StyleEnLigne;
  principalClass: string;
  secondaireStyle: StyleEnLigne;
  secondaireClass: string;
  masquerStyle: StyleEnLigne;
  masquerClass: string;
}

const VIDE: StyleEnLigne = {};

/**
 * Styles du bandeau pour une variante de shell.
 *
 * @param alerte vrai pour un incident (endpoint mort), faux pour une simple
 *   information de bascule — les deux tons ne doivent pas se ressembler.
 * @param enCours une sonde est en route : le bouton principal s'atténue.
 */
export function stylesBandeau(
  variante: VarianteBandeau,
  alerte: boolean,
  enCours: boolean
): StylesBandeau {
  if (variante === 'legacy') {
    return {
      containerStyle: VIDE,
      containerClass:
        'mb-6 flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 ' +
        (alerte ? 'border-red-400/30 bg-red-400/10' : 'border-white/10 bg-canvas-700/60'),
      iconeStyle: VIDE,
      iconeClass:
        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ' +
        (alerte ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-ink-200'),
      texteStyle: VIDE,
      texteClass: 'min-w-[240px] flex-1',
      titreStyle: VIDE,
      titreClass: 'm-0 text-[12.5px] font-bold ' + (alerte ? 'text-red-300' : 'text-ink-100'),
      causeStyle: VIDE,
      causeClass: 'mt-1 text-[11.5px] text-ink-300',
      heureStyle: VIDE,
      heureClass: 'mt-0.5 text-[10.5px] text-ink-400',
      actionsStyle: VIDE,
      actionsClass: 'flex flex-wrap items-center gap-2',
      principalStyle: VIDE,
      principalClass:
        'rounded-full bg-accent-violet px-3 py-1.5 text-[11px] font-semibold text-white ' +
        'transition hover:bg-accent-violet/90 disabled:opacity-60',
      secondaireStyle: VIDE,
      secondaireClass:
        'rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-ink-300 ' +
        'transition hover:text-white',
      masquerStyle: VIDE,
      masquerClass:
        'text-[11px] font-medium text-ink-400 underline underline-offset-2 transition hover:text-ink-200',
    };
  }

  const bordure = alerte ? 'var(--p-err)' : 'var(--p-line)';
  const commun: StyleEnLigne = {
    minHeight: 30,
    padding: '5px 12px',
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'Inter',sans-serif",
    cursor: 'pointer',
  };

  return {
    containerStyle: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: 12,
      margin: '0 0 24px',
      padding: '12px 16px',
      borderRadius: 14,
      border: `1px solid ${bordure}`,
      background: 'var(--p-canvas)',
      color: 'var(--p-ink)',
      fontFamily: "'Inter',sans-serif",
    },
    containerClass: '',
    iconeStyle: {
      flexShrink: 0,
      width: 22,
      height: 22,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 99,
      background: alerte ? 'var(--p-err)' : 'var(--p-line)',
      color: alerte ? '#fff' : 'var(--p-ink2)',
      fontSize: 12,
      fontWeight: 800,
    },
    iconeClass: '',
    texteStyle: { flex: 1, minWidth: 240 },
    texteClass: '',
    titreStyle: {
      margin: 0,
      fontSize: 12.5,
      fontWeight: 700,
      color: alerte ? 'var(--p-err)' : 'var(--p-ink2)',
    },
    titreClass: '',
    causeStyle: { margin: '5px 0 0', fontSize: 11.5, color: 'var(--p-ink3)' },
    causeClass: '',
    heureStyle: { margin: '3px 0 0', fontSize: 10.5, color: 'var(--p-ink3)' },
    heureClass: '',
    actionsStyle: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    actionsClass: '',
    principalStyle: {
      ...commun,
      border: 'none',
      background: 'var(--p-accent)',
      color: '#fff',
      opacity: enCours ? 0.6 : 1,
    },
    principalClass: '',
    secondaireStyle: {
      ...commun,
      border: '1px solid var(--p-line)',
      background: 'transparent',
      color: 'var(--p-ink2)',
    },
    secondaireClass: '',
    masquerStyle: {
      ...commun,
      border: 'none',
      background: 'transparent',
      color: 'var(--p-ink2)',
      textDecoration: 'underline',
    },
    masquerClass: '',
  };
}
