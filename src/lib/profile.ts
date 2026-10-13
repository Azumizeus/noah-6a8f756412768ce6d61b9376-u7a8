// src/lib/profile.ts
// Profil builder — cache localStorage par wallet. La source de vérité est
// distante (table builder_profiles, voir profileRemote.ts) ; ce module ne
// sert qu'à afficher quelque chose immédiatement avant la réponse réseau.
import type { ThemeId } from './theme';

export type SkillLevel = 'debutant' | 'confirme' | 'expert';
export interface BuilderProfile { wallet: string; pseudo: string; bio: string; skills: string[]; skillLevels: Record<string, SkillLevel>; links: { github?: string; twitter?: string; portfolio?: string }; availability: 'open' | 'busy' | 'closed'; avatarUrl: string | null; bannerUrl: string | null; themePalette: ThemeId | null; hideWallet: boolean; updatedAt: number }
const key = (wallet: string) => `buildpact_profile_${wallet}`;
// Assainissement à la lecture (audit 19/09) : un localStorage corrompu ou
// édité à la main ne doit jamais injecter de valeur arbitraire dans l'UI.
// Seuls des types corrects survivent ; tout le reste retombe sur la valeur
// vide par défaut, exactement comme un profil inexistant.
function sanitizeProfile(p: unknown, wallet: string): BuilderProfile | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const str = (v: unknown, maxLen: number) => (typeof v === 'string' ? v.slice(0, maxLen) : '');
  const skills = Array.isArray(o.skills) ? (o.skills as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 30) : [];
  const lvl = typeof o.skillLevels === 'object' && o.skillLevels !== null ? Object.fromEntries(Object.entries(o.skillLevels as Record<string, unknown>).filter(([, v]) => v === 'debutant' || v === 'confirme' || v === 'expert')) : {};
  const links = typeof o.links === 'object' && o.links !== null ? Object.fromEntries(Object.entries(o.links as Record<string, unknown>).filter(([k, v]) => ['github', 'twitter', 'portfolio'].includes(k) && typeof v === 'string')) : {};
  const url = (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v) ? v : null);
  const avail = o.availability === 'open' || o.availability === 'busy' || o.availability === 'closed' ? o.availability : 'open';
  return { ...emptyProfile(wallet), pseudo: str(o.pseudo, 80), bio: str(o.bio, 2000), skills, skillLevels: lvl as Record<string, SkillLevel>, links, availability: avail, avatarUrl: url(o.avatarUrl), bannerUrl: url(o.bannerUrl), hideWallet: o.hideWallet === true, updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0 };
}
export function loadProfile(wallet: string): BuilderProfile | null { try { const raw = localStorage.getItem(key(wallet)); const parsed = raw ? JSON.parse(raw) as unknown : null; return sanitizeProfile(parsed, wallet); } catch { return null; } }
export function saveProfile(profile: BuilderProfile): void { const next = { ...profile, updatedAt: Date.now() }; localStorage.setItem(key(profile.wallet), JSON.stringify(next)); }
export function hasProfile(wallet: string): boolean { return loadProfile(wallet) !== null; }

// Profil neuf, tous champs à leur valeur vide. Centralisé ici (et non
// redéfini dans chaque page) parce que l'interface a des champs requis :
// en ajouter un casse la compilation de TOUTES les copies locales, ce qui
// est le comportement souhaité — mais seulement s'il n'y en a qu'une.
// `themePalette: null` = « aucune préférence enregistrée », distinct de
// 'violet' : le thème local de l'appareil ne doit pas être écrasé par un
// profil qui n'en a jamais choisi.
export function emptyProfile(wallet: string): BuilderProfile { return { wallet, pseudo: '', bio: '', skills: [], skillLevels: {}, links: {}, availability: 'open', avatarUrl: null, bannerUrl: null, themePalette: null, hideWallet: false, updatedAt: 0 }; }
// labelKey pointe vers translations.ts (profile.availabilityXxx) — le libellé
// affiché doit suivre la langue courante, donc pas de texte en dur ici.
export const AVAILABILITY_META: Record<BuilderProfile['availability'], { emoji: string; labelKey: string }> = { open: { emoji: '🟢', labelKey: 'profile.availabilityOpen' }, busy: { emoji: '🟠', labelKey: 'profile.availabilityBusy' }, closed: { emoji: '🔴', labelKey: 'profile.availabilityClosed' } };
// labelKey pointe vers translations.ts (profile.levelXxx) — même raison que
// AVAILABILITY_META : le libellé doit suivre la langue courante.
export const SKILL_LEVEL_META: Record<SkillLevel, { labelKey: string }> = { debutant: { labelKey: 'profile.levelDebutant' }, confirme: { labelKey: 'profile.levelConfirme' }, expert: { labelKey: 'profile.levelExpert' } };
export const SKILL_LEVELS: SkillLevel[] = ['debutant', 'confirme', 'expert'];
