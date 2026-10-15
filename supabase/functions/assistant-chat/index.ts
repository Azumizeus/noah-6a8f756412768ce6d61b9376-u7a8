// supabase/functions/assistant-chat/index.ts
// BuildPact — Nexus, l'assistant Solana/Web3 embarqué (relais BYOK sans état).
// Récupéré depuis la version déployée le 15/10/2026 (n'était pas versionné),
// puis durci : CORS restreint + garde anti-SSRF sur `baseUrl`.
//
// Modèle "chacun sa clé" : la clé de l'utilisateur arrive à chaque requête,
// est relayée au fournisseur et n'est JAMAIS persistée ni loguée.
// Fournisseurs : 'anthropic' (API Messages) et 'openai' (tout endpoint
// compatible Chat Completions).
// Déploiement : supabase functions deploy assistant-chat --no-verify-jwt
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROVIDERS = ['anthropic', 'openai'] as const;
type Provider = (typeof PROVIDERS)[number];

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 6000;
const MAX_KEY_CHARS = 400;

// Prompt système — Nexus. Périmètre : technique Solana/Web3/BuildPact,
// pédagogique sur la réglementation crypto EN GÉNÉRAL, jamais de conseil
// personnalisé (juridique, fiscal ou financier).
const SYSTEM_PROMPT = `Tu es Nexus, l'assistant technique intégré à BuildPact (une DApp Solana qui formalise on-chain la répartition des parts entre co-fondateurs d'un projet — rôles/parts définis à la création, approbation mutuelle, financement via escrow PDA, distribution automatique 2% protocole / 98% membres, sur devnet).

Ton rôle : aider un développeur à comprendre Solana, Anchor, le développement Web3 en général, et le fonctionnement de BuildPact. Ton senior, direct, technique.

Règles strictes :
- Réglementation / droit crypto : tu peux EXPLIQUER des concepts généraux (ce qu'est une security, un DAO, une KYC/AML, comment la réglementation varie par juridiction en général) mais tu ne donnes JAMAIS de conseil juridique personnalisé à la situation de quelqu'un. Termine toute réponse touchant à ce terrain par une phrase rappelant que ce n'est pas un conseil juridique et qu'il faut consulter un professionnel qualifié pour sa situation précise.
- Même prudence pour tout ce qui ressemble à du conseil financier ou d'investissement : informations factuelles oui, recommandation "fais X" non.
- Si on te demande de générer du code touchant au programme Anchor de BuildPact (lib.rs, PDA, comptes), rappelle que toute modification du Program ID ou du Config PDA doit être validée par un humain avant d'être appliquée — tu peux expliquer et esquisser, pas décider à la place de l'équipe.
- Réponses concises, en français par défaut sauf si on te parle en anglais.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  messages?: ChatMessage[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Garde anti-SSRF (15/10/2026). `baseUrl` est choisi par l'appelant et la
 * fonction y envoie un fetch CÔTÉ SERVEUR : sans garde, n'importe qui
 * pouvait viser localhost, le réseau interne ou les métadonnées cloud.
 * Règles : https uniquement, pas d'identifiants dans l'URL, pas de nom
 * d'hôte local/privé (littéraux IP v4/v6 privés, localhost, .local,
 * .internal). Les hôtes DNS qui résoudraient vers du privé ne sont pas
 * détectables ici — le runtime Edge n'a pas accès au réseau interne du
 * projet, ce garde ferme le cas trivial.
 */
function baseUrlError(baseUrl: string | undefined): string | null {
  if (!baseUrl || !baseUrl.trim()) return null;
  let u: URL;
  try {
    u = new URL(baseUrl.trim());
  } catch {
    return 'URL de base invalide.';
  }
  if (u.protocol !== 'https:') return 'URL de base : https obligatoire.';
  if (u.username || u.password) return 'URL de base : identifiants interdits.';
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.startsWith('[') || // IPv6 littérale : refusée par prudence
    /^\d+\.\d+\.\d+\.\d+$/.test(h) // IPv4 littérale : refusée (privées/metadata)
  ) {
    return 'URL de base non autorisée.';
  }
  return null;
}

function validate(body: RequestBody): string | null {
  if (typeof body.provider !== 'string' || !PROVIDERS.includes(body.provider as Provider)) {
    return 'Fournisseur inconnu.';
  }
  if (typeof body.apiKey !== 'string' || body.apiKey.length === 0 || body.apiKey.length > MAX_KEY_CHARS) {
    return 'Clé API absente ou invalide.';
  }
  if (typeof body.model !== 'string' || body.model.length === 0) {
    return 'Modèle non précisé.';
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return 'Aucun message.';
  }
  if (body.messages.length > MAX_MESSAGES) {
    return 'Conversation trop longue pour ce relais.';
  }
  for (const m of body.messages) {
    if (m.role !== 'user' && m.role !== 'assistant') return 'Rôle de message invalide.';
    if (typeof m.content !== 'string' || m.content.length === 0 || m.content.length > MAX_MESSAGE_CHARS) {
      return 'Message invalide ou trop long.';
    }
  }
  if (body.provider === 'openai') return baseUrlError(body.baseUrl);
  return null;
}

async function callAnthropic(apiKey: string, model: string, messages: ChatMessage[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Erreur Anthropic (${res.status}).`);
  }
  const text = Array.isArray(data?.content)
    ? data.content.map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text ?? '' : '')).join('')
    : '';
  return text || '(réponse vide)';
}

async function callOpenAiCompatible(
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  const root = (baseUrl && baseUrl.trim()) || 'https://api.openai.com/v1';
  const res = await fetch(`${root.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 1024,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Erreur (${res.status}).`);
  }
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' && text.length > 0 ? text : '(réponse vide)';
}

// CORS restreint (15/10/2026). Surcharge : supabase secrets set ALLOWED_ORIGINS="https://a,https://b"
const ALLOWED_ORIGINS = (
  Deno.env.get('ALLOWED_ORIGINS') ??
  'https://buildpact-solana.vercel.app,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function withCors(req: Request, res: Response): Response {
  const origin = req.headers.get('Origin');
  const headers = new Headers(res.headers);
  headers.set('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  } else {
    headers.delete('Access-Control-Allow-Origin');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Methode non supportee.' }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalide.' }, 400);
  }

  const validationError = validate(body);
  if (validationError) return jsonResponse({ error: validationError }, 400);

  const { provider, apiKey, baseUrl, model, messages } = body as Required<Omit<RequestBody, 'baseUrl'>> &
    Pick<RequestBody, 'baseUrl'>;

  try {
    const reply =
      provider === 'anthropic'
        ? await callAnthropic(apiKey, model, messages)
        : await callOpenAiCompatible(apiKey, baseUrl, model, messages);
    return jsonResponse({ ok: true, reply });
  } catch (e) {
    // Message du fournisseur utile pour corriger SA config — jamais la clé.
    const msg = e instanceof Error ? e.message : 'Erreur inconnue.';
    console.error('[assistant-chat] provider error:', msg);
    return jsonResponse({ error: msg }, 502);
  }
}

Deno.serve(async (req: Request) => withCors(req, await handle(req)));
