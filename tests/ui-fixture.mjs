// Local integration fixture. This never contacts Doorlist or sends a text message.
import { createDoorlistServer } from '../server.mjs';
import { ProviderError } from '../doorlist-provider.mjs';
import QRCode from 'qrcode';
const now = Date.now();
const profiles=Array.from({length:24},(_,i)=>({id:`cached-${i}`,name:`Cached Profile Fixture ${i}`,photo:'https://doorlist-mobile-josh-roe.fairrose12.chatgpt.site/mobile/profile.png'}));
const events = ['invited-fixture','discover-fixture','official-fixture'].map((id, index) => ({
  id, title: ['Invited Test Event','Discover Test Event','Official Test Event'][index], host: 'Test Host', image:'', hostPhoto:'https://invalid.example/host.jpg',hostId:'fixture-host',guestPreview:[{id:'preview-one',name:'Test Guest',photo:'https://invalid.example/person.jpg'}], theme:'purple',rsvpAppearance:{background:['#78340c','#173b73','#4e2477'][index],accent:['#f04a24','#1474ff','#b845e4'][index],gradientColors:[['#ff6e48','#ec2925'],['#176fff','#0e50bd'],['#e382e6','#8c38cc']][index],style:['Monkeys','Default','Hearts'][index],commentsEnabled:true},fontFamily:['Serif','BricolageGrotesque','Glitch'][index],
  startsAt:new Date(now+3600000).toISOString(), endsAt:new Date(now+7200000).toISOString(), location:'2647 Durant Avenue',locationAddress:'2647 Durant Avenue, Berkeley, CA',playlist:{url:'https://open.spotify.com/playlist/fixture',songCount:2}, description:'Integration fixture',
  access:index===1?'discover':'invited', source:'doorlist', sourceUrl:`https://doorlist.app/e/${id}`, rsvp:'invited',canRsvp:index!==1,
  guests:[],guestsLoaded:false,detailsLoaded:false,
}));
createDoorlistServer({port:4174,providerFactory:()=>({
  profile:null, clear(){this.profile=null;}, async sendCode(){},
  async verifyCode(){this.profile={id:'fixture-user',name:'Fixture User',photo:'profile.png'};return this.profile;},
  async loadProfile(){this.profile={...this.profile,school:'BERK',friendCount:profiles.length,friends:profiles,groups:[],groupCount:0,eventCount:3,detailsVersion:2,detailsUpdatedAt:Date.now()};return {profile:this.profile,profiles};},
  async setRsvp(id,status,{comment}={}){const event=events.find(event=>event.id===id);event.rsvp=status;return {event,commentSent:Boolean(comment)};},
  listProfiles(){return profiles;},
  async syncEvents(){if(process.env.FIXTURE_SLOW_REFRESH)await new Promise(resolve=>setTimeout(resolve,3000));return {events,profiles,suggestedFriends:[{id:'friend-one',name:'Jordan Lee',photo:'',mutualFriends:20},{id:'friend-two',name:'Alex Morgan',photo:'',mutualEvents:3},{id:'friend-three',name:'Riley Park',photo:'',mutualFriends:12},{id:'friend-four',name:'Taylor Chen',photo:'',mutualFriends:6}],profile:this.profile,coverage:{invited:2,discoverable:1,partial:false},syncedAt:new Date().toISOString()};},
  async loadEvent(id){return {...events.find(event=>event.id===id),detailsLoaded:true};},
  async loadGuests(id,options={}){
    if(id==='discover-fixture')return {guests:profiles.map((p,i)=>({...p,status:'unconfirmed',displayStatus:i%9===8?'maybe':'going',attendanceVerified:false})),restricted:true,partial:false,source:'profile-cache'};
    const page=options.cursor?1:0;
    const guests=Array.from({length:180},(_,i)=>({id:`guest-${page*180+i}`,name:`Fixture Guest ${String(page*180+i).padStart(3,'0')}`,status:i%5===0?'invited':i%4===0?'maybe':'going',photo:'',color:i%6}));
    guests.splice(7,0,{id:'fixture-user',name:'Fixture User',status:'maybe',photo:'profile.png'});
    return {guests,restricted:false,partial:!page,nextPageToken:page?null:'fixture-next-page'};
  },
  qrCalls:0,
  async loadInvite(id){
    if(id!=='official-fixture')return {kind:'generated',eventId:id,reason:'No accessible ticket.'};
    if(this.qrCalls++)throw new ProviderError('Fixture: unavailable on refresh',502);
    return {kind:'official',eventId:id,svg:await QRCode.toString('DOORLIST TEST ONLY',{type:'svg',margin:4}),validForMs:2500,expiresAt:Date.now()+2500,refreshAfterMs:1800};
  },
})}).listen(4174,'127.0.0.1',()=>console.log('UI fixture http://127.0.0.1:4174'));
