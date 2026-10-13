// src/components/QrCode.tsx
//
// Rendu d'un QR code en SVG, généré localement (aucun appel réseau).
//
// Ce composant était importé par PactStep3 mais n'existait pas dans le
// projet — c'est ce qui faisait planter le chargement de l'application
// entière : Vite ne résout pas `../QrCode`, l'erreur remonte au module
// racine et rien ne s'affiche.
//
// La génération elle-même vit dans lib/qr.ts (qrcode-generator, MIT).
// On passe par un <img> data URI plutôt que dangerouslySetInnerHTML :
// même rendu, zéro alerte Semgrep, aucune surface XSS.

import { useMemo } from 'react';
import { generateQrSvg } from '../lib/qr';

interface Props {
  /** Contenu encodé — typiquement l'URL publique du pact. */
  value: string;
  /** Côté du carré, en pixels. */
  size?: number;
}

export default function QrCode({ value, size = 96 }: Props) {
  // generateQrSvg est purement calculatoire mais non trivial (matrice +
  // correction d'erreur). On le mémoïse : PactStep3 se re-rend à chaque
  // frappe dans le formulaire, et l'URL, elle, ne change pas.
  const dataUri = useMemo(() => {
    if (!value) return '';
    try {
      const svg = generateQrSvg(value);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      // Un QR peut échouer si le texte dépasse la capacité maximale du
      // format. Mieux vaut un trou dans l'UI qu'un écran blanc.
      return '';
    }
  }, [value]);

  if (!dataUri) return null;

  return (
    <img
      src={dataUri}
      width={size}
      height={size}
      alt="QR code"
      style={{ display: 'block', width: size, height: size }}
    />
  );
}
