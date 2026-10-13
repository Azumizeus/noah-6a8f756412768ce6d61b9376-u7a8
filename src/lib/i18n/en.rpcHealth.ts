// src/lib/i18n/en.rpcHealth.ts
// `rpcHealth` namespace (EN) — mirrors fr.rpcHealth.ts key for key.
import type { Dict } from './types';

export const enRpcHealth: Dict = {
  title: 'Primary RPC endpoint unavailable',
  titleDegraded: 'Primary RPC endpoint degraded',
  alertFallback:
    'The app is running on the fallback — {{actif}} — instead of the intended endpoint ({{primaire}}). Reads may be slower or rate-limited.',
  alertDown:
    'The intended endpoint ({{primaire}}) is not answering. Reads will switch to the fallback — {{repli}} — on the next call, which may be slower or rate-limited.',
  alertNoFallback:
    'The intended endpoint ({{primaire}}) is not answering and the list holds no other endpoint. On-chain data will not load.',
  alertRotated:
    'A rotation happened during this session: reads now go through {{actif}} instead of {{primaire}}.',
  reason: 'Cause: {{reason}}',
  checkedAt: 'Checked at {{time}}',
  retry: 'Re-check',
  checking: 'Checking…',
  settings: 'Configure an RPC',
  hide: 'Hide for this session',

  verdictUp: 'endpoint reachable',
  verdictThrottle: 'node saturated (429) — it is rate-limiting',
  verdictMethodBlocked: 'method refused by the provider (-32401)',
  verdictMissing: 'the URL serves no JSON-RPC function (404) — relay not deployed?',
  verdictBroken: 'endpoint error (5xx or refusal)',
  verdictNotJson: 'the response is not JSON-RPC (HTML page or wrong URL)',
  verdictRpcError: 'JSON-RPC error returned by the node',
  verdictUnreachable: 'endpoint unreachable (network, DNS, CORS or timeout)',

  motifThrottle: 'node saturated (429)',
  motifMethodBlocked: 'method refused by the provider',
  motifRelayGone: 'relay unreachable (404/503 or network down)',
};
