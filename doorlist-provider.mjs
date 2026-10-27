import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';

const publishedConfig = JSON.parse(await readFile(new URL('./doorlist-provider-config.json', import.meta.url)));
export class ProviderError extends Error {
  constructor(message, status = 502, code = '') { super(message); this.status = status; this.code = code; }
}
// Only documented error identifiers are retained; upstream messages can contain private details.
const authFailureCodes=new Set(['signup_disabled','user_not_found','validation_failed','sms_send_failed','phone_provider_disabled','otp_disabled','otp_expired','invalid_credentials','over_sms_send_rate_limit','over_request_rate_limit','unexpected_failure','request_timeout','user_banned','session_expired','phone_not_confirmed','captcha_failed','hook_timeout','hook_timeout_after_retry']);
function authFailure(url,base,data,status) {
  if(!url.startsWith(`${base}/auth/v1/`))return null;
  const path=new URL(url).pathname;
  if(!['/auth/v1/otp','/auth/v1/verify'].includes(path))return null;
  const incoming=data?.error_code||data?.code;
  const code=authFailureCodes.has(incoming)?incoming:'upstream_auth_error';
  const sending=path.endsWith('/otp');
  let message=sending
    ? 'Doorlist could not send a code for this number. Check the country code and use the phone number on your existing Doorlist account.'
    : 'Doorlist could not complete sign-in. Try again.';
  if(['signup_disabled','user_not_found'].includes(code))message='Use the phone number attached to your existing Doorlist account. This website cannot create a new Doorlist account.';
  else if(['otp_expired','invalid_credentials'].includes(code))message='That code is incorrect or has expired. Enter the latest SMS code, or request a new one.';
  else if(['over_sms_send_rate_limit','over_request_rate_limit'].includes(code)||status===429)message='Doorlist is limiting SMS requests. Wait before requesting another code.';
  else if(code==='sms_send_failed')message='Doorlist could not deliver the SMS. Check your phone number and try again later.';
  else if(['phone_provider_disabled','otp_disabled'].includes(code))message='Doorlist SMS sign-in is unavailable right now. Try again later.';
  else if(code==='validation_failed')message=sending?'Doorlist did not accept that phone number. Check the digits and country code.':'Doorlist did not accept that code. Enter the latest code from your SMS.';
  else if(code==='user_banned')message='Doorlist could not sign in to this account. Contact Doorlist support.';
  else if(code==='captcha_failed')message='Doorlist could not complete its security check. Try signing in through the official Doorlist app.';
  else if(status>=500||['request_timeout','hook_timeout','hook_timeout_after_retry'].includes(code))message='Doorlist sign-in is temporarily unavailable. Try again later.';
  return new ProviderError(message,status,code);
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
// Native stock themes omit isThemeDark on some event feeds. These light-theme
// slugs come from Doorlist's public theme metadata; an event's own flag wins.
const lightStockThemes = new Set([
  'beer', 'beige-wallpaper', 'g-blue', 'blue-cartoon', 'champagne-preview-1',
  'champagne--preview-2-', 'clouds---sky', 'crinkled-paper', 'film-screen',
  'flower-wallpaper', 'g-turquoise', 'g-green', 'g-light-blue',
  'neon-sunset-road', 'g-orange', 'pastel-watercolor', 'g-pink', 'pink-blue-shapes',
  'pink-orange-bubbles', 'pink-watercolor', 'pool', 'pulsing-heart', 'g-purple',
  'purple-ecoli', 'purple-yellow-gradient', 'rainbow-gradient', 'rotating-sun',
  'white-falling-snow', 'g-yellow',
]);
const stockPosterNames = {
  'black-waves--new-':'black-waves-new', 'g-blue':'blue', 'bodybuilder---':'bodybuilder-',
  'champagne--preview-2-':'champagne-preview-2',
  'clouds---sky':'clouds--sky', 'g-turquoise':'gradients---turcoise',
  'g-green':'green', 'g-light-blue':'light-blue', 'neon-pink-blue-frame':'neon-pinkblue-frame',
  'g-orange':'orange', 'g-pink':'pink', 'g-purple':'purple',
  'purple-gradient-floor':'purple-gradient-floo', 'purple-yellow-gradient':'purple-yellow-gradie',
  'g-red':'red', 'red-yellow-neon-frame':'red-yellow-neon-fram', 'g-yellow':'yellow',
  // Shared filename prefixes need their complete native media identity.
  'champagne_1777392502288_6but6bb2f7m.mp4':'champagne-preview-1',
  'theme_1776822775731_f96vxc8q535.mp4':'dark-blue-bubbles',
  'theme_1776822097725_xu5hd54dn7j.mp4':'pink-watercolor',
  'theme_1776820063280_3a1xa30zu53.mp4':'sunset-road',
};
function safeBackgroundURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function normalizeBackground(event = {}, previous = null) {
  const url = safeBackgroundURL(event.themeURL);
  if (!url) return null;
  const parsed = new URL(url);
  const kind = /\.(mp4|webm|mov|m4v)$/i.test(parsed.pathname) ? 'video' : 'image';
  const stock = parsed.origin === 'https://storage.googleapis.com'
    && parsed.pathname.match(/^\/doorlist-b6a3f\.appspot\.com\/videoThemes\/([\w-]+)_\d+_[\w-]+\.(?:mp4|webm|mov|m4v)$/i);
  const stockSlug = stock && (stockPosterNames[parsed.pathname.split('/').at(-1)] || stock[1]);
  const posterSlug = stock && (stockPosterNames[stockSlug] || stockSlug);
  const cached = previous?.url === url ? previous : null;
  let poster = safeBackgroundURL(event.themeFirstFrame) || safeBackgroundURL(cached?.poster);
  if (!poster && stock) poster = `${parsed.origin}/doorlist-b6a3f.appspot.com/themeStills/${posterSlug}.jpg`;
  if (!poster && /(^|\.)giphy\.com$/i.test(parsed.hostname) && /\/giphy\.gif$/i.test(parsed.pathname)) {
    const still = new URL(url);
    still.pathname = still.pathname.replace(/\/giphy\.gif$/i, '/giphy_s.gif');
    poster = still.href;
  }
  const isDark = typeof event.isThemeDark === 'boolean' ? event.isThemeDark
    : typeof cached?.isDark === 'boolean' ? cached.isDark : !lightStockThemes.has(stockSlug);
  return { url, kind, poster, isDark };
}
function toISO(value, fallback = null) {
  if(value && typeof value==='object')value=value.seconds??value._seconds??value.timestampValue;
  if(typeof value==='string' && /^\d+(?:\.\d+)?$/.test(value))value=Number(value);
  if(typeof value==='number' && value<1e12)value*=1000;
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
export function normalizeLocation(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return {location:value.trim(),locationAddress:value.trim()};
  if (value && typeof value === 'object') {
    const street=[value.streetNumber,value.street].filter(Boolean).join(' ').trim();
    const address=[street,value.city,value.state].filter(Boolean).join(', ');
    const title=street || String(value.nickname || value.readable || value.address || value.name || value.formattedAddress || '');
    if (title || address) return {location:title || address,locationAddress:address || title};
  }
  return {location:fallback || 'Location not shared',locationAddress:fallback || ''};
}
const eventFontFamilies=new Set(['Bartle','BricolageGrotesque','Glitch','Graffiti','Pixelify','Varela','Serif']);
export function normalizeEventFont(value) {
  return typeof value==='string' && eventFontFamilies.has(value.trim()) ? value.trim() : null;
}
export function normalizeEvent(event, access = 'discover') {
  const id = String(event.eventId || event.id || '');
  if (!/^[\w-]{5,100}$/.test(id) || !event.name) return null;
  const start = toISO(event.time ?? event.startTime);
  const end = toISO(event.endTime, start);
  return {
    id, title: String(event.name), host: String(event.orgName || event.hostName || 'Doorlist event'),
    hostId: String(event.orgFBid || event.orgID || event.hostID || ''),
    hostPhoto: safeImage(event.orgCoverPhoto || event.hostPhoto || event.hostProfilePicture),
    image: safeImage(event.eventCoverCroppedURL || event.eventCoverURL || event.coverPhotoURL),
    theme: 'purple', background: normalizeBackground(event), fontFamily:normalizeEventFont(event.fontFamily), startsAt: start, endsAt: end,
    ...normalizeLocation(event.locationReadable && Object.values(event.locationReadable).some(Boolean) ? event.locationReadable : event.location, String(event.locationName || event.address || '')),
    goingCount:event.goingCount!=null&&Number.isInteger(Number(event.goingCount))&&Number(event.goingCount)>=0?Number(event.goingCount):null,
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
    // Keep native fetch unbound to this provider; Workers requires its global receiver.
    this.fetch = (...args) => fetchImpl(...args); this.config = config; this.clock = clock; this.allowedEvents = new Map(); this.profilePool = new Map();
  }
  rememberProfiles(people) {
    for(const person of people || []) {
      const id=String(person.id || person.uuid || ''),name=String(person.name || '').trim(),photo=safeImage(person.photo || person.profilePicture || person.profilePictureUrl);
      if(!id || !name || !photo || photo.length>2048)continue;
      const key=id.toLowerCase();
      this.profilePool.delete(key);
      this.profilePool.set(key,{id,name:name.slice(0,200),photo});
    }
    while(this.profilePool.size>500)this.profilePool.delete(this.profilePool.keys().next().value);
  }
  listProfiles() { return [...this.profilePool.values()].map(person=>({...person})); }
  snapshot() {
    return {events:[...this.allowedEvents.values()],profile:this.profile,profiles:this.listProfiles(),suggestedFriends:this.suggestedFriends||[],coverage:this.coverage||null,syncedAt:this.syncedAt||null};
  }
  profileSuggestions(eventId) {
    this.requireEvent(eventId);
    const people=this.listProfiles().filter(person=>person.id.toLowerCase()!==String(this.profile?.id||'').toLowerCase()).sort((a,b)=>a.id.localeCompare(b.id));
    const seed=Array.from(eventId).reduce((hash,char)=>(Math.imul(hash,31)+char.charCodeAt(0))>>>0,7);
    const offset=people.length?seed%people.length:0;
    // Synthetic display badges never become an actual RSVP or an attendance count.
    const guests=Array.from({length:Math.min(24,people.length)},(_,index)=>({...people[(offset+index)%people.length],status:'unconfirmed',displayStatus:index%9===8?'maybe':'going',attendanceVerified:false}));
    return {guests,restricted:true,partial:false,nextPageToken:null,source:'profile-cache',attendanceVerified:false};
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
      const auth=authFailure(url,this.config.supabaseUrl,data,status);
      if(auth)throw auth;
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
  async checkConnection() {
    await this.request(`${this.config.supabaseUrl}/auth/v1/health`, { headers: this.authHeaders() });
    return true;
  }
  async sendCode(phone) {
    await this.request(`${this.config.supabaseUrl}/auth/v1/otp`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ phone, create_user: true, channel: 'sms' }),
    });
  }
  async verifyCode(phone, code) {
    const session = await this.request(`${this.config.supabaseUrl}/auth/v1/verify`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ phone, token: code, type: 'sms' }),
    });
    if (!session.access_token || !session.refresh_token) throw new ProviderError('Doorlist did not return a session.', 401);
    // A new SMS sign-in starts a fresh account-scoped cache and Firebase identity.
    this.clear();
    this.setSession(session);
    let user;
    try { user = await this.api(`/api/users/phone/${obfuscatePhone(phone)}`); }
    catch(error) {
      this.clear();
      if(error.status===404)throw new ProviderError('An existing Doorlist account is required. Create your account in the official Doorlist app first.',404,'doorlist_account_required');
      throw error;
    }
    if (!user.uuid || !user.name) { this.clear(); throw new ProviderError('An existing Doorlist account is required. Create your account in the official Doorlist app first.',404,'doorlist_account_required'); }
    this.profile = { id: user.uuid, name: String(user.name), photo: safeImage(user.profilePicture) || 'profile.png',school:String(user.school||'') };
    this.rememberProfiles([this.profile]);
    return this.profile;
  }
  setSession(session) {
    this.accessToken = session.access_token; this.refreshToken = session.refresh_token;
    this.expiresAt = this.clock() + Number(session.expires_in || 3600) * 1000;
  }
  clear() { this.accessToken = null; this.refreshToken = null; this.firebaseToken = null; this.profile = null; this.allowedEvents.clear(); this.profilePool.clear();this.suggestedFriends=[];this.syncedAt=null;this.coverage=null; }
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
      this.api(`/api/events/profile/${encodeURIComponent(this.profile.id)}?token=${encodeURIComponent(token)}`),
      this.groupEvents(),
      this.campusEvents(),
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
        const event = normalizeEvent(raw, i === 0 || i === 4 || i === 5 || raw.type === 'own' ? 'invited' : 'discover');
        if (!event || raw.isCancelled || raw.isCanceled || (event.endsAt && new Date(event.endsAt).getTime() <= this.clock())) continue;
        const previous = merged.get(event.id);
        const access = previous?.access === 'invited' ? 'invited' : event.access;
        const cached=this.allowedEvents.get(event.id);
        merged.set(event.id, { ...cached, ...previous, ...event, goingCount:event.goingCount??previous?.goingCount??cached?.goingCount??null,
          background:normalizeBackground(raw,previous?.background||cached?.background)||previous?.background||cached?.background||null,
          fontFamily:normalizeEventFont(raw.fontFamily)||previous?.fontFamily||cached?.fontFamily||null,
          guests:cached?.guests||[],guestsLoaded:cached?.guestsLoaded||false,guestListSource:cached?.guestListSource,
          access, canRsvp: access === 'invited' });
      }
    }
    this.allowedEvents = merged;
    const events = [...merged.values()].sort((a, b) => (a.startsAt || '9999').localeCompare(b.startsAt || '9999'));
    await this.enrichEventPhotos(events);
    let suggestedFriends = [];
    try {
      const result = await this.api(`/api/recommendations?user_uuid=${encodeURIComponent(this.profile.id)}&forEvent=`);
      suggestedFriends = (Array.isArray(result.recommendations) ? result.recommendations : []).filter(person => person.uuid && person.name && !person.isFriendsWithUser && person.uuid !== this.profile.id).slice(0, 12).map(person => ({id:String(person.uuid), name:String(person.name), photo:safeImage(person.profilePicture || person.profilePictureUrl), mutualFriends:Number(person.mutualFriends) || 0, mutualEvents:Number(person.mutualEvents) || 0}));
    } catch { /* Recommendations are optional; never manufacture real account connections. */ }
    this.rememberProfiles([this.profile,...suggestedFriends,...events.flatMap(event=>event.guestPreview||[])]);
    for(const event of events)if(!event.guestPreview?.some(person=>person.photo))event.guestPreview=this.profileSuggestions(event.id).guests.slice(0,4);
    const eligible = own.value.eligibleEventCount ?? (own.value.events || []).length;
    const limited = eligible > events.filter(event=>event.access==='invited').length;
    this.suggestedFriends=suggestedFriends;this.syncedAt=new Date(this.clock()).toISOString();this.coverage={
      invited: events.filter(event => event.access === 'invited').length,
      discoverable: events.filter(event => event.access === 'discover').length,
      eligibleEventCount: eligible, limited, partial: limited || results.some(result => result.status === 'rejected'||result.value?.partial),
      sources:Object.fromEntries(['account','friends','home','trending','profile','groups','campus'].map((name,index)=>{const result=results[index];return [name,result.status==='fulfilled'?{count:(result.value.events||result.value.lightEvents||[]).length,partial:Boolean(result.value.partial)}:{count:0,status:result.reason.status||502}];})),
    };
    return this.snapshot();
  }
  async campusEvents() {
    if(!this.profile.school) {
      const user=await this.api(`/api/users/uuid/${encodeURIComponent(this.profile.id)}`);
      this.profile.school=String(user.school||'NONE');
    }
    if(!/^[A-Z0-9]{2,12}$/.test(this.profile.school)||this.profile.school==='NONE')return {events:[]};
    const token=await this.firebase(),events=[];let last=null,more=false;
    for(let page=0;page<20;page++) {
      const query={from:[{collectionId:'eventObjects'}],where:{compositeFilter:{op:'AND',filters:[
        {fieldFilter:{field:{fieldPath:'school'},op:'EQUAL',value:{stringValue:this.profile.school}}},
        {fieldFilter:{field:{fieldPath:'visibility'},op:'EQUAL',value:{stringValue:'EventVisibility.PUBLIC'}}},
      ]}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:200,
        ...(last?{startAt:{values:[{referenceValue:last}],before:false}}:{})};
      const response=await this.request(`https://firestore.googleapis.com/v1/projects/${this.config.firebaseProjectId}/databases/(default)/documents:runQuery`,{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:query}),
      });
      const docs=(Array.isArray(response)?response:[]).filter(row=>row.document).map(row=>row.document);
      for(const doc of docs){const raw=decodeFields(doc.fields);if(raw.hideDetailsIfNotOnList){delete raw.location;delete raw.locationReadable;delete raw.locationName;delete raw.address;raw.description='';}events.push({...raw,eventId:doc.name.split('/').at(-1)});}
      more=docs.length===200;
      const next=docs.at(-1)?.name;if(!more||!next||next===last)break;last=next;
    }
    return {events,partial:more};
  }
  async groupEvents() {
    const result=await this.api(`/api/users/groups/${encodeURIComponent(this.profile.id)}`);
    const groups=Array.isArray(result)?result:Array.isArray(result.groups)?result.groups:Array.isArray(result.all)?result.all.map(id=>({id})):[];
    const ids=new Set();
    await Promise.all(groups.map(async group=>{
      if(Array.isArray(group.members)&&!group.members.includes(this.profile.id))return;
      let details=group;
      if(!Array.isArray(details.eventIds)&&/^[\w-]{1,100}$/.test(String(group.id||group.uuid||''))){
        try{const response=await this.api(`/api/group/${encodeURIComponent(group.id||group.uuid)}`);details=response.group||response;}catch{/* Try the same group's authorized document. */}
        if(!Array.isArray(details.eventIds))try{details=decodeFields((await this.firestore(`organizations/${encodeURIComponent(group.id||group.uuid)}`)).fields);}catch{return;}
      }
      for(const id of details.eventIds||[])if(/^[\w-]{5,100}$/.test(String(id)))ids.add(String(id));
    }));
    const events=[];
    // Bounded concurrency; only event IDs returned for the current account's groups.
    const queue=[...ids];
    await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
      while(queue.length){const id=queue.shift();try{const document=await this.firestore(`eventObjects/${encodeURIComponent(id)}`);if(document.fields)events.push({...decodeFields(document.fields),eventId:id});}catch(error){if(error.status===401)throw error;}}
    }));
    return {events};
  }
  async enrichEventPhotos(events) {
    const hosts = new Map();
    for (const event of events.slice(0,20)) {
      if (!event.hostId || event.hostPhoto || hosts.has(event.hostId)) continue;
      const id = event.hostId;
      hosts.set(id, (async () => {
        try {
          const result = id.length > 20
            ? await this.api('/api/users/light_details', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uuids:[id]})})
            : await this.api(`/api/group/${encodeURIComponent(id)}`);
          const host = id.length > 20 ? result[id] : (result.group || result);
          return safeImage(host?.orgCoverPhoto || host?.profilePictureUrl || host?.profilePicture);
        } catch { return ''; }
      })());
    }
    await Promise.all(events.slice(0, 20).map(async event => {
      const [photo, circles, location] = await Promise.allSettled([
        hosts.get(event.hostId) || Promise.resolve(event.hostPhoto),
        this.api(`/api/event/${encodeURIComponent(event.id)}/circles`),
        event.locationAddress && event.goingCount!=null && event.background && event.fontFamily ? Promise.resolve(null) : this.firestore(`eventObjects/${encodeURIComponent(event.id)}`),
      ]);
      if (photo.status === 'fulfilled' && photo.value) event.hostPhoto = photo.value;
      if(location.status==='fulfilled'&&location.value?.fields) {
        const fields=decodeFields(location.value.fields);
        event.background=normalizeBackground(fields,event.background)||event.background||null;
        event.fontFamily=normalizeEventFont(fields.fontFamily)||event.fontFamily||null;
        if(fields.goingCount!=null&&Number.isInteger(Number(fields.goingCount))&&Number(fields.goingCount)>=0)event.goingCount=Number(fields.goingCount);
        if(!fields.hideDetailsIfNotOnList || event.access==='invited') {
          const location=normalizeLocation(fields.locationReadable || fields.location,String(fields.locationName || fields.address || ''));
          if(location.locationAddress)Object.assign(event,location);
        }
      }
      const rows = circles.status === 'fulfilled' ? (circles.value.guests || circles.value.attendees || []) : [];
      event.guestPreview = (Array.isArray(rows) ? rows : []).filter(person => person.name).slice(0,4).map(person => ({id:String(person.uuid || ''),name:String(person.name),photo:safeImage(person.profilePhotoUrl || person.profilePictureUrl || person.profilePicture)}));
    }));
  }
  requireEvent(id) {
    const event = this.allowedEvents.get(id);
    if (!event) throw new ProviderError('Refresh Your events before opening this event.', 404);
    return event;
  }
  async loadEvent(id) {
    let event = this.requireEvent(id);
    const [details, guest, playlist] = await Promise.allSettled([
      this.firestore(`eventObjects/${encodeURIComponent(id)}`),
      this.firestore(`eventObjects/${encodeURIComponent(id)}/guests/${encodeURIComponent(this.profile.id)}`),
      this.api(`/api/event-playlist/playlist/${encodeURIComponent(id)}`),
    ]);
    if (details.status === 'fulfilled') {
      const fields = decodeFields(details.value.fields);
      const normalized = normalizeEvent({ ...fields, eventId: id }, event.access);
      if (normalized) event = { ...event, ...normalized, background:normalizeBackground(fields,event.background)||event.background||null, fontFamily:normalizeEventFont(fields.fontFamily)||event.fontFamily||null, guests:event.guests||[],guestsLoaded:event.guestsLoaded||false, image: normalized.image || event.image, hostPhoto: normalized.hostPhoto || event.hostPhoto, location:normalized.locationAddress?normalized.location:event.location, locationAddress:normalized.locationAddress||event.locationAddress, goingCount:normalized.goingCount??event.goingCount };
    }
    if (guest.status === 'fulfilled') {
      const fields = decodeFields(guest.value.fields);
      event = { ...event, rsvp: normalizeStatus(fields.rsvpStatus), plusOneRequested: Boolean(fields.requestedPlusOnes), hasAdmission: Number(fields.ticketCount) > 0 };
    }
    const authorizationError = result => result.status === 'rejected' && result.reason.status === 401;
    if ([details, guest].some(authorizationError)) throw new ProviderError('Your Doorlist session expired. Please sign in again.', 401);
    if (playlist.status === 'fulfilled') {
      const data=playlist.value || {};
      event.playlist={name:String(data.playlist_name || 'Shared Playlist'),url:safeImage(data.playlist_url),image:safeImage(data.playlist_cover_url),songCount:Number(data.total_songs) || (Array.isArray(data.songs)?data.songs.length:0)};
    }
    event.detailsLoaded = true;
    event.detailsRestricted = details.status === 'rejected';
    this.allowedEvents.set(id, event);
    return event;
  }
  async loadGuests(id, options = {}) {
    this.requireEvent(id);
    const cursor=options.cursor || '';
    if(typeof cursor !== 'string' || cursor.length>2048)throw new ProviderError('Invalid guest-list cursor.',400);
    const pageLimit=Math.max(1,Math.min(50,Number(options.pageLimit)||50));
    const guests = []; let pageToken = cursor; let pages = 0;
    try {
      do {
        pages++;
        const query = new URLSearchParams({ pageSize: '100' });
        if (pageToken) query.set('pageToken', pageToken);
        const page = await this.firestore(`eventObjects/${encodeURIComponent(id)}/guests`, `?${query}`);
        for (const doc of page.documents || []) {
          const guest = decodeFields(doc.fields);
          if (!guest.name || guest.name.startsWith('*')) continue;
          guests.push({ id: doc.name.split('/').at(-1), name: guest.name, status: normalizeStatus(guest.rsvpStatus), photo: safeImage(guest.profilePhotoUrl || guest.profilePhotoURL || guest.profilePictureUrl || guest.profilePicture || guest.photoURL), color: guests.length % 6 });
        }
        pageToken = page.nextPageToken || '';
      } while (pageToken && pages < pageLimit);
      if(options.enrichPhotos) {
        const missing=guests.filter(person=>!person.photo);
        await Promise.all(Array.from({length:Math.ceil(missing.length/100)},async(_,index)=>{
          const batch=missing.slice(index*100,index*100+100);
          try {
            const details=await this.api('/api/users/light_details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uuids:batch.map(person=>person.id)})});
            const byId=new Map(Object.entries(details||{}).map(([id,detail])=>[String(detail?.uuid||id).toLowerCase(),detail]));
            for(const person of batch){const detail=byId.get(person.id.toLowerCase());person.photo=safeImage(detail?.profilePictureUrl || detail?.profilePicture || detail?.profilePhotoUrl);}
          }catch { /* An unavailable account photo keeps its local neutral avatar. */ }
        }));
      }
      this.rememberProfiles(guests);
      const photos=new Map(this.listProfiles().map(person=>[person.id.toLowerCase(),person.photo]));
      for(const person of guests)if(!person.photo)person.photo=photos.get(person.id.toLowerCase())||'';
      if(!cursor)Object.assign(this.requireEvent(id),{guests,guestsLoaded:true,guestListSource:'doorlist',guestListRestricted:false,guestListPartial:Boolean(pageToken),guestListNextCursor:pageToken||null});
      return { guests, restricted: false, partial: Boolean(pageToken), nextPageToken:pageToken || null, source:'doorlist' };
    } catch (error) {
      if (error.status === 401) throw error;
      if (![403,404].includes(error.status) && error.status<500)throw error;
      const fallback=this.profileSuggestions(id);
      if(!cursor)Object.assign(this.requireEvent(id),{guests:fallback.guests,guestsLoaded:true,guestListSource:'profile-cache',guestListRestricted:true,guestListPartial:false,guestListNextCursor:null});
      return fallback;
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
