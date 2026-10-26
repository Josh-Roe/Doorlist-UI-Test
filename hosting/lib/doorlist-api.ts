import { DoorlistProvider, ProviderError } from './doorlist-provider.mjs';

type Runtime = { DB?: D1Database; SESSION_ENCRYPTION_KEY?: string };
const encoder = new TextEncoder();
const toBase64 = (data: Uint8Array) => btoa(Array.from(data, c => String.fromCharCode(c)).join(''));
const fromBase64 = (data: string) => Uint8Array.from(atob(data), c => c.charCodeAt(0));
async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
async function keyFor(env: Runtime) {
  if (!env.SESSION_ENCRYPTION_KEY || env.SESSION_ENCRYPTION_KEY.length < 32) throw new ProviderError('Account connections are not configured yet.',503);
  const bytes = await crypto.subtle.digest('SHA-256',encoder.encode(env.SESSION_ENCRYPTION_KEY));
  return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptSession(data: unknown, env: Runtime, id: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},await keyFor(env),encoder.encode(JSON.stringify(data)));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}
export async function decryptSession(value: string, env: Runtime, id: string) {
  const [iv,data]=value.split('.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(iv),additionalData:encoder.encode(id)},await keyFor(env),fromBase64(data));
  return JSON.parse(new TextDecoder().decode(plain));
}
function reply(value: unknown,status=200,extra: Record<string,string>={}) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
}
async function readBody(request: Request) {
  const text=await request.text();
  if(text.length>8192)throw new ProviderError('Request too large.',413);
  try{return JSON.parse(text||'{}');}catch{throw new ProviderError('Invalid request.',400);}
}
const cookie = (id: string,secure:boolean) => `doorlist_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`;
async function limit(db:D1Database,env:Runtime,value:string,max:number,cooldown:number) {
  const id=await digest(`${env.SESSION_ENCRYPTION_KEY}:${value}`),now=Date.now(),window=15*60000;
  const row=await db.prepare(`INSERT INTO doorlist_auth_limits (id,started_at,last_at,attempts) VALUES (?,?,?,1)
    ON CONFLICT(id) DO UPDATE SET started_at=CASE WHEN started_at<? THEN ? ELSE started_at END,
      attempts=CASE WHEN started_at<? THEN 1 ELSE attempts+1 END,last_at=?
    WHERE last_at<=? AND (started_at<? OR attempts<?) RETURNING attempts`)
    .bind(id,now,now,now-window,now,now-window,now,now-cooldown,now-window,max).first();
  if(!row) {
    const previous=await db.prepare('SELECT started_at,last_at,attempts FROM doorlist_auth_limits WHERE id=?').bind(id).first<{started_at:number,last_at:number,attempts:number}>();
    const delay=Math.max(1,Math.ceil(Math.max((previous?.last_at||now)+cooldown-now,(previous?.attempts||0)>=max?(previous?.started_at||now)+window-now:0)/1000));
    throw new ProviderError(`Wait ${delay} seconds before requesting another code.`,429);
  }
}
async function getSession(request:Request,env:Runtime) {
  const raw=/(?:^|;\s*)doorlist_session=([a-f0-9-]{36})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
  if(!raw)return null;
  const id=await digest(raw);
  const row=await env.DB!.prepare('SELECT ciphertext,expires_at FROM doorlist_sessions WHERE id=?').bind(id).first<{ciphertext:string,expires_at:number}>();
  if(!row||row.expires_at<Date.now())return null;
  try {
    const data=await decryptSession(row.ciphertext,env,id);
    const provider=new DoorlistProvider();
    Object.assign(provider,data.provider);
    provider.allowedEvents=new Map(data.provider.allowedEvents||[]);
    return {...data,id,raw,provider};
  } catch { return null; }
}
async function saveSession(session:any,env:Runtime) {
  const p=session.provider;
  const data={phone:session.phone,codeTime:session.codeTime,attempts:session.attempts,
    provider:{profile:p.profile,accessToken:p.accessToken,refreshToken:p.refreshToken,expiresAt:p.expiresAt,
      firebaseToken:p.firebaseToken,firebaseExpiry:p.firebaseExpiry,allowedEvents:[...p.allowedEvents]}};
  const cipher=await encryptSession(data,env,session.id);
  await env.DB!.prepare('INSERT INTO doorlist_sessions(id,ciphertext,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET ciphertext=excluded.ciphertext,expires_at=excluded.expires_at')
    .bind(session.id,cipher,Date.now()+12*3600000).run();
}
export async function handleDoorlist(request:Request,env:Runtime) {
  const url=new URL(request.url);
  let session:any=null;
  try {
    if(!env.DB)throw new ProviderError('Account storage is not ready.',503);
    if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
    if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||request.headers.get('X-Doorlist-Client')!=='mobile-ui'||!request.headers.get('Content-Type')?.startsWith('application/json')))return reply({error:'Open this app to make this request.'},403);
    const fetchSite=request.headers.get('Sec-Fetch-Site');
    if(request.method==='GET'&&fetchSite&&!['same-origin','none'].includes(fetchSite))return reply({error:'Cross-site access is not allowed.'},403);
    if(request.method==='GET'&&url.pathname==='/api/health') {
      const doorlistReachable=await new DoorlistProvider().checkConnection();
      return reply({ready:Boolean(env.SESSION_ENCRYPTION_KEY),service:'doorlist-mobile',doorlistReachable});
    }
    session=await getSession(request,env);
    if(request.method==='GET'&&url.pathname==='/api/session')return reply({authenticated:Boolean(session?.provider.profile),profile:session?.provider.profile||null});
    if(request.method==='POST'&&url.pathname==='/api/auth/code') {
      await keyFor(env);
      const body=await readBody(request);
      let phone=String(body.phone||'').replace(/[\s()-]/g,'');
      if(/^\d{10}$/.test(phone))phone=`+1${phone}`;
      if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new ProviderError('Enter your phone number with its country code.',400);
      await limit(env.DB,env,`phone:${phone}`,5,60000);
      await limit(env.DB,env,`ip:${request.headers.get('CF-Connecting-IP')||'unknown'}`,20,1000);
      if(!session){const raw=crypto.randomUUID();session={raw,id:await digest(raw),provider:new DoorlistProvider()};}
      await session.provider.sendCode(phone);
      session.phone=phone;session.codeTime=Date.now();session.attempts=0;
      await saveSession(session,env);
      await env.DB.prepare('DELETE FROM doorlist_sessions WHERE expires_at<?').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM doorlist_auth_limits WHERE last_at<?').bind(Date.now()-15*60000).run();
      return reply({sent:true,phoneHint:`••• ${phone.slice(-4)}`},200,{'Set-Cookie':cookie(session.raw,url.protocol==='https:')});
    }
    if(request.method==='POST'&&url.pathname==='/api/auth/verify') {
      const body=await readBody(request);
      if(!session?.phone||session.codeTime+10*60000<Date.now())throw new ProviderError('Request a new sign-in code.',401);
      if(!/^\d{6,8}$/.test(String(body.code||'')))throw new ProviderError('Enter the code from your text message.',400);
      session.attempts=(session.attempts||0)+1;
      await saveSession(session,env);
      if(session.attempts>6)throw new ProviderError('Request a new sign-in code before trying again.',429);
      const profile=await session.provider.verifyCode(session.phone,String(body.code));
      delete session.phone;
      await saveSession(session,env);
      return reply({authenticated:true,profile},200,{'Set-Cookie':cookie(session.raw,url.protocol==='https:')});
    }
    if(request.method==='POST'&&url.pathname==='/api/auth/disconnect') {
      if(session)await env.DB.prepare('DELETE FROM doorlist_sessions WHERE id=?').bind(session.id).run();
      return reply({disconnected:true},200,{'Set-Cookie':'doorlist_session=; Max-Age=0; HttpOnly; SameSite=Strict; Secure; Path=/'});
    }
    if(!session?.provider.profile)throw new ProviderError('Sign in to connect your Doorlist events.',401);
    const p=session.provider;
    if(request.method==='GET'&&url.pathname==='/api/events') {
      const result=await p.syncEvents();await saveSession(session,env);return reply(result);
    }
    const match=/^\/api\/events\/([\w-]{5,100})(?:\/(guests|invite))?$/.exec(url.pathname);
    if(request.method==='GET'&&match) {
      const result=match[2]==='guests'?await p.loadGuests(match[1]):match[2]==='invite'?await p.loadInvite(match[1]):{event:await p.loadEvent(match[1])};
      await saveSession(session,env);return reply(result);
    }
    return reply({error:'Not found.'},404);
  } catch(error:any) {
    return reply({error:error instanceof ProviderError?error.message:'The app could not complete this request.'},error instanceof ProviderError?error.status:500);
  }
}
