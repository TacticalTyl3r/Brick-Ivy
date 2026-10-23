/* Deprecated: Brick & Ivy does not use homepage image uploads or a media
 * library. The Homepage Editor uses direct HTTPS image URLs instead.
 * Endpoint intentionally disabled without deleting historical storage data.
 */
Deno.serve((_request: Request) => new Response(JSON.stringify({
  error:"Homepage media uploads and library access are disabled."
}),{
  status:410,
  headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
}));
