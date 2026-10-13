// src/lib/i18n/en.settings.ts
// `settings` namespace of the EN dictionary — must mirror fr.settings.ts
// key for key. A key present on one side only fails silently: t() returns
// the raw key, so the UI shows "settings.rpcHeading" — but only in the
// language that lacks it, which is exactly the case nobody tests.
import type { Dict } from './types';

export const enSettings: Dict = {
  rpcHeading: 'Custom RPC endpoint',
  // Deliberately long, in three beats (what it is / what for / how to):
  // this is the only setting in the app that asks the user to go create an
  // account on a third-party service.
  rpcHint:
    "What it is: the server that relays your transactions to the Solana network. BuildPact rotates through several by default, free and enough for normal use — you don't need to touch this. " +
    'What it\'s for: if you see "429" errors (too many requests) or slow loads at peak times, pasting your own key gives you a quota that\'s yours alone, instead of sharing the default rotation. ' +
    'How to do it: create a free account at helius.dev or quicknode.com, pick the "Solana Devnet" network, copy the URL you get (your API key is baked into it) and paste it below. Takes effect after a page reload.',
  rpcClear: 'Remove',
  // "reload the page" is load-bearing, not politeness: CUSTOM_RPC is read
  // once at module load (constants.ts), so saving changes nothing until a
  // reload.
  rpcSaved: 'Saved — reload the page to apply it.',

  densityHeading: 'Display density',
  densityComfortable: 'Comfortable',
  densityCompact: 'Compact',
  densityHint: 'Compact shows more pacts on screen, with less space between cards.',

  privacyHeading: 'Profile privacy',
  privacyToggleLabel: 'Hide my full wallet address',
  privacyHint:
    'Shows a nickname (or a truncated address) instead of the full address on your public profile. Transactions stay verifiable on-chain — this setting only hides the display, never the chain.',
  // Explains why the save button is absent instead of offering a checkbox
  // that would fail silently: this is a PROFILE field, saved by wallet
  // signature (see PremiumSettings).
  privacyNeedsWallet: 'Connect your wallet to change this setting.',

  // Keys for NotificationSettings (mounted from ProfileSettingsModal).
  // notifPushUnsupported deliberately covers two cases in one sentence —
  // browser without Push API, and missing project infrastructure
  // (VITE_VAPID_PUBLIC_KEY, /push-sw.js, `push` Edge Function). The
  // distinction doesn't help the user: there's nothing they can do either way.
  notificationsHeading: 'Notifications',
  notificationsHint:
    'Turn on notifications on this device to get a real alert (even with the tab closed) for the types checked below.',
  notifApprovals: 'Member approval',
  notifFunding: 'Funding received',
  notifQuests: 'Claimable quest',
  notifPushDeviceLabel: 'Notifications on this device',
  notifPushOn: 'On — you will receive real alerts',
  notifPushOff: 'Off — no alert is sent',
  notifPushUnsupported:
    "Your browser doesn't support push notifications (or the server key isn't configured).",
  notifPushNeedsWallet: 'Connect your wallet to enable notifications.',
  notifPushUnexpected: 'Something unexpected happened — try again.',

  // Translation service diagnostic (TranslationStatus). Each state names
  // the fix on the project side, not just the symptom: "it doesn't work"
  // is exactly what this indicator exists to replace.
  translationHeading: 'Translation service',
  translationHint:
    "Tests the server function that translates chat, Network and contact messages. A failure here breaks nothing else: messages stay shown in their original language.",
  translationServiceLabel: 'Automatic translation',
  translationIdle: 'Unknown state — run a test.',
  translationTest: 'Test',
  translationTesting: 'Testing…',
  translationOk: 'Working — messages are being translated.',
  translationQuota: 'Daily quota reached — the service works, it resumes tomorrow.',
  translationKeyMissing:
    'DeepL key missing from Supabase secrets (DEEPL_API_KEY) — needs adding on the project side.',
  translationNotDeployed: 'The `translate` function is not deployed on the Supabase project.',
  translationAuthBlocked:
    'Function deployed but JWT-protected — it must be published with --no-verify-jwt.',
  translationUpstream: 'DeepL rejected the request — invalid key or expired plan.',
  translationUnreachable: 'Service unreachable — network down or request blocked by the browser.',
  translationDisabled: 'Supabase is not configured in this build.',
  translationUnknown: 'Unexpected response from the server.',
  translationByokNote:
    'Your own key is active: your translations bypass this service, so this test does not apply to them.',

  usdToggleLabel: 'Show USD equivalent',
  // "for reference only" matters: the price comes from an off-chain oracle
  // and feeds NO share or amount calculation.
  usdHint:
    'Estimate via the Pyth oracle (SOL/USD), for reference only — never used in any on-chain calculation.',
  usdUnavailable: 'n/a',

  exportHeading: 'CSV export',
  exportHint: 'Download your XP history and pact events for this wallet.',
  exportButton: 'Export as CSV',
  exportEmpty: 'Nothing to export for this wallet.',
};
