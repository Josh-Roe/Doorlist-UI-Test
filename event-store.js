import { eventStore as demoStore } from './demo-store.js';
let events = [];
let profile = { name: 'You', photo: 'profile.png' };
let authenticated = false;
let mode = 'disconnected';
let status = 'loading';
let error = '';
let coverage = null;
let syncedAt = null;
async function request(path, body) {
  let response;
  try {
    response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Doorlist-Client': 'mobile-ui' }, body: JSON.stringify(body),
    }) });
  } catch { throw new Error('The connection service could not be reached. Try again.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Start the app with npm start to connect Doorlist.'); }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      authenticated = false; mode = 'disconnected'; events = []; profile = { name: 'You', photo: 'profile.png' };
    }
    const error = new Error(data.error || 'Doorlist could not complete the request.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export const eventStore = {
  get mode() { return mode; },
  get authenticated() { return authenticated; },
  get status() { return status; },
  get error() { return error; },
  get coverage() { return coverage; },
  get syncedAt() { return syncedAt; },
  listEvents: () => mode === 'preview' ? demoStore.listEvents() : structuredClone(events),
  getEvent: id => mode === 'preview' ? demoStore.getEvent(id) : structuredClone(events.find(event => event.id === id) || null),
  getProfile: () => mode === 'preview' ? demoStore.getProfile() : { ...profile },
  getGuests: id => eventStore.getEvent(id)?.guests || [],
  async initialize() {
    status = 'loading';
    try {
      const session = await request('/api/session');
      authenticated = session.authenticated;
      if (authenticated) { mode = 'live'; profile = session.profile; await this.refresh(); }
      else { status = 'ready'; mode = 'disconnected'; }
    } catch (cause) { status = 'error'; error = cause.message; }
  },
  async refresh() {
    if (!authenticated) throw new Error('Sign in to connect your events.');
    status = 'loading'; error = '';
    try {
      const result = await request('/api/events');
      events = result.events; profile = result.profile; coverage = result.coverage; syncedAt = result.syncedAt;
      mode = 'live'; status = 'ready';
      return result;
    } catch (cause) { status = 'error'; error = cause.message; throw cause; }
  },
  sendCode: phone => request('/api/auth/code', { phone }),
  async verifyCode(code) {
    const session = await request('/api/auth/verify', { code });
    authenticated = true; mode = 'live'; profile = session.profile;
    return this.refresh();
  },
  async disconnect() {
    await request('/api/auth/disconnect', {});
    events = []; profile = { name: 'You', photo: 'profile.png' }; mode = 'disconnected'; authenticated = false;
    status = 'ready'; error = ''; coverage = null; syncedAt = null;
  },
  usePreview() { mode = 'preview'; status = 'ready'; error = ''; },
  async loadEvent(id) {
    if (mode !== 'live') return this.getEvent(id);
    const { event } = await request(`/api/events/${encodeURIComponent(id)}`);
    const index = events.findIndex(item => item.id === id);
    if (index >= 0) events[index] = { ...events[index], ...event };
    return this.getEvent(id);
  },
  async loadGuests(id) {
    let result;
    try { result = await request(`/api/events/${encodeURIComponent(id)}/guests`); }
    catch (error) {
      if (error.status === 401) throw error;
      result = { guests: [], restricted: true, partial: false };
    }
    const generated = Boolean(result.restricted);
    const guests = generated ? generateGuestPreview(id) : result.guests;
    const event = events.find(item => item.id === id);
    if (event) Object.assign(event, { guests, guestsLoaded: true, guestListRestricted: result.restricted, guestListPartial: result.partial, guestListGenerated: generated });
    return { ...result, guests, generated };
  },
  loadInvite: id => request(`/api/events/${encodeURIComponent(id)}/invite`),
  // Local preview actions never mutate live account information.
  setRsvp(id, value) { if (mode === 'preview') return demoStore.setRsvp(id, value); },
  updateEvent(id, value) { if (mode === 'preview') return demoStore.updateEvent(id, value); },
  updateProfile(value) { if (mode === 'preview') return demoStore.updateProfile(value); },
  requestPlusOne(id) { if (mode === 'preview') return demoStore.requestPlusOne(id); },
};

// Fictional sample people; never inferred from contacts or the real event's attendees.
export function generateGuestPreview(eventId) {
  const names = ['Alex Morgan', 'Jordan Lee', 'Sam Rivera', 'Taylor Chen', 'Casey Davis', 'Riley Park', 'Jamie Wilson', 'Morgan Reed', 'Avery Brooks', 'Cameron Ellis', 'Drew Bennett', 'Quinn Patel', 'Charlie Hayes', 'Skyler James', 'Reese Carter', 'Parker Kim', 'Rowan Blake', 'Finley Scott', 'Emerson Lane', 'Sage Miller', 'Dakota Reed', 'Harper Quinn', 'Jules Monroe', 'Robin West'];
  const seed = Array.from(String(eventId)).reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: 18 + seed % 7 }, (_, index) => ({
    id: `generated-${eventId}-${index}`, name: names[(seed + index) % names.length],
    status: (index + seed) % 4 === 0 ? 'maybe' : 'going', color: (index + seed) % 6, generated: true,
  }));
}
