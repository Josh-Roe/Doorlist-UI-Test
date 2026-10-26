// Local profile artwork for accounts without an accessible photo.
export function avatarFallback(identity = '', name = '') {
  const seed = Array.from(String(identity || name)).reduce((hash, c) => (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0, 7);
  const colors = [['#5966aa','#282a58'],['#a7687e','#493458'],['#598d91','#263e61'],['#917354','#4c385c'],['#7572a6','#333554'],['#648a76','#2c5056']][seed % 6];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect width="80" height="80" rx="40" fill="url(#a)"/><circle cx="40" cy="31" r="14" fill="#e8e8f0" fill-opacity=".85"/><path d="M12 80v-9c0-17 12-26 28-26s28 9 28 26v9" fill="#e8e8f0" fill-opacity=".85"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export function profileImage(person = {}) {
  const photo = person.photo || person.hostPhoto || '';
  return /^https:\/\//.test(photo) || /^(?:data:image\/|profile\.png$)/.test(photo) ? photo : avatarFallback(person.id || person.hostId, person.name || person.host);
}
