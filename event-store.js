import { eventStore as demoStore } from './demo-store.js';
let events = [];
let suggestedFriends = [];
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
      authenticated = false; mode = 'disconnected'; events = []; suggestedFriends = []; profile = { name: 'You', photo: 'profile.png' };
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
  getSuggestedFriends: () => mode === 'preview' ? demoStore.getGuests('house-night').slice(0, 6) : structuredClone(suggestedFriends),
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
      events = result.events; suggestedFriends = result.suggestedFriends || []; profile = result.profile; coverage = result.coverage; syncedAt = result.syncedAt;
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
    events = []; suggestedFriends = []; profile = { name: 'You', photo: 'profile.png' }; mode = 'disconnected'; authenticated = false;
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
  async loadGuests(id, { append = false } = {}) {
    const existing=events.find(item=>item.id===id);
    const cursor=append?existing?.guestListNextCursor:null;
    if(append&&!cursor)return {guests:existing?.guests||[],generated:Boolean(existing?.guestListGenerated)};
    let result;
    try { result = await request(`/api/events/${encodeURIComponent(id)}/guests${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`); }
    catch (error) {
      if (error.status === 401 || append) throw error;
      result = { guests: [], restricted: true, partial: false, source:'profile-cache' };
    }
    if(append&&result.nextPageToken===cursor)throw new Error('The next page could not be loaded. Try again.');
    if(append&&result.restricted)throw new Error('The remaining guest list is unavailable.');
    const generated = false;
    const source=result.source || (result.restricted?'profile-cache':'doorlist');
    const page=result.guests || [];
    const guests=append?[...new Map([...(existing?.guests||[]),...page].map(person=>[person.id,person])).values()]:page;
    const event = events.find(item => item.id === id);
    if (event) Object.assign(event, { guests, guestsLoaded: true, guestListRestricted: result.restricted, guestListPartial: result.partial, guestListGenerated: generated, guestListSource:source, guestListNextCursor:result.nextPageToken || null });
    return { ...result, guests, generated, source };
  },
  loadInvite: id => request(`/api/events/${encodeURIComponent(id)}/invite`),
  // Local preview actions never mutate live account information.
  setRsvp(id, value) { if (mode === 'preview') return demoStore.setRsvp(id, value); },
  updateEvent(id, value) { if (mode === 'preview') return demoStore.updateEvent(id, value); },
  updateProfile(value) { if (mode === 'preview') return demoStore.updateProfile(value); },
  requestPlusOne(id) { if (mode === 'preview') return demoStore.requestPlusOne(id); },
};
