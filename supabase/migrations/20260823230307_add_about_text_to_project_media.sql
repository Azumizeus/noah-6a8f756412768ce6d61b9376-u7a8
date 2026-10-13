-- Texte "À propos" (version FR) attaché à la fiche média d'un projet.
alter table project_media
  add column about_text text;

alter table project_media
  add constraint project_media_about_text_len
  check (about_text is null or char_length(about_text) <= 4000);
