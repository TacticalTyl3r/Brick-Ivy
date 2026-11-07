-- Persist per-Discord-role permissions. Existing per-user grants remain archived
-- but are no longer read for authorization. Do not copy individual grants to
-- a shared role: doing so could elevate every member of that role.
CREATE TABLE IF NOT EXISTS public.brickivy_role_permissions (
 discord_role_id text PRIMARY KEY CHECK (discord_role_id ~ '^[0-9]{17,20}$'),
 can_edit_area boolean NOT NULL DEFAULT false,
 can_manage_reservations boolean NOT NULL DEFAULT false,
 can_edit_description boolean NOT NULL DEFAULT false,
 can_set_prices boolean NOT NULL DEFAULT false,
 can_manage_storage boolean NOT NULL DEFAULT false,
 can_publish boolean NOT NULL DEFAULT false,
 can_feature boolean NOT NULL DEFAULT false,
 can_manage_photos boolean NOT NULL DEFAULT false,
 can_view_financials boolean NOT NULL DEFAULT false,
 can_manage_inquiries boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS public.brickivy_role_permission_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 discord_role_id text NOT NULL,
 actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 previous jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated jsonb NOT NULL DEFAULT '{}'::jsonb,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brickivy_role_permission_audit_role_date
 ON public.brickivy_role_permission_audit(discord_role_id,changed_at DESC);
ALTER TABLE public.brickivy_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brickivy_role_permission_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brickivy_role_permissions FROM anon,authenticated;
REVOKE ALL ON public.brickivy_role_permission_audit FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.brickivy_role_permissions TO service_role;
GRANT SELECT,INSERT ON public.brickivy_role_permission_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.brickivy_role_permission_audit_id_seq TO service_role;
