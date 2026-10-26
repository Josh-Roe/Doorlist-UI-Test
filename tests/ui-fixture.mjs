// Local integration fixture. This never contacts Doorlist or sends a text message.
import { createDoorlistServer } from '../server.mjs';
import { ProviderError } from '../doorlist-provider.mjs';
import QRCode from 'qrcode';
const now = Date.now();
const events = ['invited-fixture','discover-fixture','official-fixture'].map((id, index) => ({
  id, title: ['Invited Test Event','Discover Test Event','Official Test Event'][index], host: 'Test Host', image:'', theme:'purple',
  startsAt:new Date(now+3600000).toISOString(), endsAt:new Date(now+7200000).toISOString(), location:'Test Location', description:'Integration fixture',
  access:index===1?'discover':'invited', source:'doorlist', sourceUrl:`https://doorlist.app/e/${id}`, rsvp:'invited',canRsvp:index!==1,
  guests:[],guestsLoaded:false,detailsLoaded:false,
}));
createDoorlistServer({port:4174,providerFactory:()=>({
  profile:null, clear(){this.profile=null;}, async sendCode(){},
  async verifyCode(){this.profile={id:'fixture-user',name:'Fixture User',photo:'profile.png'};return this.profile;},
  async syncEvents(){return {events,profile:this.profile,coverage:{invited:2,discoverable:1,partial:false},syncedAt:new Date().toISOString()};},
  async loadEvent(id){return {...events.find(event=>event.id===id),detailsLoaded:true};},
  async loadGuests(id){return {guests:id==='discover-fixture'?[]:[{id:'guest-one',name:'Fixture Guest',status:'going',color:1}],restricted:id==='discover-fixture',partial:false};},
  qrCalls:0,
  async loadInvite(id){
    if(id!=='official-fixture')return {kind:'generated',eventId:id,reason:'No accessible ticket.'};
    if(this.qrCalls++)throw new ProviderError('Fixture: unavailable on refresh',502);
    return {kind:'official',eventId:id,svg:await QRCode.toString('DOORLIST TEST ONLY',{type:'svg',margin:4}),validForMs:2500,expiresAt:Date.now()+2500,refreshAfterMs:1800};
  },
})}).listen(4174,'127.0.0.1',()=>console.log('UI fixture http://127.0.0.1:4174'));
