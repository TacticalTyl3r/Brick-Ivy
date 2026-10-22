# Brick & Ivy — regions, reservations, block sorting and storage presets

## Public property browsing

The OPFW source is `https://opfw.gg/api/rest/1973/stocks_company_properties` with `company_id=5`. Its `block_id`, `property_id`, `property_type`, `property_address` and other source fields are fetched by **Supabase**, not in visitors' browsers.

The public `properties.html` page now:
- Places every confirmed **Unavailable** (rented) property **at the bottom** of the list.
- Sorts all other properties together by `block_id` in ascending natural/numeric order, then address; unavailable properties are also ordered by block within their final section.
- Honors optional Price: low/high sorting **within** the available vs. unavailable divisions. Home listing previews also put unavailable last.
- Displays the OPFW block number alongside each property.
- Shows **Available** if and only if the OPFW renter lookup succeeds with a complete matching company snapshot and finds no renter.
- Shows **Unavailable** when an active renter CID is confirmed, regardless of a staff reservation.
- Shows **Reserved** when a verified staff member marks the property reserved and no active renter is detected.
- Retains neutral **In portfolio** when occupancy cannot be verified. A neutral status is not a guarantee that a house is for sale.
- Displays the assigned area (Los Santos, Sandy Shores, Paleto Bay), when one has been configured.
- Shows the configured storage capacity (kg and/or slots) by OPFW `property_type`, if the Owner has entered one.

## Property Management

At `manage-properties.html`, the existing authenticated staff dashboard adds:
- **Region:** Owner assigns an area per property, with an Unassigned option. This metadata is stored in `public.brickivy_property_listing_settings`. Visitors can filter by the assigned area.
- **Reservation:** Both Owner and Realtor Discord roles may mark and remove Reserved. The API rejects a new reservation on a confirmed-rented property; rented status takes precedence on public pages.
- **Storage by property type:** The dashboard derives the type list from the live OPFW portfolio and shows one editable preset per type. Owners can enter an actual **storage weight (kg)** and **storage slots** for each type. Values are deliberately blank until entered — OPFW's readonly `stocks_company_properties` table provides `property_type` but **does not list storage capacities**.
- **Existing functionality:** Owners retain weekly rent price overrides. Authenticated staff retain private renter character, payment, income, and calculated weekly Brick & Ivy margin. These details are not included in public JSON.

## Protected storage, permissions and audit

`backend/migrations/20261022_property_listing_settings_storage.sql` creates:
- `public.brickivy_property_listing_settings`
- `public.brickivy_property_type_storage`
- `public.brickivy_property_listing_audit`

All three tables have RLS enabled, no public policies, and revoked `anon` and `authenticated` grants. Only Supabase service-role Edge Functions access them.

The Edge Function `brickivy-property-staff` verifies Supabase Auth Discord identity **and live guild roles on every call**:
- `setArea` (Owner)
- `setReservation` (Owner or Realtor)
- `setStorage` (Owner)
- Existing `saveWeeklyCost` (Owner)
- `list` (Owner or Realtor)

The read-only public `brickivy-properties` Edge Function fetches only the minimum occupancy data needed to derive a public status and omits renter CIDs/names, property income, and payment fields. It joins published safe region/slot/weight metadata but never returns audit logs or user IDs.

## Important semantics and tests

1. OPFW database is **read-only**: website region, reservation, pricing and storage controls cannot modify the game or in-game storage. They control the website's labels and displayed figures only.
2. Default area and capacity are blank until set by an Owner. Don't invent neighborhoods or storage amounts.
3. An occupied house always displays Unavailable even if someone left a Reserved flag set.
4. Failed/partial renter lookups must not falsely label homes Available.
5. Check public browsing: block 2 sorts before block 10, unavailable block 1 remains at the bottom, and area filters work.
6. Reserve and unreserve an unrented house as a Realtor; confirm the public badge changes.
7. Change one region and save one storage preset as Owner; confirm public listing and detail pages reflect the changes.
8. Verify unauthenticated calls and non-Owner edits are rejected, and renter fields are absent from public feed. Public Edge Function caches may take approximately 90 seconds to refresh.

Source fields documented at https://opfw.gg/api/rest.
