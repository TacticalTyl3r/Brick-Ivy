alter table public.brickivy_homepage_media
  drop constraint if exists brickivy_homepage_media_object_key_check;
alter table public.brickivy_homepage_media
  add constraint brickivy_homepage_media_object_key_check
  check (object_key ~ '^images/[0-9a-f-]{36}[.](jpg|png|webp)$');