# Brick & Ivy — Multiple property photos

## Delivered

- Each company property now has an expandable **Manage photos** section in `manage-properties.html`.
- Owner role can upload **multiple JPEG, PNG, or WebP images** per property in a single selection, set the cover image, move images up/down, and delete images.
- Up to **24 photos per property**. Each file is at most **6 MiB**. File type must match image signature and declared MIME.
- The **first photo becomes the cover**. Owners can change that later. Public cards use the chosen cover image, and `property.html` provides a full gallery with previous/next navigation and clickable thumbnails.
- Images are stored in the public-read Supabase bucket `brickivy-property-photos`. The bucket rejects other MIME types and files above 6 MiB.
- Photo metadata lives in `public.brickivy_property_photos`, with per-property order, cover choice, original filename and actor.
- No manual file URLs or OPFW write permissions are required. The gallery is part of the website, not the in-game property database.

## Security

- Mutations are routed only through the new Edge Function `brickivy-property-photos` (`verify_jwt=true`), which on **each request** validates the user's Supabase Discord identity and current Discord guild role.
- **Owner only** uploads, chooses cover, reorders or removes images. Realtors may open the read-only gallery; public visitors view only the published cover/gallery from the separate sanitized `brickivy-properties` feed.
- The function rechecks the requested `property_id` against the OPFW Brick & Ivy company stock (`company_id=5`) before accessing or mutating a property gallery.
- `brickivy_property_photos` has RLS and revoked `anon`/`authenticated` grants. There are **no public upload/delete policies** on `storage.objects`.
- **Storage images are deliberately public** once uploaded; do not upload photos intended to be confidential.
- Tokens (`OPFW_REST_TOKEN`, Discord bot, Supabase service role) remain in Supabase secrets and never enter the browser.

## Test

1. Sign in as Owner at `https://brickandivyhomes.com/manage-properties.html`.
2. Open a property's **Manage photos** section and select several valid image files. Verify the uploaded count and previews.
3. Make a later photo the cover; confirm the card thumbnail updates on the public `properties.html` page after the feed cache expires (approximately 90 seconds).
4. Reorder images using Up/Down. On `property.html?id=<property-id>` use arrows and thumbnails to view every photo.
5. Remove an image; verify it disappears from the public gallery. If the cover is removed, the next photo is promoted.
6. Verify a Realtor can see the gallery but not edit it, and unauthenticated or non-Owner upload/reorder requests are denied.
7. Confirm the original weekly pricing, region, rental status and storage preset data still appear as before.

## Configuration
Deployed to Supabase project `rcbbnzqmfvapwuqmpmhk`. SQL migration is `backend/migrations/20261022_property_photo_galleries.sql`; backend source is `backend/edge-functions/brickivy-property-photos/index.ts`.

## Interior sort
The `Storage by Interior` list is sorted in natural numeric order by raw OPFW `property_type` values: **1, 2, ... 10, 11**, not the previous alphabetical/lexicographic ordering. All 11 types remain available.
