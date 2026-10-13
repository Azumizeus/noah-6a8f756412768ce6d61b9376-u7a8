// src/lib/ThemeContext.tsx
// ═══════════════════════════════════════════════════════════════════
// Contexte de thème d'accent. Doit être monté À L'INTÉRIEUR du
// WalletProvider : il lit `useWallet()` pour mémoriser le choix par
// wallet. Monté au-dessus, il planterait au rendu.
// ═══════════════════════════════════════════════════════════════════
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  applyTheme,
  loadTheme,
  saveTheme,
  DEFAULT_THEME,
  type ThemeId,
  applyMode,
  loadMode,
  saveMode,
  DEFAULT_MODE,
  type Mode,
  loadBackground,
  saveBackground,
  DEFAULT_BACKGROUND,
  type BackgroundStyle,
  loadPreviewEnabled,
  savePreviewEnabled,
  DEFAULT_PREVIEW_ENABLED,
  loadPreviewTrigger,
  savePreviewTrigger,
  DEFAULT_PREVIEW_TRIGGER,
  type PreviewTrigger,
  loadGlowStrength,
  saveGlowStrength,
  applyGlowStrength,
  DEFAULT_GLOW_STRENGTH,
  type GlowStrength,
} from './theme';

interface ThemeCtx {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  /** Fond de page — axe indépendant de la palette/mode, voir theme.ts. */
  background: BackgroundStyle;
  setBackground: (b: BackgroundStyle) => void;
  /** Aperçu grand format logo/bannière — pas de scope par wallet (préférence
   *  d'appareil/navigateur, pas d'identité), donc pas d'argument wallet ici
   *  contrairement à theme/mode/background. */
  previewEnabled: boolean;
  setPreviewEnabled: (v: boolean) => void;
  previewTrigger: PreviewTrigger;
  setPreviewTrigger: (t: PreviewTrigger) => void;
  /** Intensité des halos/glow — préférence d'appareil, comme l'aperçu. */
  glowStrength: GlowStrength;
  setGlowStrength: (v: GlowStrength) => void;
  /** Aperçu non validé (palette/mode/fond). Cliquer une option dans
   *  ThemeModeGrid/BackgroundSwitch ne l'active pas tout de suite : ça pose
   *  un aperçu ici, en attendant confirmPreview() (bouton « Activer ce
   *  thème ») ou cancelPreview() (annulation ou fermeture de la modale sans
   *  valider). `null` = rien en aperçu, l'app affiche l'état validé. */
  preview: PreviewState | null;
  /** Fusionne un fragment dans l'aperçu en cours (en crée un si besoin) —
   *  ne touche jamais theme/mode/background tant que confirmPreview()
   *  n'est pas appelé. */
  previewSet: (partial: PreviewState) => void;
  /** Applique l'aperçu courant pour de vrai (persiste), puis l'efface.
   *  Ne fait rien si aucun aperçu n'est en cours. */
  confirmPreview: () => void;
  /** Efface l'aperçu SANS l'appliquer — les effets retombent sur les
   *  valeurs déjà validées, ce qui suffit à revenir en arrière. */
  cancelPreview: () => void;
}

/** Fragment de thème pas encore validé — voir ThemeCtx.preview. */
export interface PreviewState {
  theme?: ThemeId;
  mode?: Mode;
  background?: BackgroundStyle;
}

