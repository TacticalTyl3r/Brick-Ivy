# OPFW → Brick & Ivy live property listings

The public property listing pipeline is implemented. The read-only bearer token has been saved in the dedicated Brick & Ivy Supabase project. The OPFW endpoint was corrected to `https://opfw.gg/api/rest` on October 22, 2026; a successful production feed response is still awaiting verification.

## Data flow

- **OPFW Readonly REST API V3** → `https://opfw.gg/api/rest/1973/stocks_company_properties`.
- The Supabase Edge Function `brickivy-properties` performs server-to-server GET:
  - `select=company_id,block_id,property_id,property_name,property_type,property_address,property_cost`
  - `where=company_id=5`
  - `Authorization: Bearer <private token>` sent **only from Supabase**.
- The function verifies the company on **every returned row**, limits response size, removes anything outside the public field allowlist, and emits the site's safe listing format.
- A separate private OPFW request reads only `company_id,property_id,property_renter_cid` to determine whether a company property is currently rented. A confirmed positive renter CID changes the **public status string** to `unavailable` and the website badge to **Unavailable**. The renter's identity is discarded server-side and never enters the public feed.
- If rental fields are inaccessible, the public feed stays functional and uses neutral `listed` / **In portfolio**, never falsely advertising a property as vacant. Status refreshes with the existing short feed cache.
- Public website `index.html`, `properties.html`, `property.html` → `https://rcbbnzqmfvapwuqmpmhk.supabase.co/functions/v1/brickivy-properties`.
- No OPFW credentials, renter CIDs, income, SQL, or service-role keys reach the browser or GitHub.
- Results are cached for 60 seconds per running Edge Function instance; HTTP response is also cacheable for 30 seconds. Multiple instances can fetch independently.

## One-time secret setup (already completed)

Supabase project: **Brick & Ivy Real Estate** / `rcbbnzqmfvapwuqmpmhk`.

1. Open [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/rcbbnzqmfvapwuqmpmhk/settings/functions) in the **Brick & Ivy** project.
2. Add a secret with the exact name `OPFW_REST_TOKEN`.
3. For its value, paste the **read-only OPFW API bearer token**, without the `Bearer ` prefix. Use an authorized token for service `1973`; use a rotated token if it was previously exposed in chat.
4. Save. Supabase makes function secrets available without redeployment. This secret was supplied before the endpoint correction and need not be entered again.
5. Open `https://rcbbnzqmfvapwuqmpmhk.supabase.co/functions/v1/brickivy-properties` and verify a JSON array is returned. `[]` is a valid empty company feed, and a `SOURCE_NOT_CONFIGURED` 503 indicates the token has not reached Supabase. A 502 `UPSTREAM_UNAVAILABLE` indicates invalid credentials, upstream errors, or an unexpected data response; inspect Supabase Edge Function logs for generic error details.
6. Open the public Properties page. Records should show automatically without re-publishing static JSON.

**Never paste bearer secrets into GitHub, the public website, screenshots, or chat.** Store them only in Supabase Edge Function Secrets.

## Behavior and security boundaries

- When OPFW confirms a complete renter snapshot: property is **Unavailable** if rented, **Reserved** if a staff reservation flag is set, otherwise **Available**. When occupancy cannot be verified, unreserved homes show neutral **In portfolio**. This is calculated privately and never reveals renter information.
- `property_cost` is displayed as a **reported property value**, not a confirmed asking price.
- Property `id`, name, type, address and original cost come from OPFW. The displayed weekly value can now be overridden by an Owner in the secured `manage-properties.html` dashboard without modifying OPFW. Private rental details are shown in that staff dashboard, never here. See [PROPERTY-STAFF.md](PROPERTY-STAFF.md). Photos, custom descriptions, and manual publication management remain future work.
- If OPFW fails, the website displays **temporarily unavailable**, not an invented empty inventory or misleading stale sample properties.
- The live feed is public, but the OPFW token is private and checked only server-side. Owner/Realtor Discord sign-in and the existing `brickivy-admin` endpoint are unrelated and remain unchanged.
- Readonly API reference: https://opfw.gg/api/rest . `/op-framework` API at `p323.fivem.opfw.me` is a **different API surface** and is not used for the company stocks table.

## After configuration: tests

- Confirm 0 or more returned records all belong to company 5, match game names/addresses and prices, and include **no renter, income, or bearer fields**.
- Confirm `properties.html` search, type filter, price sorting, and detail view work.
- Confirm the homepage correctly shows actual returned properties.
- Confirm missing/invalid API token yields an error and no private raw OPFW output.
- Confirm existing `realtors.html`, Discord sign-in and Realtor Management still work.

## Region, block and storage metadata

The public feed includes `blockId` from OPFW and the Owner-defined `area`, `storageKg` and `storageSlots` fields, joined from protected Supabase metadata. Property browsing orders all non-unavailable listings by block, with unavailable homes last. The staff-side reservation flag and area are private editable records, but the resulting public badge and selected area are public-safe. See [detailed setup](LISTING-AREAS-STATUS-STORAGE.md).
