-- supabase/migrations/20260918120000_create_translation_cache.sql
-- BuildPact — cache de traductions, partagé par les 3 surfaces (chat de
-- pact, messages de contact, posts/commentaires Network). Volontairement
-- générique : clé = hash du texte original + langue cible + fournisseur,
-- pas de clé étrangère vers une table de messages précise.
create table if not exists translation_cache (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null,
  target_lang text not null,
  provider text not null,
  source_text text not null,
  translated_text text not null,
  detected_source_lang text,
  created_at timestamptz not null default now()
);

create unique index if not exists translation_cache_unique
  on translation_cache (content_hash, target_lang, provider);

create index if not exists translation_cache_hash_idx on translation_cache (content_hash);

-- Aucune politique de rétention définie à ce jour : la table grossit d'une
-- ligne par (message × langue cible). Cet index existe pour qu'une purge
-- future (`delete ... where created_at < now() - interval '90 days'`) soit
-- un range scan et pas un seq scan sur toute la table.
create index if not exists translation_cache_created_at_idx on translation_cache (created_at);

alter table translation_cache enable row level security;
-- Aucune policy : lecture/écriture réservées à la service_role.

-- Compteur de quota quotidien — voir DAILY_CHAR_LIMIT dans
-- supabase/functions/translate/index.ts.
--
-- ⚠️ `usage_key` mélange DÉLIBÉRÉMENT deux espaces d'identifiants : le
-- wallet base58 si l'appelant est connecté, sinon son IP en repli. C'est
-- assumé — un visiteur non connecté doit pouvoir lire le Network traduit,
-- donc on ne peut pas exiger un wallet. Conséquence à connaître : une
-- valeur de cette colonne n'est pas attribuable à un type d'identité sans
-- l'inspecter (une IP ne ressemble pas à du base58, mais rien ne le
-- garantit au niveau du schéma).
create table if not exists translation_usage (
  usage_key text not null check (usage_key <> ''),
  usage_day date not null,
  chars_used integer not null default 0,
  primary key (usage_key, usage_day)
);

alter table translation_usage enable row level security;
-- Aucune policy — accédée uniquement par la service_role depuis `translate`.
