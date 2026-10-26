// Render ordering never changes a guest's actual RSVP in Doorlist.
export function orderedGuests(guests, profile) {
  const userId=String(profile?.id || 'you').toLowerCase();
  const sameAccount=person=>String(person.id).toLowerCase()===userId || person.id==='you';
  const own=guests.find(sameAccount);
  const others=guests.filter(person=>!sameAccount(person));
  const priority={'going':0,'maybe':0,'not-going':0,'invited':1};
  others.sort((a,b)=>(priority[a.status]??1)-(priority[b.status]??1));
  // The pinned self row is the requested UI presentation, not an RSVP write.
  return [{...own,id:profile?.id || 'you',name:profile?.name || own?.name || 'You',photo:profile?.photo || own?.photo,status:'going',isSelf:true},...others];
}
