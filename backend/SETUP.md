# Brick & Ivy: launch the secure Realtor backend

**Stage:** Application source is in GitHub. No new Supabase project has been created and neither Edge Function is deployed. Leave `assets/brickivy-config.js` blank until setup is complete.

## 1. Create a dedicated project

Use the user's chosen Supabase organization to create a **new** project named `Brick & Ivy Real Estate`, in a US region close to the user. Do not put Brick & Ivy tables or secrets into the existing Green Wonderland POS project. The Supabase cost check on October 22, 2026 returned **$0/month** for a new project in TacticalTyl3r's Org, pending the owner's selection and creation.

## 2. Configure the Discord OAuth application

Use the [Discord Developer Portal](https://discord.com/developers/applications) to create or select a **Brick & Ivy** app.

- Supabase Dashboard → Authentication → Sign In / Providers → Discord: copy the **Supabase callback URL**: `https://<new-project-ref>.supabase.co/auth/v1/callback`.
- Add **that exact URL** to the Discord Application's OAuth2 Redirects, save, then configure the application's Client ID and **Client Secret** in the Supabase Dashboard's Discord provider settings. Never put the secret in GitHub.
- In Supabase Auth → URL Configuration: Site URL `https://brickandivyhomes.com`; redirect URLs `https://brickandivyhomes.com/admin.html` and `https://brickandivyhomes.com/manage-realtors.html`.
- The Discord application also needs a **bot installed in the Brick & Ivy Discord guild** (ID: `1001110667580932168`). Create its Bot Token securely in Discord and configure it as the Supabase Edge Function secret `DISCORD_BOT_TOKEN`. The backend uses the bot only to read the authenticated user's current guild roles; it does not modify Discord permissions.
- The Owner role ID is `1502871124378259526`. Realtor role ID is `1502870035176357968`. Only the verified Owner role has roster write access.
- If guild member checks are forbidden by Discord configuration, review the bot's guild installation and permissions, and whether a members intent is needed. **Never** bypass the server-side role check to make login work.

## 3. Create the backend schema

Run `backend/schema.sql` in the **new** project via Supabase SQL Editor or the authorized connector.

The schema creates `public.brickivy_realtors` with RLS enabled and revokes `anon` and `authenticated` table privileges. A record for Johnny Sausage (CID 8, phone 145-7459, Discord TacticalTyl3r) is seeded **as a public profile only**, not as a permission grant.

## 4. Deploy two Edge Functions

- `brickivy-admin`: source `backend/edge-functions/brickivy-admin/index.ts`, **JWT verification enabled**; uses the authenticated user's verified Discord identity and the bot token to check guild roles for every request. Handles `me`, `list`, `save`, `delete`.
- `brickivy-realtors`: source `backend/edge-functions/brickivy-realtors/index.ts`, **JWT verification disabled** because it is a public read-only endpoint; returns explicitly allowlisted fields for published profiles only.

Supabase provides `SUPABASE_URL` and the legacy `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions by default. Check Edge Function Secrets after deployment. Neither of these belongs in the browser.

## 5. Wire the public website

Retrieve the new project's **project URL** and **publishable key**, and set **only** those two public settings in `assets/brickivy-config.js`:

```js
window.BRICK_IVY_CONFIG = Object.freeze({
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  publishableKey: "sb_publishable_YOUR_PUBLIC_KEY"
});
```

Once this is set:

- The public `realtors.html` page reads approved public profiles from the read-only Edge Function.
- `admin.html` shows Discord sign-in and checks roles on the backend.
- An **Owner** can add, edit, publish/unpublish and remove Realtor profiles in `manage-realtors.html`.
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
