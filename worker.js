// ==============================================================================
// FRONTIER AI — CLOUDFLARE WORKER & STATIC ASSETS ENTRY POINT
// ==============================================================================

import { onRequest } from './functions/api/[[catchall]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests to the serverless edge router
    if (url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, params: {}, ctx });
    }

    // Serve static assets from public/ via Cloudflare Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
