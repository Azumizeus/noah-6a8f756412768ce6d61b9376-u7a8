-- Pendant anglais de about_text (le site est bilingue FR/EN).
alter table project_media
  add column about_text_en text;

alter table project_media
  add constraint project_media_about_text_en_len
  check (about_text_en is null or char_length(about_text_en) <= 4000);
