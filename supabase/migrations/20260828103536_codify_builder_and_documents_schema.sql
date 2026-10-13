-- ═══════════════════════════════════════════════════════════════════
-- BuildPact — socle "builders & documents".
-- Migration IDEMPOTENTE : décrit l'état cible sans rien détruire.
-- Sur la base actuelle (objets déjà créés à la main via le dashboard)
-- elle ne fait quasiment rien ; sur une base vierge elle recrée tout.
-- ═══════════════════════════════════════════════════════════════════

-- ── builder_profiles ──────────────────────────────────────────────
create table if not exists public.builder_profiles (
  wallet        text primary key,
  display_name  text        not null default '',
  bio           text        not null default '',
  roles         text[]      not null default '{}',
  skills        text[]      not null default '{}',
  skill_levels  jsonb       not null default '{}',
  links         jsonb       not null default '{}',
  available     boolean     not null default true,
  avatar_url    text,
  -- colonnes héritées de la 1re version du profil, conservées pour ne
  -- pas casser les lignes existantes
  pseudo        text,
  github        text        not null default '',
  twitter       text        not null default '',
  portfolio     text        not null default '',
  availability  text        not null default 'open',
  updated_at    timestamptz not null default now()
);

alter table public.builder_profiles add column if not exists display_name text not null default '';
alter table public.builder_profiles add column if not exists roles        text[] not null default '{}';
alter table public.builder_profiles add column if not exists skill_levels jsonb  not null default '{}';
alter table public.builder_profiles add column if not exists links        jsonb  not null default '{}';
alter table public.builder_profiles add column if not exists available    boolean not null default true;
alter table public.builder_profiles add column if not exists avatar_url   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='builder_profiles_bio_check' and conrelid='public.builder_profiles'::regclass) then
    alter table public.builder_profiles add constraint builder_profiles_bio_check check (char_length(bio) <= 280);
  end if;
  if not exists (select 1 from pg_constraint where conname='builder_profiles_pseudo_check' and conrelid='public.builder_profiles'::regclass) then
    alter table public.builder_profiles add constraint builder_profiles_pseudo_check check (char_length(pseudo) between 2 and 32);
  end if;
  if not exists (select 1 from pg_constraint where conname='builder_profiles_availability_check' and conrelid='public.builder_profiles'::regclass) then
    alter table public.builder_profiles add constraint builder_profiles_availability_check check (availability in ('open','busy','closed'));
  end if;
end $$;

-- ── project_open_roles ────────────────────────────────────────────
create table if not exists public.project_open_roles (
  id          bigint generated always as identity primary key,
  project_pda text        not null,
  role_label  text        not null,
  "position"  integer     not null default 0,
  created_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='project_pda_format_chk' and conrelid='public.project_open_roles'::regclass) then
    alter table public.project_open_roles add constraint project_pda_format_chk check (project_pda ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='role_label_len_chk' and conrelid='public.project_open_roles'::regclass) then
    alter table public.project_open_roles add constraint role_label_len_chk check (char_length(role_label) between 1 and 40);
  end if;
end $$;

create index if not exists project_open_roles_project_pda_idx
  on public.project_open_roles (project_pda, "position");

-- ── builder_contact_requests ──────────────────────────────────────
create table if not exists public.builder_contact_requests (
  id          bigserial primary key,
  from_wallet text        not null,
  to_wallet   text        not null,
  role_text   text        not null default '',
  message     text        not null default '',
  created_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='from_wallet_format_chk' and conrelid='public.builder_contact_requests'::regclass) then
    alter table public.builder_contact_requests add constraint from_wallet_format_chk check (from_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='to_wallet_format_chk' and conrelid='public.builder_contact_requests'::regclass) then
    alter table public.builder_contact_requests add constraint to_wallet_format_chk check (to_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='role_text_len_chk' and conrelid='public.builder_contact_requests'::regclass) then
    alter table public.builder_contact_requests add constraint role_text_len_chk check (char_length(role_text) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname='message_len_chk' and conrelid='public.builder_contact_requests'::regclass) then
    alter table public.builder_contact_requests add constraint message_len_chk check (char_length(message) <= 500);
  end if;
end $$;

create index if not exists builder_contact_requests_to_idx
  on public.builder_contact_requests (to_wallet, created_at desc);

-- ── builder_ratings ───────────────────────────────────────────────
create table if not exists public.builder_ratings (
  id          bigserial primary key,
  from_wallet text        not null,
  to_wallet   text        not null,
  stars       smallint    not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='from_wallet_format_chk' and conrelid='public.builder_ratings'::regclass) then
    alter table public.builder_ratings add constraint from_wallet_format_chk check (from_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='to_wallet_format_chk' and conrelid='public.builder_ratings'::regclass) then
    alter table public.builder_ratings add constraint to_wallet_format_chk check (to_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='no_self_rating_chk' and conrelid='public.builder_ratings'::regclass) then
    alter table public.builder_ratings add constraint no_self_rating_chk check (from_wallet <> to_wallet);
  end if;
  if not exists (select 1 from pg_constraint where conname='stars_range_chk' and conrelid='public.builder_ratings'::regclass) then
    alter table public.builder_ratings add constraint stars_range_chk check (stars between 1 and 6);
  end if;
  -- indispensable au onConflict('from_wallet,to_wallet') de l'upsert
  if not exists (select 1 from pg_constraint where conname='unique_rating_pair' and conrelid='public.builder_ratings'::regclass) then
    alter table public.builder_ratings add constraint unique_rating_pair unique (from_wallet, to_wallet);
  end if;
