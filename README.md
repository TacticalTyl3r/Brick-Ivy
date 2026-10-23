# Brick & Ivy Real Estate

Public website for Brick & Ivy Real Estate in Legendary Roleplay.

**Website:** https://brickandivyhomes.com  
**Hosting:** GitHub Pages (branch `main`, repository root)  
**Status:** Live OPFW property listings, Discord staff access, Owner-managed Realtor profiles, weekly rent adjustments, reservations, regions, storage presets, and secure multi-image property galleries are deployed. OPFW bearer credentials are stored in Supabase secrets. Owner-written property descriptions and Owner-controlled publishing/featured listings are active; public inquiries remain future work.

## Pages

- `index.html` — branded homepage, property search, featured listings, neighborhoods, company introduction.
- `properties.html` — property search, filters and sorting.
- `property.html?id=...` — published property detail and photo gallery.
- `realtors.html` — public Realtor and Owner directory, grouped by position and loaded from the live Supabase public endpoint.
- `admin.html` — Discord authenticated staff portal with live verification of guild roles.
- `manage-realtors.html` — Owner-only Realtor management, public profile editing, position sections and persistent ordering.
- `manage-properties.html` — authenticated property management and a private company-wide financial snapshot showing rented-property revenue minus maintenance for every company property. The per-property report and CSV export are not included.
- `manage-permissions.html` — Owner-only per-Realtor permission toggles for property descriptions, weekly rent, regions, storage, reservation changes, publishing, featured homes and photo management.
- `manage-homepage.html` — Owner-only homepage editing studio with private drafts, live preview, publish and restore controls.
- `manage-history.html` — Owner-only, searchable website audit timeline with the option to restore prior homepage publications into a private draft.

## Live Owner Homepage Editor and financial visibility

