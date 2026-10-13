// scripts/profile-form.test.ts
// ═══════════════════════════════════════════════════════════════════
// Test automatisé — SANS navigateur — du formulaire d'édition du profil.
//
// On teste la logique réelle consommée par PremiumProfil (lib/profileForm.ts) :
// le stockage est injecté en mémoire, donc aucun window/localStorage/DOM n'est
// requis. Node fournit le lanceur (`node --test`).
//
// Couverture demandée : enregistrer · annuler · restaurer.
//   - enregistrer : commitEditForm retire les espaces, writeStoredProfile
//     persiste, readStoredProfile les relit ;
//   - annuler : bootEditForm repart des valeurs enregistrées et jette la
//     saisie abandonnée ;
//   - restaurer : après enregistrement le profil relu est identique, et le
//     profil d'un autre wallet n'est jamais affiché sur celui-ci.
// ═══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readStoredProfile,
  writeStoredProfile,
  bootEditForm,
  commitEditForm,
  mergeIntoRemoteProfile,
  PROFILE_FORM_KEY,
  type EditableProfile,
  type StorageLike,
} from '../src/lib/profileForm.ts';
import type { BuilderProfile } from '../src/lib/profile.ts';

// Faux stockage en mémoire : même surface que localStorage, sans navigateur.
function memoryStorage(): StorageLike & { dump: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    dump: data,
  };
}

const WALLET_A = 'WALLET_A_111111111111111111111111111111111111';
const WALLET_B = 'WALLET_B_222222222222222222222222222222222222';

// Valeurs de référence « enregistrées » affichées par la fiche.
const displayedProfile: EditableProfile = {
  pseudo: 'Alice',
  avatarUrl: 'https://cdn.example/a.png',
  bannerUrl: 'https://cdn.example/b.png',
  skillLevel: 'expert',
};

test('enregistrer : les valeurs sont persistées puis relues à l’identique', () => {
  const storage = memoryStorage();

  // L'utilisateur saisit des espaces parasites autour des champs.
  const typed: EditableProfile = {
    pseudo: '  Alice  ',
    avatarUrl: '  https://cdn.example/a.png  ',
    bannerUrl: '',
    skillLevel: 'confirme',
  };

  const saved = commitEditForm(typed);
  writeStoredProfile(storage, WALLET_A, saved);

  // commitEditForm a bien retiré les espaces avant l'écriture.
  assert.deepEqual(saved, {
    pseudo: 'Alice',
    avatarUrl: 'https://cdn.example/a.png',
    bannerUrl: '',
    skillLevel: 'confirme',
  });

  // La relecture rend exactement ce qui a été enregistré.
  assert.deepEqual(readStoredProfile(storage, WALLET_A), saved);
});

test('enregistrer : le wallet est stocké et le niveau invalide est refusé à la relecture', () => {
  const storage = memoryStorage();
  writeStoredProfile(storage, WALLET_A, displayedProfile);

  // Le profil enregistré porte l'adresse du wallet propriétaire…
  assert.equal(JSON.parse(storage.dump[PROFILE_FORM_KEY]).wallet, WALLET_A);

  // …et un niveau hors nomenclature est ramené à « aucun » plutôt qu'affiché.
  storage.setItem(PROFILE_FORM_KEY, JSON.stringify({ wallet: WALLET_A, pseudo: 'X', skillLevel: 'beginner' }));
  assert.equal(readStoredProfile(storage, WALLET_A)?.skillLevel, null);
});

test('annuler : bootEditForm repart des valeurs enregistrées et jette la saisie', () => {
  const storage = memoryStorage();
  writeStoredProfile(storage, WALLET_A, displayedProfile);

  // Ouverture du formulaire : amorcé sur les valeurs affichées.
  let form = bootEditForm(displayedProfile);
  assert.deepEqual(form, displayedProfile);

  // L'utilisateur tape sans enregistrer.
  form = { ...form, pseudo: 'Bob', skillLevel: 'debutant' };
  assert.equal(form.pseudo, 'Bob');

  // Annulation : le formulaire revient sur les valeurs enregistrées.
  const afterCancel = bootEditForm(displayedProfile);
  assert.equal(afterCancel.pseudo, 'Alice');
  assert.equal(afterCancel.skillLevel, 'expert');

  // Et rien n'a été écrit : la saisie abandonnée n'existe nulle part.
  assert.deepEqual(readStoredProfile(storage, WALLET_A), displayedProfile);
});

test('restaurer : après enregistrement, le profil relu correspond aux valeurs saisies', () => {
  const storage = memoryStorage();
  const edited = commitEditForm({ pseudo: 'Alice v2', avatarUrl: '', bannerUrl: '', skillLevel: 'debutant' });
  writeStoredProfile(storage, WALLET_A, edited);

  const restored = readStoredProfile(storage, WALLET_A);
  assert.deepEqual(restored, edited);
});

test('restaurer : le profil d’un autre wallet n’est jamais affiché sur celui-ci', () => {
  const storage = memoryStorage();
  writeStoredProfile(storage, WALLET_A, displayedProfile);

  assert.deepEqual(readStoredProfile(storage, WALLET_A), displayedProfile);
  // Un autre wallet ne doit rien voir du profil d'Alice.
  assert.equal(readStoredProfile(storage, WALLET_B), null);
});

