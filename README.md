# Brick & Ivy Real Estate

Public website for Brick & Ivy Real Estate in Legendary Roleplay.

**Website:** https://brickandivyhomes.com  
**Hosting:** GitHub Pages (branch `main`, repository root)  
**Status:** Live OPFW property listings, Discord staff access, Owner-managed Realtor profiles, weekly rent adjustments, reservations, regions, storage presets, and secure multi-image property galleries are deployed. OPFW bearer credentials are stored in Supabase secrets. Owner-written property descriptions and Owner-controlled publishing/featured listings are active; the private property inquiry pipeline and staff inbox are deployed (Discord delivery now uses the Brick & Ivy App's bot token; an Owner test verifies channel permissions).

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
- `manage-inquiries.html` — private property inquiry inbox for Owners and Realtors granted individual inquiry permissions; includes an Owner-only Discord test.

## Live Owner Homepage Editor and financial visibility

From the [Staff Portal](https://brickandivyhomes.com/admin.html), the Owner can open the [Homepage Editor](https://brickandivyhomes.com/manage-homepage.html) to customize the hero, headings, descriptions, announcements and homepage sections with **private drafts and one-click publishing**. The editor supports Owner-only direct uploads for all five homepage images (hero, three neighborhoods, and About), optional HTTPS image links, image previews, section reordering, curated color themes, and alternate layouts. Uploading alone does not publish: use **Save Draft → Publish Homepage**. Images are stored in the separate public-read Supabase homepage-media bucket, but uploads require a live verified Owner role. The homepage content lives in Supabase, so normal edits do not require GitHub commits.

The Owner can also use [Realtor Permissions](https://brickandivyhomes.com/manage-permissions.html) to enable the individual **View Financial Snapshot** permission. This permits access to the private weekly rental revenue, total company maintenance and net weekly income view without giving the Realtor other editing powers. It is disabled by default and independently checked server-side.

See [Homepage Editor and financial visibility guide](backend/HOMEPAGE-EDITOR-FINANCIAL-VISIBILITY.md).

## Property map: private Owner preview

Brick & Ivy has a private property-location editor at [manage-map.html](manage-map.html), linked only from the **Owner** tools on the Staff Portal. It is intentionally absent from public menus, uses \`noindex\`, and has no public map API. **GitHub Pages cannot make a static HTML document secret**, so the page markup itself can be visited with its URL, but the map data, portfolio, saved coordinates, and editor remain hidden and are served only after a valid Discord sign-in whose current Brick & Ivy Owner role is verified server-side. The map is **not published** to home listings, property cards, or detail pages.

The private Edge Function is \`brickivy-property-map\`. It requires a Supabase session and the live Discord Owner role, pulls company ID 5 properties, and uses \`brickivy_property_map_locations\` for private, explicitly placed \`x\`/\`y\` game coordinates. The table has RLS enabled and no direct anonymous or authenticated Data API privileges. It never exposes renter data or changes original game property records. New pins start empty: the portfolio's \`block_id\`/address do not supply a verified GTA location, so owners must **click the map or enter actual game X/Y coordinates** rather than inventing locations. Z is not needed.

The map uses Leaflet 1.9.4 with the same X/Y projection for all styles. Staff can switch between **Atlas** (existing FiveDock tiles), **Satellite** (VIRUXE satellite tiles) and **Road** (a high-contrast road-focused treatment of VIRUXE Atlas tiles). Road is a styling of the Atlas imagery rather than an independent native road tile set. Base tiles are third-party imagery and require a connection; review exact marker alignment in each style against in-game coordinates before public release. Style selection is saved per browser.

The map colors pins using **verified occupancy**, independent of publishing status: Available = green, Reserved = amber, Unavailable/rented = red and unverified occupancy = gray. Rented takes precedence over Reserved. Unverified renter data is never treated as Available, and no renter identity is returned in the map response. The private map now supports filtering by status, selecting a property through `manage-map.html?property=ID`, and **Show all pins** (`?view=all`). Owner-only **View on Map** links live below each Property Management card, with an Owner-only View All Pins tab at the top of Property Management. There are still **no public property map links**.

## Homepage first-paint behavior

The homepage's initial HTML includes a snapshot of the **actual published**
Supabase configuration (text, five image URLs, current theme, section visibility
and layout). Visitors see the real hero photo and copy immediately rather than
a blank loading treatment or the original stock images. The public content API
is prefetched from the page head and still hydrates updates without a refresh;
`assets/site.js` does **not** re-hide/reload an image when the published URL
already matches the HTML.

The Owner's **Save Draft → Publish Homepage** workflow and live public content
API are unchanged. A subsequently published version can differ from the static
fallback until the next GitHub HTML snapshot update; the browser will reconcile
the new published values on load. If Supabase is temporarily unavailable, the
latest static HTML snapshot remains visible instead of an empty page.

## Footer visitor counter

Every public and staff page footer shows the same **Site visitors** total. Only the four public sections (Home, Properties, Property Details, and Realtor Directory) register visits. The protected staff pages display the total without increasing it.

A browser creates and stores a random UUID in its own `localStorage`. The public `brickivy-visitors` Edge Function hashes that UUID with SHA-256 and inserts it into the private `brickivy_site_visitors` table with a uniqueness constraint. Refreshing or visiting multiple pages does not increase the count for the same browser. Neither raw UUID, IP addresses, names, page paths, nor user agents are stored in the application visitor table. The counter estimates **unique browsers/devices**, not individual people; private browsing, changed browsers, or cleared storage may count as a new visitor. Known crawler user agents are excluded where detectable; it is not intended as fraud-resistant analytics. The number starts counting with feature launch; historical website traffic is not available.

The Edge Function has public GET for aggregate counts and first-party-origin POST for registration; DB RLS and revoked grants prevent anonymous/authenticated clients from directly accessing the underlying visitor table. The script is `assets/brickivy-visitors.js` and the protected endpoint is `backend/edge-functions/brickivy-visitors/index.ts`.

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

The **Meet Our Realtors** page reads published, Owner-approved profiles from the live `brickivy-realtors` Supabase Edge Function. The current production site is configured for that backend; `data/realtors.json` is an unconfigured-development fallback, not the active roster. Owners manage profiles, positions, ordering, contact details and publishing in `manage-realtors.html`.

- Public display fields include character name, position, in-game phone, approved Discord contact, optional email, biography and photo. An approved portrait takes priority over the backend-sanitized character mugshot; initials are the fallback.
- `characterId` identifies a specific roleplay character for optional mugshot, in-game phone and live availability enrichment. The backend looks up only approved characters and never returns OPFW bearer tokens or unrelated player records.
- Public-facing `role` / position labels do **not** grant permissions. Discord OAuth sessions and current Brick & Ivy guild roles are checked server-side before privileged changes.
- Only published profiles are returned to visitors. Owners may reorder Realtors within position groups and move non-Owner position groups; the Owner section stays first.
- The backend may return `onlineStatus: "unknown"` when the private OPFW server status source is unavailable. The public page must not interpret an unknown result as offline.

See [the Realtor API guide](backend/REALTOR-API.md) and [the backend setup guide](backend/SETUP.md).

## Discord OAuth + dedicated Supabase backend (deployed)

The live dedicated Brick & Ivy Supabase project is `rcbbnzqmfvapwuqmpmhk`. Discord OAuth is enabled in `assets/brickivy-config.js`; the Staff Portal verifies membership and current roles in Brick & Ivy Discord guild `1001110667580932168`.

- Owner role `1502871124378259526` has unrestricted website administrative access. Realtor role `1502870035176357968` receives only its explicitly allowed actions, with separate individual editing grants.
- `brickivy-admin` handles protected Realtor profile management, and `brickivy-realtors` serves the public allowlisted directory.
- `brickivy-property-staff`, `brickivy-property-photos`, `brickivy-homepage`, and `brickivy-history` enforce their own protected operations. Public functions `brickivy-properties` and `brickivy-realtors` are read-only; the homepage endpoint supports public reads with separately authorized writes.
- Sensitive credentials remain in Supabase Edge Function secrets. Protected tables use RLS and do not grant direct anonymous or authenticated Data API access. Frontend controls are never the permission boundary.

**Deployment verification (October 23, 2026):** The Supabase project reported `ACTIVE_HEALTHY`, all eight Brick & Ivy Edge Functions reported active, and recent public requests to the properties, Realtors and homepage functions returned HTTP 200 in function logs. Those signals confirm deployment and successful API requests, **not** a complete end-to-end browser, Discord role, or upstream-content acceptance test.

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

The **public Realtor endpoint now performs enrichment server-side**, rather than having a GitHub Pages browser retrieve raw game-server player or connection records.

**Realtor CID privacy:** The public Realtor directory and its JSON endpoint do not expose in-game Character IDs. Public live-status badges are associated with non-CID roster profile IDs; the private Edge Function still uses CID server-side for OPFW status and mugshot lookups. CID remains visible and editable in the protected Realtor Management pages.

- For published profiles with valid character IDs, `brickivy-realtors` optionally retrieves approved character mugshots and phone information through the private OPFW REST token.
- It optionally queries the game server's `players.json` route with a **separate** private `OPFW_SERVER_TOKEN` and matches exact approved character IDs. That token is **not** interchangeable with `OPFW_REST_TOKEN`.
- The public API emits only a sanitized photo/phone and `onlineStatus` of `available`, `unavailable` or `unknown`. Missing credentials, rejected upstream authorization and network failures result in `unknown`, not a false offline report.
- The public page refreshes status from its own Supabase endpoint at 60-second intervals while visible and when the browser tab becomes visible again. It does not receive source/license identifiers.
- The badge indicates whether a particular Realtor character appears in the game-server status source; it does not promise the person is free to serve an appointment.

**Operational check:** Earlier function logs showed upstream HTTP 401 errors and periods where `OPFW_SERVER_TOKEN` was unset. Verify the secret's authorization and a current returned status before calling live availability fully operational. Do not paste or commit either token.

## Property integration (deployed; private token stored server-side)

- **Function:** `backend/edge-functions/brickivy-properties/index.ts` deployed as `brickivy-properties` with JWT check OFF (public, read-only, sanitized data only).
- **OPFW V3:** `https://opfw.gg/api/rest/1973/stocks_company_properties?select=company_id,property_id,property_name,property_type,property_address,property_cost&where=company_id%3D5`.
- **Server-only secret:** `OPFW_REST_TOKEN` in Brick & Ivy Supabase Edge Function Secrets, never GitHub.
- **Frontend:** live `index.html`, `properties.html`, `property.html`; no fake fallback when production backend is configured.
- **Docs and verification:** [backend/OPFW-PROPERTIES.md](backend/OPFW-PROPERTIES.md).

## Remaining work and acceptance tests

- **Property inquiries and Realtor workflow:** Public listings accept private inquiries verified against OPFW and stored with RLS restrictions. New public inquiries and Owner retries ping only the allowlisted Brick & Ivy Realtor Discord role. Assignments, reassignments and self-claims mention only the Realtor receiving the inquiry; routine status updates remain non-pinging. Changing an inquiry to Contacted (blue), Awaiting Customer (gold), or Closed (green) posts a non-pinging status embed. Authorized staff can claim unassigned inquiries, assign and individually notify a Realtor, track five follow-up statuses, view a staff activity history, copy response templates, and review aggregated company/Realtor analytics. The Staff Portal shows a permission-aware inquiry pulse. See [the complete inquiry workflow](backend/PROPERTY-INQUIRIES.md).
- **Inquiry reliability and conversion:** Public property cards and details link directly to the on-page inquiry form. Authorized staff see 24-hour attention-needed and 48-hour urgent flags for uncontacted inquiries; the Owner can retry a failed initial Discord notification and re-alert the team without creating a duplicate inquiry. Responsive and security checks are documented in [the inquiry workflow guide](backend/PROPERTY-INQUIRIES.md).
- **Live availability QA:** Confirm the separate game-server token successfully reads authorized character status and that active Realtor badges match their precise character. Until verified, `unknown` is expected when upstream enrichment fails.
- **End-to-end verification:** Test public inventory/occupancy status, publishing, galleries, homepage themes and a sample inquiry on desktop/mobile; verify the Owner's non-pinging Discord test, a real new-inquiry Realtor-role mention, a targeted Realtor assignment/claim mention and private inbox updates; test Owner and restricted Realtor accounts, including revoked permissions and direct API denial. The presence of active functions or HTTP 200 logs does not replace these checks.
- **Documentation:** Some older backend guides still describe previous rollout stages. Refer to actual GitHub code, deployed function versions, database state and current logs before changing configuration.

Security invariant: OPFW bearer tokens, Discord OAuth client secrets, service-role keys, renter identities and private player details must never enter GitHub Pages, public JSON, or chat messages.

## Development

No build command is required. This is a lightweight static site built using HTML, CSS and JavaScript. To run locally, use any static file server from the repository root (for example `python -m http.server 8000`), then open http://localhost:8000.

## Branding

The illustrated house-and-ivy artwork was adapted into vector SVG assets from the existing Brick & Ivy logo supplied for this project. Page lifestyle photography is illustrative and does not represent available in-game properties.

### Interior codes and furniture limits

The Property Management **Storage by Interior** section labels OPFW `property_type` codes **1–11** with their interior names (Motel through High-End Apartment). Capacity is shown in **SU** and **Objects (Furniture Pieces)**, not storage slots. See [complete interior mapping](backend/LISTING-AREAS-STATUS-STORAGE.md#opfw-interior-codes). Existing stored values and type keys are unchanged.
