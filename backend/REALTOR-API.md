# Brick & Ivy — Public Realtor directory API

## Live data sources
The public Realtor directory is `https://brickandivyhomes.com/realtors.html`.
It calls `/functions/v1/brickivy-realtors` in the dedicated Brick & Ivy Supabase project.

1. **Supabase published roster** (`brickivy_realtors`) remains the authoritative list of which Owners and Realtors appear. Only Owner-approved rows with `published=true` are included. Display order and position groups are preserved.
2. **OPFW read-only REST** (`https://opfw.gg/api/rest/1973/characters`) is queried **server-side** using the already-configured `OPFW_REST_TOKEN`. Only the published Realtors' character IDs are requested. The public response can show the current OPFW mugshot and in-game phone number when available. Manual photos/phones from the Brick & Ivy roster take precedence. Private fields such as license identifiers, cash, bank balance, and other characters are never included.
3. **OPFW live players** (`https://p323.fivem.opfw.me/op-framework/players.json`) is queried **server-side** using the published Realtors' character IDs and a private Bearer token. A successful player list confirms which character is online; the public status is **Available** (character online) or **Unavailable** (not online). On a failed or unexpected response, status is **Status unavailable** instead of falsely reporting offline. OPFW has returned HTTP 401 for unauthenticated live-player requests, so the backend now sends the configured credential.

The frontend no longer fetches OPFW's internal game-server routes from each visitor's browser. It refreshes status about every minute by querying the protected Supabase backend's public, allowlisted output, avoiding cross-origin/browser dependencies.

## Public profile
Public Realtor cards show:
- Character name, Owner/Realtor position grouping and sort order
- CID, in-game phone, Discord username/link, optional email and biography
- An approved manual portrait, otherwise the character's OPFW mugshot, otherwise initials
- Online status with an explicit distinction between offline and unknown

Owner controls are unchanged at `manage-realtors.html`: the Owner manages membership, public visibility, position/title, biography, contacts, and manual photos.

## Security / failure behavior
- Supabase `brickivy-realtors` is public read-only with `verify_jwt=false`; all privileged table reads use the service-role key only inside the Edge Function.
- `brickivy-admin` remains Owner-only, with Discord OAuth and live guild role verification.
- OPFW bearer tokens are never placed in public files or client requests.
- If character lookup or game-server status fails, the published Realtor roster still returns successfully. Only enrichment/status falls back.
- No automatic publication of characters who are not already explicitly approved in the Brick & Ivy roster.
- Response cache is at most about 30 seconds, browser status refresh is once per minute.

## Verification
- Open the public `brickivy-realtors` Edge Function URL. It should return a JSON list of published profiles with `onlineStatus` and optional `mugshotUrl`.
- Ensure Owner Johnny Sausage (CID 8) and Realtor Roland Montgomery (CID 132) are published, matching the existing source records at the time of deployment.
- Open `realtors.html` and verify portraits, roles, CID and contact rows display.
- If a character is loaded and the OPFW players endpoint responds correctly, status should say **Available**; otherwise it should be **Unavailable** or **Status unavailable** according to actual source reliability.
- Keep `brickivy-admin` and the property feed untouched.

## Live-player API authorization

The Edge Function uses `OPFW_SERVER_TOKEN` if set; otherwise it tries the existing `OPFW_REST_TOKEN` Supabase secret. Both values stay **server-side**. OPFW may issue separate credentials or route permissions for its game-server API versus its read-only database REST API. If the online-status endpoint continues returning **401 Unauthorized**, a credential authorized specifically to read `/op-framework/players.json` for server `p323` must be saved as the `OPFW_SERVER_TOKEN` Edge Function secret. A successful directory `GET 200` is not, by itself, proof that real-time online status is authorized; check the function logs and the public `onlineStatus` field after authorization.
