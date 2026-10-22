# Private rental information and editable website weekly property values

## Delivered
- `manage-properties.html`: secured staff dashboard accessible from the Brick & Ivy Staff Portal.
- `brickivy-property-staff`: independent authenticated Edge Function (JWT verified); it performs a live Discord guild membership check on **every** read or write.
- Owner role `1502871124378259526`: read rental details and save or reset website weekly values.
- Realtor role `1502870035176357968`: read rental information and set/remove a property reservation. Weekly value, region and storage presets remain Owner-only.
- `brickivy-properties`: public feed reads only company property basics and stored website value overrides; it does not query renter/income/payment fields.

## What rental staff can see
From OPFW `stocks_company_properties` for company_id 5, requested **only from the protected Edge Function**:
- `property_renter_cid` → renter CID and status (if present).
- `property_income` → source-reported property income.
- `property_last_pay` → last payment field (shown as provided/formatted).
- Optionally resolves the renter's first/last name from the `characters` table for those returned CID values, **only if the token permits**. Failure here does not block the rest of the staff view.

If the OPFW token does not permit rental columns, the endpoint falls back to basic property data and explicitly reports `rentalAvailable:false`. The UI shows "details unavailable" rather than wrongly calling rented houses vacant.

## Brick & Ivy Income (staff-only)

The former "OPFW property income" field on Property Management cards has been replaced by **Brick & Ivy Income**:

`Weekly rent price (website effective weekly cost) − Weekly maintenance cost (OPFW original property_cost)`.

- Positive difference: green with a leading **+** (e.g. `+$3,000.00`).
- Negative difference: red with a leading **−** (e.g. `-$1,500.00`).
- Zero: neutral `$0.00`. If either amount is missing, show `Not reported` instead of a misleading result.
- Recalculates immediately after an Owner saves or resets an override; no additional backend changes or new stored income records.
- This is a **weekly calculated margin**, not a claim that rent has actually been collected; tenant and payment details remain restricted to staff.

## Weekly property value overrides
- OPFW is **read-only**. An Owner's saved value changes the **Brick & Ivy website**; it does **not** change the game's rent charge or OPFW `property_cost`.
- New private table `brickivy_property_weekly_costs` stores `property_id`, nullable override, `updated_by`, `updated_at`.
- A separate private audit table `brickivy_property_weekly_cost_audit` records original and new overrides with actor/time.
- Both have RLS enabled, zero public policies, and no `anon`/`authenticated` table grants. Only privileged Edge Functions using Supabase service credentials can read/write.
- Ownership in company 5 is rechecked against live OPFW results before accepting a change. There is no public direct write API.
- `null` override resets that property to the OPFW-reported value.
- The public website caches feed values for up to ~90 seconds before the override is visible.

## Security checks
- Rental fields NEVER reach the public feed, even if a public visitor guesses a property ID.
- Every request to staff function requires a valid signed-in Supabase Discord identity, a current guild membership checked with the private Discord Bot Token, and Owner or Realtor role.
- Only Owner can call `saveWeeklyCost`. The staff frontend hiding controls is not the permission boundary.
- `OPFW_REST_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and `DISCORD_BOT_TOKEN` stay only in Supabase secrets. The browser receives only the user's own JWT.
- An unsuccessful optional renter-name lookup is handled gracefully without exposing any cross-company records or token.
- The existing Realtor Manager and its independent Edge Function remain unchanged.

## How to verify
1. Open `https://brickandivyhomes.com/admin.html`, sign in, click Property Management.
2. Owner: confirm the roster displays properties; change one weekly value and click Save.
3. Public `properties.html`: verify the new website value is visible after cache expiry (can take around 90 seconds).
4. Owner: click Use OPFW value; confirm the price reverts.
5. A Realtor with a current Discord guild Realtor role should see rental fields and a reservation toggle, but not weekly price/area/storage editing; forged Owner-only writes must return 403.
6. A visitor not signed into Supabase receives 401; direct access to the new tables with the publishable key is denied.
7. Confirm public `brickivy-properties` JSON contains no renter CID, tenant name, income, or last payment.
8. Verify rental info only where OPFW provides it. If rental fields are inaccessible, confirm the dashboard warning instead of displaying a false "not rented" status.

## Known limits
- This phase is a **website value override**, not an OPFW property mutation.
- A company's presence in the OPFW stock table does not guarantee the house is for sale.
- The optional renter name lookup depends on the read token's `characters` table permissions.
- Photo management, custom descriptions, and Realtor-specific per-feature permissions are future work.

## Additional listing controls

Owners may assign Los Santos/Sandy Shores/Paleto Bay and set weight/slot storage presets for each live OPFW property type. Realtors and Owners may reserve/unreserve homes. The public status calculation and block sorting are documented in [LISTING-AREAS-STATUS-STORAGE.md](LISTING-AREAS-STATUS-STORAGE.md).