end $$;

create index if not exists builder_ratings_to_idx on public.builder_ratings (to_wallet);

-- ── project_documents ─────────────────────────────────────────────
create table if not exists public.project_documents (
  id              bigserial primary key,
  project_pda     text        not null,
  uploader_wallet text        not null,
  title           text        not null default '',
  file_path       text        not null,
  mime_type       text        not null default 'application/octet-stream',
  size_bytes      bigint      not null default 0,
  status          text        not null default 'pending',
  founder_note    text        not null default '',
  reviewed_by     text,
  reviewed_at     timestamptz,
  supersedes_id   bigint references public.project_documents(id) on delete set null,
  created_at      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='project_pda_format_chk' and conrelid='public.project_documents'::regclass) then
    alter table public.project_documents add constraint project_pda_format_chk check (project_pda ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='uploader_wallet_format_chk' and conrelid='public.project_documents'::regclass) then
    alter table public.project_documents add constraint uploader_wallet_format_chk check (uploader_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  end if;
  if not exists (select 1 from pg_constraint where conname='title_len_chk' and conrelid='public.project_documents'::regclass) then
    alter table public.project_documents add constraint title_len_chk check (char_length(title) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname='founder_note_len_chk' and conrelid='public.project_documents'::regclass) then
    alter table public.project_documents add constraint founder_note_len_chk check (char_length(founder_note) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname='status_chk' and conrelid='public.project_documents'::regclass) then
    alter table public.project_documents add constraint status_chk check (status in ('pending','approved','changes_requested'));
  end if;
end $$;

create index if not exists project_documents_project_idx
  on public.project_documents (project_pda, created_at desc);

-- ── Vues d'agrégat ────────────────────────────────────────────────
create or replace view public.builder_ratings_summary as
  select to_wallet,
         round(avg(stars), 1)   as avg_stars,
         count(*)::integer      as rating_count
    from public.builder_ratings
   group by to_wallet;

create or replace view public.project_documents_summary as
  select project_pda,
         count(*)::integer   as doc_count,
         max(created_at)     as latest_at
    from public.project_documents
   group by project_pda;

-- ═══ RLS ═══════════════════════════════════════════════════════════
-- Principe : AUCUNE écriture directe depuis le navigateur sur ces cinq
-- tables. Toutes les écritures passent par les Edge Functions, qui
-- vérifient une signature wallet puis utilisent la service_role key
-- (laquelle bypass RLS). On n'ouvre donc QUE des policies SELECT, et
-- uniquement là où l'UI a besoin de lire en anonyme.
alter table public.builder_profiles        enable row level security;
alter table public.project_open_roles      enable row level security;
alter table public.builder_contact_requests enable row level security;
alter table public.builder_ratings         enable row level security;
alter table public.project_documents       enable row level security;

-- Lecture publique : annuaire des builders (BuildersPage) et rôles
-- ouverts affichés sur les pages publiques de projet.
drop policy if exists profiles_select_public on public.builder_profiles;
-- doublon exact de la policy ci-dessous, hérité de la création manuelle
drop policy if exists profiles_public_read  on public.builder_profiles;
create policy profiles_public_read on public.builder_profiles
  for select using (true);

drop policy if exists project_open_roles_public_read on public.project_open_roles;
create policy project_open_roles_public_read on public.project_open_roles
  for select using (true);

-- Lecture publique des AGRÉGATS de notes uniquement (moyenne + nombre).
-- La table builder_ratings elle-même reste fermée : personne ne doit
-- pouvoir lire qui a mis quelle note à qui.
grant select on public.builder_ratings_summary to anon, authenticated;

-- builder_contact_requests : messages privés → aucune policy, table
-- totalement fermée au client.
-- builder_ratings : voir ci-dessus → aucune policy.
-- project_documents : livrables confidentiels → aucune policy, et la vue
-- d'agrégat n'est PAS exposée à anon (elle révélerait l'activité des
-- projets). L'Edge Function `vault` est le seul chemin d'accès.
revoke all on public.project_documents_summary from anon, authenticated;

-- ═══ Buckets Storage ══════════════════════════════════════════════
-- builder-avatars : PUBLIC (les avatars s'affichent dans l'annuaire).
-- project-documents : PRIVÉ (accès uniquement via signed URL générée
-- par l'Edge Function `vault` après vérification d'appartenance).
insert into storage.buckets (id, name, public)
values ('builder-avatars', 'builder-avatars', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do update set public = excluded.public;

-- Aucune policy storage sur ces buckets : l'upload passe toujours par une
-- signed upload URL émise côté serveur, jamais par un accès direct client.
