import hashes from '../generated/csp.json';
import { allowsOrigin } from './origin';
export { SignalingHub } from './signaling';

type Environment = { ASSETS: Fetcher; SIGNALING: DurableObjectNamespace };

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) {
      if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket')
        return new Response('Secure connection required', { status: 403 });
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (
        request.method !== 'GET' ||
        url.pathname !== '/' ||
        url.search ||
        !allowsOrigin(request.headers.get('Origin'), url.origin)
      )
        return new Response('Forbidden', { status: 403 });
      // One bounded in-memory hub. No file payloads or database writes.
      return env.SIGNALING.get(env.SIGNALING.idFromName('preview')).fetch(request);
    }
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname === '/health')
      return Response.json(
        { ok: true, network: 'stun', relay: false },
        {
          headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        },
      );
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    const signal = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
    response.headers.set(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self'; img-src 'self' data:; connect-src 'self' ${signal}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    );
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (url.protocol === 'https:')
      response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    if (response.headers.get('Content-Type')?.includes('text/html'))
      response.headers.set('Cache-Control', 'no-store');
    return response;
  },
} satisfies ExportedHandler<Environment>;
