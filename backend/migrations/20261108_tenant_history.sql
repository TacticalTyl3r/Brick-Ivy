-- Brick & Ivy former-tenant archive.
-- Auto records contain observed dates; manual records can contain known dates.
-- Applied to Supabase project rcbbnzqmfvapwuqmpmhk on 2026-11-08.
CREATE TABLE IF NOT EXISTS public.brickivy_tenant_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 property_id text NOT NULL CHECK (length(property_id) BETWEEN 1 AND 80),
 property_address text NOT NULL DEFAULT '',
 renter_cid bigint CHECK (renter_cid IS NULL OR renter_cid > 0),
 renter_name text NOT NULL DEFAULT '',
 source text NOT NULL DEFAULT 'opfw' CHECK (source IN ('opfw','manual')),
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 ended_reason text CHECK (ended_reason IS NULL OR ended_reason IN ('vacated','changed','historical_entry')),
 move_in_on date,
 move_out_on date,
 notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT brickivy_tenant_history_dates CHECK (move_in_on IS NULL OR move_out_on IS NULL OR move_in_on <= move_out_on),
 CONSTRAINT brickivy_tenant_history_manual_ended CHECK (source <> 'manual' OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS brickivy_tenant_one_current_per_property
 ON public.brickivy_tenant_history(property_id)
 WHERE source='opfw' AND ended_at IS NULL;
CREATE INDEX IF NOT EXISTS brickivy_tenant_history_property
 ON public.brickivy_tenant_history(property_id,first_seen_at DESC);
CREATE INDEX IF NOT EXISTS brickivy_tenant_history_cid
 ON public.brickivy_tenant_history(renter_cid) WHERE renter_cid IS NOT NULL;
ALTER TABLE public.brickivy_tenant_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brickivy_tenant_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.brickivy_tenant_history TO service_role;
-- One locked transactional pass per OPFW snapshot avoids duplicate active rows.
CREATE OR REPLACE FUNCTION public.brickivy_sync_tenant_history(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
AS $$
DECLARE
 row_data jsonb; p_id text; p_address text; p_name text; p_cid bigint;
 old_id uuid; old_cid bigint; observed timestamptz := now();
 changed integer := 0;
BEGIN
 IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 1000 THEN
  RAISE EXCEPTION 'Invalid rental snapshot';
 END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows)
 LOOP
  p_id := trim(coalesce(row_data->>'propertyId',''));
  IF p_id !~ '^[a-zA-Z0-9_-]{1,80}$' THEN CONTINUE; END IF;
  p_address := left(trim(coalesce(row_data->>'propertyAddress','')),200);
  p_name := left(trim(coalesce(row_data->>'renterName','')),140);
  p_cid := NULL;
  IF coalesce(row_data->>'renterCid','') ~ '^[0-9]{1,15}$' THEN
   p_cid := (row_data->>'renterCid')::bigint;
   IF p_cid <= 0 THEN p_cid := NULL; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('brickivy-tenancy:'||p_id,5001));
  old_id := NULL; old_cid := NULL;
  SELECT id,renter_cid INTO old_id,old_cid
   FROM public.brickivy_tenant_history
   WHERE property_id=p_id AND source='opfw' AND ended_at IS NULL
   FOR UPDATE;
  IF old_id IS NOT NULL THEN
   IF old_cid IS NOT DISTINCT FROM p_cid THEN
    UPDATE public.brickivy_tenant_history
     SET last_seen_at=observed,
      renter_name=CASE WHEN p_name<>'' THEN p_name ELSE renter_name END,
      property_address=CASE WHEN p_address<>'' THEN p_address ELSE property_address END
     WHERE id=old_id;
   ELSE
    UPDATE public.brickivy_tenant_history SET
     ended_at=observed,
     ended_reason=CASE WHEN p_cid IS NULL THEN 'vacated' ELSE 'changed' END
    WHERE id=old_id;
    changed := changed+1;
   END IF;
  END IF;
  IF p_cid IS NOT NULL AND (old_id IS NULL OR old_cid IS DISTINCT FROM p_cid) THEN
   INSERT INTO public.brickivy_tenant_history
    (property_id,property_address,renter_cid,renter_name,source,first_seen_at,last_seen_at)
   VALUES (p_id,p_address,p_cid,p_name,'opfw',observed,observed);
   changed := changed+1;
  END IF;
 END LOOP;
 RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.brickivy_sync_tenant_history(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brickivy_sync_tenant_history(jsonb) TO service_role;
