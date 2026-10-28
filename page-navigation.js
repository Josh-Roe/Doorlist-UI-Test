export function shouldCompleteSwipe(distance,width,velocity=0) {
  return width>0 && velocity>-.15 && (distance/width>=.34 || (distance>=40 && velocity>.5));
}
export function visibleViewport(view) {
  const vv=view.visualViewport,scale=vv?.scale||1;
  if(Math.abs(scale-1)>.02)return null;
  const standalone=Boolean(view.navigator?.standalone||view.matchMedia?.('(display-mode: standalone)').matches);
  const iphone=/iPhone/.test(view.navigator?.userAgent||'');
  const width=view.innerWidth,height=vv?.height||view.innerHeight;
  const screenWidth=Math.min(view.screen?.width||width,view.screen?.height||height);
  const screenHeight=Math.max(view.screen?.width||width,view.screen?.height||height);
  const portrait=width<view.innerHeight;
  const physicalWidth=portrait?screenWidth:screenHeight,physicalHeight=portrait?screenHeight:screenWidth;
  const editing=Boolean(view.document?.activeElement?.matches?.('input,textarea,[contenteditable="true"]'));
  const keyboard=editing&&height<view.innerHeight-100;
  if(standalone&&iphone&&!keyboard&&Math.abs(width-physicalWidth)<4)return {top:0,height:physicalHeight};
  return {top:Math.max(0,vv?.offsetTop||0),height};
}

