import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";
import componentTagger from "./plugins/component-tagger";

// ─── Tampon de build ────────────────────────────────────────────────
// Sans lui, la question « la prod sert-elle bien ce commit ? » ne se
// tranche qu'en ouvrant le tableau de bord Vercel. Avec lui, la réponse est
// dans le HTML servi : scripts/deploy-check.mjs compare les deux et échoue
// si ça diverge. C'est exactement la panne constatée le 07/10 — la prod
// servait un build antérieur aux correctifs, et rien ne le signalait.
//
// Sur Vercel, VERCEL_GIT_COMMIT_SHA dit quel commit a été construit (vrai
// aussi pour un déploiement déclenché depuis le dashboard) ; en local, on
// retombe sur git. Une valeur "unknown" est déjà une information : elle
// signifie que le build n'a pas été fait depuis ce dépôt.
function buildStamp(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    hmr: {
      overlay: false,
      timeout: 15000,
    },
    watch: {
      usePolling: true,
      interval: 500,
      binaryInterval: 500,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: "buildpact-commit-stamp",
      transformIndexHtml(html: string) {
        return html.replace(
          "<head>",
          `<head>\n    <meta name="build-commit" content="${buildStamp()}" />`
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    // Source maps cachées : débuggage prod sans exposer le code source
    sourcemap: false,
    // Code-splitting : sépare les libs lourdes du bundle applicatif.
    // Rolldown (Vite 8) exige une fonction, pas un objet.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (
              id.includes("@solana/wallet-adapter") ||
              id.includes("@solana-mobile/wallet-adapter")
            ) {
              return "solana-wallet";
            }
            if (id.includes("@solana/web3.js") || id.includes("@coral-xyz/anchor")) {
              return "solana-web3";
            }
            if (id.includes("react-dom") || id.includes("react/")) {
              return "react-vendor";
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));
