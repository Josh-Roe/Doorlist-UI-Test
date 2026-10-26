(() => {
  'use strict';

  const STORAGE_KEY = 'invite-app-state-v1';
  let activeEventId = null;
  let activeLiveEvent = false;

  const els = {
    appBar: document.getElementById('appBar'),
    settingsBtn: document.getElementById('settingsBtn'),
    patternBtn: document.getElementById('patternBtn'),
    patternDialog: document.getElementById('patternDialog'),
    basePattern: document.getElementById('basePattern'),
    closeBtn: document.getElementById('closeBtn'),

    eventPhoto: document.getElementById('eventPhoto'),
    eventName: document.getElementById('eventName'),
    personName: document.getElementById('personName'),
    profilePhoto: document.getElementById('profilePhoto'),
    qrImage: document.getElementById('qrImage'),

    sheetOverlay: document.getElementById('sheetOverlay'),
    sheet: document.getElementById('sheet'),
    closeSheetBtn: document.getElementById('closeSheetBtn'),
    saveSheetBtn: document.getElementById('saveSheetBtn'),

    profileUpload: document.getElementById('profileUpload'),
    eventUpload: document.getElementById('eventUpload'),
    profilePreview: document.getElementById('profilePreview'),
    eventPreview: document.getElementById('eventPreview'),
    eventNameInput: document.getElementById('eventNameInput'),
    personNameInput: document.getElementById('personNameInput'),

    carouselTrack: document.getElementById('carouselTrack'),
    carouselViewport: document.getElementById('carouselViewport'),
    dots: Array.from(document.querySelectorAll('.dot')),
  };

  const DEFAULT_AVATAR = 'profile.png';
  const DEFAULT_EVENT_PHOTO = 'event.png';

  let state = {
    eventName: 'Fairs bro fairs',
    personName: 'Josh is da real goat',
    eventPhoto: DEFAULT_EVENT_PHOTO,
    profilePhoto: DEFAULT_AVATAR,
    basePattern: 'small',
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(state, parsed);
      }
    } catch (e) {
      /* ignore corrupted storage */
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage full or unavailable; ignore */
    }
  }

  function applyState() {
    els.eventName.textContent = state.eventName;
    els.personName.textContent = state.personName;
    els.eventPhoto.src = state.eventPhoto;
    els.profilePhoto.src = state.profilePhoto;
    els.profilePhoto.hidden = false;
    els.eventPhoto.classList.toggle('reference-photo', false);
    els.profilePreview.classList.toggle('reference-profile', false);
    els.eventPreview.classList.toggle('reference-event', false);
  }

  let qrAnimation;

  // Decorative invite artwork is used for every event.
  function buildQrPattern() {
    const rows = ["1111111000000100110000111001101111111", "1000001000110101101000010001001000001", "1011101001100010110000011010101011101", "1011101000011110100100000111101011101", "1011101000001011000001110110101011101", "1000001011011100001111100011101000001", "1111111010101010101010101010101111111", "0000000000101100011011011001100000000", "1001011011001011010111111010010100000", "0100010000011101011011011010000001001", "0101001110010000110100000010011001011", "0011010100111001000111101100010110010", "1001001101101110110010000101011101101", "1111010000100100000010000110010101001", "0010011100100110000001011100111110111", "1010100101010100000000011100111000001", "1111101011101100000000000010111000101", "1011100110011000000000111001110111111", "0010101010011101100001000010011010101", "0011000100101010001001001011110010100", "1100101100010010001001010111101101001", "0011110101111111110011000110110000101", "1110001110001100100001100110100110101", "1010110001001100000101101110100000000", "1011001011100010100011011100101100100", "0110000000011101100101101011001001000", "1010011011101110100000011010011101101", "0100110011000111011111100101000101011", "1111001010011001100111111001111110101", "0000000011111001110101001101100010010", "1111111000010010010010001001101010011", "1000001010010000010001011010100010101", "1011101001101101010110000100111110101", "1011101010101000110011111110000110100", "1011101000010010100100100100110011111", "1000001000101001100111100110110000000", "1111111010101101110000001001101000111"];
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 702 704');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.innerHTML = `<rect width="702" height="704" fill="#fff"/>`;
    svg.dataset.corners = 'square';
    svg.dataset.pattern = state.basePattern;
    svg.innerHTML += `<defs><clipPath id="fixed-finders"><rect x="28" y="26" width="130" height="127"/><rect x="552" y="26" width="123" height="127"/><rect x="28" y="551" width="130" height="128"/></clipPath></defs><image href="qr.svg" width="702" height="704" clip-path="url(#fixed-finders)"/>`;
    const connections = document.createElementNS(ns, 'g');
    connections.setAttribute('stroke', '#000');
    connections.setAttribute('stroke-width', '2.5');
    connections.setAttribute('stroke-linecap', 'round');
    svg.appendChild(connections);
    const cells = [];
    const grid = new Map();
    const gridSize = state.basePattern === 'large' ? 29 : 37;
    const spacing = state.basePattern === 'large' ? 22.3 : 17.4;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        // Preserve the finder squares and their quiet margins.
        const cornerPad = state.basePattern === 'large' ? 7 : 8;
        const rightStart = gridSize - cornerPad;
        const bottomStart = gridSize - cornerPad;
        if ((x < cornerPad && y < cornerPad) || (x >= rightStart && y < cornerPad) || (x < cornerPad && y >= bottomStart)) continue;
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('cx', (38 + x * spacing).toFixed(1));
        circle.setAttribute('cy', (37 + y * spacing).toFixed(1));
        circle.setAttribute('r', state.basePattern === 'large' ? '11.2' : '7.8');
        circle.setAttribute('fill', '#000');
        const covered = Math.hypot(38 + x * 17.4 - 356, 37 + y * 17.5 - 352) < 83;
        let active = covered ? (x * 13 + y * 7 + x * y) % 11 < 6 : rows[y][x] === '1';
        if (active && (x * 17 + y * 29 + x * y * 3) % 20 < 3) active = false;
        circle.style.display = active ? '' : 'none';
        const cell = { circle, active, x, y };
        circle.style.transition = 'none';
        cells.push(cell);
        grid.set(`${x},${y}`, cell);
        svg.appendChild(circle);
      }
    }
    function updateConnections() {
      const lines = document.createDocumentFragment();
      if (state.basePattern === 'large') { connections.replaceChildren(); return; }
      for (const cell of cells) {
        if (!cell.active) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const neighbor = grid.get(`${cell.x + dx},${cell.y + dy}`);
          if (!neighbor?.active) continue;
          // Keep both isolated dots and connected clusters like the reference.
          if ((cell.x * 7 + cell.y * 11 + dx * 3) % 5 > 1) continue;
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('x1', cell.circle.getAttribute('cx'));
          line.setAttribute('y1', cell.circle.getAttribute('cy'));
          line.setAttribute('x2', neighbor.circle.getAttribute('cx'));
          line.setAttribute('y2', neighbor.circle.getAttribute('cy'));
          lines.appendChild(line);
        }
      }
      connections.replaceChildren(lines);
    }
    updateConnections();
    els.qrImage.style.backgroundImage = 'none';
    els.qrImage.replaceChildren(svg);
    // Swap occupied and empty grid positions to retain identical dot density.
    window.clearInterval(qrAnimation);
    qrAnimation = window.setInterval(() => {
      if (document.hidden || document.getElementById('inviteView').hidden) return;
      const on = cells.filter(cell => cell.active);
      const off = cells.filter(cell => !cell.active);
      const swaps = Math.min(65, on.length, off.length);
      for (let i = 0; i < swaps; i++) {
        const oldDot = on.splice(Math.floor(Math.random() * on.length), 1)[0];
        const newDot = off.splice(Math.floor(Math.random() * off.length), 1)[0];
        oldDot.active = false;
        newDot.active = true;
        oldDot.circle.style.display = 'none';
        newDot.circle.style.display = '';
      }
      updateConnections();
    }, 1000);
  }
  function buildRequestQrPattern() {
    const el = document.querySelector('.qr-placeholder');
    if (!el) return;
    const source = document.querySelector('#qrImage > svg');
    if (!source) return;
    const pattern = source.cloneNode(true);
    pattern.removeAttribute('id');
    pattern.dataset.corners = 'circle';
    pattern.querySelectorAll('defs, image').forEach(node => node.remove());
    const finders = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    finders.dataset.finders = 'circle';
    [[88, 86], [618, 86], [88, 619]].forEach(([cx, cy]) => {
      [['#000', 68], ['#fff', 48], ['#000', 26]].forEach(([fill, r]) => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        Object.entries({ cx, cy, r, fill }).forEach(([key, value]) => circle.setAttribute(key, value));
        finders.appendChild(circle);
      });
    });
    pattern.appendChild(finders);
    pattern.setAttribute('aria-hidden', 'true');
    pattern.style.cssText = 'position:absolute; inset:0; width:100%; height:100%;';
    el.style.background = 'none';
    el.replaceChildren(pattern, el.querySelector('.request-plus'));
  }
  const moreBtn = document.getElementById('moreBtn');
  const actionsMenu = document.getElementById('actionsMenu');
  function closeMenu() {
    actionsMenu.hidden = true;
    moreBtn.setAttribute('aria-expanded', 'false');
  }
  moreBtn.addEventListener('click', () => {
    actionsMenu.hidden = !actionsMenu.hidden;
    moreBtn.setAttribute('aria-expanded', String(!actionsMenu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.app-bar')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); closeSheet(); }
    if (e.key === 'Tab' && els.sheetOverlay.classList.contains('open')) {
      const controls = Array.from(els.sheet.querySelectorAll('input:not([hidden]), button'));
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Safari browser chrome is controlled by Safari; standalone launch omits it.
  els.closeBtn.addEventListener('click', () => {
    if (activeEventId) window.location.hash = `/event/${activeEventId}`;
    else window.location.hash = '/';
  });

  // ---------- Settings sheet ----------
  let sheetReturnFocus;
  function openSheet() {
    sheetReturnFocus = document.activeElement;
    els.sheetOverlay.inert = false;
    closeMenu();
    els.profilePreview.src = state.profilePhoto;
    els.eventPreview.src = state.eventPhoto;
    els.eventNameInput.value = state.eventName;
    els.personNameInput.value = state.personName;
    els.sheetOverlay.classList.add('open');
    els.eventNameInput.focus();
  }

  function closeSheet() {
    els.sheetOverlay.classList.remove('open');
    els.sheetOverlay.inert = true;
    if (sheetReturnFocus?.isConnected) sheetReturnFocus.focus({ preventScroll: true });
    sheetReturnFocus = null;
  }

  els.settingsBtn.addEventListener('click', openSheet);
  function openPattern() {
    closeMenu();
    els.basePattern.value = state.basePattern;
    els.patternDialog.showModal();
    els.patternDialog.focus();
  }
  els.patternBtn.addEventListener('click', openPattern);
  function refreshPattern() {
    buildQrPattern();
    buildRequestQrPattern();
    saveState();
  }
  els.basePattern.addEventListener('change', () => { state.basePattern = els.basePattern.value; refreshPattern(); });
  els.closeSheetBtn.addEventListener('click', closeSheet);
  els.sheetOverlay.addEventListener('click', (e) => {
    if (e.target === els.sheetOverlay) closeSheet();
  });

  function readFileAsDataUrl(file, onLoad) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result);
    reader.readAsDataURL(file);
  }

  els.profileUpload.addEventListener('change', (e) => {
    readFileAsDataUrl(e.target.files[0], (url) => {
      els.profilePreview.src = url;
    });
  });

  els.eventUpload.addEventListener('change', (e) => {
    readFileAsDataUrl(e.target.files[0], (url) => {
      els.eventPreview.src = url;
    });
  });

  els.saveSheetBtn.addEventListener('click', () => {
    state.eventName = els.eventNameInput.value.trim() || state.eventName;
    state.personName = els.personNameInput.value.trim() || state.personName;
    state.profilePhoto = els.profilePreview.getAttribute('src');
    state.eventPhoto = els.eventPreview.getAttribute('src');
    applyState();
    saveState();
    closeSheet();
    window.dispatchEvent(new CustomEvent('invite:settings', { detail: { id: activeEventId, ...state } }));
  });

  // ---------- Swipeable carousel ----------
  const SLIDE_COUNT = 2;
  let currentSlide = 0; // start on the first (QR) slide
  let startX = 0;
  let startY = 0;
  let currentTranslate = 0;
  let dragging = false;
  let lockedAxis = null;

  function viewportWidth() {
    const slides = els.carouselTrack.querySelectorAll('.slide');
    return slides[1].offsetLeft - slides[0].offsetLeft;
  }

  function setTrackTransform(px, animate) {
    els.carouselTrack.style.transition = animate ? '' : 'none';
    els.carouselTrack.style.transform = `translateX(${px}px)`;
  }

  function goToSlide(index, animate = true) {
    currentSlide = Math.max(0, Math.min(SLIDE_COUNT - 1, index));
    const px = -currentSlide * viewportWidth();
    setTrackTransform(px, animate);
    els.dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
  }

  function onPointerDown(clientX, clientY) {
    lastDx = 0;
    dragging = true;
    lockedAxis = null;
    startX = clientX;
    startY = clientY;
    currentTranslate = -currentSlide * viewportWidth();
    setTrackTransform(currentTranslate, false);
  }

  function onPointerMove(clientX, clientY) {
    if (!dragging) return null;
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (lockedAxis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return null;
      lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (lockedAxis !== 'x') return null;
    setTrackTransform(currentTranslate + dx, false);
    return dx;
  }

  function onPointerUp(dx) {
    if (!dragging) return;
    dragging = false;
    if (lockedAxis === 'x' && dx !== null && dx !== undefined) {
      const threshold = viewportWidth() * 0.18;
      if (dx < -threshold) goToSlide(currentSlide + 1);
      else if (dx > threshold) goToSlide(currentSlide - 1);
      else goToSlide(currentSlide);
    } else {
      goToSlide(currentSlide);
    }
    lockedAxis = null;
  }

  // Touch events
  let lastDx = 0;
  els.carouselViewport.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      onPointerDown(t.clientX, t.clientY);
    },
    { passive: true }
  );

  els.carouselViewport.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      const dx = onPointerMove(t.clientX, t.clientY);
      if (dx !== null) lastDx = dx;
      if (lockedAxis === 'x') e.preventDefault();
    },
    { passive: false }
  );

  els.carouselViewport.addEventListener('touchend', () => onPointerUp(lastDx));
  els.carouselViewport.addEventListener('touchcancel', () => onPointerUp(lastDx));

  // Mouse events (desktop preview support)
  let mouseDown = false;
  els.carouselViewport.addEventListener('mousedown', (e) => {
    mouseDown = true;
    onPointerDown(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    const dx = onPointerMove(e.clientX, e.clientY);
    if (dx !== null) lastDx = dx;
  });
  window.addEventListener('mouseup', () => {
    if (!mouseDown) return;
    mouseDown = false;
    onPointerUp(lastDx);
  });

  els.dots.forEach((dot) => {
    dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.index, 10)));
  });

  window.addEventListener('resize', () => goToSlide(currentSlide, false));

  document.querySelector('.refresh-btn').addEventListener('click', () => {
    refreshPattern();
    showGeneratedInvite();
  });
  document.querySelector('.request-plus').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('invite:plus-one', { detail: { id: activeEventId } }));
  });
  els.carouselViewport.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') goToSlide(currentSlide + 1);
    if (event.key === 'ArrowLeft') goToSlide(currentSlide - 1);
  });
  function showGeneratedInvite() {
    const view = document.getElementById('inviteView');
    view.dataset.credential = 'generated';
    if(els.qrImage.querySelector('svg')?.dataset.pattern!==state.basePattern)buildQrPattern();
    if(document.querySelector('.qr-placeholder > svg')?.dataset.pattern!==state.basePattern)buildRequestQrPattern();
    els.profilePhoto.hidden = false;
    view.querySelector('.slide:first-child .invite-sub').textContent = 'Your invite';
  }
  window.InviteView = {
    show(event, profile, { live = false } = {}) {
      activeLiveEvent = live;
      els.settingsBtn.hidden = live;
      els.patternBtn.hidden = live;
      const officialLink = document.getElementById('officialEventLink');
      officialLink.hidden = !live;
      officialLink.href = live ? event.sourceUrl : '#';
      activeEventId = event.id;
      state.eventName = event.title;
      state.eventPhoto = event.image || DEFAULT_EVENT_PHOTO;
      state.personName = profile.name;
      state.profilePhoto = profile.photo;
      applyState();
      showGeneratedInvite();
      goToSlide(0, false);
    },
    hide() { closeSheet(); closeMenu(); els.patternDialog.close(); },
    settings: openSheet,
  };

  // ---------- Init ----------
  loadState();
  applyState();
  buildQrPattern();
  buildRequestQrPattern();
  goToSlide(currentSlide, false);
})();
