import test from 'node:test';
import assert from 'node:assert/strict';
import { DoorlistProvider, normalizeBackground, normalizeEvent } from '../doorlist-provider.mjs';

const now = Date.parse('2026-10-25T12:00:00Z');
const carnival = 'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/film-screen_1776982281523_kzmhihz3cvn.mp4';
const pike = 'https://media1.giphy.com/media/v1.example/PjxPX98p8ncCOzgKYP/giphy.gif';
const raw = extra => ({eventId:'event-background',name:'Event',time:now+3600000,endTime:now+7200000,...extra});
const fields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
  typeof item === 'boolean' ? {booleanValue:item} : typeof item === 'number' ? {integerValue:String(item)} : {stringValue:item}]));
function provider() {
  const p = new DoorlistProvider({clock:()=>now});
  p.profile = {id:'my-user',name:'Test User',school:'NONE'};
  p.accessToken = 'test-session-only'; p.expiresAt = now+3600000;
  return p;
}

test('native event video themes preserve their media, stock poster and light palette', () => {
  assert.deepEqual(normalizeEvent(raw({themeURL:carnival})).background, {
    url:carnival,kind:'video',poster:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/themeStills/film-screen.jpg',isDark:false,
  });
  assert.equal(normalizeBackground({themeURL:carnival,isThemeDark:true}).isDark,true);
  const explicit = normalizeBackground({themeURL:carnival,themeFirstFrame:'https://images.example/event.jpg',isThemeDark:false});
  assert.equal(explicit.poster,'https://images.example/event.jpg');
  assert.equal(normalizeBackground({themeURL:'https://images.example/clip.webm?token=ok'}).kind,'video');
  const gradient = normalizeBackground({themeURL:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/g-blue_1776821053541_example.mp4'});
  assert.equal(gradient.isDark,false);
  assert.match(gradient.poster,/\/blue\.jpg$/);
  const generic = normalizeBackground({themeURL:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/theme_1776822775731_f96vxc8q535.mp4'});
  assert.equal(generic.isDark,true);
  assert.match(generic.poster,/\/dark-blue-bubbles\.jpg$/);
  const darkChampagne = normalizeBackground({themeURL:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/champagne_1777388681233_65s7whrqtln.mp4'});
  const lightChampagne = normalizeBackground({themeURL:'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/videoThemes/champagne_1777392502288_6but6bb2f7m.mp4'});
  assert.equal(darkChampagne.isDark,true);
  assert.match(darkChampagne.poster,/\/champagne\.jpg$/);
  assert.equal(lightChampagne.isDark,false);
  assert.match(lightChampagne.poster,/\/champagne-preview-1\.jpg$/);
});

test('native GIF themes remain images and use a static Giphy poster', () => {
  assert.deepEqual(normalizeBackground({themeURL:pike,isThemeDark:true}), {
    url:pike,kind:'image',poster:pike.replace('/giphy.gif','/giphy_s.gif'),isDark:true,
  });
  assert.equal(normalizeBackground({themeURL:'https://images.example/backdrop.jpg'}).poster,'');
});

test('missing or unsafe background URLs do not manufacture a theme', () => {
  for (const themeURL of [undefined,'','http://images.example/backdrop.jpg','javascript:alert(1)','data:image/png;base64,anything','https://name:secret@images.example/backdrop.jpg']) {
    assert.equal(normalizeBackground({themeURL}),null);
  }
  assert.equal(normalizeBackground({themeURL:carnival,themeFirstFrame:'javascript:alert(1)'}).poster,
    'https://storage.googleapis.com/doorlist-b6a3f.appspot.com/themeStills/film-screen.jpg');
  assert.equal(normalizeEvent(raw()).background,null);
});

test('sparse priority feeds and later refreshes retain richer event backgrounds', async () => {
  const p = provider();
  const rich = raw({themeURL:pike,themeFirstFrame:'https://images.example/custom-still.jpg',isThemeDark:false});
  let includeRich = true;
  p.api = async path => path.includes('forUser') ? {events:[raw()]}
    : path.includes('home-feed') ? {lightEvents:includeRich?[rich]:[]}
    : {events:[]};
  p.groupEvents = p.campusEvents = async () => ({events:[]});
  p.enrichEventPhotos = async () => {};
  let result = await p.syncEvents();
  assert.deepEqual(result.events[0].background,normalizeBackground(rich));
  includeRich = false;
  result = await p.syncEvents();
  assert.deepEqual(result.events[0].background,normalizeBackground(rich));
});

test('a sparse copy of the same theme retains its supplied poster and palette', () => {
  const cached = normalizeBackground({themeURL:pike,themeFirstFrame:'https://images.example/still.jpg',isThemeDark:false});
  assert.deepEqual(normalizeBackground({themeURL:pike},cached),cached);
  assert.equal(normalizeBackground({themeURL:carnival},cached).isDark,false);
  assert.notEqual(normalizeBackground({themeURL:carnival},cached).poster,cached.poster);
});

test('Firestore enrichment loads a missing background even when address and count exist', async () => {
  const p = provider();
  const event = normalizeEvent(raw({location:'123 College Ave',goingCount:12}),'invited');
  const requests = [];
  p.api = async () => ({guests:[]});
  p.firestore = async path => {
    requests.push(path);
    return {fields:fields({themeURL:carnival})};
  };
  await p.enrichEventPhotos([event]);
  assert.deepEqual(requests,['eventObjects/event-background']);
  assert.deepEqual(event.background,normalizeBackground({themeURL:carnival}));
  assert.equal(event.locationAddress,'123 College Ave');
});

test('event detail refresh preserves a cached background when sparse and replaces it when supplied', async () => {
  const p = provider();
  const cached = normalizeBackground({themeURL:pike,themeFirstFrame:'https://images.example/still.jpg',isThemeDark:false});
  p.allowedEvents.set('event-background',{...normalizeEvent(raw(),'invited'),background:cached});
  p.api = async () => ({});
  let details = {name:'Event'};
  p.firestore = async path => {
    if (path.includes('/guests/')) throw new Error('No guest document');
    return {fields:fields(details)};
  };
  assert.deepEqual((await p.loadEvent('event-background')).background,cached);
  details = {name:'Event',themeURL:pike};
  assert.deepEqual((await p.loadEvent('event-background')).background,cached);
  details = {name:'Event',themeURL:carnival};
  assert.deepEqual((await p.loadEvent('event-background')).background,normalizeBackground(details));
});
