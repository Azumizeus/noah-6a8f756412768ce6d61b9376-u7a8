import { truncateUtf8 } from './textSafety';

export interface RoleDef { id: string; label: string; weight: number }
export interface RoleGroup { category: string; roles: RoleDef[] }

export const ROLE_GROUPS: RoleGroup[] = [
  { category: 'Direction', roles: [
    { id: 'founder', label: '👑 Founder', weight: 15 }, { id: 'cofounder', label: '🤝 Co-Founder', weight: 12 }, { id: 'pm', label: '📋 Product Manager', weight: 10 },
  ] },
  { category: 'Tech', roles: [
    { id: 'leaddev', label: '💻 Lead Dev', weight: 15 }, { id: 'rustdev', label: '🦀 Rust / Anchor Dev', weight: 15 }, { id: 'frontend', label: '🖥️ Frontend Dev', weight: 10 }, { id: 'backend', label: '⚙️ Backend Dev', weight: 10 }, { id: 'fullstack', label: '🔧 Fullstack Dev', weight: 12 }, { id: 'mobile', label: '📱 Mobile Dev', weight: 10 }, { id: 'gamedev', label: '🎮 Game Dev', weight: 10 }, { id: 'devops', label: '🛠️ DevOps', weight: 8 }, { id: 'security', label: '🔐 Security Auditor', weight: 12 },
  ] },
  { category: 'Design & Creative', roles: [{ id: 'uxui', label: '🎨 UX/UI Designer', weight: 10 }, { id: 'artist', label: '🖌️ Artist / 3D', weight: 8 }, { id: 'motion', label: '🎬 Motion Designer', weight: 6 }, { id: 'sound', label: '🎧 Sound Designer', weight: 6 }, { id: 'music', label: '🎵 Music Producer', weight: 6 }] },
  { category: 'Business & Growth', roles: [{ id: 'tokenomics', label: '📊 Tokenomics Expert', weight: 10 }, { id: 'marketing', label: '📣 Marketing', weight: 8 }, { id: 'community', label: '💬 Community Mgr', weight: 5 }, { id: 'growth', label: '📈 Growth / BD', weight: 8 }, { id: 'content', label: '✍️ Content Writer', weight: 5 }, { id: 'legal', label: '⚖️ Legal Advisor', weight: 6 }] },
  { category: 'Capital', roles: [{ id: 'investor', label: '💰 Investor', weight: 0 }, { id: 'advisor', label: '🧭 Advisor', weight: 3 }] },
];
export const ALL_ROLES = ROLE_GROUPS.flatMap(g => g.roles);
const SHORT: Record<string, string> = { founder: 'Founder', cofounder: 'CoFounder', pm: 'PM', leaddev: 'Lead Dev', rustdev: 'Rust Dev', frontend: 'Frontend', backend: 'Backend', fullstack: 'Fullstack', mobile: 'Mobile', gamedev: 'Game Dev', devops: 'DevOps', security: 'Security', uxui: 'UX/UI', artist: 'Artist', motion: 'Motion', sound: 'Sound Design', music: 'Music Prod', tokenomics: 'Tokenomics', marketing: 'Marketing', community: 'Community', growth: 'Growth', content: 'Content', legal: 'Legal', investor: 'Investor', advisor: 'Advisor' };
// on-chain role field is limited to 24 BYTES; emojis would blow the limit (error 6005)
export function roleShortLabel(id: string): string { return SHORT[id] ?? id.slice(0, 24); }

// Combine plusieurs rôles (+ un texte libre optionnel) en UN SEUL label ≤ 24 octets
// on-chain. Ex: ['leaddev','uxui'] + '' → "Lead Dev/UX-UI". Tronque en OCTETS (pas en
// caractères) pour ne jamais redéclencher l'erreur 6005 (InvalidParameter) si le
// combo est long ou contient des accents.
export function combineRoleLabels(ids: string[], customText?: string): string {
  const parts = [
    ...ids.map((id) => roleShortLabel(id)),
    ...(customText && customText.trim() ? [customText.trim()] : []),
  ];
  const joined = parts.join('/') || 'Membre';
  return truncateUtf8(joined, 24);
}
// project_id ≤ 20 bytes on-chain.
export function slugId(name: string): string { const base = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 15).replace(/-$/g, ''); return `${base}-${Math.random().toString(36).slice(2, 6)}`; }
