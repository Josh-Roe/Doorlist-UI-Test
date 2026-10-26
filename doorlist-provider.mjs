import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';

const publishedConfig = JSON.parse(await readFile(new URL('./doorlist-provider-config.json', import.meta.url)));
export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export function decodeField(value = {}) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeField);
  if (value.mapValue) return decodeFields(value.mapValue.fields);
  return null;
}
export function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeField(value)]));
}
export function safeImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
function toISO(value, fallback = null) {
  const date = new Date(value ?? NaN);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}
export function normalizeStatus(status) {
  const value = String(status ?? '').toLowerCase().replace(/[ _]/g, '-');
  if (['going', 'yes', '1'].includes(value)) return 'going';
  if (['maybe', '2'].includes(value)) return 'maybe';
  if (['not-going', 'notgoing', 'no', '3'].includes(value)) return 'not-going';
  return 'invited';
}
export function normalizeEvent(event, access = 'discover') {
  const id = String(event.eventId || event.id || '');
  if (!/^[\w-]{5,100}$/.test(id) || !event.name) return null;
  const start = toISO(event.time ?? event.startTime);
  const end = toISO(event.endTime, start);
  return {
    id, title: String(event.name), host: String(event.orgName || event.hostName || 'Doorlist event'),
    image: safeImage(event.eventCoverCroppedURL || event.eventCoverURL || event.coverPhotoURL),
    theme: 'purple', startsAt: start, endsAt: end,
    location: typeof event.location === 'string' ? event.location : String(event.locationName || event.address || 'See event details in Doorlist'),
    description: String(event.description || ''), rsvp: 'invited', canRsvp: access === 'invited',
    access, source: 'doorlist', sourceUrl: `https://doorlist.app/e/${encodeURIComponent(event.linkID || id.slice(0, 7))}`,
    isPaidEvent: Boolean(event.isPaidEvent), guests: [], guestsLoaded: false, guestListPartial: false,
    plusOneRequested: false, detailsLoaded: false,
  };
}
function obfuscatePhone(phone) {
  const letter = () => String.fromCharCode(97 + randomInt(26));
  const padding = length => Array.from({ length }, letter).join('');
  const digits = phone.replace(/\D/g, '').split('').map(char => 'jabcdefghi'[Number(char)]);
  return padding(14) + digits.map((char, index) => char + (index < digits.length - 1 ? letter() : '')).join('') + padding(15);
}
export class DoorlistProvider {
  constructor({ fetchImpl = fetch, config = publishedConfig, clock = Date.now } = {}) {
    this.fetch = fetchImpl; this.config = config; this.clock = clock; this.allowedEvents = new Map();
  }
  async request(url, options = {}) {
    let response;
    try { response = await this.fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: 'manual' }); }
    catch { throw new ProviderError('Doorlist could not be reached. Try again.'); }
    if (response.status >= 300 && response.status < 400) throw new ProviderError('Doorlist returned an unexpected redirect.', 502);
    let data = {};
    try { data = await response.json(); } catch { /* Some successful responses have no JSON body. */ }
    if (!response.ok) {
      const status = response.status;
      const message = status === 401 ? 'Your Doorlist session expired. Please sign in again.'
        : status === 403 ? 'Doorlist has not granted access to this information.'
        : status === 429 ? 'Too many requests. Please wait before trying again.'
        : status === 400 || status === 422 ? 'Doorlist could not verify these details. Check your phone number or code.'
        : status === 404 ? 'This information is not available from Doorlist.'
        : 'Doorlist could not complete the request. Try again.';
      throw new ProviderError(message, status);
    }
    return data;
  }
  authHeaders() { return { apikey: this.config.supabasePublicKey, 'Content-Type': 'application/json' }; }
  async sendCode(phone) {
    await this.request(`${this.config.supabaseUrl}/auth/v1/otp`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ phone, create_user: false, channel: 'sms' }),
    });
  }
  async verifyCode(phone, code) {
    const session = await this.request(`${this.config.supabaseUrl}/auth/v1/verify`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ phone, token: code, type: 'sms' }),
    });
    if (!session.access_token || !session.refresh_token) throw new ProviderError('Doorlist did not return a session.', 401);
    this.setSession(session);
    const user = await this.api(`/api/users/phone/${obfuscatePhone(phone)}`);
    if (!user.uuid || !user.name) { this.clear(); throw new ProviderError('An existing Doorlist account is required.', 404); }
    this.profile = { id: user.uuid, name: String(user.name), photo: safeImage(user.profilePicture) || 'profile.png' };
    return this.profile;
  }
  setSession(session) {
    this.accessToken = session.access_token; this.refreshToken = session.refresh_token;
    this.expiresAt = this.clock() + Number(session.expires_in || 3600) * 1000;
  }
  clear() { this.accessToken = null; this.refreshToken = null; this.firebaseToken = null; this.profile = null; this.allowedEvents.clear(); }
  async token() {
    if (!this.accessToken) throw new ProviderError('Sign in to connect your Doorlist events.', 401);
    if (this.expiresAt < this.clock() + 60000) {
      if (!this.refreshing) this.refreshing = this.request(`${this.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ refresh_token: this.refreshToken }),
      }).then(data => this.setSession(data)).finally(() => { this.refreshing = null; });
      await this.refreshing;
    }
    return this.accessToken;
  }
  async api(path, options = {}) {
    const token = await this.token();
    return this.request(`https://doorlist.app${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  }
  async firebase() {
    if (this.firebaseToken && this.firebaseExpiry > this.clock() + 60000) return this.firebaseToken;
    if (!this.firebasePending) this.firebasePending = (async () => {
      const data = await this.api('/api/users/token');
      if (!data.token) throw new ProviderError('Doorlist did not authorize event details.', 403);
      const auth = await this.request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.config.firebasePublicApiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: data.token, returnSecureToken: true }),
      });
      this.firebaseToken = auth.idToken; this.firebaseExpiry = this.clock() + Number(auth.expiresIn || 3600) * 1000;
      return auth.idToken;
    })().finally(() => { this.firebasePending = null; });
    return this.firebasePending;
  }
  async firestore(path, query = '') {
    const token = await this.firebase();
    return this.request(`https://firestore.googleapis.com/v1/projects/${this.config.firebaseProjectId}/databases/(default)/documents/${path}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  async syncEvents() {
    const token = await this.token();
    const results = await Promise.allSettled([
      this.api(`/api/events/forUser/${encodeURIComponent(this.profile.id)}?token=${encodeURIComponent(token)}`),
      this.api(`/api/events/friendsOf/${encodeURIComponent(this.profile.id)}`),
      this.api('/api/events/home-feed'),
      this.api('/api/events/trending'),
    ]);
    const own = results[0];
    // A denied or failed account feed must not quietly turn into an empty successful import.
    if (own.status === 'rejected') throw own.reason;
    const merged = new Map();
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];
      if (result.status !== 'fulfilled') continue;
      const rows = result.value.events || result.value.lightEvents || [];
      for (const raw of rows) {
        const event = normalizeEvent(raw, i === 0 || raw.type === 'own' ? 'invited' : 'discover');
        if (!event || raw.isCancelled || raw.isCanceled || (event.endsAt && new Date(event.endsAt).getTime() <= this.clock())) continue;
        const previous = merged.get(event.id);
        const access = previous?.access === 'invited' ? 'invited' : event.access;
        merged.set(event.id, { ...previous, ...event, access, canRsvp: access === 'invited' });
      }
    }
    this.allowedEvents = merged;
    const events = [...merged.values()].sort((a, b) => (a.startsAt || '9999').localeCompare(b.startsAt || '9999'));
    const eligible = own.value.eligibleEventCount ?? (own.value.events || []).length;
    const limited = eligible > (own.value.events || []).length;
    return { events, profile: this.profile, syncedAt: new Date(this.clock()).toISOString(), coverage: {
      invited: events.filter(event => event.access === 'invited').length,
      discoverable: events.filter(event => event.access === 'discover').length,
      eligibleEventCount: eligible, limited, partial: limited || results.some(result => result.status === 'rejected'),
    } };
  }
  requireEvent(id) {
    const event = this.allowedEvents.get(id);
    if (!event) throw new ProviderError('Refresh Your events before opening this event.', 404);
    return event;
  }
  async loadEvent(id) {
    let event = this.requireEvent(id);
    const [details, guest] = await Promise.allSettled([
      this.firestore(`eventObjects/${encodeURIComponent(id)}`),
      this.firestore(`eventObjects/${encodeURIComponent(id)}/guests/${encodeURIComponent(this.profile.id)}`),
    ]);
    if (details.status === 'fulfilled') {
      const fields = decodeFields(details.value.fields);
      const normalized = normalizeEvent({ ...fields, eventId: id }, event.access);
      if (normalized) event = { ...event, ...normalized, image: normalized.image || event.image };
    }
    if (guest.status === 'fulfilled') {
      const fields = decodeFields(guest.value.fields);
      event = { ...event, rsvp: normalizeStatus(fields.rsvpStatus), plusOneRequested: Boolean(fields.requestedPlusOnes), hasAdmission: Number(fields.ticketCount) > 0 };
    }
    const authorizationError = result => result.status === 'rejected' && result.reason.status === 401;
    if ([details, guest].some(authorizationError)) throw new ProviderError('Your Doorlist session expired. Please sign in again.', 401);
    event.detailsLoaded = true;
    event.detailsRestricted = details.status === 'rejected';
    this.allowedEvents.set(id, event);
    return event;
  }
  async loadGuests(id) {
    this.requireEvent(id);
    const guests = []; let pageToken = ''; let pages = 0;
    try {
      do {
        pages++;
        const query = new URLSearchParams({ pageSize: '100' });
        if (pageToken) query.set('pageToken', pageToken);
        const page = await this.firestore(`eventObjects/${encodeURIComponent(id)}/guests`, `?${query}`);
        for (const doc of page.documents || []) {
          const guest = decodeFields(doc.fields);
          if (!guest.name || guest.name.startsWith('*')) continue;
          guests.push({ id: doc.name.split('/').at(-1), name: guest.name, status: normalizeStatus(guest.rsvpStatus), photo: safeImage(guest.profilePhotoUrl), color: guests.length % 6 });
        }
        pageToken = page.nextPageToken || '';
      } while (pageToken && pages < 50);
      return { guests, restricted: false, partial: Boolean(pageToken) };
    } catch (error) {
      if (error.status === 401) throw error;
      if (![403, 404].includes(error.status)) throw error;
      return { guests: [], restricted: true, partial: false };
    }
  }
  async loadInvite(id) {
    this.requireEvent(id);
    const fallback = reason => ({ kind: 'generated', reason, eventId: id });
    let tickets;
    try { tickets = await this.firestore(`eventObjects/${encodeURIComponent(id)}/guests/${encodeURIComponent(this.profile.id)}/tickets`, '?pageSize=100'); }
    catch (error) {
      if (error.status === 401) throw error;
      if ([403, 404].includes(error.status)) return fallback('Doorlist has not provided an accessible invite for this event.');
      throw error;
    }
    const ticket = (tickets.documents || []).find(doc => {
      const fields = decodeFields(doc.fields);
      return !fields.scanTime && (!fields.uuid || fields.uuid === this.profile.id);
    });
    if (!ticket) return fallback('There is no available admission ticket on your account for this event.');
    const fields = decodeFields(ticket.fields);
    const query = new URLSearchParams({ eventID: id, tierID: fields.tierID || 'FREE', ticketID: ticket.name.split('/').at(-1) });
    let result;
    try { result = await this.api(`/api/qr?${query}`); }
    catch (error) {
      if ([403, 404].includes(error.status)) return fallback('Doorlist has not granted access to this event’s QR code.');
      throw error;
    }
    const codes = result.qrCodes;
    const interval = Number(result.intervalLength);
    const responseTime = Number(result.responseTime);
    if (!Array.isArray(codes) || !codes.length || !Number.isFinite(interval) || interval <= 0 || !Number.isFinite(responseTime)) {
      throw new ProviderError('Doorlist returned an unsupported QR response.');
    }
    const index = Math.max(0, Math.floor((this.clock() - responseTime) / interval));
    if (index >= codes.length || typeof codes[index] !== 'string') throw new ProviderError('Doorlist returned an expired QR code. Refresh your invite.');
    const expiresAt = responseTime + (index + 1) * interval;
    const svg = await QRCode.toString(codes[index], { type: 'svg', errorCorrectionLevel: 'H', margin: 4, width: 704 });
    return { kind: 'official', eventId: id, svg, expiresAt, validForMs: Math.max(0, expiresAt - this.clock()), refreshAfterMs: Math.max(100, expiresAt - this.clock() - 300) };
  }
}
