# Brick & Ivy Real Estate

Public website for Brick & Ivy Real Estate in Legendary Roleplay.

**Website:** https://brickandivyhomes.com  
**Hosting:** GitHub Pages (branch `main`, repository root)  
**Status:** Public-facing design and property browsing are in place. The production listing API, staff login and image upload backend are **not connected yet**.

## Pages

- `index.html` — branded homepage, property search, featured listings, neighborhoods, company introduction.
- `properties.html` — property search, filters and sorting.
- `property.html?id=...` — published property detail and photo gallery.
- `admin.html` — temporary, clearly labelled portal placeholder. It does **not** allow login or write access.

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
