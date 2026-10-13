-- supabase/migrations/20260919090000_add_lang_to_translated_tables.sql
-- Langue d'écriture des textes lus par d'autres builders.
--
-- Pourquoi : TranslatedMessage envoyait CHAQUE message à DeepL, y compris
-- ceux déjà rédigés dans la langue du lecteur — DeepL les renvoyait
-- inchangés, mais les caractères étaient comptés dans le quota. Sur un fil
-- francophone lu par des francophones, c'était l'essentiel du quota dépensé
-- pour rien. On ne peut pas détecter la langue d'origine après coup : il
-- faut l'avoir stockée à l'écriture. C'est ce que fait cette colonne.
--
-- Nullable et sans valeur par défaut, volontairement : toutes les lignes
-- écrites AVANT cette migration ont `lang = null`, ce qui signifie « langue
-- inconnue » et déclenche l'ancien comportement (appel de traduction). Un
-- default 'fr' aurait affirmé une langue qu'on n'a jamais mesurée et
-- masquerait pour de bon les messages anglais de l'historique.
--
-- ⚠️ La table des demandes de contact s'appelle `builder_contact_requests`
-- (et non `contact_requests`) — vérifié dans supabase/functions/contact.
alter table project_chat_messages   add column if not exists lang text;
alter table network_posts           add column if not exists lang text;
alter table network_post_comments   add column if not exists lang text;
alter table builder_contact_requests add column if not exists lang text;
