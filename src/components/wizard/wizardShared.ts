// src/components/wizard/wizardShared.ts
//
// Constantes et classes partagées par les trois étapes du wizard.
// Extraites de CreatePactWizard.tsx le 27/08 : le composant monolithique
// dépassait 1400 lignes / 64 Ko, ce qui le rendait impossible à éditer d'un
// bloc par la plupart des outils (y compris les miens). Le découpage n'est
// pas cosmétique — c'était un point de blocage réel.

// ═══ Wallet plateforme BuildPact — FIXE, non modifiable ═══
// Pour le changer : modifie cette constante + commit + redeploy.
export const PLATFORM_WALLET = 'AVhVM29hD6YRLb2DujhKfF8Ger4bgaCpx9P93Q3XBWSH';

export const inputCls =
  'w-full rounded-xl border border-white/10 bg-canvas-800/80 p-3 text-sm text-white ' +
  'transition-colors placeholder:text-ink-400 focus:border-accent-violet/60 focus:outline-none focus:ring-2 focus:ring-accent-violet/20';

export const labelCls = 'block text-sm font-semibold text-white';

export const hintCls = 'mt-1.5 block text-[11px] leading-snug text-ink-400';

export interface MemberDraft {
  wallet: string;
  roleIds: string[]; // multi-sélection — ids de ALL_ROLES (ex: dev ET designer à la fois)
  customRole: string; // rôle libre additionnel, combiné avec roleIds
  role: string; // label final combiné envoyé on-chain (≤ 24 octets, via combineRoleLabels)
  share: number;
  shareTouched: boolean; // true dès que l'utilisateur édite le % à la main
}

// ═══ Brouillon localStorage — survit à la fermeture de page ═══
export interface PactDraft {
  step: number;
  title: string;
  description: string;
  selectedRoles: string[];
  customRoles: string[];
  wantedRoles: string[]; // ajouté le 25/08 — d'où le ?? [] à la restauration
  myShare: number;
  shareTouched: boolean;
  stage: string;
  seedAmount: string;
  members: MemberDraft[];
  projectId: string;
  projectPda: string;
  savedAt: number;
}

export const draftKey = (wallet: string) => `buildpact_pact_draft_${wallet}`;

export function loadDraft(wallet: string): PactDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(wallet));
    if (!raw) return null;
    const d = JSON.parse(raw) as PactDraft;
    if (!d || typeof d !== 'object' || !d.title) return null;
    // Expire après 7 jours
    if (Date.now() - d.savedAt > 7 * 24 * 3600 * 1000) return null;
    return d;
  } catch {
    return null;
  }
}

// project_id safe : ≤ 20 bytes, minuscules, sans accents
export function slugId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .normalize('NFD')
      // ⚠️ Plage des diacritiques combinants, en échappements \u :
      // écrite littéralement, elle se fait manger par les copier/coller et
      // le slug ressort avec des accents non normalisés.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 12) || 'pact';
  return `${slug}-${Date.now().toString(36).slice(-6)}`; // ex: "seeker-mobile-abc123"
}
