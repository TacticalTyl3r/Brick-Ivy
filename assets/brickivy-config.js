/* Public Brick & Ivy Supabase connection settings. These are not secrets.
 * Discord OAuth enabled; the backend still checks current guild roles on each protected request.
 */
window.BRICK_IVY_CONFIG = Object.freeze({
  supabaseUrl: "https://rcbbnzqmfvapwuqmpmhk.supabase.co",
  publishableKey: "sb_publishable_coK46zZcVL53os91RCGw3A_jmnLmlZX",
  discordAuthReady: true
});
