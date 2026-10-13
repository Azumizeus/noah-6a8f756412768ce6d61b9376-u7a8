
export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // `sans` doit être surchargé explicitement : DashboardLayout utilise
        // font-sans, qui pointerait sinon sur la stack système par défaut de
        // Tailwind et ignorerait Space Grotesk.
        sans: ["'Space Grotesk'", "sans-serif"],
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Space Grotesk'", "sans-serif"],
        mono: ["'Space Mono'", "monospace"],
      },
      colors: {
        // ═══ Design system BuildPact ═══
        // Ces tokens sont consommés par CreatePactWizard, wizardShared et
        // MigratePactButton. Sans eux, Tailwind purge les classes et les
        // composants rendent en noir sur noir — sans aucune erreur de build.
        // ⚠️ Ces tokens DOIVENT pointer sur les variables CSS de index.css,
        // jamais sur un hex. C'était la cause du bug « en thème Atelier /
        // mode clair, des éléments disparaissent » : index.css réécrit bien
        // --canvas-*-rgb et --ink-*-rgb par thème, mais Tailwind compilait
        // ici des hex figés de mode sombre. Résultat : le fond de page
        // passait en ivoire (le body, lui, lisait la variable) pendant que
        // `text-ink-100` restait à #e6e6ef — du blanc cassé sur de l'ivoire,
        // invisible, sans la moindre erreur de build.
        canvas: {
          // DEFAULT permet d'écrire `bg-canvas` (utilisé par DashboardLayout).
          // Sans lui la classe est simplement ignorée et le fond retombe sur
          // celui du body — visuellement proche, donc le bug passe inaperçu.
          DEFAULT: "rgb(var(--canvas-900-rgb) / <alpha-value>)",
          900: "rgb(var(--canvas-900-rgb) / <alpha-value>)",
          800: "rgb(var(--canvas-800-rgb) / <alpha-value>)",
          700: "rgb(var(--canvas-700-rgb) / <alpha-value>)",
        },
        // ⚠️ Toute la gamme doit exister : `text-ink-300` est utilisé dans le
        // wizard. Une nuance absente ne provoque AUCUNE erreur — Tailwind
        // ignore simplement la classe et le texte hérite de la couleur
        // parente. Sur fond sombre, ça passe inaperçu jusqu'à ce qu'une
        // hiérarchie visuelle disparaisse sans explication.
        ink: {
          900: "rgb(var(--ink-900-rgb) / <alpha-value>)",
          500: "rgb(var(--ink-500-rgb) / <alpha-value>)",
          400: "rgb(var(--ink-400-rgb) / <alpha-value>)",
          300: "rgb(var(--ink-300-rgb) / <alpha-value>)",
          200: "rgb(var(--ink-200-rgb) / <alpha-value>)",
          100: "rgb(var(--ink-100-rgb) / <alpha-value>)",
        },
        // `white` redéfini sur le même token que le texte principal.
        //
        // Raison : la règle `[data-theme='atelier'] .text-white` d'index.css
        // ne rattrape QUE la classe nue. `hover:text-white`, `text-white/70`,
        // `group-hover:text-white`, `border-white/10`, `bg-white/5` génèrent
        // d'autres noms de classe et restaient blancs — donc invisibles sur
        // fond ivoire. Le faire ici couvre toutes les variantes d'un coup.
        //
        // En mode sombre --text-primary-rgb vaut 255 255 255 : rendu
        // strictement identique à avant. En Atelier, `bg-white/5` et
        // `border-white/10` deviennent une teinte d'encre à faible alpha —
        // ce qu'on veut : des séparateurs enfin visibles sur clair.
        white: "rgb(var(--text-primary-rgb) / <alpha-value>)",
        // ⚠️ Format imposé : la variable contient des CANAUX RGB séparés
        // (`153 69 255`), pas un hex. C'est ce qui permet à Tailwind
        // d'injecter <alpha-value> et donc de garder `bg-accent-violet/20`
        // fonctionnel. Avec un hex ou un `rgb(...)` complet dans la
        // variable, TOUS les modificateurs d'opacité du projet
        // casseraient — sans erreur de build : la classe serait juste
        // ignorée et l'élément rendrait transparent.
        //
        // Les noms sont désormais des RÔLES, pas des couleurs :
        //   violet = primaire · neon = argent · gold = mise en avant.
        // Les renommer aurait imposé de toucher chaque classe du projet.
        "accent-neon": "rgb(var(--accent-neon-rgb) / <alpha-value>)",
        "accent-violet": "rgb(var(--accent-violet-rgb) / <alpha-value>)",
        "accent-gold": "rgb(var(--accent-gold-rgb) / <alpha-value>)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Dérive lente des orbes de fond (DashboardLayout). Amplitude faible
        // et durée longue : c'est une respiration d'ambiance, pas un effet.
        float: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -28px, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 14s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
