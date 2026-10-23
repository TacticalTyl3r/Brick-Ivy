# Brick & Ivy — Property inquiries and Discord notifications

## Pages and APIs
- Public property details: [property.html](../property.html) loads `assets/brickivy-inquiry.js` and provides an inquiry form on a valid published property.
- Public submission Edge Function: `brickivy-inquiries` (`backend/edge-functions/brickivy-inquiries/index.ts`, `verify_jwt=false`).
- Private inbox: [manage-inquiries.html](../manage-inquiries.html), powered by `assets/brickivy-inquiry-staff.js`.
- Privileged inbox actions: `brickivy-admin` (`verify_jwt=true`), `listInquiries`, `updateInquiry` and Owner-only `testInquiryDiscord`.
- Database: `brickivy_property_inquiries` and `brickivy_inquiry_activity`, both with RLS enabled and no direct anon/authenticated Data API privileges.

## Discord notifications sent by the Brick & Ivy App

**Sender:** `DISCORD_BOT_TOKEN`, the existing private bot credential for the Brick & Ivy Discord application. Notifications are created using Discord's bot **Create Message** API, so the author is the application's bot user, not a webhook profile. Secrets remain in the Brick & Ivy Supabase project.

**Channel:** `BRICKIVY_INQUIRY_DISCORD_CHANNEL_ID` is optional. If set, it must be the numeric Discord channel ID inside the Brick & Ivy guild. If absent, the backend securely performs a read-only `GET` of the saved `BRICKIVY_INQUIRY_DISCORD_WEBHOOK` to discover the original channel. **No webhook POST is performed.** This allows existing installations to switch to the bot without changing their channel settings. Once the channel ID is explicitly configured, the saved webhook can be removed if desired.

**Role pings:** `BRICKIVY_INQUIRY_PING_ROLE_IDS` is optional and accepts up to five comma-separated numeric role IDs, defaulting to `1502870035176357968` (Realtor). Messages use `allowed_mentions.parse=[]` and an explicit role allowlist. Visitor text is sanitized and displayed only in the embed. Role pings also depend on the bot having permission to mention non-mentionable roles, or the role itself being mentionable.

The bot must have **View Channel**, **Send Messages**, and **Embed Links** in the notification channel. If the Realtor role is not mentionable, the bot also needs **Mention @everyone, @here, and All Roles** permission to trigger that role ping. Do not grant unnecessary permissions elsewhere. No credentials are exposed to website visitors.

Both **new inquiry** notifications and the Owner's **test notification** now use matching Brick & Ivy Discord embeds (green border, branded heading, structured fields, and timestamp). Real inquiry embeds show the property, property ID, address, character name, in-game phone, optional Discord contact, message, and a clickable property listing link. The Realtor role mention stays in the message content outside the embed because Discord does not generate role notifications from embedded fields.

New property inquiry embeds additionally show **Weekly Rent** and **Availability**, sourced from the public sanitized `brickivy-properties` endpoint. This reproduces the public listing's effective weekly price (including an Owner override) and occupancy-aware status. The availability labels are `Available`, `Reserved`, `Unavailable (rented)`, or `In portfolio — occupancy not verified`. If the public feed cannot be verified at notification time, the embed says `Check property listing` and `Not verified — check listing` instead of inventing a rent or vacancy status. The inquiry remains saved and the notification still goes out. The separate Owner-only notification test has no real property and therefore cannot display actual property rent/status.


The inquiry is saved in Supabase **before** Discord delivery is attempted. A bot or channel failure is recorded as `failed` (or `not_configured` when no destination/bot credential is configured); it does not discard the inquiry.

### Owner test