From the [Staff Portal](https://brickandivyhomes.com/admin.html), the Owner can open the [Homepage Editor](https://brickandivyhomes.com/manage-homepage.html) to customize the hero, headings, descriptions, announcements and homepage sections with **private drafts and one-click publishing**. The editor now supports **direct JPEG/PNG/WebP image uploads**, a reusable image library, section reordering, color controls, five theme presets and alternate homepage layouts. The homepage content lives in Supabase, so normal edits do not require GitHub commits.

The Owner can also use [Realtor Permissions](https://brickandivyhomes.com/manage-permissions.html) to enable the individual **View Financial Snapshot** permission. This permits access to the private weekly rental revenue, total company maintenance and net weekly income view without giving the Realtor other editing powers. It is disabled by default and independently checked server-side.

See [Homepage Editor and financial visibility guide](backend/HOMEPAGE-EDITOR-FINANCIAL-VISIBILITY.md).

## Site-wide light and dark mode

Every Brick & Ivy page—public homepage, listings, property details, Realtor directory, Staff Portal, Realtor Management, Property Management, Realtor Permissions and the Owner Homepage Editor—includes a shared **Light / Dark** appearance toggle in the header (the icon remains visible on mobile).

- Defaults to the visitor's device light/dark preference on first visit.
- Clicking the header toggle explicitly selects the other mode and stores it under the `brickivy-color-mode` browser preference. The choice follows the visitor across all pages on the same origin and overrides system changes until toggled again.
- Theme choice is **individual to the visitor**, not an Owner-global appearance setting. Clearing site storage returns to automatic system preference.
- All management cards, forms, photo galleries, income snapshots, table-style controls and Owner preview panels use an accessible darker surface palette, with the homepage custom theme/palette still supported.
- The script `assets/theme.js` runs in the document head before stylesheets to prevent a light-mode flash. `assets/dark-mode.css` loads after `assets/styles.css` and only applies dark styles when the document is marked dark.
- No service keys, database writes, third-party libraries or sign-in privileges are involved.

## Company financial snapshot and change history

Owners and explicitly financial-authorized Realtors can view company-wide weekly rental revenue, **maintenance for all company properties**, and net income in [Property Management](https://brickandivyhomes.com/manage-properties.html). The separate per-property weekly report, filters, calculations and CSV export have been removed. Figures remain projected weekly values, not payment receipts.

Owners can review a private [Website Change History](https://brickandivyhomes.com/manage-history.html), covering homepage edits, property settings, rental prices and Realtor permissions. A previous published homepage revision can be restored to a **draft**, reviewed and then explicitly published. Restoring does not change the live homepage until a separate Publish action.

Full implementation: [Realtor permissions, financial reports and change history](backend/REALTOR-PERMISSIONS-OWNER-DASHBOARD.md).

## Publishing and featured homes

Each Brick & Ivy property is published by default. Verified Owners can unpublish a property (removes its public record and detail URL without deleting staff data) or mark published homes as Featured from Property Management. The homepage prioritizes featured homes, then fills up to three slots with other published properties. Realtors can see publication status but cannot change it. Details: [Property publishing setup and tests](backend/PROPERTY-PUBLISHING.md).

## Secure Realtor permissions and Owner income reporting

The Owner can assign individual Realtor editing permissions at [Realtor Permissions](https://brickandivyhomes.com/manage-permissions.html). Grants are verified server-side against Supabase Discord authentication and live guild roles. Photo changes have an independent server-side permission check. New Realtors retain reservation access, but no other edit grants until the Owner enables them.

The Owner dashboard calculates **net weekly income = rent from currently rented properties − original OPFW maintenance cost for every company property (including empty homes)**. Estimates are omitted if occupancy or costs are incomplete. See the [implementation, security rules and verification guide](backend/REALTOR-PERMISSIONS-OWNER-DASHBOARD.md).

## Financial snapshot and change history

- [Property Management](https://brickandivyhomes.com/manage-properties.html): financial viewers can review company-wide projected weekly rental revenue, maintenance expenses for the entire portfolio, and net weekly income. Individual property-level rent settings remain editable under their own permissions.
- [Website Change History](https://brickandivyhomes.com/manage-history.html): Owner-only searchable audit timeline for homepage edits, properties, price overrides and Realtor permission changes, with before/after comparisons and safe restoration of a previously published homepage version **to a draft**.

Details, privacy restrictions and financial formula: [Financial Reports and Change History guide](backend/FINANCIAL-REPORTS-CHANGE-HISTORY.md).

## Public data contract

The live public pages now read `brickivy-properties` from the dedicated Supabase project. `data/properties.json` is retained only as an unconfigured-development fallback; it contains `[]`. OPFW token configuration is required to display real company properties. See [OPFW setup](backend/OPFW-PROPERTIES.md).

When a secure backend is connected, it should produce a sanitized, public-only feed in this shape:

```json
[
  {
    "id": "a-stable-public-id",
    "name": "Property name",
    "address": "Public address",
    "neighborhood": "Los Santos",
    "type": "House",
    "price": 250000,
    "status": "listed",
    "published": true,
    "featured": false,
    "description": "Public listing description",
    "coverImage": "https://example.com/public-photo.webp",
    "images": ["https://example.com/public-photo.webp"]
  }
]
```

The public client accepts `published === true` and `status` of `available`, `reserved`, `listed`, `unavailable`, `for-sale`, `pending`, or `sold`. Imported OPFW company records are shown as **In portfolio** by default. A private server-side renter check marks a confirmed rented property **Unavailable** on public property cards and detail pages. Only the status is public; renter CIDs, tenant names, income, and last payments are never exposed. If OPFW rental access fails, the status remains neutral instead of claiming the property is vacant. The website weekly rent value can be overridden by an Owner without changing in-game billing.


## Public Realtor directory

The new **Meet Our Realtors** page is linked from the site navigation and footer. It reads `data/realtors.json`, which currently includes Johnny Sausage's published Owner profile and the provided in-game contact details.

Only explicitly approved and published profiles will display. Create entries in this format (example values below are **not** live profiles):

```json
[
  {
    "published": false,
    "displayOrder": 10,
    "name": "Character name",
    "role": "Realtor",
    "title": "Real Estate Agent",
    "characterId": null,
    "photo": "assets/realtors/portrait.webp",
    "inGamePhone": "",
    "discordUsername": "",
    "discordId": "",
    "email": "",
    "bio": "A short approved introduction."
  }
]
```

- Set `published: true` after the individual has approved their **public** name, contact information and optional photo.
- `role` may be `Owner` or `Realtor`; it is the **public display role**, not an authorization grant. The backend must verify actual Discord roles independently.
- `inGamePhone` is a displayed in-game number with a convenient **Copy** button; the site does not dial phone numbers.
- `discordUsername` appears as text. If `discordId` is provided as a valid 17–20 digit Discord user ID, a **View Discord** link appears. Do not publish IDs or handles without permission.
- `email` is optional and creates a mailto contact button when present.
- `photo` can be a public image URL or a file in the repository. A sanitized backend-supplied `mugshotUrl` is supported as a fallback. If both are empty, initials appear.
- `displayOrder` lets owners control the team directory ordering. No Discord bot or third-party service is required for the public directory.
- `characterId` is optional. The Owner will provide the exact character ID; do not infer it from a name. The public site never calls the token-protected OPFW API directly.
- `bio` is optional; no description is displayed when blank.
- Mugshot integration (not deployed): a secure backend requests `characters` from service `1973`, selecting only `character_id,mugshot_url`, filtered by the approved Character ID. It validates the response and outputs a public-safe photo URL. Neither the bearer token nor private character fields belong in the GitHub Pages feed.
- Long term, the Owner dashboard should manage these profiles, photos and publishing status in a protected database; the static JSON format is an interim source until that backend is built.

## Discord OAuth + dedicated Supabase backend (prepared, not deployed)

The website now contains a secure Owner management UI on `admin.html` and `manage-realtors.html`; it stays locked and explains that setup is pending until the independent Brick & Ivy Supabase project is configured. See `backend/SETUP.md` for prerequisites and deployment instructions.

The protected API implementation is `backend/edge-functions/brickivy-admin/index.ts`:
- Validates the signed-in user's Supabase Auth session and Discord OAuth identity.
- Calls Discord's guild membership API on **every** request to check Owner role `1502871124378259526` (guild `1001110667580932168`).
- Only the Owner role can create, edit, unpublish or delete Realtors. Realtor role `1502870035176357968` can authenticate but cannot change the directory.
- Uses a private service-role key inside the Edge Function, never on the website. SQL `backend/schema.sql` enables RLS and denies public direct access.

The public endpoint in `backend/edge-functions/brickivy-realtors/index.ts` returns only approved published profiles. The public Realtor website uses local `data/realtors.json` until `assets/brickivy-config.js` is filled with a new project's **public** URL and publishable API key. After that it uses the backend.

**Current status:** The GitHub code is committed but has not been deployed to Supabase and Discord OAuth has not been configured. Do not claim that sign-in, secure saves or live synchronization currently work. Do not put a Discord OAuth secret or bot token in any GitHub file.

## Public property overview details

Public `property.html` pages use a simple **Weekly Rent** label and prominently display the selected **Interior**, storage in **SU**, and max **Furniture Objects**. Listings without photos show the existing Brick & Ivy logo rather than an empty placeholder. Every property has a **Meet Our Realtors** link pointing directly to `realtors.html`.

Owners can write a **custom public property overview** (up to 3,000 characters) from an expandable editor in Property Management; descriptions persist in Supabase, preserve line breaks and are HTML-escaped in public pages. See [details and tests](backend/PROPERTY-OVERVIEWS.md).

## Multi-photo property galleries

Each property supports **up to 24 JPEG, PNG, or WebP photos** (6 MiB/file). Owners can select multiple files at once, set a cover, reorder photos, and delete them inside the expandable **Manage photos** panel on `manage-properties.html`. Cover images appear on public listing cards; detail pages show the full photo gallery with arrows and thumbnails. Upload and management requests go through `brickivy-property-photos`, which checks the Owner's Discord role and live company property ID. The Supabase Storage bucket is public-read, but uploader actions are private and audited through Supabase Auth. See [Property photo setup](backend/PROPERTY-PHOTOS.md).

**Storage by Interior** sorts by numeric OPFW code `1, 2, ... 10, 11` instead of alphabetical ordering. The existing 11 named interiors remain in place.

## Public listing status, block, region and storage

- Non-unavailable properties sort by actual OPFW `block_id` (natural numeric order); rented/Unavailable properties stay at the bottom. The property type filter uses the live OPFW type list.
- The public badge becomes **Available** for a confirmed not-rented home, **Reserved** if Brick & Ivy staff explicitly reserved it, and **Unavailable** if a renter is confirmed. Rented overrides reserved; unreadable occupancy remains neutral.
- Owners can assign areas (Los Santos, Sandy Shores, Paleto Bay) and storage capacity (SU and objects/furniture pieces) by interior type. OPFW exposes `property_type` but not the associated storage capacities, so those sizes must be supplied by an Owner.
- See [implementation and permissions](backend/LISTING-AREAS-STATUS-STORAGE.md).

## Private property management: pricing and rentals

The **Property Management** link in the Staff Portal opens `manage-properties.html`.

- **All authorized Brick & Ivy staff** can view private OPFW rental fields for company ID 5: renter character ID, source property income, last payment, and optionally renter name if the OPFW token permits it.
- **Owners only** can override the website's displayed weekly property cost/value, or reset it to the OPFW-reported value. OPFW is read-only; these edits do not change in-game billing.
- Renter and financial details never enter the public `brickivy-properties` API or GitHub data files. Staff access requires Supabase Discord identity and a live role check.
- Values and audit history live in RLS-protected, privilege-revoked tables `brickivy_property_weekly_costs` and `brickivy_property_weekly_cost_audit`; see `backend/migrations/20261022_brickivy_property_weekly_costs.sql`.
- Backend: `backend/edge-functions/brickivy-property-staff/index.ts`; see [full implementation and test instructions](backend/PROPERTY-STAFF.md).

## Position sections and roster ordering

**Implemented:** Both the public `realtors.html` page and the Owner-only `manage-realtors.html` page group members by their **public position**, using `title` for Realtors and the fixed `Owner` category for Owners. The Owner section is pinned first; remaining sections follow the order set in management.

- Use **Edit** to update a Realtor's **Public position / group** (for example `Senior Realtor`); that moves the person to the corresponding section when saved.
- Use the row's **↑ / ↓** buttons to rearrange people *within that same position*.
- Use the **↑ / ↓** controls on a position section to reorder entire non-Owner groups.
- All changes are saved immediately through the `brickivy-admin` `reorder` action. This endpoint confirms current Discord Owner membership on each request, validates a full roster snapshot, preserves grouped positions, and only writes `display_order` on existing profiles.
- Public listings are returned in stored order. The public page groups members without altering their availability status or contact details.
- Changing a displayed position never grants Owner status or Discord roles. `role_label` remains protected server-side.
- The Owner group is always displayed first and cannot be deleted through management.
- Position ordering currently uses the existing `display_order` column; no SQL migration was needed and existing Realtor records were retained.

## In-game availability on Realtor profiles

The public Realtor directory now attempts a **live online status check every 60 seconds** for profiles with an approved `characterId`:

1. Fetch `https://p323.fivem.opfw.me/op-framework/players.json?characterId=<comma-separated-realtor-cids>`, which exposes loaded characters and the connected player source/license.
2. Fetch `https://p323.fivem.opfw.me/op-framework/connections.json`, which exposes connected sources/licenses and their `joined` flag.
3. Mark a Realtor **Available** only when the exact loaded Character ID matches a player and a corresponding entry in `connections.json` has `joined: true`. Otherwise, after *both* successful checks, mark **Unavailable**.
4. If either request fails, returns unexpected data, or is blocked by browser CORS, display **Status unavailable** rather than wrongly report offline.
5. Refresh when the page becomes visible again. No authentication tokens are included in client requests and no raw identifiers or other player information are stored or displayed.

**Deployment caveat:** The public routes are documented by OPFW, but their reachability from GitHub Pages and cross-origin browser permissions have not yet been verified. This is a best-effort frontend integration, **not confirmed live on Legendary**. If CORS is blocked or endpoints require authorization, replace the browser calls with a secure server-side endpoint returning only `{characterId, available, checkedAt}` for published Realtors; never expose connected players' license identifiers in frontend output.

The badge reports whether the Realtor is logged in with that **specific character**. It does not measure whether they are free for appointments or whether their account is playing as a different character.

## Property integration (deployed; private secret required)

- **Function:** `backend/edge-functions/brickivy-properties/index.ts` deployed as `brickivy-properties` with JWT check OFF (public, read-only, sanitized data only).
- **OPFW V3:** `https://opfw.gg/api/rest/1973/stocks_company_properties?select=company_id,property_id,property_name,property_type,property_address,property_cost&where=company_id%3D5`.
- **Server-only secret:** `OPFW_REST_TOKEN` in Brick & Ivy Supabase Edge Function Secrets, never GitHub.
- **Frontend:** live `index.html`, `properties.html`, `property.html`; no fake fallback when production backend is configured.
- **Docs and verification:** [backend/OPFW-PROPERTIES.md](backend/OPFW-PROPERTIES.md).

## Remaining backend integrations to build

- **Source:** OPFW readonly REST endpoint for Legendary service ID `1973`, table `stocks_company_properties`.
- **Server-side company restriction:** `company_id = 5`.
- **Security:** Never expose the OPFW bearer token, Discord OAuth client secret, service-role keys or private player/renter fields to GitHub Pages. The previously shared bearer token should be rotated.
- **Discord server ID:** `1001110667580932168`
- **Owner role ID:** `1502871124378259526`
- **Realtor role ID:** `1502870035176357968`
- **Authorization:** Owner always has full access. Realtors have individual backend-enforced permissions configured by Owners.
- **Property publishing:** The server property table is the source of truth for real estate identity and base details; owners' curated descriptions, prices, published status, photos and featured flags live in a protected application database.
- **Images:** Private write operations for authorized Owners/Realtors; public read URLs for photos associated with published listings.
- **Backend hosting:** Choose secure backend hosting and storage before implementing any sign-in or protected write actions.

Do not deploy an OAuth button or a form that pretends to save data before the backend has been connected and tested.

## Development

No build command is required. This is a lightweight static site built using HTML, CSS and JavaScript. To run locally, use any static file server from the repository root (for example `python -m http.server 8000`), then open http://localhost:8000.

## Branding

The illustrated house-and-ivy artwork was adapted into vector SVG assets from the existing Brick & Ivy logo supplied for this project. Page lifestyle photography is illustrative and does not represent available in-game properties.

### Interior codes and furniture limits

The Property Management **Storage by Interior** section labels OPFW `property_type` codes **1–11** with their interior names (Motel through High-End Apartment). Capacity is shown in **SU** and **Objects (Furniture Pieces)**, not storage slots. See [complete interior mapping](backend/LISTING-AREAS-STATUS-STORAGE.md#opfw-interior-codes). Existing stored values and type keys are unchanged.