test('restaurer : un stockage absent ou corrompu retombe sur « aucun profil »', () => {
  const empty = memoryStorage();
  assert.equal(readStoredProfile(empty, WALLET_A), null);

  const corrupted = memoryStorage();
  corrupted.setItem(PROFILE_FORM_KEY, '{ pas du json');
  assert.equal(readStoredProfile(corrupted, WALLET_A), null);
});

// ─────────────────────────────────────────────────────────────────────
// Écriture distante (annuaire builders). Le pseudo, l'avatar et la bannière
// édités en premium doivent partir au serveur ; tout le reste doit être
// CONSERVÉ, car `submitProfileUpdate` envoie le profil entier.
// ─────────────────────────────────────────────────────────────────────

// Profil tel qu'il existe côté serveur : des champs que le formulaire premium
// n'expose pas du tout (bio, liens, disponibilité, palette de thème).
const remoteBase: BuilderProfile = {
  wallet: WALLET_A,
  pseudo: 'Alice (serveur)',
  bio: 'Bio distante',
  skills: ['dev', 'design'],
  skillLevels: { design: 'expert', dev: 'debutant' },
  links: { github: 'https://github.com/alice' },
  availability: 'busy',
  avatarUrl: 'https://cdn.example/old.png',
  bannerUrl: 'https://cdn.example/old-banner.png',
  themePalette: 'solana',
  hideWallet: true,
  updatedAt: 1234,
};

test('distant : le pseudo, l’avatar et la bannière saisis écrasent ceux du serveur', () => {
  const values = commitEditForm({
    pseudo: '  Alice v2  ',
    avatarUrl: ' https://cdn.example/new.png ',
    bannerUrl: 'https://cdn.example/new-banner.png',
    skillLevel: 'expert',
  });

  const merged = mergeIntoRemoteProfile(remoteBase, values);

  // Les trois champs demandés partent bien au serveur, espaces retirés.
  assert.equal(merged.pseudo, 'Alice v2');
  assert.equal(merged.avatarUrl, 'https://cdn.example/new.png');
  assert.equal(merged.bannerUrl, 'https://cdn.example/new-banner.png');

  // …et rien d'autre n'est perdu au passage : le formulaire premium n'expose
  // ni bio, ni liens, ni disponibilité, ni palette, ni confidentialité.
  assert.equal(merged.bio, 'Bio distante');
  assert.deepEqual(merged.links, { github: 'https://github.com/alice' });
  assert.equal(merged.availability, 'busy');
  assert.equal(merged.themePalette, 'solana');
  assert.equal(merged.hideWallet, true);
  assert.deepEqual(merged.skills, ['dev', 'design']);
  assert.equal(merged.wallet, WALLET_A);
});

test('distant : un champ vidé part en null, jamais en chaîne vide', () => {
  const values = commitEditForm({ pseudo: 'Alice', avatarUrl: '', bannerUrl: '   ', skillLevel: 'expert' });

  const merged = mergeIntoRemoteProfile(remoteBase, values);

  // `null` est la forme que profile.ts relit ; '' est la forme que l'Edge
  // Function accepte — la conversion est faite par submitProfileUpdate.
  assert.equal(merged.avatarUrl, null);
  assert.equal(merged.bannerUrl, null);
});

test('distant : le niveau choisi va au rôle affiché, les autres restent intacts', () => {
  // La fiche premium affiche le niveau du premier rôle qui en a un — ici
  // « design ». C'est donc ce rôle que le formulaire modifie.
  const merged = mergeIntoRemoteProfile(remoteBase, {
    pseudo: 'Alice',
    avatarUrl: '',
    bannerUrl: '',
    skillLevel: 'confirme',
  });

  assert.deepEqual(merged.skillLevels, { design: 'confirme', dev: 'debutant' });
  // La map d'origine n'est pas modifiée sur place.
  assert.deepEqual(remoteBase.skillLevels, { design: 'expert', dev: 'debutant' });
});

test('distant : « aucun niveau » retire le niveau affiché au lieu d’en inventer un', () => {
  const merged = mergeIntoRemoteProfile(remoteBase, {
    pseudo: 'Alice',
    avatarUrl: '',
    bannerUrl: '',
    skillLevel: null,
  });

  assert.deepEqual(merged.skillLevels, { dev: 'debutant' });
});

test('distant : sans rôle déclaré, un niveau choisi ne crée pas de rôle fantôme', () => {
  const vierge: BuilderProfile = { ...remoteBase, skills: [], skillLevels: {} };

  const merged = mergeIntoRemoteProfile(vierge, {
    pseudo: 'Alice',
    avatarUrl: '',
    bannerUrl: '',
    skillLevel: 'expert',
  });

  // Un niveau n'a pas de sens sans rôle : la map reste vide plutôt que
  // d'inventer une clé que rien n'afficherait (BuilderDetailModal lit
  // skillLevels[roleId]).
  assert.deepEqual(merged.skillLevels, {});
});
