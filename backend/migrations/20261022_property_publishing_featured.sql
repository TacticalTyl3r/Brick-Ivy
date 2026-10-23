-- Brick & Ivy publishing controls. Existing OPFW company properties remain public by default.
ALTER TABLE public.brickivy_property_listing_settings
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

ALTER TABLE public.brickivy_property_listing_settings
  DROP CONSTRAINT IF EXISTS brickivy_property_listing_settings_featured_requires_published;
ALTER TABLE public.brickivy_property_listing_settings
  ADD CONSTRAINT brickivy_property_listing_settings_featured_requires_published
    CHECK (published = true OR featured = false);

ALTER TABLE public.brickivy_property_listing_audit
  DROP CONSTRAINT IF EXISTS brickivy_property_listing_audit_action_check;
ALTER TABLE public.brickivy_property_listing_audit
  ADD CONSTRAINT brickivy_property_listing_audit_action_check
    CHECK (action IN ('set_area','set_reserved','set_storage','set_description','set_published','set_featured'));