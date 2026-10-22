# Brick & Ivy: launch the secure Realtor backend

**Stage (October 22, 2026):** Dedicated project `rcbbnzqmfvapwuqmpmhk` has been created in us-east-1. `backend/schema.sql` has been applied; both Edge Functions are deployed as active. The public URL and publishable key are configured in `assets/brickivy-config.js`. `discordAuthReady: false` keeps login disabled until Discord OAuth and server-side bot configuration are complete.

## 1. Create a dedicated project

**Completed:** Project `Brick & Ivy Real Estate` was created at `https://supabase.com/dashboard/project/rcbbnzqmfvapwuqmpmhk` in `us-east-1`, separate from the existing Green Wonderland POS project; Supabase quoted `$0/month` at project creation.

## 2. Configure the Discord OAuth application

Use the [Discord Developer Portal](https://discord.com/developers/applications) to create or select a **Brick & Ivy** app.

- Supabase Dashboard → Authentication → Sign In / Providers → Discord: copy the **Supabase callback URL**: `https://<new-project-ref>.supabase.co/auth/v1/callback`.
- Add **that exact URL** to the Discord Application's OAuth2 Redirects, save, then configure the application's Client ID and **Client Secret** in the Supabase Dashboard's Discord provider settings. Never put the secret in GitHub.
- In Supabase Auth → URL Configuration: Site URL `https://brickandivyhomes.com`; redirect URLs `https://brickandivyhomes.com/admin.html` and `https://brickandivyhomes.com/manage-realtors.html`.
- The Discord application also needs a **bot installed in the Brick & Ivy Discord guild** (ID: `1001110667580932168`). Create its Bot Token securely in Discord and configure it as the Supabase Edge Function secret `DISCORD_BOT_TOKEN`. The backend uses the bot only to read the authenticated user's current guild roles; it does not modify Discord permissions.
- The Owner role ID is `1502871124378259526`. Realtor role ID is `1502870035176357968`. Only the verified Owner role has roster write access.
- If guild member checks are forbidden by Discord configuration, review the bot's guild installation and permissions, and whether a members intent is needed. **Never** bypass the server-side role check to make login work.

## 3. Create the backend schema

**Completed:** `backend/schema.sql` was applied to project `rcbbnzqmfvapwuqmpmhk` through a Supabase migration. Row-level security was verified enabled, with zero public RLS policies.

The schema creates `public.brickivy_realtors` with RLS enabled and revokes `anon` and `authenticated` table privileges. A record for Johnny Sausage (CID 8, phone 145-7459, Discord TacticalTyl3r) is seeded **as a public profile only**, not as a permission grant.

## 4. Edge Functions — deployed

- `brickivy-admin`: source `backend/edge-functions/brickivy-admin/index.ts`, **JWT verification enabled**; uses the authenticated user's verified Discord identity and the bot token to check guild roles for every request. Handles `me`, `list`, `save`, `delete`.
- `brickivy-realtors`: source `backend/edge-functions/brickivy-realtors/index.ts`, **JWT verification disabled** because it is a public read-only endpoint; returns explicitly allowlisted fields for published profiles only.

Supabase provides `SUPABASE_URL` and the legacy `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions by default. Check Edge Function Secrets after deployment. Neither of these belongs in the browser.

## 5. Wire the public website

**Completed:** The new project's public URL and publishable key are now in `assets/brickivy-config.js`. Keep `discordAuthReady: false` until the Discord provider, redirects, bot secret and authorized role checks work.

```js
window.BRICK_IVY_CONFIG = Object.freeze({
  supabaseUrl: "https://rcbbnzqmfvapwuqmpmhk.supabase.co",
  publishableKey: "YOUR_PUBLIC_PUBLISHABLE_KEY",
  discordAuthReady: false
});
```

Once this is set:

- The public `realtors.html` page is configured to read approved public profiles from the read-only Edge Function (live browser response still needs verification).
- After Discord setup and changing `discordAuthReady` to `true`, `admin.html` will show Discord sign-in and check roles on the backend.
- After Discord setup, a verified **Owner** can add, edit, publish/unpublish and remove Realtor profiles in `manage-realtors.html`.
- A **Realtor** can sign in, but cannot access Owner-only Realtor management.
- All profile changes are saved to the protected database; **no GitHub JSON copy/paste** is needed.

## 6. Verify before calling it live

1. Make sure the page displays the pending configuration notice before the public URL/key are supplied; no protected controls should be visible.
2. Verify an unauthorized visitor receives 401 or 403 from `brickivy-admin`.
3. Verify a Discord account without the Owner role cannot `list`, `save` or `delete` a Realtor.
4. Verify the Owner can add a test unpublished Realtor; ensure it is **not** returned by the public endpoint.
5. Publish that approved profile and confirm the public page shows it.
6. Remove the Discord Owner role from a test account and confirm subsequent writes are denied **without requiring a new login**.
7. Verify direct Data API reads/writes on `public.brickivy_realtors` from the publishable key are forbidden.
8. Check the public response contains no JWTs, bot tokens, privileged character fields or player identifiers beyond the intended contact details.
9. Confirm `data/realtors.json` still serves as an intentional fallback **only before** the URL is configured; once connected, backend failures show an error rather than reverting to stale data.

## Important safety limits

- **Discord roles**, not the text `role_label` in the public Realtor profile, determine website authorization.
- Adding someone to the Realtor directory does not assign a Discord role.
- Automatic OPFW mugshots are planned but **not yet deployed**. The CID is available for future server-side retrieval.
- GitHub Pages is public static hosting: no secret credentials, sensitive member data or backend write logic belong there.
