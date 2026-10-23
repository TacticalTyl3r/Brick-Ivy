# Brick & Ivy — Owner Publishing and Featured Homes

## What owners can do
Sign in to `https://brickandivyhomes.com/manage-properties.html` as a Discord-verified Brick & Ivy Owner.

Each company property now has a separate **Website visibility** panel:
- **Publish property** makes it visible on the public homepage, all-property page, and public detail URL.
- **Unpublish property** hides it from those public pages and the **public JSON feed**. It remains visible and fully editable to authorized staff, including prices, reservations, interior/storage presets, description and photos.
- **Feature on homepage** places a published home ahead of ordinary properties in the three homepage cards; **Remove featured** restores normal placement.
- Unpublishing a featured property also removes its featured status. A property must be published before it can be featured.
- A **View public listing** link appears for published properties.
- A **Website visibility** dropdown filters staff inventory to All, Published, Unpublished and Featured, independently of rental-status filtering.
- Staff counts display the total, published and featured homes.
- Realtors can view publish/feature status but only Owners can change either setting.

The homepage shows up to **three published properties**: featured properties first (ordered by normal occupancy/block sequence within the featured group), followed by ordinary published homes if fewer than three are featured. Every featured property is identified with a small badge on listing cards.

## Data flow and security
- New boolean flags `brickivy_property_listing_settings.published` and `featured` live in the dedicated Brick & Ivy Supabase project. Existing properties **default to published** and **not featured**; the migration does not unexpectedly hide existing homes.
- `featured` implies `published` through the database constraint `brickivy_property_listing_settings_featured_requires_published`.
- `setPublished` and `setFeatured` are Owner-only actions on `brickivy-property-staff`. Every request verifies the supplied property ID against the live OPFW company 5 stock, validates the authenticated user's Supabase Discord identity and fetches Discord guild roles live. The existing RLS/private backend access model remains unchanged.
- Every successful toggle writes to `brickivy_property_listing_audit` as `set_published` or `set_featured`, including before/after values.
- Saving an area, reservation or overview preserves the current `published` and `featured` flags. Changing publication/featured preserves area, reservation and description; the existing weekly-price table, gallery metadata and storage presets remain unchanged.
- The public `brickivy-properties` Edge Function reads only the explicit public settings and **filters unpublished properties before serializing the response**. Its public result set no longer includes hidden listings, so visitors cannot view a hidden property's detail page by ID.
- Cached public listings may take up to approximately **2 minutes** to reflect changes due to edge and CDN caching. Already loaded pages may need a refresh; remote clients may retain prior data.
- Publicly stored photo object URLs remain independently accessible to anyone who knows the URL because the photo bucket is public; unpublished means removed from the public **listing feed and pages**, not the revocation of previously shared photo URLs.

## Deployment
- SQL migration: `backend/migrations/20261022_property_publishing_featured.sql`
- Edge Functions: `backend/edge-functions/brickivy-property-staff/index.ts` and `backend/edge-functions/brickivy-properties/index.ts`
- Frontend: `assets/brickivy-property-staff.js`, `assets/site.js`, `assets/styles.css`, `manage-properties.html`, public `index.html`, `properties.html`, `property.html`, `realtors.html`

## Manual acceptance test
1. Confirm existing properties are published by default and the homepage continues displaying three.
2. As Owner, unpublish a known property. Staff still see and can edit it, but after the public cache expires it disappears from the API, home and property search. The original public `property.html?id=...` link shows the not-found state.
3. Republish; public pages display it after cache expiry.
4. Feature one or two published properties. Confirm they lead the homepage collection and remaining cards come from normal published properties; unfeature and verify normal block ordering returns.
5. Unpublish a featured property, confirm both flags are false; republish and verify featured status stays off until explicitly enabled.
6. Edit area, reservation and overview on a featured property and confirm featured/publication flags stay unchanged. Edit publishing on a customized property and confirm description, area, reserved and pricing remain intact.
7. A Realtor can see visibility status but has no publishing buttons; manually POST to either protected action as Realtor should receive HTTP 403.
