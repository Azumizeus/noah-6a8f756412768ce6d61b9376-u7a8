-- ═══════════════════════════════════════════════════════════════════
-- Révocation SERVEUR des jetons de session du chat.
--
-- Jusqu'ici, « révoquer » ne faisait qu'effacer le jeton du localStorage.
-- C'est utile sur un poste partagé, mais ça ne révoque rien : le jeton est
-- un bearer token signé, il reste cryptographiquement valide côté serveur
-- jusqu'à son échéance. Une copie déjà exfiltrée (XSS, extension) continuait
-- de fonctionner pendant 24 h.
--
-- Modèle retenu : un CUTOFF par wallet, pas une liste de jetons.
-- On stocke « toute session signée avant cet instant est refusée » plutôt
-- que l'empreinte de chaque jeton révoqué. Raison : pour révoquer par
-- empreinte, il faudrait connaître le jeton — or l'utilisateur qui révoque
-- est justement sur un AUTRE appareil que celui compromis, et n'a donc pas
-- la copie à invalider. Le cutoff couvre les jetons qu'on ne connaît pas,
-- ce qui est exactement le cas d'usage.
--
-- Portée volontairement WALLET-LARGE (tous projets confondus) : quelqu'un
-- qui révoque après avoir quitté un poste partagé veut sortir de partout,
-- pas seulement du chat affiché à ce moment-là.
--
-- Une seule ligne par wallet, mise à jour par upsert : la table ne grossit
-- pas avec le temps, contrairement à un journal de jetons.
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.chat_session_revocations (
  wallet text primary key,
  -- Toute session dont le Timestamp signé est ANTÉRIEUR à cette date est
  -- rejetée par chat-moderate. Les sessions signées après restent valides,
  -- ce qui permet à l'utilisateur légitime de re-signer immédiatement.
  revoked_before timestamptz not null,
  updated_at timestamptz not null default now()
);

-- RLS activée SANS aucune policy : la table devient inaccessible à `anon`
-- et `authenticated`, en lecture comme en écriture. Seule la clé
-- service_role (qui contourne RLS) y touche, depuis chat-moderate.
--
-- Ce n'est pas un oubli — c'est le point du dispositif. Une policy UPDATE
-- publique permettrait à n'importe qui de reculer le cutoff d'un autre
-- wallet et d'annuler sa révocation ; une policy INSERT publique
-- permettrait de révoquer les sessions d'autrui (déni de service).
-- L'écriture doit rester conditionnée à une signature, donc hors SQL.
alter table public.chat_session_revocations enable row level security;