// Screens stay mounted. Neither dragging nor completing a swipe reparents their content.
export function createPageNavigation({app,invite,onActivate=()=>{},onActivity=()=>{},onSettled=()=>{},getMeta=()=>({}),getBackTarget=()=>null,onBack=()=>{}}) {
  const pages=new Map(),movingFrames=new Set();
  const stage=document.createElement('div');stage.className='page-stage';app.before(stage);
  let current,preview=null,motion=null,gesture=null,suppressClickUntil=0,viewportFrame=0;
  const chromeFor=()=>{const el=document.createElement('div');el.className='page-chrome';return el;};
  function sceneFor(route,content=null) {
    const frame=document.createElement('div');frame.className='page-frame';frame.dataset.screen='app';
    if(!content){content=document.createElement('main');content.className='mobile-app';}
    stage.append(frame);
    const chrome=chromeFor();frame.append(content,chrome);frame.inert=true;frame.style.visibility='hidden';
    const scene={route,frame,content,chrome,rendered:false,meta:{},scrollTop:0};
    if(route)pages.set(route,scene);
    return scene;
  }
  current=sceneFor(null,app);
  const inviteFrame=document.createElement('div');inviteFrame.className='page-frame';inviteFrame.dataset.screen='invite';
  stage.append(inviteFrame);inviteFrame.append(invite);inviteFrame.style.visibility='hidden';
  const isQR=()=>document.body.dataset.page==='invite';
  const busy=()=>Boolean(motion||gesture?.dragging);
  function viewport() {
    viewportFrame=0;if(busy())return;
    const box=visibleViewport(window);if(!box)return;
    document.documentElement.style.setProperty('--app-visible-top',`${box.top}px`);
    document.documentElement.style.setProperty('--app-visible-height',`${box.height}px`);
  }
  function queueViewport(){if(!viewportFrame)viewportFrame=requestAnimationFrame(viewport);}
  window.addEventListener('resize',queueViewport);window.addEventListener('orientationchange',queueViewport);
  window.visualViewport?.addEventListener('resize',queueViewport);window.visualViewport?.addEventListener('scroll',queueViewport);
  document.addEventListener('focusout',queueViewport);viewport();
  function parkIds(scene,active) {
    if(active){scene.content.id='appView';scene.content.querySelectorAll('[data-scene-id]').forEach(node=>{node.id=node.dataset.sceneId;delete node.dataset.sceneId;});}
    else{scene.content.removeAttribute('id');scene.content.querySelectorAll('[id]').forEach(node=>{node.dataset.sceneId=node.id;node.removeAttribute('id');});}
  }
  function extractChrome(scene) {
    const dock=scene.content.querySelector('.bottom-dock,.event-dock');
    if(dock)scene.chrome.replaceChildren(dock);
    else if(!scene.rendered)scene.chrome.replaceChildren();
  }
  function syncVisibility() {
    const qr=isQR();
    for(const scene of new Set([current,...pages.values()])) {
      const shown=movingFrames.has(scene.frame)||(!qr&&(scene===current||scene===preview));
      scene.frame.hidden=false;scene.frame.style.visibility=shown?'visible':'hidden';
      scene.frame.inert=qr||scene!==current||busy();scene.frame.setAttribute('aria-hidden',String(qr||scene!==current));
      scene.frame.dataset.current=String(!qr&&scene===current);
      scene.frame.dataset.canSwipe=String(!qr&&scene===current&&Boolean(getBackTarget()));
      scene.content.hidden=false;
      if(!busy()){
        scene.frame.style.zIndex=scene===current?'2':scene===preview?'1':'0';
        scene.frame.style.transform=scene!==current&&scene===preview?'translate3d(-28%,0,0)':'translate3d(0,0,0)';
        scene.frame.style.willChange=scene===current||scene===preview?'transform':'auto';
      }
    }
    invite.hidden=!(qr||movingFrames.has(inviteFrame));inviteFrame.style.visibility=invite.hidden?'hidden':'visible';
    inviteFrame.inert=!qr||busy();inviteFrame.setAttribute('aria-hidden',String(!qr));
    if(!busy()){inviteFrame.style.transform='translate3d(0,0,0)';inviteFrame.style.zIndex=qr?'2':'0';}
  }
  function activate(scene) {
    if(preview===scene)preview=null;
    if(scene!==current){parkIds(current,false);current=scene;}
    parkIds(current,true);onActivate(current.content);
    if(scene.route){pages.delete(scene.route);pages.set(scene.route,scene);}
  }
  function prune() {
    for(const [route,scene] of pages){if(pages.size<=10)break;if(scene===current||scene===preview||movingFrames.has(scene.frame))continue;scene.content.querySelectorAll('video').forEach(v=>v.pause());scene.frame.remove();pages.delete(route);}
  }
  function settle(notify=true) {
    movingFrames.clear();delete document.documentElement.dataset.pageMoving;syncVisibility();viewport();onActivity();prune();if(notify)onSettled();
  }
  function releaseGesture(notify=true) {
    const g=gesture;if(!g)return;gesture=null;cancelAnimationFrame(g.raf);
    for(const animation of g.animations||[])animation.cancel();settle(notify);
  }
  function finish(){motion?.cancel(false);releaseGesture(false);}
  const api={
    get moving(){return busy();},
    get scroller(){return isQR()?inviteFrame:current.content;},
    syncVisibility,finish,
    has:route=>Boolean(pages.get(route)?.rendered),
    prime(route,html,meta={}) {
      if(pages.get(route)?.rendered)return;
      const scene=pages.get(route)||sceneFor(route);scene.content.innerHTML=html;extractChrome(scene);
      scene.content.querySelectorAll('video').forEach(v=>{v.autoplay=false;v.pause();});
      scene.meta=meta;scene.rendered=true;parkIds(scene,false);syncVisibility();prune();
    },
    prepareBack(route){if(busy())return;preview=pages.get(route)||null;syncVisibility();},
    restore(route){
      if(current.route!==route){
        if(current.rendered)activate(pages.get(route)||sceneFor(route));
        else{if(current.route)pages.delete(current.route);current.route=route;pages.set(route,current);}
      }
      return current.rendered?{meta:current.meta,scrollTop:current.scrollTop}:null;
    },
    didRender(route){if(isQR())return;current.route=route;current.rendered=true;current.meta=getMeta();current.scrollTop=current.content.scrollTop;pages.set(route,current);extractChrome(current);},
    clear(){finish();for(const scene of pages.values())if(scene!==current)scene.frame.remove();pages.clear();preview=null;current.rendered=false;settle(false);},
    slide(kind,swap,{from='',to=''}={}) {
      const continuing=gesture?.dragging&&gesture.target===to?gesture:null;
      const progress=continuing?.progress||0;
      if(continuing){cancelAnimationFrame(continuing.raf);gesture=null;motion?.cancel(false);}else finish();
      const oldScene=current,oldQR=isQR(),outgoing=oldQR?inviteFrame:oldScene.frame;
      oldScene.meta=getMeta();oldScene.scrollTop=oldScene.content.scrollTop;if(from&&!from.endsWith('/invite')){oldScene.route=from;pages.set(from,oldScene);}
      if(!to.endsWith('/invite'))activate(pages.get(to)||sceneFor(to));
      const incoming=to.endsWith('/invite')?inviteFrame:current.frame;
      movingFrames.add(outgoing);movingFrames.add(incoming);document.documentElement.dataset.pageMoving='true';
      onActivity();swap();syncVisibility();
      let firstFrame=0,secondFrame=0,animations=[],complete=false;
      const finishMotion=(notify=true)=>{
        if(complete)return;complete=true;cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);
        for(const animation of animations)animation.cancel();
        if(motion?.cancel===finishMotion)motion=null;
        settle(notify);
      };
      motion={cancel:finishMotion};
      if(kind==='instant'||matchMedia('(prefers-reduced-motion: reduce)').matches||incoming===outgoing){finishMotion();return;}
      const back=kind==='back',present=kind==='present',dismiss=kind==='dismiss';
      const start=present?'translate3d(0,100%,0)':back?`translate3d(${-28*(1-progress)}%,0,0)`:dismiss?'translate3d(0,0,0)':'translate3d(100%,0,0)';
      const oldStart=back?`translate3d(${100*progress}%,0,0)`:'translate3d(0,0,0)';
      const end=dismiss?'translate3d(0,100%,0)':present?'translate3d(0,0,0)':back?'translate3d(100%,0,0)':'translate3d(-28%,0,0)';
      incoming.style.transform=start;outgoing.style.transform=oldStart;incoming.style.willChange='transform';outgoing.style.willChange='transform';
      incoming.style.zIndex=back||dismiss?'51':'52';outgoing.style.zIndex=back||dismiss?'52':'51';
      const animate=()=>{
        if(complete)return;
        const timing={duration:Math.max(100,310*(1-progress)),easing:'cubic-bezier(.22,.72,.24,1)',fill:'both'};
        animations=[incoming.animate([{transform:start},{transform:'translate3d(0,0,0)'}],timing),outgoing.animate([{transform:oldStart},{transform:end}],timing)];
        Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>finishMotion());
      };
      if(continuing)animate();else firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(animate);});
    },
  };
  function drawGesture(g) {
    if(gesture!==g)return;g.raf=0;
    g.scene.frame.style.transform=`translate3d(${g.progress*g.width}px,0,0)`;
    g.parent.frame.style.transform=`translate3d(${-0.28*(1-g.progress)*g.width}px,0,0)`;
  }
  function beginGesture(g,event) {
    const parent=pages.get(g.target);if(!parent?.rendered)return false;
    g.parent=parent;preview=parent;g.dragging=true;
    movingFrames.add(g.scene.frame);movingFrames.add(parent.frame);document.documentElement.dataset.pageMoving='true';
    parent.frame.style.visibility='visible';parent.frame.style.zIndex='51';g.scene.frame.style.zIndex='52';
    parent.frame.style.willChange='transform';g.scene.frame.style.willChange='transform';onActivity();
    try{g.scene.frame.setPointerCapture(event.pointerId);}catch{}return true;
  }
  function endGesture(event,cancelled=false) {
    const g=gesture;if(!g||event.pointerId!==g.id)return;
    if(!g.dragging){gesture=null;return;}
    event.preventDefault();cancelAnimationFrame(g.raf);drawGesture(g);suppressClickUntil=Date.now()+100;
    const velocity=event.timeStamp-g.lastTime<100?g.velocity:0;
    if(!cancelled&&shouldCompleteSwipe(g.progress*g.width,g.width,velocity)){
      g.committed=true;onBack(g.target);setTimeout(()=>{if(gesture===g)releaseGesture();},1000);
    }else{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){releaseGesture();return;}
      const timing={duration:180,easing:'cubic-bezier(.22,.72,.24,1)',fill:'both'};
      g.animations=[g.scene.frame.animate([{transform:g.scene.frame.style.transform},{transform:'translate3d(0,0,0)'}],timing),g.parent.frame.animate([{transform:g.parent.frame.style.transform},{transform:'translate3d(-28%,0,0)'}],timing)];
      Promise.all(g.animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(gesture===g)releaseGesture();});
    }
  }
  document.addEventListener('pointerdown',event=>{
    if(busy()||gesture||isQR()||event.button!==0||event.isPrimary===false||document.querySelector('dialog[open]')||!current.content.contains(event.target))return;
    if(event.target.closest('input,textarea,select,[contenteditable="true"],.coming-up-rail,.gathering-rail,.friends-rail,.carousel-viewport'))return;
    const target=getBackTarget();if(!target||!pages.get(target)?.rendered)return;
    gesture={scene:current,id:event.pointerId,target,x:event.clientX,y:event.clientY,width:current.frame.clientWidth,lastX:event.clientX,lastTime:event.timeStamp,velocity:0,progress:0,dragging:false};
  },{passive:true});
  document.addEventListener('pointermove',event=>{
    const g=gesture;if(!g||g.committed||event.pointerId!==g.id)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.dragging){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*.75||dx< -10){gesture=null;return;}if(dx<9||Math.abs(dy)>dx*.65)return;if(!beginGesture(g,event)){gesture=null;return;}}
    event.preventDefault();const elapsed=event.timeStamp-g.lastTime;if(elapsed>0)g.velocity=(event.clientX-g.lastX)/elapsed;
    g.lastX=event.clientX;g.lastTime=event.timeStamp;g.progress=Math.max(0,Math.min(1,dx/g.width));if(!g.raf)g.raf=requestAnimationFrame(()=>drawGesture(g));
  },{passive:false});
  document.addEventListener('pointerup',event=>endGesture(event),{passive:false});document.addEventListener('pointercancel',event=>endGesture(event,true),{passive:false});
  document.addEventListener('dragstart',event=>{if(gesture)event.preventDefault();});
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  return api;
}
