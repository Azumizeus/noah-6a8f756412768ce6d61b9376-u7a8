// src/hooks/useChatSessionCleanup.ts
// ═══════════════════════════════════════════════════════════════════
// Efface les jetons de session du chat quand le wallet se déconnecte
// (ou qu'on passe à un autre compte).
//
// Pourquoi : le jeton de session (voir chatSession.ts) est un bearer token
// en localStorage, valable 24 h. Sans ce nettoyage il SURVIT au disconnect :
// sur un poste partagé, l'utilisateur suivant pouvait poster sous le wallet
// du précédent alors même que celui-ci s'était « déconnecté ». La
// déconnexion donnait une impression de sortie qui n'existait pas.
//
// Monté une seule fois au niveau de App, volontairement : mettre cette
// logique dans ChatBox ne l'aurait déclenchée que si un chat était affiché
// à l'instant du disconnect. Se déconnecter depuis le dashboard ou la
// marketplace — le cas le plus courant — n'aurait rien nettoyé.
//
// ⚠️ Portée : effacement LOCAL, pas une révocation. Le jeton reste
// cryptographiquement valide côté serveur jusqu'à son échéance ; une copie
// déjà exfiltrée continuerait de fonctionner. Pour ça, il faut la
// révocation serveur — bouton « Révoquer » dans ChatBox.
//
// Et on ne peut PAS la déclencher ici : révoquer exige une signature du
// wallet, or à cet instant précis le wallet vient d'être déconnecté et ne
// peut plus rien signer. La déconnexion restera donc toujours un simple
// nettoyage local ; c'est une limite structurelle, pas un oubli.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { clearChatSessionsForWallet } from '../lib/chatSession';

export function useChatSessionCleanup(): void {
  const { publicKey } = useWallet();

  // Dernier wallet OBSERVÉ connecté. Démarre à null, ce qui est la clé de
  // la correction du faux positif décrit plus bas.
  const previousWalletRef = useRef<string | null>(null);

  useEffect(() => {
    const current = publicKey ? publicKey.toBase58() : null;
    const previous = previousWalletRef.current;
    previousWalletRef.current = current;

    // On n'agit QUE sur une transition depuis un wallet réellement observé :
    //   • A → null  : déconnexion
    //   • A → B     : changement de compte (le jeton de A n'a plus à traîner)
    //
    // On ne se fie pas au booléen `connected`, qui peut osciller pendant une
    // reconnexion. Et comme la ref part de null, la séquence de rechargement
    // de page avec autoConnect (null → A) ne déclenche rien : sans cette
    // garde, chaque refresh effacerait le jeton et rendrait les 24 h
    // parfaitement inutiles — une régression silencieuse, l'utilisateur
    // verrait juste « encore un popup ».
    if (previous && previous !== current) {
      clearChatSessionsForWallet(previous);
    }
  }, [publicKey]);
}
