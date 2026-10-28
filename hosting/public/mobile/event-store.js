import { deduplicateEvents } from './event-identity.js';
import { eventStore as demoStore } from './demo-store.js';
const CACHE_KEY='doorlist-account-view-v1';
const CACHE_TTL=30*24*60*60*1000;
const blankProfile=()=>({name:'You',photo:'profile.png'});
function browserStorage(){try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}}
export function createEventStore({fetchImpl=(...args)=>fetch(...args),storage=browserStorage(),clock=Date.now}={}) {
  let events=[],suggestedFriends=[],profiles=[],profile=blankProfile();
  let authenticated=false,mode='disconnected',status='loading',error='',coverage=null,syncedAt=null;
  let refreshing=null,epoch=0;
  const listeners=new Set();
  const emit=()=>listeners.forEach(fn=>fn());
  const removeCache=()=>{try{storage?.removeItem(CACHE_KEY);}catch{}};
  const reset=()=>{epoch++;refreshing=null;events=[];suggestedFriends=[];profiles=[];profile=blankProfile();authenticated=false;mode='disconnected';status='ready';error='';coverage=null;syncedAt=null;removeCache();};
  const persist=()=>{
    if(!authenticated||!profile.id)return;
    try{storage?.setItem(CACHE_KEY,JSON.stringify({version:1,accountId:profile.id,savedAt:clock(),events,suggestedFriends,profiles,profile,coverage,syncedAt}));}catch{/* Storage full/disabled must not block the app. */}
  };
  function restore() {
    try {
      const cached=JSON.parse(storage?.getItem(CACHE_KEY)||'null');
      if(!cached||cached.version!==1||!cached.profile?.id||cached.accountId!==cached.profile.id||!Array.isArray(cached.events)||clock()-cached.savedAt>CACHE_TTL||cached.savedAt>clock()){removeCache();return;}
      ({events,suggestedFriends=[],profiles=[],profile,coverage=null,syncedAt=null}=cached);
      mode='cached';status='ready';
    }catch{removeCache();}
  }
  restore();
  async function request(path,body) {
    let response;
    try{response=await fetchImpl(path,{cache:'no-store',credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Doorlist-Client':'mobile-ui'},body:JSON.stringify(body)})});}
    catch{throw new Error('The connection service could not be reached. Try again.');}
    let data;
    try{data=await response.json();}catch{throw new Error('The connection service could not complete the request.');}
    if(!response.ok){
      if(response.status===401&&!path.startsWith('/api/auth/')){reset();emit();}
      const cause=new Error(data.error||'Doorlist could not complete the request.');cause.status=response.status;throw cause;
    }
    return data;
  }
  function applySnapshot(result,{merge=false}={}) {
    if(!result?.profile?.id)return;
    if(profile.id&&profile.id!==result.profile.id)reset();
    const previous=new Map(events.map(event=>[event.id,event]));
    events=(result.events||[]).map(event=>merge?{...previous.get(event.id),...event,
      guests:event.guestsLoaded?event.guests:previous.get(event.id)?.guests||event.guests||[],
      guestsLoaded:event.guestsLoaded||previous.get(event.id)?.guestsLoaded||false,
      guestListStale:Boolean(event.guestsLoaded||previous.get(event.id)?.guestsLoaded),detailsStale:true}:event);
    suggestedFriends=result.suggestedFriends||[];profiles=result.profiles||profiles;profile=result.profile;
    coverage=result.coverage||null;syncedAt=result.syncedAt||null;mode='live';status='ready';persist();
  }
  const store={
    get mode(){return mode;},get authenticated(){return authenticated;},get status(){return status;},get error(){return error;},get coverage(){return coverage;},get syncedAt(){return syncedAt;},get refreshing(){return Boolean(refreshing);},
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    listEvents:()=>structuredClone(deduplicateEvents(mode==='preview'?demoStore.listEvents():events)),
    getEvent:id=>mode==='preview'?demoStore.getEvent(id):structuredClone(events.find(event=>event.id===id)||null),
    getSuggestedFriends:()=>mode==='preview'?demoStore.getGuests('house-night').slice(0,6):structuredClone(suggestedFriends),
    getProfiles:()=>structuredClone(profiles),
    getProfile:()=>mode==='preview'?demoStore.getProfile():{...profile},
    getGuests:id=>store.getEvent(id)?.guests||[],
    previewPeople(event,limit=4){
      if(mode==='preview')return (event.guestPreview?.length?event.guestPreview:event.guests||[]).slice(0,limit);
      const actual=[...(event.guestPreview||[]),...(event.guests||[])].filter(person=>/^https:\/\//.test(person.photo||''));
      const seed=Array.from(event.id).reduce((hash,c)=>(Math.imul(hash,31)+c.charCodeAt(0))>>>0,7);
      const pool=profiles.filter(person=>person.id!==profile.id);
      const rotated=pool.length?[...pool.slice(seed%pool.length),...pool.slice(0,seed%pool.length)]:[];
      return [...new Map([...actual,...rotated].map(person=>[person.id,person])).values()].slice(0,limit);
    },
    async initialize(){
      if(!events.length)status='loading';
      try{
        const session=await request('/api/session');
        if(!session.authenticated){reset();emit();return;}
        if(profile.id&&profile.id!==session.profile.id)reset();
        authenticated=true;profile=session.profile;mode='live';
        if(session.snapshot?.syncedAt)applySnapshot(session.snapshot,{merge:true});
        const update=this.refresh();emit();
        await update;
      }catch(cause){status=events.length?'ready':'error';error=cause.message;emit();}
    },
    async refresh(){
      if(refreshing)return refreshing;
      if(!authenticated)throw new Error('Sign in to connect your events.');
      const generation=epoch;
      if(!events.length)status='loading';error='';
      const pending=(async()=>{
        try{const result=await request('/api/events');if(generation!==epoch)return;applySnapshot(result,{merge:true});emit();return result;}
        catch(cause){if(generation===epoch){status=events.length?'ready':'error';error=cause.message;emit();}throw cause;}
        finally{if(generation===epoch)refreshing=null;}
      })();
      refreshing=pending;return pending;
    },
    sendCode:phone=>request('/api/auth/code',{phone}),
    async verifyCode(code){const session=await request('/api/auth/verify',{code});reset();authenticated=true;mode='live';profile=session.profile;return this.refresh();},
    async disconnect(){await request('/api/auth/disconnect',{});reset();emit();},
    usePreview(){reset();mode='preview';status='ready';},
    async loadEvent(id){
      if(mode!=='live'||!authenticated)return this.getEvent(id);
      const generation=epoch,{event}=await request(`/api/events/${encodeURIComponent(id)}`);
      if(generation!==epoch)return null;
      const index=events.findIndex(item=>item.id===id);
      if(index>=0)events[index]={...events[index],...event,guests:events[index].guests||[],guestsLoaded:events[index].guestsLoaded||false,detailsStale:false};
      persist();return this.getEvent(id);
    },
    async loadGuests(id,{append=false}={}){
      const existing=events.find(item=>item.id===id),cursor=append?existing?.guestListNextCursor:null,generation=epoch;
      if(mode!=='live'||!authenticated)return {guests:existing?.guests||[]};
      if(append&&!cursor)return {guests:existing?.guests||[],generated:false};
      let result;
      try{result=await request(`/api/events/${encodeURIComponent(id)}/guests${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);}
      catch(cause){
        if(cause.status===401||append)throw cause;
        if(existing?.guestsLoaded&&existing.guestListSource==='doorlist')return {guests:existing.guests,source:'doorlist',partial:true,generated:false};
        result={guests:profiles.filter(person=>person.id!==profile.id).slice(0,24).map((person,i)=>({...person,status:'unconfirmed',displayStatus:i%9===8?'maybe':'going',attendanceVerified:false})),restricted:true,partial:false,source:'profile-cache',attendanceVerified:false};
      }
      if(generation!==epoch)return {guests:[]};
      if(append&&result.nextPageToken===cursor)throw new Error('The next page could not be loaded. Try again.');
      if(append&&result.restricted)throw new Error('The remaining guest list is unavailable.');
      const source=result.source||(result.restricted?'profile-cache':'doorlist'),page=result.guests||[];
      const guests=append?[...new Map([...(existing?.guests||[]),...page].map(person=>[person.id,person])).values()]:page;
      // Only a person's own photo can fill a missing real-guest photo.
      profiles=[...new Map([...profiles,...guests.filter(person=>/^https:\/\//.test(person.photo||''))].map(person=>[person.id,{id:person.id,name:person.name,photo:person.photo}])).values()].slice(-500);
      const photos=new Map(profiles.map(person=>[person.id.toLowerCase(),person.photo]));
      guests.forEach(person=>{if(!person.photo)person.photo=photos.get(person.id.toLowerCase())||'';});
      const event=events.find(item=>item.id===id);
      if(event)Object.assign(event,{guests,guestsLoaded:true,guestListStale:false,guestListRestricted:result.restricted,guestListPartial:result.partial,guestListGenerated:source==='profile-cache',guestListSource:source,guestListNextCursor:result.nextPageToken||null});
      persist();return {...result,guests,generated:source==='profile-cache',source};
    },
    loadInvite:id=>request(`/api/events/${encodeURIComponent(id)}/invite`),
    async setRsvp(id,value){
      if(mode==='preview'){const result=demoStore.setRsvp(id,value);emit();return result;}
      const generation=epoch;
      const result=await request(`/api/events/${encodeURIComponent(id)}/rsvp`,{status:value});
      if(generation!==epoch)return;
      const index=events.findIndex(event=>event.id===id);if(index>=0)events[index]={...events[index],...result.event};persist();emit();return result;
    },
    updateEvent(id,value){if(mode==='preview')return demoStore.updateEvent(id,value);},
    updateProfile(value){if(mode==='preview')return demoStore.updateProfile(value);},
    requestPlusOne(id){if(mode==='preview')return demoStore.requestPlusOne(id);},
  };
  return store;
}
export const eventStore=createEventStore();
