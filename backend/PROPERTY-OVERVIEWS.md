# Brick & Ivy — Custom property overviews and enhanced detail pages

## Detail page
- Price label is **Weekly Rent** (removing the prior longer disclaimer).
- Below the heading, an emphasized, responsive feature grid displays **Interior** (using OPFW interior type names), **Storage Capacity** in **SU**, and **Furniture Objects** in pieces.
- Missing interior capacities display **Not listed** rather than a fabricated zero. A real zero is displayed as 0.
- Properties with no uploaded photos show the existing Brick & Ivy logo asset `assets/brick-ivy-mark.svg`, with an appropriate branded backdrop. Listing cards use the same placeholder.
- Uploaded photos and chosen covers continue to work; gallery thumbnails and navigation are retained.
- The **Property Overview** section displays the Owner-written description, preserving paragraph breaks; when empty it offers a short neutral explanation.
- Every detail page ends with a **Meet Our Realtors →** button linking directly to `realtors.html` (including Reserved and Unavailable properties).
- Detail page descriptions are rendered with HTML escaping; no user-entered HTML is trusted.

## Owner custom overview editor
- Open `https://brickandivyhomes.com/manage-properties.html`, sign in using Discord as Owner, find the property and expand **Edit public property overview**.
- Write up to **3,000 characters** in the textarea and click **Save overview**. Save blank to clear the custom description.
- Owner-only `setDescription` action in protected `brickivy-property-staff` validates the actual OPFW company property, Discord role and length.
- The text is stored on `brickivy_property_listing_settings.description`. A save preserves the property's preexisting `area` and `reserved` values; saving an area or reservation also preserves the description.
- Every change is recorded in `brickivy_property_listing_audit` using action `set_description`.
- Sanitized descriptions are exposed by `brickivy-properties` alongside public details. Rental information stays private. Cached feeds may take up to approximately 90 seconds to show changes.
- The migration is `backend/migrations/20261022_property_custom_overview.sql`.

## Verification checklist
1. Check an unphotographed home on `property.html?id=<property-id>`: logo placeholder, rent label, interior, SU and object figures, link to Realtors.
2. Check a photographed home: gallery remains navigable with its uploaded cover and thumbnails.
3. Owner saves a multi-paragraph description, refreshes public page after cache expiry, verifies exact text and paragraphs.
4. Owner edits the area/reserved flags after setting a description, verifies description remains unchanged; then edit description and confirm area/reservation stay unchanged.
5. Verify Realtors cannot save the description, non-staff requests are denied, and no renter/financial fields appear on the public feed.
