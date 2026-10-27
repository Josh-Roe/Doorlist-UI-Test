const words=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function street(event) {
  const value=event.locationAddress||event.location||'';
  if(/^(?:location not shared|tba|to be announced)$/i.test(value.trim()))return '';
  const suffixes={avenue:'ave',street:'st',road:'rd',drive:'dr',boulevard:'blvd',lane:'ln',court:'ct',place:'pl',parkway:'pkwy'};
  return words(value.split(',')[0]).replace(/\b(avenue|street|road|drive|boulevard|lane|court|place|parkway)\b/g,name=>suffixes[name]);
}
function posterKey(event) {
  try{const url=new URL(event.image);if(url.protocol!=='https:')return '';return url.origin+url.pathname+(url.searchParams.get('url')||'');}catch{return '';}
}
function sameOccurrence(a,b) {
  const first=street(a),second=street(b);
  if(first&&second)return first===second;
  const image=posterKey(a);return Boolean(image&&image===posterKey(b));
}
function preferred(a,b) {
  const score=e=>(e.hasAdmission?4:0)+(e.access==='invited'?2:0)+(e.canRsvp?1:0);
  if(score(a)!==score(b))return score(a)>score(b)?a:b;
  if((a.goingCount??-1)!==(b.goingCount??-1))return (a.goingCount??-1)>(b.goingCount??-1)?a:b;
  return String(a.id).localeCompare(String(b.id))<=0?a:b;
}
// Cross-posts can have different Doorlist IDs and hosts. Preserve separate dates/venues.
export function deduplicateEvents(events) {
  const groups=[],byNameAndTime=new Map();
  for(const event of events) {
    if(!event.startsAt||!event.title||!Number.isFinite(Date.parse(event.startsAt))){groups.push({members:[event],event});continue;}
    const key=`${words(event.title)}|${Date.parse(event.startsAt)}`;
    const candidates=byNameAndTime.get(key)||[];
    const address=street(event);
    const group=candidates.find(group=>(!address||group.members.every(member=>!street(member)||street(member)===address))&&group.members.some(member=>sameOccurrence(member,event)));
    if(group){group.members.push(event);group.event=preferred(group.event,event);}
    else{const fresh={members:[event],event};groups.push(fresh);candidates.push(fresh);byNameAndTime.set(key,candidates);}
  }
  return groups.map(({event,members})=>members.length>1?{...event,duplicateEventIds:members.filter(member=>member.id!==event.id).map(member=>member.id)}:event);
}
