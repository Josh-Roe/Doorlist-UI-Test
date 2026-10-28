import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DoorlistProvider, ProviderError } from './doorlist-provider.mjs';

const SESSION_SECONDS=30*24*60*60;
const files = new Set(['index.html', 'app.js', 'app.css', 'event-store.js', 'notification-feed.js', 'page-navigation.js', 'event-identity.js', 'avatar.js', 'guest-list.js', 'demo-store.js', 'script.js', 'style.css', 'manifest.webmanifest', 'profile.png', 'event.png', 'qr.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'assets/doorlist-bar-crawl.png', 'assets/doorlist-birthday.png', 'assets/doorlist-study-sesh.png', 'assets/doorlist-sunday-scaries.png', 'assets/doorlist-warm-up.png', 'assets/doorlist-watch-party.png', 'assets/doorlist-host-stack.png']);
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };
export function createDoorlistServer({ providerFactory = () => new DoorlistProvider(), clock = Date.now, port = Number(process.env.PORT || 4173) } = {}) {
  const sessions = new Map(); const codeLimits = new Map();
  const publicOrigin = process.env.PUBLIC_ORIGIN || '';
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(publicOrigin ? [new URL(publicOrigin).host] : [])]);
  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  }
  async function body(req) {
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 8192) throw new ProviderError('Request too large.', 413); }
    try { return JSON.parse(text || '{}'); } catch { throw new ProviderError('Invalid request.', 400); }
  }
  function getSession(req) {
    const cookie = /(?:^|;\s*)doorlist_session=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '');
    const session = cookie && sessions.get(cookie[1]);
    if (session && session.touched + (session.provider.profile?SESSION_SECONDS:600)*1000 > clock()) { session.touched = clock(); return session; }
    if (session) { session.provider.clear(); sessions.delete(cookie[1]); }
    return null;
  }
  function sessionCookie(session,secure){return `doorlist_session=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${session.provider.profile?SESSION_SECONDS:600}${secure?'; Secure':''}`;}
  function needSession(req) {
    const session = getSession(req);
    if (!session?.provider.profile) throw new ProviderError('Sign in to connect your Doorlist events.', 401);
    return session;
  }
  const server = createServer(async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host)) return json(res, 403, { error: 'This host is not allowed.' });
      const origin = publicOrigin || `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
        if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['x-doorlist-client'] !== 'mobile-ui' || !req.headers['content-type']?.startsWith('application/json'))) {
          return json(res, 403, { error: 'Open this app to make this request.' });
        }
        if (req.method === 'GET' && req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) {
          return json(res, 403, { error: 'Cross-site access is not allowed.' });
        }
        if (req.method === 'GET' && url.pathname === '/api/session') {
          const session = getSession(req);
          if(session?.provider.profile)res.setHeader('Set-Cookie',sessionCookie(session,origin.startsWith('https:')));
          return json(res, 200, { authenticated: Boolean(session?.provider.profile), profile: session?.provider.profile || null, ...(session?.provider.profile&&session.provider.snapshot?{snapshot:session.provider.snapshot()}: {}) });
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/code') {
          const data = await body(req); let phone = String(data.phone || '').replace(/[\s()-]/g, '');
          if (/^\d{10}$/.test(phone)) phone = `+1${phone}`;
          else if (/^1\d{10}$/.test(phone)) phone = `+${phone}`;
          if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new ProviderError('Enter your phone number with its country code.', 400);
          const key = createHash('sha256').update(phone).digest('hex');
          const limit = codeLimits.get(key);
          if (limit && (clock() - limit.last < 10000 || (limit.count >= 5 && clock() - limit.start < 15 * 60000))) throw new ProviderError('Wait before requesting another code.', 429);
          const next = !limit || clock() - limit.start > 15 * 60000 ? { start: clock(), last: clock(), count: 1 } : { ...limit, last: clock(), count: limit.count + 1 };
          codeLimits.set(key, next);
          let session = getSession(req);
          if (!session) { session = { id: randomUUID(), touched: clock(), provider: providerFactory() }; sessions.set(session.id, session); }
          await session.provider.sendCode(phone);
          session.phone = phone; session.codeTime = clock(); session.attempts = 0;
          res.setHeader('Set-Cookie', sessionCookie(session,origin.startsWith('https:')));
          return json(res, 200, { sent: true, phoneHint: `••• ${phone.slice(-4)}` });
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/verify') {
          const session = getSession(req); const data = await body(req);
          if (!session?.phone || session.codeTime + 10 * 60000 < clock()) throw new ProviderError('Request a new sign-in code.', 401);
          if (!/^\d{6,8}$/.test(String(data.code || ''))) throw new ProviderError('Enter the code from your text message.', 400);
          if (++session.attempts > 6) throw new ProviderError('Request a new sign-in code before trying again.', 429);
          const profile = await session.provider.verifyCode(session.phone, String(data.code));
          delete session.phone;
          res.setHeader('Set-Cookie',sessionCookie(session,origin.startsWith('https:')));
          return json(res, 200, { authenticated: true, profile });
        }
        if (req.method === 'POST' && url.pathname === '/api/auth/disconnect') {
          const session = getSession(req);
          if (session) { session.provider.clear(); sessions.delete(session.id); }
          res.setHeader('Set-Cookie', 'doorlist_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');
          return json(res, 200, { disconnected: true });
        }
        if(req.method==='GET'&&url.pathname==='/api/profile')return json(res,200,await needSession(req).provider.loadProfile());
        if(req.method==='GET'&&url.pathname==='/api/profiles')return json(res,200,{profiles:needSession(req).provider.listProfiles(),scope:'signed-in-account'});
        if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, await needSession(req).provider.syncEvents());
        const rsvp=/^\/api\/events\/([\w-]{5,100})\/rsvp$/.exec(url.pathname);
        if(req.method==='POST'&&rsvp){const session=needSession(req);const data=await body(req);return json(res,200,await session.provider.setRsvp(rsvp[1],data.status,{comment:data.comment,submissionId:data.submissionId}));}
        const match = /^\/api\/events\/([\w-]{5,100})(?:\/(guests|invite|host-members))?$/.exec(url.pathname);
        if (req.method === 'GET' && match) {
          const provider = needSession(req).provider;
          const result = match[2]==='host-members'?await provider.loadHostMembers(match[1]):match[2] === 'guests' ? await provider.loadGuests(match[1],{cursor:url.searchParams.get('cursor')||'',pageLimit:5,enrichPhotos:true}) : match[2] === 'invite' ? await provider.loadInvite(match[1]) : { event: await provider.loadEvent(match[1]) };
          return json(res, 200, result);
        }
        return json(res, 404, { error: 'Not found.' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!files.has(name)) return json(res, 404, { error: 'Not found.' });
      const data = await readFile(new URL(`./${name}`, import.meta.url));
      res.writeHead(200, { 'Content-Type': mime[name.split('.').at(-1)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      const authPath=(req.url||'').split('?')[0];
      if(error instanceof ProviderError&&error.code&&/^\/api\/auth\/(code|verify)$/.test(authPath))console.warn('doorlist_auth_failure',{stage:authPath.endsWith('/code')?'send_code':'verify_code',status:error.status,reason:error.code});
      json(res, error instanceof ProviderError ? error.status : 500, { error: error instanceof ProviderError ? error.message : 'The app could not complete this request.' });
    }
  });
  server.on('listening', () => {
    if (port === 0) { const actualPort = server.address().port; allowedHosts.add(`127.0.0.1:${actualPort}`); allowedHosts.add(`localhost:${actualPort}`); }
  });
  const cleanup = setInterval(() => {
    for (const [id, session] of sessions) if (session.touched + (session.provider.profile?SESSION_SECONDS:600)*1000 < clock()) { session.provider.clear(); sessions.delete(id); }
    for (const [key, value] of codeLimits) if (value.last + 15 * 60000 < clock()) codeLimits.delete(key);
  }, 60000);
  cleanup.unref(); server.on('close', () => { clearInterval(cleanup); for (const session of sessions.values()) session.provider.clear(); });
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 4173);
  createDoorlistServer({ port }).listen(port, '127.0.0.1', () => console.log(`Doorlist mobile: http://127.0.0.1:${port}`));
}
