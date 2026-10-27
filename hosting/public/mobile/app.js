import { createPageNavigation } from './page-navigation.js';
import { eventStore } from './event-store.js';
import { avatarFallback, profileImage } from './avatar.js';
import { orderedGuests, guestDisplayStatus } from './guest-list.js';

const app = document.getElementById('appView');
const invite = document.getElementById('inviteView');
const dialog = document.getElementById('actionDialog');
const toast = document.getElementById('toast');
const pageNavigation=createPageNavigation({app,invite,onActivity:updateConfettiPlayback,onSettled:()=>{if(pendingDataRender)renderDataUpdate();scheduleBackPage();},getMeta:()=>({revision:screenRevision,guestFilter,guestQuery,guestVisibleCount,guestBatchError}),getBackTarget:backTarget,onBack:goBack});
const icons = {
  back: '<path d="m14 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  bell: '<g transform="rotate(-18 12 12)"><path d="M18 9a6 6 0 0 0-12 0v3c0 2-1.2 3.5-2.5 4.6-.6.5-.3 1.4.5 1.4h16c.8 0 1.1-.9.5-1.4C19.2 15.5 18 14 18 12V9Z"/><path d="M10 21c.5 1 3.5 1 4 0M3 6l-1 3m19-3 1 3"/></g>',
  user: '<circle cx="12" cy="6.5" r="3.5"/><path d="M4.5 21v-1.5c0-4 3-6.5 7.5-6.5s7.5 2.5 7.5 6.5V21"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m2 9v-2a6 6 0 0 0-2-4"/>',
  qr: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Z"/><path fill="currentColor" stroke="none" d="M14 14h3v3h-3zm5 0h2v2h-2zm-5 5h2v2h-2zm4-1h3v3h-3z"/>',
  thumb: '<path fill="currentColor" stroke="none" d="M8.7 9.3 11 3.1c.3-.8 1.1-1.2 1.8-1 .8.2 1.3.9 1.2 1.7l-.5 4.5h4.1c2.1 0 3.1 1.2 2.6 3.1l-1.7 6.4c-.4 1.4-1.4 2.2-3 2.2h-3.6c-1.7 0-3.2-.8-3.2-2.5V9.3ZM3.5 9.2H7V21H3.5c-.9 0-1.5-.6-1.5-1.5v-8.8c0-.9.6-1.5 1.5-1.5Z"/>',
  spotify: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><g stroke="#07041b" stroke-width="1.6" fill="none"><path d="M6.5 9c3.5-1 7.5-.7 11 1M7.2 12.3c3-.9 6.3-.5 9.2.9m-8.5 2.3c2.5-.6 5-.3 7.5.8"/></g>',
  arrowUpRight: '<path d="M13 4h7v7m0-7L10 14M9 6H5v14h14v-4"/>',
  playlist: '<path d="M9 17V4l12-2v13M9 7l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
  share: '<path d="M12 16V2m-5 5 5-5 5 5M5 11H3v11h18V11h-2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  more: '<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 8 15 8 15S25 10 20 5Z"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.next}</svg>`;
const esc = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initials = name => name.split(/\s+/).map(part => part[0]).slice(0, 2).join('');
const statusLabel = status => ({going:'Going',maybe:'Maybe','not-going':'Not going',invited:'Invited',unconfirmed:'Not confirmed'}[status]);
let currentRoute = '';
let screenRevision=0,cacheAccountId=eventStore.getProfile().id||null;
let historyIndex=0;
const historyRoutes=new Map([[0,location.hash.slice(1)||'/']]);
history.replaceState({...history.state,doorlistRoute:{index:0,route:location.hash.slice(1)||'/'}},'');
let warmBackTask=0;
let guestFilter = 'all';
let guestQuery = '';
const GUEST_BATCH_SIZE=60;
let guestVisibleCount = GUEST_BATCH_SIZE;
let guestObserver;
let guestBatchLoading=false;
let guestBatchError='';
let activeHeroId=null;
let toastTimer;
let phoneHint = '';
const hydrating = new Set();

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
function dateParts(event) {
  if (!event.startsAt) return {day:'—',weekday:'',full:'Date to be announced',time:'TBA',endTime:'TBA'};
  const date = new Date(event.startsAt);
  return {
    day: date.toLocaleDateString('en-US',{day:'numeric'}),
    weekday: date.toLocaleDateString('en-US',{weekday:'short'}),
    full: date.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}),
    time: date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),
    endTime: new Date(event.endsAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),
  };
}
const unavailablePhotos=new Set();
function avatar(person, extra = '') {
  return `<img class="guest-avatar ${extra}" loading="lazy" decoding="async" src="${esc(profileImage(person))}" data-avatar-id="${esc(person.id || person.hostId || '')}" data-avatar-name="${esc(person.name || person.host || '')}" alt="">`;
}
function hostAvatar(event) { return avatar({id:event.hostId || event.host,name:event.host,photo:event.hostPhoto},'host-mark'); }
function avatarStack(event) {
  const people = eventStore.previewPeople(event);
  return people?.length ? `<span class="avatar-stack" aria-hidden="true">${people.slice(0,4).map(person=>avatar(person)).join('')}</span>` : '';
}
document.addEventListener('error', event => {
  const image=event.target;
  if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-avatar-id') || image.dataset.fallbackApplied) return;
  unavailablePhotos.add(image.getAttribute('src'));
  if(image.closest('.avatar-stack')&&eventStore.mode!=='preview') {
    const used=new Set([...image.closest('.avatar-stack').querySelectorAll('img')].map(node=>node.dataset.avatarId));
    const replacement=eventStore.getProfiles().find(person=>!used.has(person.id)&&!unavailablePhotos.has(person.photo));
    if(replacement){image.dataset.avatarId=replacement.id;image.dataset.avatarName=replacement.name;image.src=replacement.photo;return;}
    image.hidden=true;return;
  }
  image.dataset.fallbackApplied='true';
  image.src=avatarFallback(image.dataset.avatarId,image.dataset.avatarName);
},true);
function poster(event) {
  if (event.image && event.image !== 'event.png') return `<img class="uploaded-poster" loading="lazy" decoding="async" src="${esc(event.image)}" alt="">`;
  return `<div class="event-art art-${esc(event.theme)}" aria-hidden="true"><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><div class="poster-copy"><small>${esc(event.host)} PRESENTS</small><strong>${esc(event.title)}</strong><span>${esc(dateParts(event).full)} · ${esc(dateParts(event).time)}</span></div><span class="poster-star star-one">✦</span><span class="poster-star star-two">✦</span></div>`;
}
function eventCard(event, featured = false) {
  const date = dateParts(event);
  return `<a class="event-card ${featured ? 'featured-card' : 'small-event-card'}" href="#/event/${event.id}" aria-label="Open ${esc(event.title)}">
    <div class="event-poster">${poster(event)}<span class="date-badge"><strong>${date.day}</strong><span>${date.weekday}</span></span>
    ${featured ? `<div class="hero-caption"><div class="host-line">${hostAvatar(event)}${esc(event.host)}</div><h3>${esc(event.title)}</h3><p>${date.time} – ${date.endTime} | ${esc(event.location)}</p></div>${avatarStack(event)}` : ''}</div>
    ${!featured ? `<div class="card-caption"><span>${esc(event.host)}</span><h3>${esc(event.title)}</h3><p>${date.full} · ${date.time}${event.source === 'doorlist' ? ` · ${event.access === 'invited' ? 'Invited' : 'Discover'}` : ''}</p></div>` : ''}
  </a>`;
}
function nav(selected = 'home') {
  return `<nav class="bottom-dock" aria-label="Main navigation"><div class="dock-tabs" data-selected="${selected}">${[['home','Home','/'],['bell','Activity','/activity'],['user','Profile','/profile']].map(([name,label,path])=>`<a href="#${path}" aria-label="${label}" ${selected === name ? 'aria-current="page"' : ''}>${icon(name)}</a>`).join('')}</div><button class="dock-plus" data-action="create" aria-label="Create event">${icon('plus')}</button></nav>`;
}
function topbar(back, title = '', action = '') {
  return `<header class="screen-topbar"><a href="#${back}" class="glass-button" aria-label="Back">${icon('back')}</a>${title ? `<span class="topbar-title">${esc(title)}</span>` : '<span></span>'}${action}</header>`;
}
function empty(title, message, symbol = 'search') {
  return `<div class="empty-state">${icon(symbol)}<h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
}
const gatheringTemplates = [
  {id:'warm-up',title:'THE WARM UP',description:'Grab the crew for a pregame',image:'assets/doorlist-warm-up.png'},
  {id:'birthday',title:'Birthday Party',description:"Celebrate you or your friend's bday",image:'assets/doorlist-birthday.png',motion:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/purple-confetti_1777411740084_gb1xercrd4g.mp4'},
  {id:'sunday-scaries',title:'Sunday Scaries',description:"You know the drill—let’s fight this together",image:'assets/doorlist-sunday-scaries.png'},
  {id:'study-sesh',title:'Study Sesh',description:"Time to lock in—let’s get those A’s",image:'assets/doorlist-study-sesh.png',motion:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/math_1777424138280_y6gnutt3zmb.mp4'},
  {id:'bar-crawl',title:'BAR CRAWL',description:'Set the record for most bar stops',image:'assets/doorlist-bar-crawl.png'},
  {id:'watch-party',title:'Watch Party',description:"You're gonna wanna see this!",image:'assets/doorlist-watch-party.png'},
];
function swayAdvertisement() {
  return `<section class="sway-ad" aria-label="Sway advertisement"><div class="sway-ad-top"><span class="sway-wordmark"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M2 2h21L13 13h9v13H1l10-11H2Z" fill="currentColor" stroke="none"/></svg>Sway</span><span class="sway-status"><i></i>Applications open</span></div><h2>Throw a ballot party.<br><span>Sway covers up to $500.</span></h2><a href="https://www.sway.co/ballot-party" target="_blank" rel="noopener noreferrer" class="sway-apply">Apply to host ${icon('next')}</a><p>External offer · Nonpartisan · closes Oct 31</p></section>`;
}
function suggestedFriendsSection() {
  const friends=eventStore.getSuggestedFriends();
  return `<section class="home-section suggested-friends"><div class="section-heading"><h2>Suggested friends</h2><button data-action="add-friends">Add Friends ${icon('next')}</button></div>${friends.length ? `<div class="friends-rail">${friends.map(person=>`<button class="friend-suggestion" data-action="friend-profile" data-id="${esc(person.id)}" aria-label="Open ${esc(person.name)}"><span class="friend-photo">${avatar(person)}<span class="friend-add">${icon('plus')}</span></span><strong>${esc(person.name)}</strong><small>${person.mutualFriends ? `${person.mutualFriends} mutual friends` : person.mutualEvents ? `${person.mutualEvents} mutual events` : 'People you may know'}</small></button>`).join('')}</div>` : `<button class="find-friends-card" data-action="add-friends">${icon('people')}Find your people ${icon('next')}</button>`}</section>`;
}
function gatheringSection() {
  return `<section class="home-section gathering-section"><h2>Get people together!</h2><p>Tap to make an event</p><div class="gathering-rail">${gatheringTemplates.map(template=>`<button class="gathering-card" data-action="event-template" data-template="${template.id}" aria-label="${esc(template.title)}. ${esc(template.description)}"><img class="native-template-art" loading="lazy" src="${template.image}" alt="">${template.motion?`<video class="template-video" data-template-video="${template.id}" muted loop autoplay playsinline preload="metadata" aria-hidden="true"><source src="${template.motion}" type="video/mp4"></video>`:''}</button>`).join('')}</div></section>`;
}
function hostTile(events) {
  return `<button class="host-card" data-action="create"><svg class="host-card-outline" viewBox="0 0 236 236" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="234" height="234" rx="23" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="10 10" vector-effect="non-scaling-stroke"/></svg><img class="native-host-art" src="assets/doorlist-host-stack.png" alt="" aria-hidden="true"><strong>Create your own event</strong><span>Host and invite your friends!</span></button>`;
}
function home() {
  const events=eventStore.listEvents();
  const featured=events.find(event=>event.rsvp==='going') || events.find(event=>event.access==='invited') || events[0];
  const slides=featured?[featured,...events.filter(event=>event.id!==featured.id)]:[];
  return `<div class="home-view"><header class="home-header"><h1 class="wordmark">doorlist</h1><div class="header-actions"><a href="#/search" class="glass-button" aria-label="Search events">${icon('search')}</a></div></header>
    ${connectionPanel()}<section class="home-section coming-up"><h2>Coming up!</h2>${slides.length?`<div class="coming-up-rail" aria-label="Upcoming events" tabindex="0">${slides.map(event=>eventCard(event,true)).join('')}</div>`:empty('Nothing coming up','Your next invite will show up here.','calendar')}</section>
    <section class="home-section your-events"><a class="section-heading" href="#/events"><h2>Your events</h2>${icon('next')}</a><div class="hosting-rail">${hostTile(events)}</div></section>
    ${swayAdvertisement()}${suggestedFriendsSection()}${gatheringSection()}${nav()}</div>`;
}
function confettiBackground() {
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video='https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/purple-confetti_1777411740084_gb1xercrd4g.mp4';
  const poster='https://storage.googleapis.com/doorlist-b6a3f.appspot.com/themeStills/purple-confetti.jpg';
  return `<div class="confetti-field" aria-hidden="true">${reduceMotion ? `<img class="confetti-still" src="${poster}" alt="">` : `<video class="confetti-video" autoplay muted loop playsinline preload="metadata" poster="${poster}"><source src="${video}" type="video/mp4"></video>`}${Array.from({length:28},(_,i)=>`<i style="--x:${(i*37+13)%100}%;--y:${(i*53)%100}%;--delay:${-(i*1.13)}s;--duration:${12+i%9}s;--angle:${i*43}deg;--confetti-color:${['#ae75ff','#f68fe5','#7ac3ff','#f9ce75','#8feac9'][i%5]}"></i>`).join('')}</div>`;
}
document.addEventListener('playing',event=>{
  if(event.target.matches?.('.confetti-video'))event.target.closest('.confetti-field')?.classList.add('video-ready');
},true);
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
function updateConfettiPlayback() {
  document.querySelectorAll('.avatar-stack').forEach(stack=>stack.style.setProperty('--avatars-play-state',document.hidden||document.documentElement.dataset.pageMoving||!stack.dataset.inView?'paused':'running'));
  document.querySelectorAll('.confetti-video,.template-video').forEach(video=>{
    if(document.hidden || document.documentElement.dataset.pageMoving || motionPreference.matches || app.hidden || (video.matches('.template-video')&&!video.dataset.inView))video.pause();
    else video.play().catch(()=>{});
  });
}
motionPreference.addEventListener('change',updateConfettiPlayback);
document.addEventListener('visibilitychange',updateConfettiPlayback);
let templateVideoObserver;
function bindTemplateMotion() {
  templateVideoObserver?.disconnect();
  templateVideoObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){const video=entry.target;if(entry.isIntersecting)video.dataset.inView='true';else delete video.dataset.inView;}
    updateConfettiPlayback();
  },{rootMargin:'120px'});
  document.querySelectorAll('.template-video,.avatar-stack').forEach(target=>templateVideoObserver.observe(target));
  updateConfettiPlayback();
}
function eventRow(event) {
  return `<a class="event-row" href="#/event/${event.id}"><span class="event-row-art">${poster(event)}</span><span class="event-row-copy"><strong>${esc(event.title)}</strong><span>${esc(dateParts(event).full)} · ${esc(dateParts(event).time)}</span></span>${icon('next')}</a>`;
}
function eventPage(event) {
  const date = dateParts(event);
  const going = event.goingCount ?? (event.guests.filter(guest=>guest.status==='going').length + (event.source !== 'doorlist' && event.rsvp==='going' ? 1 : 0));
  return `<div class="event-view theme-${esc(event.theme)}">${confettiBackground()}${topbar('/', '', `<button class="glass-button" data-action="event-menu" data-id="${event.id}" aria-label="Event options">${icon('more')}</button>`)}
    <h1 class="event-title">${esc(event.title)}</h1><div class="detail-poster">${poster(event)}</div>
    <a class="guest-summary glass-panel" href="#/event/${event.id}/guests">${avatarStack(event)}<span><strong>Guest List</strong><small>${going} going</small></span><span class="see-all">See All ${icon('next')}</span></a>
    <section class="event-info"><div class="info-line"><span class="info-icon">${icon('calendar')}</span><div><span>Date</span><strong>${date.full}</strong><p>${date.time} – ${date.endTime}</p></div></div><div class="info-line">${hostAvatar(event)}<div><span>Hosted by</span><strong>${esc(event.host)}</strong></div></div><div class="info-line"><span class="info-icon">${icon('pin')}</span><div><span>Location</span><strong>${esc(event.location)}</strong>${event.locationAddress?`<a class="location-link" href="https://maps.apple.com/?q=${encodeURIComponent(event.locationAddress)}" target="_blank" rel="noopener noreferrer">${esc(event.locationAddress)}</a>`:''}</div></div></section>
    <section class="about-event"><h2>About this event</h2><p>${esc(event.description)}</p></section>
    ${sharedPlaylistSection(event)}
    <nav class="event-dock" aria-label="Event actions"><button data-action="rsvp" data-id="${event.id}"><span class="event-dock-button">🔥</span><span>RSVP</span></button><button class="share-action" data-action="share" data-id="${event.id}"><span class="event-dock-button">${icon('share')}</span><span>Share</span></button><a href="#/event/${event.id}/invite"><span class="event-dock-button">${icon('qr')}</span><span>Tickets</span></a></nav></div>`;
}
function sharedPlaylistSection(event) {
  return `<section class="shared-playlist"><h2>${icon('spotify')}Shared Playlist</h2><div class="playlist-actions"><button data-action="playlist-add" data-id="${event.id}">${icon('plus')}Add a Song</button>${event.playlist?.url?`<a href="${esc(event.playlist.url)}" target="_blank" rel="noopener noreferrer">${icon('arrowUpRight')}Open Playlist</a>`:`<button disabled>${icon('arrowUpRight')}Open Playlist</button>`}</div></section>`;
}
function guestListPage(event) {
  if(currentRoute!==`/event/${event.id}/guests`){guestFilter='all';guestQuery='';guestVisibleCount=GUEST_BATCH_SIZE;guestBatchError='';}
  return `<div class="guest-list-view">${topbar(`/event/${event.id}`)}<h1 class="sr-only">${esc(event.title)} guest list</h1><div class="guest-controls"><div class="segmented-control" role="group" aria-label="Filter guests">${[['all','All'],['going','Going'],['maybe','Maybe']].map(([id,label])=>`<button data-action="guest-filter" data-filter="${id}" aria-pressed="${id===guestFilter}">${label}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="guestSearch" type="search" value="${esc(guestQuery)}" placeholder="Search Guests" aria-label="Search guests" autocomplete="off"></label></div><div id="guestResults" class="guest-results" aria-live="polite">${guestRows(event)}</div><p class="preview-note">${guestSourceNote(event)}</p></div>`;
}
function guestCandidates(event) {
  return orderedGuests(event.guests,eventStore.getProfile()).map(person=>({...person,status:guestDisplayStatus(person)})).filter(person=>{
    const answered=['going','maybe','not-going'].includes(person.status);
    return (!event.guestListNextCursor || answered || guestFilter!=='all') &&
      (guestFilter==='all'||person.status===guestFilter) && person.name.toLowerCase().includes(guestQuery.toLowerCase());
  });
}
function guestRows(event) {
  if (!event) return empty('Sign in to view guests', 'Reconnect your Doorlist account.', 'people');
  const profile = eventStore.getProfile();
  if (event.source === 'doorlist' && !event.guestsLoaded) return empty('Loading guests', 'Checking the guest list available to your account.', 'people');
  if (event.guestListRestricted && event.guestListSource!=='profile-cache') return empty('Guest list unavailable', 'Doorlist has not granted access to this guest list.', 'people');
  const filtered=guestCandidates(event);
  const more=filtered.length>guestVisibleCount || event.guestListNextCursor;
  return (filtered.length?`<ul class="guest-list">${filtered.slice(0,guestVisibleCount).map(guest=>`<li class="guest-row" data-guest-id="${esc(guest.id)}" ${guest.isSelf?'data-self="true"':''}>${avatar(guest)}<span class="guest-name">${esc(guest.name)}${guest.isSelf?'':`<span class="guest-heart" aria-hidden="true">${icon('heart')}</span>`}</span><span class="guest-status guest-status-${guest.status}" aria-label="${statusLabel(guest.status)}">${guest.status==='going'?icon('thumb'):guest.status==='maybe'?'?':guest.status==='not-going'?'−':'·'}</span></li>`).join('')}</ul>`:empty('No guests found','Try a different name or filter.')) + (more?`<div id="guestListSentinel" data-event-id="${esc(event.id)}" class="guest-list-sentinel" role="status">${guestBatchError?`<span>${esc(guestBatchError)}</span><button data-action="guest-retry">Try again</button>`:'<span class="guest-loading-dot" aria-hidden="true"></span><span class="sr-only">Loading more guests</span>'}</div>`:'');
}
function bindGuestScroll() {
  guestObserver?.disconnect();
  const sentinel=document.getElementById('guestListSentinel');
  if(!sentinel || guestBatchError)return;
  guestObserver=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting))loadNextGuestBatch(sentinel.dataset.eventId);
  },{rootMargin:'0px 0px 450px 0px'});
  guestObserver.observe(sentinel);
}
function repaintGuests(event) {
  const anchor=Array.from(document.querySelectorAll('.guest-row')).find(row=>row.getBoundingClientRect().bottom>140);
  const id=anchor?.dataset.guestId, top=anchor?.getBoundingClientRect().top;
  patchSurface(document.getElementById('guestResults'),guestRows(event));
  if(id){const next=Array.from(document.querySelectorAll('.guest-row')).find(row=>row.dataset.guestId===id);if(next)pageNavigation.scroller.scrollBy(0,next.getBoundingClientRect().top-top);}
  bindGuestScroll();
}
async function loadNextGuestBatch(id) {
  if(guestBatchLoading || location.hash!==`#/event/${id}/guests`)return;
  guestBatchLoading=true;
  try {
    let event=eventStore.getEvent(id);
    const visible=guestCandidates(event);
    if(guestVisibleCount>=visible.length && event.guestListNextCursor){await eventStore.loadGuests(id,{append:true});event=eventStore.getEvent(id);}
    guestVisibleCount+=GUEST_BATCH_SIZE;
    if(location.hash===`#/event/${id}/guests`)repaintGuests(event);
  }catch(error){guestBatchError=error.message;if(location.hash===`#/event/${id}/guests`)repaintGuests(eventStore.getEvent(id));}
  finally{guestBatchLoading=false;if(location.hash.endsWith('/guests'))bindGuestScroll();}
}
function eventListPage(search = false) {
  return `<div class="event-list-view">${topbar('/',search ? 'Search' : 'Your events')}<h1>${search ? 'Find your next plan' : 'Your events'}</h1><label class="search-field">${icon('search')}<input id="eventSearch" type="search" placeholder="Search Events" aria-label="Search events" autocomplete="off"></label><div id="eventResults" class="all-events">${eventStore.listEvents().map(event=>eventRow(event)).join('')}</div>${nav()}</div>`;
}
function profilePage() {
  const profile = eventStore.getProfile();
  return `<div class="profile-view">${topbar('/','Your profile')}<img class="profile-main-photo" src="${esc(profile.photo)}" alt="Your profile photo"><h1>${esc(profile.name)}</h1><p class="muted">Your social calendar, all in one place.</p><div class="profile-stats"><div><strong>${eventStore.listEvents().length}</strong><span>Events</span></div><div><strong>${eventStore.listEvents().filter(event=>event.rsvp==='going').length}</strong><span>Going</span></div></div><a class="settings-link" href="#/events">${icon('calendar')}Your events${icon('next')}</a><button class="settings-link" data-action="settings">${icon('user')}Edit profile & invite${icon('next')}</button><button class="settings-link" data-action="connect">${icon('people')}${eventStore.authenticated ? 'Doorlist connection' : 'Connect Doorlist'}${icon('next')}</button>${nav('user')}</div>`;
}
const savedScroll = new Map();
let pendingDataRender=false;
function renderDataUpdate(){
  if(pageNavigation.moving||document.documentElement.dataset.pageMoving||dialog.open){pendingDataRender=true;return;}
  pendingDataRender=false;render({background:true});
}
dialog.addEventListener('close',()=>{if(pendingDataRender)renderDataUpdate();});

