-- Stable chronological inquiry numbers for Brick & Ivy.
-- Backfill original inquiries oldest-first, then assign a unique increasing
-- reference to each newly submitted inquiry. Do not renumber closed entries.
CREATE SEQUENCE IF NOT EXISTS public.brickivy_inquiry_number_seq AS bigint START WITH 1 INCREMENT BY 1;
ALTER TABLE public.brickivy_property_inquiries
  ADD COLUMN IF NOT EXISTS inquiry_number bigint;
WITH chronology AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC)::bigint AS number
  FROM public.brickivy_property_inquiries
)
UPDATE public.brickivy_property_inquiries AS inquiry
SET inquiry_number=chronology.number
FROM chronology
WHERE inquiry.id=chronology.id AND inquiry.inquiry_number IS NULL;
SELECT setval(
  'public.brickivy_inquiry_number_seq',
  coalesce((SELECT max(inquiry_number) FROM public.brickivy_property_inquiries),1),
  EXISTS (SELECT 1 FROM public.brickivy_property_inquiries)
);
ALTER TABLE public.brickivy_property_inquiries
  ALTER COLUMN inquiry_number SET DEFAULT nextval('public.brickivy_inquiry_number_seq'::regclass),
  ALTER COLUMN inquiry_number SET NOT NULL;
ALTER SEQUENCE public.brickivy_inquiry_number_seq OWNED BY public.brickivy_property_inquiries.inquiry_number;
CREATE UNIQUE INDEX IF NOT EXISTS brickivy_inquiry_number_unique
  ON public.brickivy_property_inquiries(inquiry_number);
REVOKE ALL ON SEQUENCE public.brickivy_inquiry_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.brickivy_inquiry_number_seq TO service_role;
