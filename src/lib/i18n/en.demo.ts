// src/lib/i18n/en.demo.ts
// `demo` namespace (EN) — mirrors fr.demo.ts key for key.
import type { Dict } from './types';

export const enDemo: Dict = {
  eyebrow: 'Scripted replay',
  title: 'The full journey, no wallet required',
  subtitle:
    'create → add_member → approve → finalize → fund → distribute, step by step. No transaction is sent and no wallet is needed: addresses and signatures shown here are fictional and reproducible.',
  banner: 'Off-chain walkthrough. On devnet, every step asks for a real wallet signature.',

  play: 'Play the replay',
  pause: 'Pause',
  next: 'Next step',
  restart: 'Restart',

  // Recording mode — see lib/tournage.ts. Never on by default: hiding a real
  // RPC incident has to stay an explicit gesture.
  tournage: 'Recording mode',
  tournageOff: 'Leave recording mode',
  // The EFFECTIVE pace ({{pas}}) and frame ({{largeur}}) are shown: a rejected
  // or out-of-range URL value is then visible on screen instead of silently
  // changing the take.
  tournageOn:
    'Recording mode on — one step every {{pas}}s, health banner hidden, {{largeur}}px frame.',
  tournageHint:
    'Auto-plays on load, hides the RPC health banner and locks a 1000px frame, so the video records without any interaction. The state lives in the URL (#/demo?tournage=1), so the link is shareable and survives a reload.',

  // Replay pace — see lib/tournage.ts (PARAM_PAS).
  rythme: 'Pace',
  rythmeRapide: 'Fast · {{s}}s',
  rythmeNormal: 'Normal · {{s}}s',
  rythmeLent: 'Slow · {{s}}s',
  rythmeHint:
    'How long each step stays on screen (default: 2.4s). The setting lives in the URL (?pas=2.4, in seconds), so two takes of the same link are identical and a too-fast link is fixed by changing one digit.',
  stepLabel: 'Step {{n}} / {{total}}',
  done: 'Journey complete — vault emptied, members paid.',

  timeline: 'Timeline',
  instruction: 'Instruction',
  signer: 'Signer',
  signature: 'Signature (fictional)',
  vault: 'Vault',
  vaultAfter: 'Vault balance after this step',

  fee: 'Protocol fee (2%)',
  net: 'To members (98%)',
  funded: 'Funding',
  payouts: 'Payout split',
  payoutLine: '{{pseudo}} · {{shares}} → {{amount}} SOL',
  shares: 'share',
  wallet: 'Address (fictional)',
  participants: 'Participants',
  creatorBadge: 'creator',

  // Demo-owned data (unlike the roles of a real pact, typed by its
  // creator) — translated so the English recording stays coherent.
  role: {
    founder: 'Product founder',
    engineer: 'Solana engineer',
    design: 'Design & growth',
  },

  step: {
    create: 'Create the pact "{{titre}}" — creator {{createur}} holds {{shares}}',
    add_member: '{{membre}} joins the pact — {{role}}, {{shares}}',
    approve: '{{membre}} approves the pact terms',
    finalize: 'The creator finalizes "{{titre}}" — the pact becomes fundable',
    fund: '{{montant}} SOL land in the vault of "{{titre}}"',
    distribute: 'Distributing {{montant}} SOL — {{frais}} SOL protocol fee, the rest to {{n}} members',
  },
};
