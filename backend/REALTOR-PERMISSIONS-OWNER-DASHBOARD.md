# Brick & Ivy — Realtor Permissions + Owner Financial Dashboard

## Permission management
Open `https://brickandivyhomes.com/manage-permissions.html`, sign in with Discord as the Brick & Ivy Owner, and choose permissions for each Realtor. This page is also linked from the staff portal.

Permissions are associated with the **verified Discord user ID**, not the public Realtor name, character CID, or editable Supabase user metadata.

Available per-Realtor grants:
- Change property region (`can_edit_area`)
- Reserve / unreserve properties (`can_manage_reservations`)
- Edit public description (`can_edit_description`)
- Set/reset website weekly rent (`can_set_prices`)
- Change interior storage SU/object presets (`can_manage_storage`) — includes all 11 standard OPFW interiors, even if the company owns none of a particular type.
- Publish / unpublish (`can_publish`)
- Feature / unfeature homes (`can_feature`)
- Upload, remove, reorder and choose property images (`can_manage_photos`)

Defaults: **reservation changes enabled** for current Realtor guild members, all other changes disabled until the Owner explicitly enables them. The Owner always has full access. To configure a Realtor who has no numeric Discord ID in their profile, add it first through **Realtor Management**. The target must also hold the correct Brick & Ivy Discord Realtor role before grants can be saved.

All editing requests validate the caller's Supabase session, verified Discord identity, and live guild role. The property staff API reloads the caller's private grants for every request, and the image API independently checks photo grants. Editing UI is hidden or disabled for missing permissions, but authorization is performed **server-side**, not solely through the buttons. Every Owner permission save is audited with previous and updated values.

Database: `brickivy_realtor_permissions` and `brickivy_realtor_permission_audit`, both RLS protected and inaccessible to public anon/authenticated REST access. The database migration is `backend/migrations/20261022_realtor_granular_permissions.sql`.

## Owner dashboard

The Owner-only financial section appears at the top of `manage-properties.html` once authenticated as Owner. It displays total properties, rented, vacant, published, featured, and the following breakdown:

**Projected weekly rental revenue** = sum of the Brick & Ivy **website weekly rent price** (`weekly_cost_override`, falling back to OPFW `property_cost`) for **currently rented** company homes only.

**Weekly maintenance** = sum of each property's original OPFW `property_cost` across **every current company-owned property** — whether rented, vacant, reserved, published or unpublished.

**Net weekly income** = projected weekly rental revenue **minus** weekly maintenance for the **entire company stock**.

Example: Two occupied properties at $1,200 and $900 rent generate $2,100 projected weekly rent. If the maintenance fees of **all** company properties total $1,000, net weekly income is $1,100. Vacant properties contribute $0 to rent **but still contribute their maintenance**.

The calculations are done server-side in integer cents to avoid floating-point drift and returned only to the verified Owner as `financialSummary` from `brickivy-property-staff`; Realtor responses receive `null` for the financial summary.

**Data validity:** If OPFW rental occupancy is unavailable or any maintenance amount or any occupied home's rent is missing, the dashboard reports **Unavailable** instead of pretending the unknown value is $0. This is an estimated *weekly run-rate*, not a payment or cash-collection ledger. OPFW `property_income` historical totals and last-payment data are not double counted.

## Per-property weekly financial report (2026-10-22)

The financial snapshot includes a **Weekly income report** for verified Owners and Realtors with `can_view_financials=true`. Each property reports:

- **Weekly rental revenue**: its configured weekly rent when OPFW confirms it is rented; **$0** when confirmed vacant.
- **Weekly maintenance expense**: original OPFW `property_cost` **for every owned property**, including vacant, reserved and unpublished.
- **Weekly net**: rental revenue minus maintenance, computed in integer cents on the protected Edge Function.
- If occupancy or any needed amount is unknown, the relevant property figure is **Unavailable** rather than an invented value. The entire-company summary stays marked incomplete when needed.

The page supports property search, occupancy filtering, sorting by rent/maintenance/net, and a CSV export of the currently filtered rows. The CSV is generated in the browser only after the authenticated API has granted financial viewing permission; formulas in string fields are escaped. This remains a **projected weekly run-rate**, not a real payment ledger or historical cash flow.

## Owner change history & restoration

[Owner Website Change History](https://brickandivyhomes.com/manage-history.html), linked in the Staff Portal, aggregates recent events from:

- `brickivy_homepage_audit` (draft saves, publishes, reset and historical draft restoration)
- `brickivy_property_listing_audit` (region, reservation, storage, descriptions, publishing and featured controls)
- `brickivy_property_weekly_cost_audit` (weekly rent changes)
- `brickivy_realtor_permission_audit` (individual grants and revocations)

The server checks Supabase Auth, provider-verified Discord identity and **live Owner guild role** before querying any audits. History is private; the audit API returns a bounded collection of recent events, along with field-level before/after values and actor labels where available.

**Restore a past homepage version**: click **Restore this version to draft** on a previous `publish` event, confirm, then open the Homepage Editor to preview. The protected `brickivy-homepage` function fetches that recorded published snapshot, validates its content and saves it as a **private draft only**, under the current optimistic revision check. It does *not* alter public published content or publish automatically. After inspection, select **Publish Homepage** explicitly.

A matching database migration expands the homepage audit action constraint to include `restore_draft`. The view and restoration are Owner-only; financial viewer permissions never grant access to this history.

## Web polish
The public property cards now use consistent card layouts, stronger hover/focus treatments, responsive spacing and clearer featured-listing badges. Finance and permission pages have responsive mobile layouts. Reduced-motion settings are respected on property cards.

## Verification
1. Owner signs into Realtor Permissions; Realtor account must not be able to list or change any permission.
2. Grant a Realtor only description access. They should be able to save descriptions but not prices, photos, publishing or featured status. Direct protected API POSTs for denied actions must return HTTP 403.
3. Grant photo access. Confirm uploading/cover/reorder/removal succeeds, then revoke and verify a subsequent write fails.
4. Modify the Realtor's Discord ID; their old ID's grants must no longer apply.
5. Confirm Owner dashboard **weekly revenue = occupied weekly rents**, **maintenance = all stock maintenance**, **net = revenue − maintenance**, including periods where rent revenue is zero and expenses continue.
6. Confirm any unavailable OPFW rental data is clearly marked unavailable and is not treated as zero profit.
7. Test property listings, public Realtor page and Owner management after the deployment.

## All 11 OPFW storage interior presets

The `Storage by Interior` section in Property Management now always displays all eleven standard OPFW interiors, numbered 1–11 in numeric order: Motel, Trevor's Trailer, Janitor Apartment, Low-End Apartment, Lester's House, Franklin's House, Mid-End Apartment, Trevor's Beach House, Michael's Mansion, Franklin's Mansion and High-End Apartment.

The backend returns all eleven presets alongside any current nonstandard company property types, retaining previously saved capacity values. It distinguishes **not currently in inventory** from **preset not set**. Owners or Realtors granted `can_manage_storage` can configure or clear a standard interior preset even before the company acquires property of that type. The preset then applies automatically to any current or future owned property with the same OPFW interior code. Existing SU and object limits are unchanged by this update. This is website metadata; it does not alter in-game storage values or OPFW property records.
