# Brick & Ivy: Financial Reports and Website Change History

## Weekly property financial report
Open [Property Management](https://brickandivyhomes.com/manage-properties.html), then the **Weekly financial snapshot** section. The report is available only to a verified Owner or a Realtor who has been explicitly granted `can_view_financials`.

The backend computes a private `financialSummary.propertyBreakdown` alongside the company totals. Every current OPFW company property is included, regardless of whether it is rented, reserved, vacant, published, or unpublished:

- **Projected weekly rent earned:** `weeklyCostOverride ?? OPFW property_cost` if a property is confirmed rented; **0** if the property is confirmed vacant; **Unavailable** if occupancy is unknown.
- **Weekly maintenance:** original OPFW `property_cost` for **every company property**, including vacant/unpublished properties.
- **Net weekly income:** weekly rent earned **minus** weekly maintenance. Vacant properties therefore have a **negative** weekly contribution if maintenance is positive.
- **Company total:** sum of earned rent for occupied properties minus maintenance for every owned property.

All arithmetic is calculated in integer cents. If OPFW occupancy or a necessary monetary value is unavailable, the affected property calculation and company net are shown as **Unavailable** rather than fabricated. These figures represent a projected weekly run-rate, not actual cash collected.

The private interface provides search by name/address/block/area, occupancy filtering, sorting by weekly income/rent/maintenance, expandable per-property calculations, and a CSV export of filtered rows. Financial permission does not grant permission to modify prices or property records.

## Owner-only website change history
Open [Website Change History](https://brickandivyhomes.com/manage-history.html) through the Owner Staff Portal.

The history endpoint reads private Supabase audit tables for:
- Homepage draft saves, publications, resets and historical draft restores.
- Property settings: region, publication/featured status, reservations, descriptions, storage presets.
- Website weekly rent overrides.
- Individual Realtor permission changes.

Records are ordered by time and filtered in the UI by category or search. Where recorded, each shows the person who made the change and the fields' before/after values. The API reads the latest 100 records from each of four audit tables and returns a maximum of 250 combined events. Older records are not deleted but are not part of the current recent-history view.

**Restore a published homepage version**: Select a past `Homepage published` entry and click **Restore this version to draft**. The protected homepage API checks the current revision and inserts that historical content into the private draft. The public homepage is **not** changed until the Owner reviews and publishes that draft separately in [Homepage Editor](https://brickandivyhomes.com/manage-homepage.html). Existing audit records remain intact.

Both private functions require Supabase Discord authentication, the verified identity from Supabase Auth, and a fresh live Brick & Ivy guild Owner role check. Supabase audit tables are RLS-protected, and their contents are not exposed in public listing endpoints.

## Acceptance checks
1. Rented property: projected weekly rent $1,000, maintenance $200 → net +$800.
2. Vacant property: projected weekly rent $0, maintenance $250 → net -$250.
3. Together: rent revenue $1,000 minus **all-property** maintenance $450 → net +$550.
4. Realtor without `can_view_financials` cannot see financial summary or property breakdown. A granted Realtor can view but cannot edit without separate permissions.
5. Owner Change History includes the existing homepage, property, price and permission audit records with searchable event details.
6. Restoring a published homepage version changes only the private draft and is itself audited. The public homepage does not change until the Owner explicitly publishes it.