function transitionKind(from,to) {
  if (to.endsWith('/invite')) return 'present';
  if (from.endsWith('/invite')) return 'dismiss';
  if (!from.startsWith('/event/') && !to.startsWith('/event/')) {const order=['/','/events','/search','/activity','/profile'];return order.indexOf(to)<order.indexOf(from)?'back':'forward';}
  return to.split('/').filter(Boolean).length < from.split('/').filter(Boolean).length ? 'back' : 'forward';
}
function backTarget() {
  if(!currentRoute||currentRoute==='/'||currentRoute.endsWith('/invite'))return null;
  const parts=currentRoute.split('/').filter(Boolean);
  return parts[0]==='event'&&parts.length>2?`/event/${parts[1]}`:'/';
}
function goBack(target=backTarget()) {
  if(!target)return;
  if(historyIndex>0&&historyRoutes.get(historyIndex-1)===target)history.back();
  else location.hash=target;
}
function scheduleBackPage() {
  if(warmBackTask)return;
  warmBackTask=setTimeout(()=>{
    warmBackTask=0;if(pageNavigation.moving||eventStore.status==='loading')return;
    const target=backTarget();if(!target||pageNavigation.has(target))return;
    const event=target.startsWith('/event/')?eventStore.getEvent(target.split('/')[2]):null;
    if(target!=='/'&&!event)return;
    pageNavigation.prime(target,target==='/'?home():eventPage(event),{revision:screenRevision,guestFilter:'all',guestQuery:'',guestVisibleCount:GUEST_BATCH_SIZE,guestBatchError:''});
    pageNavigation.syncVisibility();
  },120);
}
document.addEventListener('click',event=>{
  const back=event.target.closest('a[aria-label="Back"]');
  if(!back||event.defaultPrevented)return;
  event.preventDefault();goBack(back.hash.slice(1));
});
window.addEventListener('invite:close',()=>goBack(`/event/${location.hash.split('/')[2]}`));
function navigate() {
  const target=location.hash.slice(1)||'/';
  if(target===currentRoute)return;
  savedScroll.set(currentRoute,pageNavigation.scroller.scrollTop);
  const kind=transitionKind(currentRoute,target);
  document.documentElement.dataset.navigation=kind;
  const state=history.state?.doorlistRoute;
  if(state?.route===target)historyIndex=state.index;
  else {historyIndex++;historyRoutes.set(historyIndex,target);history.replaceState({...history.state,doorlistRoute:{index:historyIndex,route:target}},'');}
  pageNavigation.slide(kind,()=>render(),{from:currentRoute,to:target});
}
// Keep images, video decoders and focused controls alive during background updates.
function patchSurface(parent,html) {
  const template=document.createElement('template');template.innerHTML=html;
  const key=node=>node.nodeType===1?(node.id||node.getAttribute('data-guest-id')||node.getAttribute('href')||`${node.tagName}:${node.getAttribute('class')||''}`):'';
  function patch(oldNode,newNode) {
    if(oldNode.nodeType!==newNode.nodeType||oldNode.nodeName!==newNode.nodeName){oldNode.replaceWith(newNode.cloneNode(true));return;}
    if(oldNode.nodeType!==1){if(oldNode.nodeValue!==newNode.nodeValue)oldNode.nodeValue=newNode.nodeValue;return;}
    if(oldNode.matches('video,.confetti-field'))return;
    for(const attr of [...oldNode.attributes])if(!newNode.hasAttribute(attr.name)&&!attr.name.startsWith('data-fallback'))oldNode.removeAttribute(attr.name);
    for(const attr of [...newNode.attributes])if(oldNode.getAttribute(attr.name)!==attr.value&&!(oldNode===document.activeElement&&attr.name==='value'))oldNode.setAttribute(attr.name,attr.value);
    reconcile(oldNode,newNode);
  }
  function reconcile(target,source) {
    const oldChildren=[...target.childNodes],used=new Set();
    for(const [index,newChild] of [...source.childNodes].entries()) {
      const identity=key(newChild);
      const candidate=oldChildren.find(node=>!used.has(node)&&node.nodeName===newChild.nodeName&&key(node)===identity);
      if(candidate){used.add(candidate);if(target.childNodes[index]!==candidate)target.insertBefore(candidate,target.childNodes[index]||null);patch(candidate,newChild);}
      else target.insertBefore(newChild.cloneNode(true),target.childNodes[index]||null);
    }
    for(const child of oldChildren)if(!used.has(child)&&child.parentNode===target)child.remove();
  }
  reconcile(parent,template.content);
}
function render({background=false}={}) {
  const previousY=pageNavigation.scroller.scrollTop;
  const rails=background?[...document.querySelectorAll('.coming-up-rail,.friends-rail,.gathering-rail')].map(node=>[node.className,node.scrollLeft]):[];
  let route;
  try { route = decodeURIComponent(location.hash.slice(1) || '/'); } catch { route = '/'; }
  const parts = route.split('/').filter(Boolean);
  const event = parts[0]==='event' ? eventStore.getEvent(parts[1]) : null;
  const qr = Boolean(event && parts[2]==='invite');
  guestObserver?.disconnect();
  if(!background)document.querySelectorAll('.confetti-video,.template-video').forEach(video=>video.pause());
  if(!background)dialog.close();
  app.hidden = qr;
  invite.hidden = !qr;
  pageNavigation.syncVisibility();
  document.body.dataset.page = qr ? 'invite' : parts[0] || 'home';
  if (qr) {
    if(!background)window.InviteView.show(event,eventStore.getProfile(), { live: event.source === 'doorlist' });
    document.title = `${event.title} — Your invite`;
  } else {
    window.InviteView.hide();
    const restored=!background?pageNavigation.restore(route):null;
    if(restored?.meta){({guestFilter,guestQuery,guestVisibleCount,guestBatchError}=restored.meta);if(restored.meta.revision!==screenRevision)pendingDataRender=true;}
    let markup;
    if(restored){}
    else if (parts[0]==='event' && !event && eventStore.status === 'loading') markup = `${topbar('/')}<div class="not-found">${empty('Loading events','Connecting to your Doorlist account.','calendar')}</div>`;
    else if (parts[0]==='event' && !event) markup = `${topbar('/')}<div class="not-found">${empty('Event unavailable','This event could not be found.','calendar')}<a class="primary-button" href="#/">Back to home</a></div>`;
    else if (event) markup = parts[2]==='guests' ? guestListPage(event) : eventPage(event);
    else if (parts[0]==='events' || parts[0]==='search') markup = eventListPage(parts[0]==='search');
    else if (parts[0]==='activity') markup = `<div class="activity-view">${topbar('/','Activity')}${empty('All caught up','Your invites, event updates, and +1 requests will show up here.','bell')}${nav('bell')}</div>`;
    else if (parts[0]==='profile') markup = profilePage();
    else markup = home();
    if(!restored){if(background)patchSurface(app,markup);else app.innerHTML=markup;}
    document.title = event ? `${event.title} — Doorlist` : 'Doorlist';
  }
  if (currentRoute !== route) {
    if(!pageNavigation.scroller.scrollTop)pageNavigation.scroller.scrollTo(0,['back','dismiss'].includes(document.documentElement.dataset.navigation) ? savedScroll.get(route)||0 : 0);
    if (!qr && app.querySelector('h1')) { app.querySelector('h1').tabIndex=-1; app.querySelector('h1').focus({preventScroll:true}); }
  }
  currentRoute = route;
  if(background){pageNavigation.scroller.scrollTo(0,previousY);for(const [className,left] of rails){const rail=document.getElementsByClassName(className)[0];if(rail)rail.scrollLeft=left;}}
  queueMicrotask(bindTemplateMotion);
  if(parts[2]==='guests')queueMicrotask(bindGuestScroll);
  if(!qr&&parts.length===0&&activeHeroId){const rail=document.querySelector('.coming-up-rail');const card=rail?.querySelector(`a[href="#/event/${activeHeroId}"]`);if(card)rail.scrollLeft=card.offsetLeft-rail.offsetLeft;}
  if (event?.source === 'doorlist' && !qr) hydrateEventRoute(event, parts[2] === 'guests');
  pageNavigation.syncVisibility();scheduleBackPage();
}
function dismissDialog() {
  if(!dialog.open)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
  dialog.animate([{transform:'translateY(0)'},{transform:'translateY(100%)'}],{duration:240,easing:'cubic-bezier(.4,0,1,1)'}).finished.then(()=>dialog.close()).catch(()=>dialog.close());
}
function sheet(title, content) {
  dialog.innerHTML = `<div class="dialog-handle"></div><header><h2 id="actionTitle">${esc(title)}</h2><button class="dialog-close" data-action="close-dialog" aria-label="Close">${icon('close')}</button></header>${content}`;
  dialog.showModal();
}
function rsvpSheet(id) {
  const event = eventStore.getEvent(id);
  if (event.source === 'doorlist') return sheet('RSVP in Doorlist', `<p class="dialog-description">${esc(event.title)}</p><p class="dialog-note">Open the official event to RSVP, request access, or purchase a ticket. Opening a generated QR preview does not RSVP or grant entry.</p><a class="primary-button" href="${esc(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Doorlist</a>`);
  sheet('Will you be there?', `<p class="dialog-description">${esc(event.title)}</p><div class="rsvp-options">${[['going','👍','Going'],['maybe','🤔','Maybe'],['not-going','👎','Not going']].map(([status,emoji,label])=>`<button data-action="set-rsvp" data-id="${id}" data-status="${status}" aria-pressed="${event.rsvp===status}"><span>${emoji}</span>${label}${event.rsvp===status ? icon('check') : ''}</button>`).join('')}</div><p class="dialog-note">This preview saves your choice on this device.</p>`);
}
function plusOneSheet(id) {
  const event = eventStore.getEvent(id);
  if (!event) return;
  if (event.source === 'doorlist') return sheet('Bring a +1', `<p class="dialog-description">Manage your +1 request with the event’s hosts in Doorlist.</p><a class="primary-button" href="${esc(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Doorlist</a>`);
  sheet(event.plusOneRequested ? 'Request saved' : 'Bring a +1', `<div class="dialog-illustration">${icon('people')}</div><p class="dialog-description">${event.plusOneRequested ? 'Your +1 request is saved in this preview.' : 'Request an extra invite for '+esc(event.title)+'.'}</p><p class="dialog-note">Hosts will receive requests once your account is connected.</p><button class="primary-button" data-action="${event.plusOneRequested ? 'close-dialog' : 'request-plus-one'}" data-id="${id}">${event.plusOneRequested ? 'Done' : 'Save +1 request'}</button>`);
}
document.addEventListener('click', async event => {
  const hero=event.target.closest('.coming-up-rail .event-card');if(hero)activeHeroId=hero.getAttribute('href').split('/').at(-1);
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const {action,id} = button.dataset;
  if (action==='close-dialog') dismissDialog();
  if (action==='connect') connectionSheet();
  if (action==='refresh-events') { await refreshEvents(); return; }
  if (action==='disconnect') { try { await eventStore.disconnect(); location.hash = '/'; render(); } catch (error) { notify(error.message); } return; }
  if (action==='sample-ui') { eventStore.usePreview(); location.hash='/'; render(); return; }
  if (action==='preview') sheet('Your Doorlist preview','<p class="dialog-description">Explore your events, see who’s going, and open your invite.</p><p class="dialog-note">Events and guests are samples. RSVPs and +1 requests are saved only on this device. The animated QR is a visual preview and cannot be used for admission.</p><button class="primary-button" data-action="close-dialog">Got it</button>');
  if (action==='create' || action==='event-template') {
    const template=gatheringTemplates.find(item=>item.id===button.dataset.template);
    sheet(template?.title || 'Get people together!',`<p class="dialog-description">${template ? esc(template.description) : 'Make a plan and bring your people.'}</p><a class="primary-button" href="https://doorlist.app/create" target="_blank" rel="noopener noreferrer">Create an event ${icon('next')}</a>`);
  }
  if (action==='add-friends' || action==='friend-profile') {
    const person=eventStore.getSuggestedFriends().find(item=>item.id===id);
    sheet(person?.name || 'Add friends',`<p class="dialog-description">Find your people and manage friend requests in Doorlist.</p><a class="primary-button" href="https://doorlist.app" target="_blank" rel="noopener noreferrer">Open Doorlist ${icon('next')}</a>`);
  }
  if (action==='rsvp') rsvpSheet(id);
  if (action==='set-rsvp') { eventStore.setRsvp(id,button.dataset.status); render(); notify(`RSVP saved: ${statusLabel(button.dataset.status)}`); }
  if(action==='playlist-add')sheet('Shared Playlist',`<p class="dialog-description">Add songs with the other guests in Doorlist.</p><a class="primary-button" href="${esc(eventStore.getEvent(id).sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Doorlist</a>`);
  if(action==='guest-retry'){guestBatchError='';loadNextGuestBatch(location.hash.split('/')[2]);}
  if (action==='guest-filter') {
    guestFilter = button.dataset.filter;
    guestVisibleCount = GUEST_BATCH_SIZE;
    document.querySelectorAll('[data-action="guest-filter"]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    const event = eventStore.getEvent(location.hash.split('/')[2]);
    patchSurface(document.getElementById('guestResults'),guestRows(event));bindGuestScroll();
  }
  if (action==='settings') { if (eventStore.mode !== 'preview') connectionSheet(); else { window.InviteView.show(eventStore.listEvents()[0],eventStore.getProfile()); window.InviteView.settings(); } }
  if (action==='event-menu') sheet('Event options',`<a class="dialog-link" href="#/event/${id}/guests">${icon('people')}Guest list${icon('next')}</a><a class="dialog-link" href="#/event/${id}/invite">${icon('qr')}Your invite${icon('next')}</a><button class="dialog-link" data-action="rsvp" data-id="${id}">${icon('calendar')}Change RSVP${icon('next')}</button>`);
  if (action==='share') sheet('Share event',`<p class="dialog-description">${esc(eventStore.getEvent(id).title)}</p><p class="dialog-note">${eventStore.mode === 'live' ? 'Copy the official Doorlist event link.' : 'Copy a link to this preview on your device.'}</p><button class="primary-button" data-action="copy-link" data-id="${id}">${icon('share')}${eventStore.mode === 'live' ? 'Copy event link' : 'Copy preview link'}</button>`);
  if (action==='copy-link') { try { await navigator.clipboard.writeText(eventStore.getEvent(id).sourceUrl || `${location.href.split('#')[0]}#/event/${id}`); dialog.close(); notify('Event link copied'); } catch { notify('Link could not be copied. Use your browser’s address bar.'); } }
  if (action==='request-plus-one') { eventStore.requestPlusOne(id); dialog.close(); notify('+1 request saved in preview'); }
});
document.addEventListener('input', event => {
  if (event.target.id==='guestSearch') {
    guestQuery = event.target.value;
    guestVisibleCount = GUEST_BATCH_SIZE;
    guestBatchError='';patchSurface(document.getElementById('guestResults'),guestRows(eventStore.getEvent(location.hash.split('/')[2])));bindGuestScroll();
  }
  if (event.target.id==='eventSearch') {
    const query = event.target.value.toLowerCase();
    const events = eventStore.listEvents().filter(item=>`${item.title} ${item.host}`.toLowerCase().includes(query));
    document.getElementById('eventResults').innerHTML = events.length ? events.map(event=>eventRow(event)).join('') : empty('No events found','Try another event or host name.');
  }
});
dialog.addEventListener('click', event=>{ if (event.target===dialog) dismissDialog(); });
dialog.addEventListener('cancel',event=>{event.preventDefault();dismissDialog();});
window.addEventListener('invite:plus-one', event=>plusOneSheet(event.detail.id));
window.addEventListener('invite:settings', event=>{
  const {id,eventName,eventPhoto,personName,profilePhoto} = event.detail;
  eventStore.updateEvent(id,{title:eventName,image:eventPhoto});
  eventStore.updateProfile({name:personName,photo:profilePhoto});
  if (document.body.dataset.page !== 'invite') render();
  else document.title = `${eventName} — Your invite`;
  notify('Changes saved');
});
window.addEventListener('hashchange',navigate);
render();
eventStore.subscribe(()=>{const id=eventStore.getProfile().id||null;if(id!==cacheAccountId){pageNavigation.clear();cacheAccountId=id;}screenRevision++;renderDataUpdate();});
eventStore.initialize();
let lastAutoRefresh=Date.now();
function backgroundRefresh(){if(eventStore.authenticated&&!document.hidden&&Date.now()-lastAutoRefresh>60000){lastAutoRefresh=Date.now();eventStore.refresh().catch(()=>{});}}
window.addEventListener('online',backgroundRefresh);
document.addEventListener('visibilitychange',backgroundRefresh);
setInterval(backgroundRefresh,60000);

function connectionNote() {
  if (eventStore.mode === 'preview') return 'Sample events · Connect Doorlist for your live events.';
  if (eventStore.mode !== 'live') return 'Connect your Doorlist account to load your events.';
  const count = eventStore.coverage;
  return `${count?.invited || 0} invited · ${count?.discoverable || 0} discoverable${count?.partial ? ' · Some events could not be loaded' : ''}`;
}
function connectionPanel() {
  if (eventStore.status === 'loading' || eventStore.mode !== 'disconnected') return '';
  return `<section class="connection-card"><h2>Your plans, all here.</h2><p>Sign in to see your events.</p>${eventStore.error ? `<p class="auth-error" role="alert">${esc(eventStore.error)}</p>` : ''}<button class="primary-button" data-action="connect">Sign in</button></section>`;
}
function connectionSheet(step = 'phone') {
  if (eventStore.authenticated) return sheet('Connected to Doorlist', `<p class="dialog-description">${esc(eventStore.getProfile().name)}</p><p class="dialog-note">${esc(connectionNote())}. Event access is controlled by Doorlist.</p><button class="primary-button" data-action="refresh-events">Refresh events</button><button class="text-action" data-action="disconnect">Disconnect this app</button>`);
  sheet(step === 'code' ? 'Check your messages' : 'Connect Doorlist', `<p class="dialog-description">${step === 'code' ? `Enter the sign-in code sent to ${esc(phoneHint)}.` : 'Use the phone number on your existing Doorlist account.'}</p><form id="connectionForm" data-step="${step}"><label class="auth-label" for="authInput">${step === 'code' ? 'Sign-in code' : 'Phone number'}</label><input id="authInput" class="auth-input" name="${step === 'code' ? 'code' : 'phone'}" type="${step === 'code' ? 'text' : 'tel'}" inputmode="${step === 'code' ? 'numeric' : 'tel'}" autocomplete="${step === 'code' ? 'one-time-code' : 'tel'}" placeholder="${step === 'code' ? 'Code from text message' : '+1 (555) 123-4567'}" ${step === 'code' ? 'pattern="[0-9]{6,8}" maxlength="8"' : ''} required><p id="authError" class="auth-error" role="alert"></p><button class="primary-button" type="submit">${step === 'code' ? 'Sign in & load events' : 'Send sign-in code'}</button></form><p class="dialog-note">Your phone number and code are sent to Doorlist’s authentication service. Your account stays under Doorlist’s access controls.</p><button class="text-action" data-action="sample-ui">View sample UI</button>`);
}
document.addEventListener('submit', async event => {
  if (event.target.id !== 'connectionForm') return;
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const input = form.querySelector('input');
  button.disabled = true;
  form.querySelector('#authError').textContent = '';
  try {
    if (form.dataset.step === 'phone') {
      const result = await eventStore.sendCode(input.value);
      phoneHint = result.phoneHint;
      connectionSheet('code');
    } else {
      button.textContent = 'Loading events…';
      await eventStore.verifyCode(input.value);
      input.value = '';
      location.hash = '/'; render();
      notify(`${eventStore.listEvents().length} events loaded from Doorlist`);
    }
  } catch (error) {
    if (eventStore.authenticated) { location.hash='/'; render(); notify(error.message); }
    else form.querySelector('#authError').textContent = error.message;
  } finally { if (button.isConnected) { button.disabled = false; button.textContent = form.dataset.step === 'phone' ? 'Send sign-in code' : 'Sign in & load events'; } }
});
async function refreshEvents() {
  dialog.close();
  try { await eventStore.refresh(); notify('Events refreshed'); }
  catch (error) { notify(error.message); }
}
async function hydrateEventRoute(event, guests) {
  const key = `${event.id}:${guests ? 'guests' : 'details'}`;
  if (!eventStore.authenticated || hydrating.has(key) || (guests ? event.guestsLoaded&&!event.guestListStale : event.detailsLoaded&&!event.detailsStale)) return;
  if(document.documentElement.dataset.pageMoving){pendingDataRender=true;return;}
  hydrating.add(key);
  try {
    if(eventStore.refreshing)await eventStore.refresh();
    if(location.hash.slice(1)!==`/event/${event.id}${guests?'/guests':''}`)return;
    if (guests) await eventStore.loadGuests(event.id);
    else await eventStore.loadEvent(event.id);
    const route = `/event/${event.id}${guests ? '/guests' : ''}`;
    if (location.hash.slice(1) !== route) return;
    screenRevision++;
    if (guests) {
      const loaded = eventStore.getEvent(event.id);
      patchSurface(document.getElementById('guestResults'),guestRows(loaded));bindGuestScroll();
      document.querySelector('.guest-list-view>.preview-note').textContent = guestSourceNote(loaded);
    } else renderDataUpdate();
  } catch (error) {
    if (!eventStore.authenticated) { location.hash='/'; render(); notify(error.message); return; }
    if (guests && document.getElementById('guestResults')) document.getElementById('guestResults').innerHTML = empty('Guest list could not load', error.message, 'people');
    else notify(error.message);
  } finally { hydrating.delete(key); }
}
function guestSourceNote(event) {
  if(event.guestListSource==='profile-cache')return '';
  if (event.source !== 'doorlist') return 'Sample guest list';
  return '';
}
