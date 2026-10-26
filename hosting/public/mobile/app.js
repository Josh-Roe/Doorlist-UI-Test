import { eventStore } from './event-store.js';

const app = document.getElementById('appView');
const invite = document.getElementById('inviteView');
const dialog = document.getElementById('actionDialog');
const toast = document.getElementById('toast');
const icons = {
  back: '<path d="m14 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m2 9v-2a6 6 0 0 0-2-4"/>',
  qr: '<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-2zM15 19h2v2h-2z"/>',
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
const statusLabel = status => ({going:'Going',maybe:'Maybe','not-going':'Not going',invited:'Invited'}[status]);
let currentRoute = '';
let guestFilter = 'all';
let guestQuery = '';
let guestVisibleCount = 50;
let toastTimer;
let qrRefreshTimer;
let qrRequestVersion = 0;
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
function avatar(guest, extra = '') {
  return `<span class="guest-avatar color-${guest.color ?? 0} ${extra}" aria-hidden="true">${esc(initials(guest.name))}</span>`;
}
function avatarStack(event) {
  if (event.guestListGenerated) return '';
  return `<span class="avatar-stack" aria-hidden="true">${event.guests.slice(0,4).map(guest=>avatar(guest)).join('')}</span>`;
}
function poster(event) {
  if (event.image && event.image !== 'event.png') return `<img class="uploaded-poster" src="${esc(event.image)}" alt="">`;
  return `<div class="event-art art-${esc(event.theme)}" aria-hidden="true"><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><div class="poster-copy"><small>${esc(event.host)} PRESENTS</small><strong>${esc(event.title)}</strong><span>${esc(dateParts(event).full)} · ${esc(dateParts(event).time)}</span></div><span class="poster-star star-one">✦</span><span class="poster-star star-two">✦</span></div>`;
}
function eventCard(event, featured = false) {
  const date = dateParts(event);
  return `<a class="event-card ${featured ? 'featured-card' : 'small-event-card'}" href="#/event/${event.id}" aria-label="Open ${esc(event.title)}">
    <div class="event-poster">${poster(event)}<span class="date-badge"><strong>${date.day}</strong><span>${date.weekday}</span></span>
    ${featured ? `<div class="hero-caption"><div class="host-line"><span class="host-mark">${esc(initials(event.host))}</span>${esc(event.host)}</div><h3>${esc(event.title)}</h3><p>${date.time} – ${date.endTime} · ${esc(event.location)}</p></div>${avatarStack(event)}` : ''}</div>
    ${!featured ? `<div class="card-caption"><span>${esc(event.host)}</span><h3>${esc(event.title)}</h3><p>${date.full} · ${date.time}${event.source === 'doorlist' ? ` · ${event.access === 'invited' ? 'Invited' : 'Discover'}` : ''}</p></div>` : ''}
  </a>`;
}
function nav(selected = 'home') {
  return `<nav class="bottom-dock" aria-label="Main navigation"><div class="dock-tabs">${[['home','Home','/'],['bell','Activity','/activity'],['user','Profile','/profile']].map(([name,label,path])=>`<a href="#${path}" aria-label="${label}" ${selected === name ? 'aria-current="page"' : ''}>${icon(name)}</a>`).join('')}</div><button class="dock-plus" data-action="create" aria-label="Create event">${icon('plus')}</button></nav>`;
}
function topbar(back, title = '', action = '') {
  return `<header class="screen-topbar"><a href="#${back}" class="glass-button" aria-label="Back">${icon('back')}</a>${title ? `<span class="topbar-title">${esc(title)}</span>` : '<span></span>'}${action}</header>`;
}
function empty(title, message, symbol = 'search') {
  return `<div class="empty-state">${icon(symbol)}<h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
}
function home() {
  const events = eventStore.listEvents();
  const featured = events.find(event=>event.rsvp === 'going') || events.find(event=>event.access === 'invited') || events[0];
  return `<div class="home-view"><header class="home-header"><h1 class="wordmark">doorlist</h1><div class="header-actions">${connectionBadge()}<a href="#/search" class="glass-button" aria-label="Search events">${icon('search')}</a></div></header>
    ${connectionPanel()}<section class="home-section"><h2>Coming up!</h2>${featured ? eventCard(featured,true) : empty('Nothing coming up','Your next invite will show up here.','calendar')}</section>
    <section class="home-section your-events"><a class="section-heading" href="#/events"><h2>Your events</h2>${icon('next')}</a><div class="event-rail">${events.map(event=>eventCard(event)).join('')}<button class="host-card" data-action="create"><span class="host-art">${icon('plus')}</span><strong>Become a Host</strong><span>Host and invite your friends!</span></button></div></section>
    <section class="home-section"><div class="section-heading"><h2>Upcoming</h2><span class="muted">${events.length} events</span></div><div class="week-list">${events.map(event=>eventRow(event)).join('')}</div></section>
    <p class="preview-note">${connectionNote()}</p>${nav()}</div>`;
}
function eventRow(event) {
  return `<a class="event-row" href="#/event/${event.id}"><span class="event-row-art">${poster(event)}</span><span class="event-row-copy"><strong>${esc(event.title)}</strong><span>${esc(dateParts(event).full)} · ${esc(dateParts(event).time)}</span></span>${icon('next')}</a>`;
}
function eventPage(event) {
  const date = dateParts(event);
  const going = event.guests.filter(guest=>guest.status==='going').length + (event.source !== 'doorlist' && event.rsvp==='going' ? 1 : 0);
  return `<div class="event-view theme-${esc(event.theme)}">${topbar('/', '', `<button class="glass-button" data-action="event-menu" data-id="${event.id}" aria-label="Event options">${icon('more')}</button>`)}
    <h1 class="event-title">${esc(event.title)}</h1><div class="detail-poster">${poster(event)}</div>
    <a class="guest-summary glass-panel" href="#/event/${event.id}/guests">${avatarStack(event)}<span><strong>${event.guestListGenerated ? 'Preview Guest List' : 'Guest List'}</strong><small>${event.guestListGenerated ? 'Generated sample people' : event.source === 'doorlist' && !event.guestsLoaded ? 'See who’s going' : `${going} going`}</small></span><span class="see-all">See All ${icon('next')}</span></a>
    <section class="event-info"><div class="info-line"><span class="info-icon">${icon('calendar')}</span><div><span>Date</span><strong>${date.full}</strong><p>${date.time} – ${date.endTime}</p></div></div><div class="info-line"><span class="info-icon">${icon('pin')}</span><div><span>Location</span><strong>${esc(event.location)}</strong></div></div><div class="info-line"><span class="host-mark">${esc(initials(event.host))}</span><div><span>Hosted by</span><strong>${esc(event.host)}</strong></div></div></section>
    <section class="about-event"><h2>About this event</h2><p>${esc(event.description)}</p></section>
    <section class="rsvp-summary"><span class="rsvp-status status-${event.rsvp}">${event.rsvp==='going' ? icon('check') : ''}${event.access === 'discover' ? 'Discover' : statusLabel(event.rsvp)}</span><button data-action="rsvp" data-id="${event.id}">Change RSVP ${icon('next')}</button></section>
    <p class="preview-note">${event.source === 'doorlist' ? (event.access === 'invited' ? 'From your Doorlist account' : 'Discoverable event · Entry may require approval') : 'Preview event · RSVP changes stay on this device.'}</p>
    <nav class="event-dock" aria-label="Event actions"><button data-action="rsvp" data-id="${event.id}"><span class="event-dock-button">🔥</span><span>RSVP</span></button><button class="share-action" data-action="share" data-id="${event.id}"><span class="event-dock-button">${icon('share')}</span><span>Share</span></button><a href="#/event/${event.id}/invite"><span class="event-dock-button">${icon('qr')}</span><span>Tickets</span></a></nav></div>`;
}
function guestListPage(event) {
  guestFilter = 'all'; guestQuery = ''; guestVisibleCount = 50;
  return `<div class="guest-list-view">${topbar(`/event/${event.id}`)}<h1 class="sr-only">${esc(event.title)} guest list</h1><div class="guest-controls"><div class="segmented-control" role="group" aria-label="Filter guests">${[['all','All'],['going','Going'],['maybe','Maybe']].map(([id,label])=>`<button data-action="guest-filter" data-filter="${id}" aria-pressed="${id==='all'}">${label}</button>`).join('')}</div><label class="search-field">${icon('search')}<input id="guestSearch" type="search" placeholder="Search Guests" aria-label="Search guests" autocomplete="off"></label></div><div id="guestResults" class="guest-results" aria-live="polite">${guestRows(event)}</div><p class="preview-note">${guestSourceNote(event)}</p></div>`;
}
function guestRows(event) {
  if (!event) return empty('Sign in to view guests', 'Reconnect your Doorlist account.', 'people');
  const profile = eventStore.getProfile();
  if (event.source === 'doorlist' && !event.guestsLoaded) return empty('Loading guests', 'Checking the guest list available to your account.', 'people');
  if (event.guestListRestricted && !event.guestListGenerated) return empty('Guest list unavailable', 'Doorlist has not granted access to this guest list.', 'people');
  const guests = event.source === 'doorlist' ? event.guests : [{id:'you',name:profile.name,status:event.rsvp,photo:profile.photo}, ...event.guests];
  const filtered = guests.filter(guest=>(guestFilter==='all' || guest.status===guestFilter) && guest.name.toLowerCase().includes(guestQuery.toLowerCase()));
  const notice = event.guestListGenerated ? '<div class="generated-guest-notice" role="note"><strong>Generated guest preview</strong><span>These are sample people. The real guest list is unavailable.</span></div>' : '';
  return notice + (filtered.length ? `<ul class="guest-list">${filtered.slice(0,guestVisibleCount).map(guest=>`<li class="guest-row">${guest.photo ? `<img class="guest-avatar" loading="lazy" src="${esc(guest.photo)}" alt="">` : avatar(guest)}<span class="guest-name">${esc(guest.name)}${guest.id==='you' ? '' : `<span class="guest-heart" aria-hidden="true">${icon('heart')}</span>`}</span><span class="guest-status guest-status-${guest.status}" aria-label="${statusLabel(guest.status)}">${guest.status==='going' ? '👍' : guest.status==='maybe' ? '?' : guest.status==='not-going' ? '−' : '·'}</span></li>`).join('')}</ul>${filtered.length > guestVisibleCount ? `<button class="text-action" data-action="guest-more">Show more guests (${guestVisibleCount} of ${filtered.length})</button>` : ''}` : empty('No guests found','Try a different name or filter.'));
}
function eventListPage(search = false) {
  return `<div class="event-list-view">${topbar('/',search ? 'Search' : 'Your events')}<h1>${search ? 'Find your next plan' : 'Your events'}</h1><label class="search-field">${icon('search')}<input id="eventSearch" type="search" placeholder="Search Events" aria-label="Search events" autocomplete="off"></label><div id="eventResults" class="all-events">${eventStore.listEvents().map(event=>eventRow(event)).join('')}</div>${nav()}</div>`;
}
function profilePage() {
  const profile = eventStore.getProfile();
  return `<div class="profile-view">${topbar('/','Your profile')}<img class="profile-main-photo" src="${esc(profile.photo)}" alt="Your profile photo"><h1>${esc(profile.name)}</h1><p class="muted">Your social calendar, all in one place.</p><div class="profile-stats"><div><strong>${eventStore.listEvents().length}</strong><span>Events</span></div><div><strong>${eventStore.listEvents().filter(event=>event.rsvp==='going').length}</strong><span>Going</span></div></div><a class="settings-link" href="#/events">${icon('calendar')}Your events${icon('next')}</a><button class="settings-link" data-action="settings">${icon('user')}Edit profile & invite${icon('next')}</button><button class="settings-link" data-action="connect">${icon('people')}${eventStore.authenticated ? 'Doorlist connection' : 'Connect Doorlist'}${icon('next')}</button>${nav('user')}</div>`;
}
function render() {
  let route;
  try { route = decodeURIComponent(location.hash.slice(1) || '/'); } catch { route = '/'; }
  clearTimeout(qrRefreshTimer); qrRequestVersion++;
  const parts = route.split('/').filter(Boolean);
  const event = parts[0]==='event' ? eventStore.getEvent(parts[1]) : null;
  const qr = Boolean(event && parts[2]==='invite');
  dialog.close();
  app.hidden = qr;
  invite.hidden = !qr;
  document.body.dataset.page = qr ? 'invite' : parts[0] || 'home';
  if (qr) {
    window.InviteView.show(event,eventStore.getProfile(), { live: event.source === 'doorlist' });
    if (event.source === 'doorlist') refreshInvite(event.id, qrRequestVersion);
    document.title = `${event.title} — Your invite`;
  } else {
    window.InviteView.hide();
    if (parts[0]==='event' && !event && eventStore.status === 'loading') app.innerHTML = `${topbar('/')}<div class="not-found">${empty('Loading events','Connecting to your Doorlist account.','calendar')}</div>`;
    else if (parts[0]==='event' && !event) app.innerHTML = `${topbar('/')}<div class="not-found">${empty('Event unavailable','This event could not be found.','calendar')}<a class="primary-button" href="#/">Back to home</a></div>`;
    else if (event) app.innerHTML = parts[2]==='guests' ? guestListPage(event) : eventPage(event);
    else if (parts[0]==='events' || parts[0]==='search') app.innerHTML = eventListPage(parts[0]==='search');
    else if (parts[0]==='activity') app.innerHTML = `<div class="activity-view">${topbar('/','Activity')}${empty('All caught up','Your invites, event updates, and +1 requests will show up here.','bell')}${nav('bell')}</div>`;
    else if (parts[0]==='profile') app.innerHTML = profilePage();
    else app.innerHTML = home();
    document.title = event ? `${event.title} — Doorlist` : 'Doorlist';
  }
  if (currentRoute !== route) {
    window.scrollTo(0,0);
    if (app.querySelector('h1')) { app.querySelector('h1').tabIndex=-1; app.querySelector('h1').focus({preventScroll:true}); }
  }
  currentRoute = route;
  if (event?.source === 'doorlist' && !qr) hydrateEventRoute(event, parts[2] === 'guests');
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
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const {action,id} = button.dataset;
  if (action==='close-dialog') dialog.close();
  if (action==='connect') connectionSheet();
  if (action==='refresh-events') { await refreshEvents(); return; }
  if (action==='disconnect') { try { await eventStore.disconnect(); location.hash = '/'; render(); } catch (error) { notify(error.message); } return; }
  if (action==='sample-ui') { eventStore.usePreview(); location.hash='/'; render(); return; }
  if (action==='preview') sheet('Your Doorlist preview','<p class="dialog-description">Explore your events, see who’s going, and open your invite.</p><p class="dialog-note">Events and guests are samples. RSVPs and +1 requests are saved only on this device. The animated QR is a visual preview and cannot be used for admission.</p><button class="primary-button" data-action="close-dialog">Got it</button>');
  if (action==='create') sheet('Make a plan','<div class="dialog-illustration">'+icon('calendar')+'</div><p class="dialog-description">Your next great night starts here.</p><p class="dialog-note">Creating and sharing real events will be available once your account is connected.</p><button class="primary-button" data-action="close-dialog">Got it</button>');
  if (action==='rsvp') rsvpSheet(id);
  if (action==='set-rsvp') { eventStore.setRsvp(id,button.dataset.status); render(); notify(`RSVP saved: ${statusLabel(button.dataset.status)}`); }
  if (action==='guest-filter') {
    guestFilter = button.dataset.filter;
    guestVisibleCount = 50;
    document.querySelectorAll('[data-action="guest-filter"]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    const event = eventStore.getEvent(location.hash.split('/')[2]);
    document.getElementById('guestResults').innerHTML = guestRows(event);
  }
  if (action==='guest-more') {
    guestVisibleCount += 50;
    document.getElementById('guestResults').innerHTML = guestRows(eventStore.getEvent(location.hash.split('/')[2]));
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
    guestVisibleCount = 50;
    document.getElementById('guestResults').innerHTML = guestRows(eventStore.getEvent(location.hash.split('/')[2]));
  }
  if (event.target.id==='eventSearch') {
    const query = event.target.value.toLowerCase();
    const events = eventStore.listEvents().filter(item=>`${item.title} ${item.host}`.toLowerCase().includes(query));
    document.getElementById('eventResults').innerHTML = events.length ? events.map(event=>eventRow(event)).join('') : empty('No events found','Try another event or host name.');
  }
});
dialog.addEventListener('click', event=>{ if (event.target===dialog) dialog.close(); });
window.addEventListener('invite:plus-one', event=>plusOneSheet(event.detail.id));
window.addEventListener('invite:settings', event=>{
  const {id,eventName,eventPhoto,personName,profilePhoto} = event.detail;
  eventStore.updateEvent(id,{title:eventName,image:eventPhoto});
  eventStore.updateProfile({name:personName,photo:profilePhoto});
  if (document.body.dataset.page !== 'invite') render();
  else document.title = `${eventName} — Your invite`;
  notify('Changes saved');
});
window.addEventListener('hashchange',render);
window.addEventListener('invite:refresh', () => { const id = location.hash.split('/')[2]; if (eventStore.mode === 'live') refreshInvite(id, ++qrRequestVersion); });
render();
eventStore.initialize().finally(render);

function connectionBadge() {
  return `<button class="preview-badge" data-action="connect">${eventStore.mode === 'live' ? 'Connected' : eventStore.mode === 'preview' ? 'Preview' : 'Connect'}</button>`;
}
function connectionNote() {
  if (eventStore.mode === 'preview') return 'Sample events · Connect Doorlist for your live events.';
  if (eventStore.mode !== 'live') return 'Connect your Doorlist account to load your events.';
  const count = eventStore.coverage;
  return `${count?.invited || 0} invited · ${count?.discoverable || 0} discoverable${count?.partial ? ' · Some events could not be loaded' : ''}`;
}
function connectionPanel() {
  if (eventStore.status === 'loading') return '<section class="connection-card" role="status"><h2>Loading your events…</h2><p>Connecting to Doorlist.</p></section>';
  if (eventStore.mode === 'live') return `<section class="sync-summary"><span>${eventStore.error ? 'Showing your last loaded events.' : eventStore.coverage?.partial ? 'Some events could not be loaded. Try refreshing.' : 'Your Doorlist events are up to date.'}</span><button data-action="refresh-events">Refresh</button>${eventStore.error ? `<p role="alert">${esc(eventStore.error)} Your last loaded events are shown.</p>` : ''}</section>`;
  if (eventStore.mode === 'preview') return '<section class="sync-summary"><span>Sample UI</span><button data-action="connect">Connect Doorlist</button></section>';
  return `<section class="connection-card"><h2>Your plans, all here.</h2><p>Sign in to pull the events available to your Doorlist account.</p>${eventStore.error ? `<p class="auth-error" role="alert">${esc(eventStore.error)}</p>` : ''}<button class="primary-button" data-action="connect">Connect Doorlist</button></section>`;
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
  const promise = eventStore.refresh(); render();
  try { await promise; render(); notify('Events refreshed'); }
  catch (error) { render(); notify(error.message); }
}
async function hydrateEventRoute(event, guests) {
  const key = `${event.id}:${guests ? 'guests' : 'details'}`;
  if (hydrating.has(key) || (guests ? event.guestsLoaded : event.detailsLoaded)) return;
  hydrating.add(key);
  try {
    if (guests) await eventStore.loadGuests(event.id);
    else await eventStore.loadEvent(event.id);
    const route = `/event/${event.id}${guests ? '/guests' : ''}`;
    if (location.hash.slice(1) !== route) return;
    if (guests) {
      const loaded = eventStore.getEvent(event.id);
      document.getElementById('guestResults').innerHTML = guestRows(loaded);
      document.querySelector('.guest-list-view>.preview-note').textContent = guestSourceNote(loaded);
    } else render();
  } catch (error) {
    if (!eventStore.authenticated) { location.hash='/'; render(); notify(error.message); return; }
    if (guests && document.getElementById('guestResults')) document.getElementById('guestResults').innerHTML = empty('Guest list could not load', error.message, 'people');
    else notify(error.message);
  } finally { hydrating.delete(key); }
}
async function refreshInvite(id, version) {
  clearTimeout(qrRefreshTimer);
  window.InviteView.setCredential({ kind: 'loading' });
  try {
    const result = await eventStore.loadInvite(id);
    if (version !== qrRequestVersion || location.hash !== `#/event/${id}/invite`) return;
    window.InviteView.setCredential(result);
    if (result.kind === 'official') qrRefreshTimer = setTimeout(() => refreshInvite(id, version), Math.max(1000, result.refreshAfterMs));
  } catch (error) {
    if (!eventStore.authenticated) { location.hash='/'; render(); notify(error.message); return; }
    if (version === qrRequestVersion) window.InviteView.setCredential({ kind: 'error', reason: error.message });
  }
}

function guestSourceNote(event) {
  if (event.guestListGenerated) return 'Generated preview · Sample people, not confirmed attendees';
  if (event.source !== 'doorlist') return 'Sample guest list';
  return event.guestListPartial ? 'Doorlist returned a partial guest list.' : 'From Doorlist';
}
