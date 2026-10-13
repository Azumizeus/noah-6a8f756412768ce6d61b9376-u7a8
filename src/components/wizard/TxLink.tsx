// src/components/wizard/TxLink.tsx
// Lien Explorer après chaque transaction — important pour la démo devant les juges.
// Extrait de CreatePactWizard.tsx : utilisé par l'étape 2 et l'étape 3.

import { explorerTxUrl } from '../../lib/pacts';

export default function TxLink({ sig, label }: { sig: string; label: string }) {
  return (
    <a
      href={explorerTxUrl(sig)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block text-[11px] text-accent-neon underline underline-offset-2 hover:opacity-80"
    >
      {label} : {sig.slice(0, 8)}… ↗
    </a>
  );
}
