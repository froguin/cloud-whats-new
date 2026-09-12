// Shared helper for SSR calls from this Astro site to its own Worker API
// (api.whats-new.kr). Sends the "site" API_KEY_RING token so the Worker can
// tell our own server-side rendering apart from direct/agent calls to
// /api/articles, which should go through POST /mcp instead. See worker/index.js
// (requiredKeyTypeForPath, SITE_API_ENFORCEMENT) and README.md for the gate.

export function apiBase(site: URL) {
  return `${site.protocol}//api.${site.host}`;
}

// `locals` is the Astro/APIContext locals object. The @astrojs/cloudflare
// adapter puts Pages bindings/vars at locals.runtime.env; this project has no
// existing App.Locals typing, so this is intentionally loosely typed rather
// than introducing one just for this.
export function apiHeaders(locals: unknown): Record<string, string> {
  const token = (locals as { runtime?: { env?: { SITE_API_TOKEN?: string } } })?.runtime?.env?.SITE_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
