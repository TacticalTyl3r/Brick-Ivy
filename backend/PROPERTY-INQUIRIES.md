# Brick & Ivy — Property inquiries and Discord notifications

## Pages and APIs
- Public property details: [property.html](../property.html) loads `assets/brickivy-inquiry.js` and provides an inquiry form on a valid published property.
- Public submission Edge Function: `brickivy-inquiries` (`backend/edge-functions/brickivy-inquiries/index.ts`, `verify_jwt=false`).
- Private inbox: [manage-inquiries.html](../manage-inquiries.html), powered by `assets/brickivy-inquiry-staff.js`.
- Privileged inbox actions: `brickivy-admin` (`verify_jwt=true`), `listInquiries`, `updateInquiry` and Owner-only `testInquiryDiscord`.
- Database: `brickivy_property_inquiries` and `brickivy_inquiry_activity`, both with RLS enabled and no direct anon/authenticated Data API privileges.

## Discord configuration
Set these secret names in the **Brick & Ivy Supabase project**, never GitHub:
- `BRICKIVY_INQUIRY_DISCORD_WEBHOOK` — a Discord webhook URL from the private notifications channel.
- `BRICKIVY_INQUIRY_PING_ROLE_IDS` — optional comma-separated numeric role IDs. Defaults to the Brick & Ivy Realtor role `1502870035176357968`.

The Edge Function sends a role mention with `allowed_mentions.parse=[]` and an explicit allowlist of at most five configured role IDs. Visitor text is escaped to prevent unauthorized pings, and property/contact/message details are delivered in a Discord embed. A failed or missing webhook **does not discard the saved inquiry**; the private inbox records `sent`, `failed`, or `not_configured`.

### Owner notification test
1. Visit [Property Inquiries](https://brickandivyhomes.com/manage-inquiries.html) and sign in with an Owner Discord account.
2. Confirm the webhook is reported as configured.
3. Click **Send test notification to Discord** and approve the confirmation. This posts an explicitly labeled TEST message and configured role ping; it **does not** create a customer inquiry.
4. Verify the message appeared in the intended private channel and the role ping actually notified members. Discord role mention permissions and role mentionability can affect notification behavior.

No webhook URL should be pasted into a chat, frontend, or GitHub.

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

**Current verification boundary:** Supabase reports the inquiry functions deployed and the database migration applied. A private authenticated browser session and a real Discord test are required to confirm the webhook secret and successful message delivery; function deployment alone is not proof of Discord delivery.
