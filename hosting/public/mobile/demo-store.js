// UI preview data. Replace this repository with an authenticated event provider
// when live RSVP integration is implemented; views depend only on these methods.
const STORAGE_KEY = 'doorlist-preview-v1';
const demoGuests = [
  ['Alex Morgan', 'going'], ['Jordan Lee', 'going'], ['Sam Rivera', 'maybe'],
  ['Taylor Chen', 'going'], ['Casey Davis', 'invited'], ['Riley Park', 'going'],
  ['Jamie Wilson', 'maybe'], ['Morgan Reed', 'invited'], ['Avery Brooks', 'going'],
  ['Cameron Ellis', 'not-going'], ['Drew Bennett', 'going'], ['Quinn Patel', 'invited'],
].map(([name, status], index) => ({ id: `guest-${index}`, name, status, color: index % 6 }));

const initialEvents = [
  {
    id: 'house-night', title: 'Fairs bro fairs', host: 'Phi Kap Miami',
    image: 'event.png', theme: 'purple', startsAt: '2026-10-30T21:00:00-07:00',
    endsAt: '2026-10-31T01:00:00-07:00', location: 'The House',
    description: 'A night with your favorite people. Bring your invite, bring your friends, and we’ll see you there.',
    rsvp: 'going', canRsvp: true, guests: demoGuests, plusOneRequested: false,
  },
  {
    id: 'halloween', title: 'Halloween House Party', host: 'The Social Club',
    image: '', theme: 'orange', startsAt: '2026-10-31T20:00:00-07:00',
    endsAt: '2026-11-01T00:00:00-07:00', location: 'The House',
    description: 'Costumes encouraged. A Halloween night with the whole crew.',
    rsvp: 'invited', canRsvp: true, guests: demoGuests.slice(0, 8), plusOneRequested: false,
  },
  {
    id: 'sunday-social', title: 'Sunday Social', host: 'Campus Friends',
    image: '', theme: 'blue', startsAt: '2026-11-01T16:00:00-08:00',
    endsAt: '2026-11-01T19:00:00-08:00', location: 'The Courtyard',
    description: 'An easy Sunday afternoon. Come hang out and catch up.',
    rsvp: 'invited', canRsvp: true, guests: demoGuests.slice(3), plusOneRequested: false,
  },
];
let saved;
try { if (typeof window !== 'undefined') saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Keep defaults if storage is corrupt. */ }
const data = { profile: { name: 'Josh Roe', photo: 'profile.png' }, overrides: {}, ...saved };
// Preserve existing invite customization when upgrading the original QR-only app.
if (!saved && typeof window !== 'undefined') {
  try {
    const legacy = JSON.parse(localStorage.getItem('invite-app-state-v1') || 'null');
    if (legacy) {
      data.profile = { name: legacy.personName || data.profile.name, photo: legacy.profilePhoto || data.profile.photo };
      data.overrides['house-night'] = { title: legacy.eventName || initialEvents[0].title, image: legacy.eventPhoto || 'event.png' };
    }
  } catch { /* Legacy settings are optional. */ }
}
function persist() {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* The current session still works without storage. */ }
}
function getEvent(id) {
  const event = initialEvents.find(item => item.id === id);
  return event ? structuredClone({ ...event, ...data.overrides[id] }) : null;
}
function updateEvent(id, patch) {
  if (!getEvent(id)) return null;
  data.overrides[id] = { ...data.overrides[id], ...patch };
  persist();
  return getEvent(id);
}
export const eventStore = {
  mode: 'preview',
  listEvents: () => initialEvents.map(event => getEvent(event.id)),
  getEvent,
  getProfile: () => ({ ...data.profile }),
  getGuests: id => getEvent(id)?.guests || [],
  setRsvp(id, status) {
    if (!['going', 'maybe', 'not-going'].includes(status)) return null;
    const event = getEvent(id);
    return event?.canRsvp ? updateEvent(id, { rsvp: status }) : null;
  },
  updateEvent,
  updateProfile(patch) { data.profile = { ...data.profile, ...patch }; persist(); },
  requestPlusOne: id => updateEvent(id, { plusOneRequested: true }),
};
