// src/lib/profileForm.ts
// ═══════════════════════════════════════════════════════════════════
// Logique PURE du formulaire d'édition du profil (PremiumProfil).
//
// Extraite du composant pour être testable hors navigateur : la page mélange
// rendu React, wallet et localStorage, ce qui la rendait non testable sans
// navigateur. Ici il ne reste que les transformations de données — lire,
// écrire, amorcer le formulaire — sans aucun import React ni accès direct à
// localStorage (l'objet de stockage est injecté, donc remplaçable en test).
//
// Le composant consomme EXACTEMENT ces fonctions : ce qui est testé est le
// code réellement exécuté par l'écran, pas une copie qui pourrait diverger.
// ═══════════════════════════════════════════════════════════════════
import { SKILL_LEVELS, type BuilderProfile, type SkillLevel } from './profile.ts';

// Les champs éditables, sous leur forme canonique. Une seule définition,
// partagée par l'amorçage du formulaire, l'annulation et l'affichage.
export type EditableProfile = {
  pseudo: string;
  avatarUrl: string;
  bannerUrl: string;
  skillLevel: SkillLevel | null;
  /** Bio du builder (280 car. max, borne de l'Edge Function). 21/10 : le
   *  champ manquait dans le formulaire premium — la bio n'était modifiable
   *  que depuis l'ancienne page /v1/profile. */
  bio: string;
};

/** Longueur maximale de la bio — même borne que l'Edge Function
 *  `update-profile` (il tronque à 280 de son côté). */
export const MAX_BIO_LEN = 280;

// Clé de stockage localStorage (hors-ligne, pas de Supabase).
export const PROFILE_FORM_KEY = 'premiumProfilV2';

// Surface de stockage minimale réellement utilisée : permet d'injecter un
// faux stockage en test sans dépendre de `window`/`localStorage`.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Assainissement à la lecture : localStorage est modifiable à la main et la
// clé de stockage n'est pas indexée par wallet — sans le contrôle sur
// `wallet`, le profil d'une adresse s'afficherait sur une autre.
export function readStoredProfile(storage: StorageLike, myAddr: string): EditableProfile | null {
  try {
    const raw = storage.getItem(PROFILE_FORM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (myAddr && parsed.wallet !== myAddr) return null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const level = parsed.skillLevel;
    return {
      pseudo: str(parsed.pseudo),
      avatarUrl: str(parsed.avatarUrl),
      bannerUrl: str(parsed.bannerUrl),
      skillLevel: SKILL_LEVELS.includes(level as SkillLevel) ? (level as SkillLevel) : null,
      bio: str(parsed.bio).slice(0, MAX_BIO_LEN),
    };
  } catch {
    return null;
  }
}

export function writeStoredProfile(storage: StorageLike, myAddr: string, values: EditableProfile): void {
  try {
    storage.setItem(PROFILE_FORM_KEY, JSON.stringify({ wallet: myAddr, ...values }));
  } catch {
    /* localStorage plein / mode incognito — non bloquant */
  }
}

// Amorçage du formulaire : utilisé par « Modifier » (ouvrir) ET par
// « Annuler ». Dans les deux cas on repart des valeurs ENREGISTRÉES
// (`displayed`), jamais de l'état précédent du formulaire — c'est ce qui fait
// qu'une saisie abandonnée ne survit pas à l'annulation.
export function bootEditForm(displayed: EditableProfile): EditableProfile {
  return {
    pseudo: displayed.pseudo,
    avatarUrl: displayed.avatarUrl,
    bannerUrl: displayed.bannerUrl,
    skillLevel: displayed.skillLevel,
    bio: displayed.bio ?? '',
  };
}

// Valeurs canoniques à enregistrer : espaces superflus retirés (comportement
// de handleSave dans le composant).
export function commitEditForm(form: EditableProfile): EditableProfile {
  return {
    pseudo: form.pseudo.trim(),
    avatarUrl: form.avatarUrl.trim(),
    bannerUrl: form.bannerUrl.trim(),
    skillLevel: form.skillLevel,
    bio: (form.bio ?? '').trim().slice(0, MAX_BIO_LEN),
  };
}

/**
 * Prépare le profil COMPLET à envoyer à l'Edge Function `update-profile`.
 *
 * ⚠️ On repart toujours du profil DISTANT (`base`), jamais d'un objet bâti
 * avec les seuls champs du formulaire : `submitProfileUpdate` envoie le profil
 * entier, donc un objet partiel efface silencieusement en base tous les champs
 * omis — bio, liens, disponibilité, palette. Le bug a déjà été rencontré sur
 * ce projet (voir PremiumSettings.savePrivacy).
 *
 * Le seul champ qui n'a pas d'équivalent direct est le niveau : le formulaire
 * premium n'expose qu'UN niveau, alors que la base stocke une map
 * rôle → niveau (`skill_levels`). On l'applique donc au rôle dont le niveau est
 * celui affiché (l'amorçage du formulaire lit la fiche exactement comme ça),
 * et à défaut au premier rôle déclaré. Sans rôle ni compétence, le niveau ne
 * peut pas être attribué : la map distante est alors laissée intacte plutôt que
 * d'inventer une clé.
 */
export function mergeIntoRemoteProfile(base: BuilderProfile, values: EditableProfile): BuilderProfile {
  const role = Object.keys(base.skillLevels).find((k) => base.skillLevels[k]) ?? base.skills[0] ?? null;
  const skillLevels = { ...base.skillLevels };
  if (role) {
    if (values.skillLevel) skillLevels[role] = values.skillLevel;
    else delete skillLevels[role];
  }
  return {
    ...base,
    wallet: base.wallet,
    pseudo: values.pseudo,
    // `null` (et non '') pour un champ vidé : c'est la forme que `profile.ts`
    // relit (`url()` renvoie null sur une chaîne vide) et `fromRemote()` la
    // relit à l'identique. `submitProfileUpdate` la convertit en '' pour
    // l'Edge Function, qui valide des chaînes.
    avatarUrl: values.avatarUrl || null,
    bannerUrl: values.bannerUrl || null,
    skillLevels,
    // Bio : une bio SAISIE écrase la bio distante ; une bio VIDE la laisse
    // intacte. Contrairement à l'avatar et à la bannière (vides = « effacer »),
    // on ne veut pas perdre la bio d'un founder parce que le formulaire a
    // été ouvert et refermé sans y toucher.
    bio: values.bio && values.bio.trim() ? values.bio.trim() : base.bio,
  };
}
