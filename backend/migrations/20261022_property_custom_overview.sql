-- Brick & Ivy curated property descriptions are website-only and public-facing.
-- Owner mutations require live Discord role verification in brickivy-property-staff.
alter table public.brickivy_property_listing_settings
  add column if not exists description text not null default '';
alter table public.brickivy_property_listing_settings
  drop constraint if exists brickivy_property_listing_settings_description_length;
alter table public.brickivy_property_listing_settings
  add constraint brickivy_property_listing_settings_description_length
  check (char_length(description) <= 3000);
alter table public.brickivy_property_listing_audit
  drop constraint if exists brickivy_property_listing_audit_action_check;
alter table public.brickivy_property_listing_audit
  add constraint brickivy_property_listing_audit_action_check
  check (action in ('set_area','set_reserved','set_storage','set_description'));