1. Visit [Property Inquiries](https://brickandivyhomes.com/manage-inquiries.html) and sign in with the Owner Discord account.
2. Click **Test Brick & Ivy App notification** and confirm. This sends a clearly marked test under the bot's identity, not the webhook. It does **not** create an inquiry.
3. If the app test fails, click **Check bot connection** first. This read-only Owner check identifies the bot account, tests webhook-to-channel discovery and verifies the bot can see the channel. It does not post a message or ping anyone.
4. Confirm the author displayed in the channel is the Brick & Ivy application's bot and that the intended Realtor role was pinged.
5. If Discord reports HTTP 403, grant the bot access to that channel and the permissions above, then retest.

The bot displaying **Offline** does not prevent HTTP API message delivery. A green Online status requires a separately hosted, continuously connected Discord Gateway worker; request-based Supabase Edge Functions do not provide that. Since webhook metadata may omit `guild_id`, the integration now verifies the actual channel's guild via the bot API instead of rejecting the webhook prematurely.

Do not paste or commit bot tokens, channel-webhook credentials, or Discord secrets.

## Realtor workflow, follow-up, and reporting

The protected Staff Portal (`admin.html`) displays an **Inquiry pulse** only for Owners and Realtors with the individual `can_manage_inquiries` grant. It shows counts for new, unassigned, awaiting-customer and closed inquiries, with links to recent inquiries. Unauthorized Realtors do not receive these numbers.

The private inbox (`manage-inquiries.html`) now supports:
- **Claim Inquiry:** An unassigned, open inquiry can be claimed by an authorized staff member. Conditional database updates ensure only one simultaneous claimant succeeds; a second claimant receives a conflict and should refresh.
- **Assignment:** Owners and authorized Realtors can assign to an active published Realtor with a verified current Brick & Ivy Discord role. Claims and new assignments mention **only that one Realtor** in the existing notification channel using the Brick & Ivy bot. Routine note/status edits do not reping the full Realtor role.
- **Statuses:** New, In progress, Contacted, Awaiting customer, Closed. First-contact and closing timestamps are retained for analytics; reopening resets the closing timestamp.
- **Activity history:** Private event log records the authenticated Discord staff actor, when an inquiry was claimed or assigned, previous/new status and whether an internal note changed. Actual internal note contents are *not* duplicated into the activity log.
- **Customer follow-up:** One-click copying of first response, viewing, follow-up and unavailable-property message templates. Staff must review and send them manually by in-game phone or their chosen channel. Copying a template does not send a customer notification or change the inquiry status.
- **Filters and reports:** Search, status, assigned-to-me, unassigned-only; company-wide counts, top ten requested properties, weekly inquiry volume, Realtor current assignments/closed cases/claim events, and average elapsed hours from inquiry creation to closure.

Metrics are aggregated entirely server-side via `brickivy_inquiry_analytics()`, using the service role from a verified staff endpoint. This SQL function is `SECURITY INVOKER` and grants execute **only to `service_role`**; it returns counts and names but no customer messages, phone numbers or contact details. Direct Data API roles cannot call it. Analytics always covers all saved inquiries; the inbox shows up to 150 newest inquiries by design.

**Testing to complete with real staff credentials:** Owner can claim, assign, update and inspect audit history; a Realtor granted the inquiry permission can do the same; a Realtor without permission receives HTTP 403 from the API and sees no pulse; simultaneous claim race returns one HTTP 409; assignment mentions only the named Realtor; message templates only copy locally and never message the customer; complete and reopen a record to verify timestamps and average-close calculation. No credentials or fabricated test customer inquiries were used during deployment verification.

## Authorization and workflow
Owners always have full access. Realtors require their live Brick & Ivy Discord Realtor role **and** the individual `can_manage_inquiries` permission, which is off by default. The Owner grants it in Realtor Permissions. Server-side checks run on each inbox action; a public Realtor profile label never grants access.

Staff can search inquiries, filter New / In progress / Closed, assign them to a published Realtor, and store private follow-up notes. The notes are not visible to visitors and are not automatically sent to the visitor or Discord. Customer responses happen manually through the in-game phone or optional Discord contact.

The public intake checks the company property against the private OPFW read-only API and rejects unpublished properties. It caps inquiries per hashed origin address in a rolling one-hour window, includes a bot-trap field, and never shares OPFW or Supabase credentials with visitors. Public visitors cannot browse submitted inquiries.

## Acceptance tests (not replaced by deployment)
1. Load a published home detail page and verify the form appears and is responsive.
2. Submit one **clearly labeled test inquiry** with approved test contact information.
3. Verify the success response, exactly one private database row and status `sent`.
4. Confirm the Discord embed and intended role ping.
5. Owner can read, change status, assign a Realtor and save a private note.
6. A Realtor without `can_manage_inquiries` receives HTTP 403, including by direct API call. A Realtor with permission can perform only inquiry operations, not Owner-only profile/permission writes.
7. Anonymous direct Data API access to both tables is denied.
8. Verify errors and spam throttling, and confirm a webhook outage leaves the inquiry saved for staff follow-up.

**Current verification boundary:** Supabase reports the inquiry functions deployed and the database migration applied. A private authenticated browser session and a real Discord test are required to confirm the bot's channel permissions and successful message delivery; function deployment alone is not proof of Discord delivery.
