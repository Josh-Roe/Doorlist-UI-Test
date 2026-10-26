// Screen-sized layers keep page pushes independent of document length and scroll position.
export function createPageNavigation({app,invite,onActivity=()=>{},onSettled=()=>{}}) {
  function frameFor(element,name) {
    const frame=document.createElement('div');frame.className='page-frame';frame.dataset.screen=name;
    element.before(frame);frame.append(element);frame.hidden=element.hidden;return frame;
  }
  const appFrame=frameFor(app,'app'),inviteFrame=frameFor(invite,'invite');
  let motion=null;
  function syncVisibility(){appFrame.hidden=app.hidden;inviteFrame.hidden=invite.hidden;}
  function finish(){motion?.cancel(false);}
  return {
    get moving(){return Boolean(motion);},
    get scroller(){return app.hidden?inviteFrame:app;},
    syncVisibility,finish,
    slide(kind,swap) {
      finish();
      const oldInvite=!invite.hidden;
      let outgoing=null;
      if(oldInvite)outgoing=inviteFrame;
      else if(app.firstChild) {
        outgoing=document.createElement('div');outgoing.className='page-frame outgoing-page';
        const content=document.createElement('div');content.className='mobile-app outgoing-scroll';
        const scroll=app.scrollTop;content.append(...app.childNodes);outgoing.append(content);document.body.append(outgoing);content.scrollTop=scroll;
      }
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.documentElement.dataset.pageMoving='true';
      onActivity();swap();syncVisibility();
      const incoming=app.hidden?inviteFrame:appFrame;
      let firstFrame=0,secondFrame=0,animations=[],complete=false;
      const finishMotion=(notify=true)=>{
        if(complete)return;complete=true;cancelAnimationFrame(firstFrame);cancelAnimationFrame(secondFrame);
        for(const animation of animations)animation.cancel();
        incoming.style.removeProperty('transform');incoming.style.removeProperty('will-change');incoming.style.removeProperty('z-index');
        if(outgoing&&outgoing!==inviteFrame)outgoing.remove();
        if(outgoing===inviteFrame){invite.hidden=document.body.dataset.page!=='invite';inviteFrame.inert=false;inviteFrame.style.removeProperty('transform');inviteFrame.style.removeProperty('will-change');inviteFrame.style.removeProperty('z-index');}
        syncVisibility();delete document.documentElement.dataset.pageMoving;
        if(motion?.cancel===finishMotion)motion=null;
        onActivity();if(notify)onSettled();
      };
      motion={cancel:finishMotion};
      if(reduced||!outgoing||incoming===outgoing){finishMotion();return;}
      outgoing.hidden=false;outgoing.inert=true;
      if(oldInvite)invite.hidden=false;
      const back=kind==='back',present=kind==='present',dismiss=kind==='dismiss';
      const start=present?'translate3d(0,100%,0)':back?'translate3d(-28%,0,0)':dismiss?'translate3d(0,0,0)':'translate3d(100%,0,0)';
      const end=dismiss?'translate3d(0,100%,0)':present?'translate3d(0,0,0)':back?'translate3d(100%,0,0)':'translate3d(-28%,0,0)';
      incoming.style.transform=start;incoming.style.willChange='transform';outgoing.style.willChange='transform';
      incoming.style.zIndex=back||dismiss?'51':'52';outgoing.style.zIndex=back||dismiss?'52':'51';
      // Give the browser a frame to rasterize the clipped layers before moving them.
      firstFrame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{
        if(complete)return;
        const timing={duration:320,easing:'cubic-bezier(.22,.72,.24,1)',fill:'both'};
        animations=[incoming.animate([{transform:start},{transform:'translate3d(0,0,0)'}],timing),outgoing.animate([{transform:'translate3d(0,0,0)'},{transform:end}],timing)];
        Promise.all(animations.map(animation=>animation.finished.catch(()=>{}))).then(finishMotion);
      });});
    },
  };
}
