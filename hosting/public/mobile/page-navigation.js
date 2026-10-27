export function shouldCompleteSwipe(distance,width,velocity=0) {
  return width>0 && velocity>-.15 && (distance/width>=.34 || (distance>=40 && velocity>.5));
}

// Park actual DOM trees between visits; only two viewport-sized layers ever move.
export function createPageNavigation({app,invite,onActivity=()=>{},onSettled=()=>{},getMeta=()=>({}),getBackTarget=()=>null,onBack=()=>{}}) {
  function frameFor(element,name) {
    const frame=document.createElement('div');frame.className='page-frame';frame.dataset.screen=name;
    element.before(frame);frame.append(element);frame.hidden=element.hidden;return frame;
  }
  const appFrame=frameFor(app,'app'),inviteFrame=frameFor(invite,'invite');
  const pages=new Map();
  let motion=null,gesture=null,suppressClickUntil=0;
  function contentFor(){const content=document.createElement('div');content.className='mobile-app outgoing-scroll';return content;}
  function keep(route,content,scrollTop,meta) {
    if(!route||route.endsWith('/invite'))return;
    pages.delete(route);pages.set(route,{content,scrollTop,meta});
    while(pages.size>10)pages.delete(pages.keys().next().value);
  }
  function syncVisibility(){
    appFrame.hidden=app.hidden;inviteFrame.hidden=invite.hidden;
    appFrame.dataset.canSwipe=String(!app.hidden&&Boolean(getBackTarget()));
  }
  function clearStyle(frame){for(const name of ['transform','will-change','z-index'])frame.style.removeProperty(name);}
  function releaseGesture(notify=true) {
    const g=gesture;if(!g)return;gesture=null;cancelAnimationFrame(g.raf);
    for(const animation of g.animations||[])animation.cancel();
    g.underlay?.remove();clearStyle(appFrame);delete document.documentElement.dataset.pageMoving;
    onActivity();if(notify)onSettled();
  }
  function finish(){motion?.cancel(false);releaseGesture(false);}
  const api={
    get moving(){return Boolean(motion||gesture?.dragging);},
    get scroller(){return app.hidden?inviteFrame:app;},
    syncVisibility,finish,
    has:route=>pages.has(route),
    prime(route,html,meta={}){if(pages.has(route))return;const content=contentFor();content.innerHTML=html;content.querySelectorAll('video').forEach(v=>v.pause());keep(route,content,0,meta);},
    restore(route){const entry=pages.get(route);if(!entry)return null;pages.delete(route);app.replaceChildren(...entry.content.childNodes);app.scrollTop=entry.scrollTop;return entry;},
    clear(){finish();pages.clear();},
    slide(kind,swap,{from='',to=''}={}) {
      const continuing=gesture?.dragging&&gesture.target===to?gesture:null;
      const progress=continuing?continuing.progress:0;
      if(continuing){cancelAnimationFrame(continuing.raf);gesture=null;motion?.cancel(false);}
      else finish();
      const oldInvite=!invite.hidden,oldScroll=app.scrollTop,meta=getMeta();
      let outgoing=null,oldContent=null;
      if(oldInvite)outgoing=inviteFrame;
      else if(app.firstChild) {
        outgoing=document.createElement('div');outgoing.className='page-frame outgoing-page';
        oldContent=contentFor();oldContent.append(...app.childNodes);outgoing.append(oldContent);document.body.append(outgoing);oldContent.scrollTop=oldScroll;
      }
      document.documentElement.dataset.pageMoving='true';onActivity();swap();syncVisibility();
      continuing?.underlay.remove();
      const incoming=app.hidden?inviteFrame:appFrame;
      let firstFrame=0,secondFrame=0,animations=[],complete=false;
      const finishMotion=(notify=true)=>{
        if(complete)return;complete=true;cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);
        for(const animation of animations)animation.cancel();clearStyle(incoming);
        if(outgoing&&outgoing!==inviteFrame){if(oldContent)keep(from,oldContent,oldScroll,meta);outgoing.remove();}
        if(outgoing===inviteFrame){invite.hidden=document.body.dataset.page!=='invite';inviteFrame.inert=false;clearStyle(inviteFrame);}
        syncVisibility();delete document.documentElement.dataset.pageMoving;
        if(motion?.cancel===finishMotion)motion=null;
        onActivity();if(notify)onSettled();
      };
      motion={cancel:finishMotion};
      if(matchMedia('(prefers-reduced-motion: reduce)').matches||!outgoing||incoming===outgoing){finishMotion();return;}
      outgoing.hidden=false;outgoing.inert=true;if(oldInvite)invite.hidden=false;
      const back=kind==='back',present=kind==='present',dismiss=kind==='dismiss';
      const start=present?'translate3d(0,100%,0)':back?`translate3d(${-28*(1-progress)}%,0,0)`:dismiss?'translate3d(0,0,0)':'translate3d(100%,0,0)';
      const oldStart=back?`translate3d(${100*progress}%,0,0)`:'translate3d(0,0,0)';
      const end=dismiss?'translate3d(0,100%,0)':present?'translate3d(0,0,0)':back?'translate3d(100%,0,0)':'translate3d(-28%,0,0)';
      incoming.style.transform=start;outgoing.style.transform=oldStart;
      incoming.style.willChange='transform';outgoing.style.willChange='transform';
      incoming.style.zIndex=back||dismiss?'51':'52';outgoing.style.zIndex=back||dismiss?'52':'51';
      const animate=()=>{
        if(complete)return;
        const timing={duration:Math.max(100,320*(1-progress)),easing:'cubic-bezier(.22,.72,.24,1)',fill:'both'};
        animations=[incoming.animate([{transform:start},{transform:'translate3d(0,0,0)'}],timing),outgoing.animate([{transform:oldStart},{transform:end}],timing)];
        Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>finishMotion());
      };
      if(continuing)animate();
      else firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(animate);});
    },
  };

  function drawGesture(g) {
    if(gesture!==g)return;g.raf=0;
    appFrame.style.transform=`translate3d(${g.progress*g.width}px,0,0)`;
    g.underlay.style.transform=`translate3d(${-0.28*(1-g.progress)*g.width}px,0,0)`;
  }
  function beginGesture(g,event) {
    const entry=pages.get(g.target);if(!entry)return false;
    g.dragging=true;g.underlay=document.createElement('div');g.underlay.className='page-frame swipe-underlay';
    g.underlay.inert=true;g.underlay.append(entry.content);document.body.append(g.underlay);entry.content.scrollTop=entry.scrollTop;
    g.underlay.style.zIndex='51';g.underlay.style.willChange='transform';appFrame.style.zIndex='52';appFrame.style.willChange='transform';
    document.documentElement.dataset.pageMoving='true';onActivity();
    try{appFrame.setPointerCapture(event.pointerId);}catch{}
    return true;
  }
  function endGesture(event,cancelled=false) {
    const g=gesture;if(!g||event.pointerId!==g.id)return;
    if(!g.dragging){gesture=null;return;}
    event.preventDefault();cancelAnimationFrame(g.raf);drawGesture(g);suppressClickUntil=Date.now()+100;
    const velocity=event.timeStamp-g.lastTime<100?g.velocity:0;
    if(!cancelled&&shouldCompleteSwipe(g.progress*g.width,g.width,velocity)) {
      g.committed=true;onBack(g.target);
      // If history cannot move, never leave an interactive layer stuck on screen.
      setTimeout(()=>{if(gesture===g)releaseGesture();},1000);
    } else {
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){releaseGesture();return;}
      const timing={duration:190,easing:'cubic-bezier(.22,.72,.24,1)',fill:'both'};
      g.animations=[appFrame.animate([{transform:appFrame.style.transform},{transform:'translate3d(0,0,0)'}],timing),g.underlay.animate([{transform:g.underlay.style.transform},{transform:'translate3d(-28%,0,0)'}],timing)];
      Promise.all(g.animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(gesture===g)releaseGesture();});
    }
  }
  appFrame.addEventListener('pointerdown',event=>{
    if(motion||gesture||app.hidden||event.button!==0||event.isPrimary===false||document.querySelector('dialog[open]'))return;
    if(event.target.closest('input,textarea,select,[contenteditable="true"],.coming-up-rail,.gathering-rail,.friends-rail,.carousel-viewport'))return;
    const target=getBackTarget();if(!target||!pages.has(target))return;
    gesture={id:event.pointerId,target,x:event.clientX,y:event.clientY,width:appFrame.clientWidth,lastX:event.clientX,lastTime:event.timeStamp,velocity:0,progress:0,dragging:false};
  },{passive:true});
  appFrame.addEventListener('pointermove',event=>{
    const g=gesture;if(!g||g.committed||event.pointerId!==g.id)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.dragging){
      if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*.75||dx< -10){gesture=null;return;}
      if(dx<9||Math.abs(dy)>dx*.65)return;
      if(!beginGesture(g,event)){gesture=null;return;}
    }
    event.preventDefault();
    const elapsed=event.timeStamp-g.lastTime;if(elapsed>0)g.velocity=(event.clientX-g.lastX)/elapsed;
    g.lastX=event.clientX;g.lastTime=event.timeStamp;g.progress=Math.max(0,Math.min(1,dx/g.width));
    if(!g.raf)g.raf=requestAnimationFrame(()=>drawGesture(g));
  },{passive:false});
  appFrame.addEventListener('pointerup',event=>endGesture(event),{passive:false});
  appFrame.addEventListener('pointercancel',event=>endGesture(event,true),{passive:false});
  appFrame.addEventListener('dragstart',event=>{if(gesture)event.preventDefault();});
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  return api;
}
