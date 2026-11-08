-- Add a dedicated permission for Discord managers to enter historical tenants.
-- Applied to Brick & Ivy Supabase on 2026-11-08.
-- Existing grants remain unchanged; Owner can opt a Manager role into access.
-- Record removal remains owner-only in brickivy-property-staff.
ALTER TABLE public.brickivy_role_permissions
 ADD COLUMN IF NOT EXISTS can_manage_tenant_history boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.brickivy_role_permissions.can_manage_tenant_history
 IS 'Allow a verified Discord role to add older tenant records without Owner-level deletion.';