const Ctx = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  mode: DEFAULT_MODE,
  setMode: () => {},
  background: DEFAULT_BACKGROUND,
  setBackground: () => {},
  previewEnabled: DEFAULT_PREVIEW_ENABLED,
  setPreviewEnabled: () => {},
  previewTrigger: DEFAULT_PREVIEW_TRIGGER,
  setPreviewTrigger: () => {},
  glowStrength: DEFAULT_GLOW_STRENGTH,
  setGlowStrength: () => {},
  preview: null,
  previewSet: () => {},
  confirmPreview: () => {},
  cancelPreview: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  // Initialisation paresseuse : on lit localStorage AVANT le premier rendu
  // plutôt que dans un effet. Avec un effet, le premier paint utiliserait
  // le thème par défaut puis basculerait — un flash de couleur visible.
  const [theme, setThemeState] = useState<ThemeId>(() => loadTheme(null));
  const [mode, setModeState] = useState<Mode>(() => loadMode(null));
  const [background, setBackgroundState] = useState<BackgroundStyle>(() => loadBackground(null));
  // Pas de lecture par wallet pour l'aperçu : préférence d'appareil, un seul
  // état global suffit (voir le commentaire sur ThemeCtx ci-dessus).
  const [previewEnabled, setPreviewEnabledState] = useState<boolean>(() => loadPreviewEnabled());
  const [previewTrigger, setPreviewTriggerState] = useState<PreviewTrigger>(() =>
    loadPreviewTrigger()
  );
  const [glowStrength, setGlowStrengthState] = useState<GlowStrength>(() => loadGlowStrength());
  const [preview, setPreviewState] = useState<PreviewState | null>(null);

  // L'aperçu ne s'applique PAS au vrai document. Avec `preview?.theme ?? theme`
  // ici, chaque clic dans ThemeModeGrid / BackgroundSwitch fuiterait sur TOUTE
  // la page réelle — l'aperçu contenu (MockupPreviewFrame) n'aurait alors
  // servi à rien puisque la vraie page changerait quand même sous les yeux de
  // l'utilisateur. Seule la valeur déjà VALIDÉE part sur documentElement ;
  // MockupPreviewFrame lit `preview` et l'applique à son propre cadre via des
  // `data-theme`/`data-mode` locaux.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyGlowStrength(glowStrength);
  }, [glowStrength]);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  // À la connexion, on recharge le thème propre à CE wallet. Sans ça, un
  // builder qui a choisi « aurum » sur un autre appareil verrait le thème
  // du dernier visiteur de ce navigateur.
  useEffect(() => {
    if (!wallet) return;
    const own = loadTheme(wallet);
    setThemeState((prev) => (prev === own ? prev : own));
    const ownMode = loadMode(wallet);
    setModeState((prev) => (prev === ownMode ? prev : ownMode));
    const ownBg = loadBackground(wallet);
    setBackgroundState((prev) => (prev === ownBg ? prev : ownBg));
  }, [wallet]);

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeState(id);
      saveTheme(id, wallet);
    },
    [wallet]
  );

  const setMode = useCallback(
    (m: Mode) => {
      setModeState(m);
      saveMode(m, wallet);
    },
    [wallet]
  );

  const setBackground = useCallback(
    (b: BackgroundStyle) => {
      setBackgroundState(b);
      saveBackground(b, wallet);
    },
    [wallet]
  );

  const setPreviewEnabled = useCallback((v: boolean) => {
    setPreviewEnabledState(v);
    savePreviewEnabled(v);
  }, []);

  const setPreviewTrigger = useCallback((t: PreviewTrigger) => {
    setPreviewTriggerState(t);
    savePreviewTrigger(t);
  }, []);

  const setGlowStrength = useCallback((v: GlowStrength) => {
    setGlowStrengthState(v);
    saveGlowStrength(v);
  }, []);

  const previewSet = useCallback((partial: PreviewState) => {
    setPreviewState((prev) => ({ ...prev, ...partial }));
  }, []);

  const cancelPreview = useCallback(() => {
    setPreviewState(null);
  }, []);

  // Applique pour de vrai ce qui était en aperçu — mêmes setters que le
  // comportement direct (instantané + persisté), simplement déclenchés par
  // une confirmation explicite plutôt que par le clic lui-même.
  // Lit `preview` par fermeture plutôt que via l'updater de setPreviewState :
  // appeler d'autres setters d'état depuis un updater est un effet de bord
  // que React peut invoquer deux fois (StrictMode).
  const confirmPreview = useCallback(() => {
    if (!preview) return;
    if (preview.theme !== undefined) setTheme(preview.theme);
    if (preview.mode !== undefined) setMode(preview.mode);
    if (preview.background !== undefined) setBackground(preview.background);
    setPreviewState(null);
  }, [preview, setTheme, setMode, setBackground]);

  return (
    <Ctx.Provider
      value={{
        theme,
        setTheme,
        mode,
        setMode,
        background,
        setBackground,
        previewEnabled,
        setPreviewEnabled,
        previewTrigger,
        setPreviewTrigger,
        glowStrength,
        setGlowStrength,
        preview,
        previewSet,
        confirmPreview,
        cancelPreview,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
