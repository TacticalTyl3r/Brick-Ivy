# Brick & Ivy Real Estate

Public website for Brick & Ivy Real Estate in Legendary Roleplay.

**Website:** https://brickandivyhomes.com  
**Hosting:** GitHub Pages (branch `main`, repository root)  
**Status:** Public-facing design and property browsing are in place. The production listing API, staff login and image upload backend are **not connected yet**.

## Pages

- `index.html` — branded homepage, property search, featured listings, neighborhoods, company introduction.
- `properties.html` — property search, filters and sorting.
- `property.html?id=...` — published property detail and photo gallery.
- `realtors.html` — public Realtor and Owner contact directory; it reads `data/realtors.json`.
- `admin.html` — staff portal landing page with a Realtor Management entry point. Discord login and protected saving are not active yet.
- `manage-realtors.html` — draft Realtor creation form, roster preview, and JSON export to the owner-controlled GitHub editor. This page **cannot** directly change public listings or grant site privileges.

## Public data contract

The website reads `data/properties.json`. It currently contains `[]`, so no invented or private listings are published.

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
    "status": "for-sale",
    "published": true,
    "featured": false,
    "description": "Public listing description",
    "coverImage": "https://example.com/public-photo.webp",
    "images": ["https://example.com/public-photo.webp"]
  }
]
```

A property will appear on the website **only if** `published === true` and `status` is one of `for-sale`, `pending`, or `sold`.


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

## Owner Realtor management workflow (temporary)

Visit `/admin.html` and select **Realtor Management** to open `/manage-realtors.html`. It loads existing Realtor data and provides an editable *draft generator* with:

- Character name and **CID** (required and checked against existing entries to prevent duplicates)
- In-game phone, Discord handle, optional Discord user ID, public title, optional HTTPS photo and biography
- An explicit opt-in `published` checkbox so new profiles stay unpublished by default
- A live preview of the entire directory, including Johnny Sausage (CID 8)
- **Copy roster JSON**, which exports all existing profiles and newly drafted profiles without changing the hosted data

Then open the linked GitHub `data/realtors.json` editor, replace the file contents with the copied JSON, and commit. GitHub Pages will update the public Realtor directory upon deployment. GitHub, not this preview interface, enforces who can commit; **no one can publish via the static page alone**. Do not publish profile contact details without the individual's agreement.

**Production requirement:** Once Discord OAuth and a secure backend are connected, replace the GitHub workflow with an Owner-only Realtor Management screen that performs verified write operations. Validate Owner access against Discord guild `1001110667580932168` and Owner role `1502871124378259526` on every management request, not just at sign-in. Realtors (role `1502870035176357968`) must not add, publish, or remove other Realtors unless an Owner explicitly delegates an appropriate permission. Adding someone to the public directory is separate from granting Discord membership or website login.

## In-game availability on Realtor profiles

The public Realtor directory now attempts a **live online status check every 60 seconds** for profiles with an approved `characterId`:

1. Fetch `https://p323.fivem.opfw.me/op-framework/players.json?characterId=<comma-separated-realtor-cids>`, which exposes loaded characters and the connected player source/license.
2. Fetch `https://p323.fivem.opfw.me/op-framework/connections.json`, which exposes connected sources/licenses and their `joined` flag.
3. Mark a Realtor **Available** only when the exact loaded Character ID matches a player and a corresponding entry in `connections.json` has `joined: true`. Otherwise, after *both* successful checks, mark **Unavailable**.
4. If either request fails, returns unexpected data, or is blocked by browser CORS, display **Status unavailable** rather than wrongly report offline.
5. Refresh when the page becomes visible again. No authentication tokens are included in client requests and no raw identifiers or other player information are stored or displayed.

**Deployment caveat:** The public routes are documented by OPFW, but their reachability from GitHub Pages and cross-origin browser permissions have not yet been verified. This is a best-effort frontend integration, **not confirmed live on Legendary**. If CORS is blocked or endpoints require authorization, replace the browser calls with a secure server-side endpoint returning only `{characterId, available, checkedAt}` for published Realtors; never expose connected players' license identifiers in frontend output.

The badge reports whether the Realtor is logged in with that **specific character**. It does not measure whether they are free for appointments or whether their account is playing as a different character.

## Backend integrations to build

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
