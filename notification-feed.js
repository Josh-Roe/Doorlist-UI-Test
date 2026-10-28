// Generated activity is a UI preview, using only this account's cached identities.
// These entries never represent or send a real friend request or notification.
export function createNotificationPreview({profiles=[],events=[],selfId='',seed=1,limit=24}={}) {
  let value=seed>>>0;
  const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  const people=[...new Map(profiles.filter(person=>person.id&&person.id!==selfId&&person.name&&/^https:\/\//.test(person.photo||'')).map(person=>[person.id,person])).values()];
  for(let i=people.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[people[i],people[j]]=[people[j],people[i]];}
  if(!people.length)return [];
  return Array.from({length:Math.min(limit,people.length)},(_,index)=>{
    const person=people[index],event=events.length?events[Math.floor(random()*events.length)]:null;
    const type=index%5===0?'friend-request':event?(index%3===0?'event-invite':'event-rsvp'):'friend-request';
    return {id:`preview-${person.id}-${index}`,person,event,type,minutesAgo:index<6?5+index*24:1440+(index-6)*180,preview:true};
  });
}
