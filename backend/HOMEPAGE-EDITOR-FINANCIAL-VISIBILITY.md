# Brick & Ivy — Financial Snapshot Permission and Homepage Editor

## Realtor financial visibility

The Owner can open [Realtor Permissions](https://brickandivyhomes.com/manage-permissions.html) and enable **View Financial Snapshot** for a particular Realtor with a verified Discord User ID and Brick & Ivy Realtor guild role. The new flag is `can_view_financials` in `brickivy_realtor_permissions`.

- **Default: off** for every Realtor. Owner access is always on.
- The private `brickivy-property-staff` Edge Function verifies Supabase Auth, the user's original Discord identity and current guild membership, then loads individual permissions from a service-role-protected table for every request.
- The financial summary is included in authenticated responses **only if** the caller is the Owner or has `can_view_financials=true`. Other Realtors get `financialSummary:null`.
- The existing financial formula is unchanged: **total weekly website rent from OPFW-confirmed rented properties – original OPFW maintenance charges for *every* company-owned property**, including vacant, reserved and unpublished ones. Missing occupancy or costs make the total **Unavailable** rather than an incorrect zero.
- Financial visibility **does not grant** editing, Owner access, special Discord roles or the ability to change financial values.
- The property management page shows the summary only to verified viewers. Other permission checks remain separate.
- Permission changes appear in the Owner's audit trail. The database migration defaults existing Realtor grants to false.

## Homepage Editor

Open [Homepage Editor](https://brickandivyhomes.com/manage-homepage.html) via the Staff Portal, then sign in using your Brick & Ivy Owner Discord account.

Editable content includes:
- Announcement bar (text and show/hide)
- Hero header, subtitle, top label, CTA button labels, main image URL, image alt text and caption
- Search area introductory headline and subtitle (search filters remain connected to live OPFW properties)
- Property collection heading, description and visibility (property cards still use OPFW plus your published/featured controls)
- Neighborhood heading, description, three location images and visibility
- About section header, text, image and visibility
- Bottom contact CTA heading, description, button label and visibility

Images use **HTTPS URLs** (copy the address of an image you host). Image uploads from the editor itself are not included in this initial implementation.

### Draft workflow

1. Edit any fields. The right-side preview updates without changing the public site.
2. **Save Draft** saves the settings privately in Supabase. It does not change your public homepage.
3. **Publish Homepage** publishes the saved draft to visitors. If you have unsaved changes, the editor saves those first.
4. **Discard draft** reverts the editor's draft to currently published settings, with a confirmation.
5. **Restore original design** puts Brick & Ivy's original copy/images into the *draft*; publish separately if desired.
6. **Reload draft** refreshes data from the backend.

Existing live homepage content is the default until the Owner chooses to publish; the migration creates one record with empty private/published overrides and leaves the site's existing HTML fallback intact.

Changes show on the public site on the next page load. The public JS fetches `brickivy-homepage` with no browser cache and updates only text nodes, safe HTTPS image URLs and pre-existing section visibility. It does not render arbitrary HTML from stored content.

### Security / consistency

The public `GET /functions/v1/brickivy-homepage` returns **published data only**. Authenticated `POST` requests must pass Supabase JWT validation plus a live Brick & Ivy Discord Owner role check. Only the Owner may load drafts, save, publish, reset or restore defaults; the URL is not a shortcut around that authorization.

The `brickivy_homepage_content` singleton row is protected by RLS, with no public Data API permissions. Updates use incrementing revision numbers and an optimistic conditional write to prevent one stale editing tab from silently overwriting another. Edits and publishing are recorded in `brickivy_homepage_audit` (also private). The website degrades to the original HTML if its content API is offline.

### Smoke test

- Confirm the public homepage still loads with its original copy before any Owner publish action.
- Sign in as Owner, edit headline and image, review the preview, save draft. Confirm the *public* homepage is unchanged.
- Publish, refresh the homepage, confirm all updated copy, images, and section visibility.
- Restore defaults in the private draft, check the preview changes but the public page does not, and publish only when desired.
- Try the editor as a Realtor and as an unauthenticated visitor; both must be refused.
- Grant a Realtor *only* financial visibility and confirm the Owner financial summary appears on Property Management, without property editing buttons. Revoke it and refresh the Realtor page; the summary must disappear, and the API must return `financialSummary:null`.
- Confirm non-financial Realtors and public API consumers never see income or renter information through the public homepage API.
