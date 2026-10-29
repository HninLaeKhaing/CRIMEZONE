/* ============================================
   EMERGENCY SOS — Clean Dashboard JS
   Map, Contacts, SOS Hold, Alerts, Share
   ============================================ */

const sosState = {
  isActive: false,
  holdTimer: null,
  holdStart: 0,
  progressAnim: null,
  currentLocation: null,
  locationWatchId: null,
  isLiveTracking: false,
  lastGeocodeAt: 0,
  contacts: [],
  alerts: [],
  map: null,
  mapMarker: null,
  accuracyCircle: null
};

const HOLD_DURATION = 3000;
const SK_CONTACTS = 'cz_sos_contacts';
const SK_ALERTS   = 'cz_sos_alerts';

// ─── INIT ───
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadContacts();
  loadAlerts();
  initMap();
  captureLocation();
});

function updateClock() {
  const el = document.getElementById('sosTime');
  if (!el) return;
  const n = new Date();
  el.textContent = pad(n.getHours()) + ':' + pad(n.getMinutes()) + ':' + pad(n.getSeconds());
}
function pad(n) { return n.toString().padStart(2, '0'); }
function fmtTime(d) { if (typeof d === 'string') d = new Date(d); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
function initials(name) { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── MAP ───
function initMap() {
  sosState.map = L.map('sosMap', {
    center: [20.5937, 78.9629],
    zoom: 4,
    zoomControl: false,
  });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
  }).addTo(sosState.map);
}

function updateMapLocation(lat, lng) {
  if (!sosState.map) return;
  sosState.map.setView([lat, lng], 16, { animate: true });
  if (sosState.mapMarker) {
    sosState.mapMarker.setLatLng([lat, lng]);
  } else {
    const ico = L.divIcon({
      className: 'sos-marker',
      html: '<div style="position:relative;width:22px;height:22px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(255,32,64,0.25);animation:mP 2s ease-out infinite"></div><div style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#ff2040;border:2px solid #fff;box-shadow:0 0 10px rgba(255,32,64,0.5)"></div></div>',
      iconSize: [22, 22], iconAnchor: [11, 11]
    });
    sosState.mapMarker = L.marker([lat, lng], { icon: ico }).addTo(sosState.map);
    if (!document.getElementById('mPcss')) {
      const s = document.createElement('style'); s.id = 'mPcss';
      s.textContent = '@keyframes mP{0%{transform:scale(1);opacity:1}100%{transform:scale(3);opacity:0}}.sos-marker{background:none!important;border:none!important}';
      document.head.appendChild(s);
    }
  }
  if (sosState.currentLocation && sosState.currentLocation.accuracy) {
    if (sosState.accuracyCircle) {
      sosState.accuracyCircle.setLatLng([lat, lng]).setRadius(sosState.currentLocation.accuracy);
    } else {
      sosState.accuracyCircle = L.circle([lat, lng], {
        radius: sosState.currentLocation.accuracy,
        color: '#ff2040', fillColor: '#ff2040', fillOpacity: 0.06, weight: 1, opacity: 0.25
      }).addTo(sosState.map);
    }
  }
  document.getElementById('sosMapLoading').style.display = 'none';
}

// ─── LOCATION ───
function captureLocation() {
  const loading = document.getElementById('sosMapLoading');
  const denied  = document.getElementById('sosMapDenied');
  if (!navigator.geolocation) {
    loading.style.display = 'none';
    denied.style.display = 'flex';
    setLiveStatus('Geolocation is not supported', 'tracking-error');
    return;
  }
  loading.style.display = 'flex'; denied.style.display = 'none';

  navigator.geolocation.getCurrentPosition(
    pos => {
      updateCurrentLocation(pos.coords);
      loading.style.display = 'none'; denied.style.display = 'none';
    },
    err => {
      loading.style.display = 'none'; denied.style.display = 'flex';
      const sp = denied.querySelector('span:not(.g-denied-sub)');
      const message = locationErrorMessage(err);
      sp.textContent = message;
      if (!sosState.isLiveTracking) setLiveStatus(message, 'tracking-error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function updateCurrentLocation(coords) {
  const timestamp = new Date();
  const previous = sosState.currentLocation;
  sosState.currentLocation = {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: coords.accuracy,
    timestamp,
    address: previous ? previous.address : ''
  };
  updateMapLocation(coords.latitude, coords.longitude);
  document.getElementById('sosLocTimeText').textContent = 'Updated ' + fmtTime(timestamp);

  if (!sosState.lastGeocodeAt || Date.now() - sosState.lastGeocodeAt >= 60000) {
    sosState.lastGeocodeAt = Date.now();
    reverseGeocode(coords.latitude, coords.longitude);
  }
  if (sosState.isLiveTracking) setLiveStatus('Live tracking · updated ' + fmtTime(timestamp));
}

function locationErrorMessage(error) {
  if (error.code === 1) return 'Location access denied';
  if (error.code === 2) return 'Location unavailable';
  return 'Location request timed out';
}

function setLiveStatus(message, stateClass) {
  const status = document.getElementById('sosLiveStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('tracking-off', 'tracking-error');
  if (stateClass) status.classList.add(stateClass);
}

function toggleLiveTracking() {
  if (sosState.isLiveTracking) {
    stopLiveTracking();
    return;
  }
  startLiveTracking();
}

function startLiveTracking() {
  if (sosState.isLiveTracking) return;
  if (!navigator.geolocation) {
    setLiveStatus('Geolocation is not supported', 'tracking-error');
    showToast('Location unavailable', 'This browser does not support geolocation', 'error');
    return;
  }

  const denied = document.getElementById('sosMapDenied');
  const loading = document.getElementById('sosMapLoading');
  denied.style.display = 'none';
  loading.style.display = 'flex';

  sosState.locationWatchId = navigator.geolocation.watchPosition(
    pos => {
      updateCurrentLocation(pos.coords);
      loading.style.display = 'none';
      denied.style.display = 'none';
    },
    error => {
      const message = locationErrorMessage(error);
      loading.style.display = 'none';
      denied.style.display = 'flex';
      const deniedMessage = denied.querySelector('span:not(.g-denied-sub)');
      deniedMessage.textContent = message;
      if (error.code === 1) stopLiveTracking();
      setLiveStatus(message, 'tracking-error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
  sosState.isLiveTracking = true;
  const button = document.getElementById('sosLiveToggle');
  button.classList.add('active');
  button.setAttribute('aria-pressed', 'true');
  button.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/></svg> Stop Live Tracking';
  setLiveStatus('Live tracking starting…');
}

function stopLiveTracking() {
  if (sosState.locationWatchId !== null) {
    navigator.geolocation.clearWatch(sosState.locationWatchId);
    sosState.locationWatchId = null;
  }
  sosState.isLiveTracking = false;
  const button = document.getElementById('sosLiveToggle');
  if (button) {
    button.classList.remove('active');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg> Start Live Tracking';
  }
  setLiveStatus('Live tracking off', 'tracking-off');
}

async function reverseGeocode(lat, lng) {
  const el = document.getElementById('sosAddressText');
  el.textContent = 'Resolving address...';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
    const d = await r.json();
    if (d.display_name) { el.textContent = d.display_name; sosState.currentLocation.address = d.display_name; }
    else el.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (e) { el.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
}

// ─── SHARE ───
function getLocLink() {
  if (!sosState.currentLocation) return null;
  return `https://www.google.com/maps?q=${sosState.currentLocation.lat},${sosState.currentLocation.lng}`;
}
function getShareMsg() {
  if (!sosState.currentLocation) return 'I need help!';
  const addr = sosState.currentLocation.address || '';
  return `🚨 EMERGENCY SOS\n📍 ${addr ? addr + '\n' : ''}${getLocLink()}\n\nSent via CrimeZone SOS`;
}
function shareViaWhatsApp() {
  if (!sosState.currentLocation) { showToast('Location not ready', 'Wait for location', 'error'); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(getShareMsg()), '_blank');
  showToast('WhatsApp Opened', 'Share with a contact', 'success');
}
function shareViaSMS() {
  if (!sosState.currentLocation) { showToast('Location not ready', 'Wait for location', 'error'); return; }
  window.open('sms:?body=' + encodeURIComponent(getShareMsg()), '_self');
  showToast('SMS Opened', 'Share via text', 'success');
}
function shareLocationWithContact(index) {
  const contact = sosState.contacts[index];
  if (!contact) return;
  if (!sosState.currentLocation) {
    showToast('Location not ready', 'Wait for location', 'error');
    return;
  }
  const phone = contact.phone.replace(/\s/g, '');
  window.open(`sms:${phone}?body=${encodeURIComponent(getShareMsg())}`, '_self');
  showToast('SMS Opened', `Share your location with ${contact.name}`, 'success');
}
function copyLocationLink() {
  if (!sosState.currentLocation) { showToast('Location not ready', 'Wait for location', 'error'); return; }
  navigator.clipboard.writeText(getLocLink()).then(() => {
    const btn = document.querySelector('.g-share.copy');
    btn.classList.add('copied'); btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 8L7 11L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!';
    showToast('Link Copied', 'Google Maps link copied', 'success');
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3" stroke="currentColor" stroke-width="1.8"/></svg> Copy'; }, 2000);
  }).catch(() => showToast('Copy failed', 'Could not copy', 'error'));
}

// ─── SOS HOLD ───
function startSOSHold(e) {
  e.preventDefault();
  if (sosState.isActive) return;
  sosState.holdStart = Date.now();
  const btn = document.getElementById('sosBtn');
  const circle = document.getElementById('sosProgressCircle');
  btn.classList.add('holding');
  document.getElementById('sosBtnText').textContent = 'HOLD';
  sosState.progressAnim = requestAnimationFrame(function tick() {
    const pct = Math.min((Date.now() - sosState.holdStart) / HOLD_DURATION, 1);
    circle.style.strokeDashoffset = 565.48 * (1 - pct);
    if (pct >= 1) { activateSOS(); return; }
    sosState.progressAnim = requestAnimationFrame(tick);
  });
}
function cancelSOSHold(e) {
  if (e) e.preventDefault();
  if (sosState.isActive) return;
  document.getElementById('sosBtn').classList.remove('holding');
  document.getElementById('sosBtnText').textContent = 'SOS';
  document.getElementById('sosProgressCircle').style.strokeDashoffset = '565.48';
  if (sosState.progressAnim) { cancelAnimationFrame(sosState.progressAnim); sosState.progressAnim = null; }
}

function activateSOS() {
  sosState.isActive = true;
  document.getElementById('sosBtn').classList.remove('holding');
  document.getElementById('sosStatusLabel').textContent = 'Emergency Mode Active';
  document.getElementById('sosStatusLabel').style.color = '#ff2040';
  document.getElementById('sosStatusSub').textContent = 'Emergency alerts are being sent to your trusted contacts.';
  const ind = document.getElementById('sosIndicator');
  ind.className = 'g-badge red'; ind.innerHTML = '<span class="g-dot red"></span> ACTIVE';
  captureLocation();
  startLiveTracking();
  document.getElementById('sosActiveOverlay').style.display = 'flex';
  sendEmergencyAlerts();
}
function cancelSOS() {
  sosState.isActive = false;
  stopLiveTracking();
  document.getElementById('sosActiveOverlay').style.display = 'none';
  document.getElementById('sosStatusLabel').textContent = 'All Systems Protected';
  document.getElementById('sosStatusLabel').style.color = '';
  document.getElementById('sosStatusSub').textContent = 'Your device integrity, network security, and physical location monitoring are active and functioning normally.';
  const ind = document.getElementById('sosIndicator');
  ind.className = 'g-badge green'; ind.innerHTML = '<span class="g-dot green"></span> ACTIVE';
  document.getElementById('sosBtnText').textContent = 'SOS';
  document.getElementById('sosProgressCircle').style.strokeDashoffset = '565.48';
}

async function sendEmergencyAlerts() {
  const contacts = sosState.contacts;
  const status = document.getElementById('sosActiveStatus');
  const bar = document.getElementById('sosActiveBar');
  status.innerHTML = '';
  if (contacts.length === 0) {
    document.getElementById('sosActiveSub').textContent = 'No trusted contacts. Add contacts to send alerts.';
    bar.style.width = '100%';
    addAlert({ name: 'System', detail: 'No contacts configured', status: 'failed', time: new Date() });
    return;
  }
  document.getElementById('sosActiveSub').textContent = `Sending alerts to ${contacts.length} contact${contacts.length > 1 ? 's' : ''}...`;
  contacts.forEach((c, i) => {
    const d = document.createElement('div'); d.className = 'sos-active-contact'; d.id = `ac-${i}`;
    d.innerHTML = `<div class="g-avatar c${i%5}" style="width:30px;height:30px;font-size:11px">${initials(c.name)}</div><span class="sos-active-contact-name">${c.name}</span><span class="sos-active-contact-status pending" id="as-${i}">PENDING</span>`;
    status.appendChild(d);
  });
  for (let i = 0; i < contacts.length; i++) {
    if (!sosState.isActive) break;
    bar.style.width = ((i + 1) / contacts.length * 100) + '%';
    await sleep(1000 + Math.random() * 2000);
    if (!sosState.isActive) break;
    const ok = Math.random() > 0.15;
    const el = document.getElementById(`as-${i}`);
    if (ok) { el.textContent = 'SENT'; el.className = 'sos-active-contact-status sent'; addAlert({ name: contacts[i].name, detail: `Alert sent to ${contacts[i].phone}`, status: 'sent', time: new Date() }); }
    else { el.textContent = 'FAILED'; el.className = 'sos-active-contact-status failed'; addAlert({ name: contacts[i].name, detail: `Failed to reach ${contacts[i].phone}`, status: 'failed', time: new Date() }); }
  }
  if (sosState.isActive) { document.getElementById('sosActiveTitle').textContent = 'ALERTS SENT'; document.getElementById('sosActiveSub').textContent = 'Emergency alerts dispatched. Stay safe.'; }
}

// ─── ALERTS ───
function addAlert(a) { sosState.alerts.unshift(a); saveAlerts(); renderAlerts(); }
function renderAlerts() {
  const c = document.getElementById('sosAlertsList');
  if (sosState.alerts.length === 0) {
    c.innerHTML = '<div class="g-alert-empty"><svg width="24" height="24" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" stroke-dasharray="4 4"/><path d="M10 14L13 17L18 11" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>No alerts sent yet</span><span class="g-alert-empty-sub">Alerts appear here when SOS is triggered</span></div>';
    return;
  }
  c.innerHTML = '';
  sosState.alerts.forEach(a => {
    const d = document.createElement('div'); d.className = 'g-alert';
    d.innerHTML = `<div class="g-alert-ico ${a.status}">${a.status === 'sent' ? '✓' : a.status === 'failed' ? '✕' : '◌'}</div><div class="g-alert-info"><span class="g-alert-name">${a.name}</span><span class="g-alert-detail">${a.detail} · ${fmtTime(new Date(a.time))}</span></div><span class="g-alert-tag ${a.status}">${a.status.toUpperCase()}</span>`;
    c.appendChild(d);
  });
}
function clearAlerts() { sosState.alerts = []; saveAlerts(); renderAlerts(); }
function loadAlerts() { try { const s = localStorage.getItem(SK_ALERTS); if (s) sosState.alerts = JSON.parse(s); } catch(e) { sosState.alerts = []; } renderAlerts(); }
function saveAlerts() { if (sosState.alerts.length > 20) sosState.alerts = sosState.alerts.slice(0, 20); localStorage.setItem(SK_ALERTS, JSON.stringify(sosState.alerts)); }

// ─── CONTACTS ───
function loadContacts() {
  try { const s = localStorage.getItem(SK_CONTACTS); if (s) sosState.contacts = JSON.parse(s); } catch(e) { sosState.contacts = []; }
  if (sosState.contacts.length === 0) {
    sosState.contacts = [
      { name: 'Mom', phone: '+91 98765 43210', relation: 'Family' },
      { name: 'Priya Sharma', phone: '+91 87654 32109', relation: 'Friend' },
      { name: 'Rahul (Bro)', phone: '+91 76543 21098', relation: 'Family' }
    ];
    saveContacts();
  }
  renderContacts();
}

function renderContacts(hlIdx) {
  const c = document.getElementById('sosContactsList');
  c.innerHTML = '';
  const count = document.getElementById('sosShareCount');
  if (count) count.textContent = sosState.contacts.length;
  if (sosState.contacts.length === 0) {
    c.innerHTML = '<div class="g-contacts-empty"><svg width="28" height="28" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="12" r="5" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/><path d="M6 28C6 23.58 10.48 20 16 20C21.52 20 26 23.58 26 28" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/></svg><span>No trusted contacts</span><span style="font-size:11px;opacity:.5">Add contacts to receive SOS alerts</span></div>';
    return;
  }
  sosState.contacts.forEach((ct, i) => {
    const d = document.createElement('div'); d.className = 'g-contact';
    if (i === hlIdx) d.classList.add('just-added');
    const ph = ct.phone.replace(/\s/g, '');
    d.innerHTML = `
      <div class="g-avatar c${i%5}">${initials(ct.name)}</div>
      <div class="g-c-info"><span class="g-c-name">${ct.name}</span><span class="g-c-phone">${ct.phone}</span></div>
      <div class="g-c-actions">
        <span class="g-c-tag">${ct.relation}</span>
        <button class="g-c-btn loc" onclick="shareLocationWithContact(${i})" title="Text current location" aria-label="Text current location to contact">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 14s5-4.2 5-8A5 5 0 0 0 3 6c0 3.8 5 8 5 8Z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3"/></svg>
        </button>
        <button class="g-c-btn call" onclick="window.open('tel:${ph}','_self')" title="Call">
          <svg width="12" height="12" viewBox="0 0 22 22" fill="none"><path d="M20 15.5C18.75 15.5 17.55 15.3 16.43 14.93C16.08 14.82 15.69 14.9 15.41 15.17L13.21 17.37C10.38 15.93 8.06 13.62 6.62 10.78L8.82 8.57C9.1 8.31 9.18 7.92 9.07 7.57C8.7 6.45 8.5 5.25 8.5 4C8.5 3.45 8.05 3 7.5 3H4C3.45 3 3 3.45 3 4C3 12.28 9.72 19 18 19C18.55 19 19 18.55 19 18V15.5C19 14.95 18.55 14.5 18 14.5H20Z" fill="currentColor"/></svg>
        </button>
        <button class="g-c-btn txt" onclick="window.open('sms:${ph}','_self')" title="SMS">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="12" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M7 10h4M7 13h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
      <button class="g-c-btn del" onclick="removeContact(${i})" title="Remove">✕</button>
    `;
    c.appendChild(d);
  });
  if (hlIdx !== undefined && hlIdx >= 0) {
    const items = c.querySelectorAll('.g-contact');
    if (items[hlIdx]) items[hlIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function openAddContact() {
  document.getElementById('contactModal').classList.add('open');
  document.getElementById('contactName').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactRelation').value = 'Family';
  setTimeout(() => document.getElementById('contactName').focus(), 200);
}
function closeAddContact() { document.getElementById('contactModal').classList.remove('open'); }

function saveContact() {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const relation = document.getElementById('contactRelation').value;
  if (!name || !phone) {
    const b = document.querySelector('.g-modal-save');
    b.style.background = 'linear-gradient(135deg,#ff6b00,#cc4400)'; b.textContent = 'Fill all fields';
    setTimeout(() => { b.style.background = ''; b.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8L7 11L12 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Save Contact'; }, 1500);
    return;
  }
  sosState.contacts.push({ name, phone, relation });
  saveContacts(); renderContacts(sosState.contacts.length - 1); closeAddContact();
  showToast('Contact Saved', `${name} · ${phone} · ${relation}`, 'success');
}
function removeContact(i) {
  const r = sosState.contacts[i]; sosState.contacts.splice(i, 1); saveContacts(); renderContacts();
  showToast('Contact Removed', `${r.name} removed`, 'remove');
}
function saveContacts() { localStorage.setItem(SK_CONTACTS, JSON.stringify(sosState.contacts)); }

// ─── CALLS ───
function callEmergency()    { window.open('tel:112','_self'); addAlert({name:'Emergency Call',detail:'Called 112',status:'sent',time:new Date()}); }
function callPolice()       { window.open('tel:100','_self'); addAlert({name:'Police',detail:'Called 100',status:'sent',time:new Date()}); }
function callAmbulance()    { window.open('tel:108','_self'); addAlert({name:'Ambulance',detail:'Called 108',status:'sent',time:new Date()}); }
function callWomenHelpline(){ window.open('tel:1091','_self'); addAlert({name:'Women Helpline',detail:'Called 1091',status:'sent',time:new Date()}); }
function callFireService()  { window.open('tel:101','_self'); addAlert({name:'Fire Service',detail:'Called 101',status:'sent',time:new Date()}); }
function callChildHelpline(){ window.open('tel:1098','_self'); addAlert({name:'Child Helpline',detail:'Called 1098',status:'sent',time:new Date()}); }

// ─── TOAST ───
let toastT = null;
function showToast(title, detail, type) {
  const old = document.querySelector('.sos-toast'); if (old) old.remove();
  if (toastT) clearTimeout(toastT);
  const t = document.createElement('div'); t.className = 'sos-toast';
  const ok = type === 'success'; const clr = ok ? '#00ff88' : '#ff2040';
  t.style.borderColor = ok ? 'rgba(0,255,136,0.25)' : 'rgba(255,32,64,0.25)';
  t.innerHTML = `<div class="sos-toast-icon" style="background:${ok?'rgba(0,255,136,0.1)':'rgba(255,32,64,0.1)'};border:1px solid ${ok?'rgba(0,255,136,0.18)':'rgba(255,32,64,0.18)'};color:${clr}">${ok?'✓':'✕'}</div><div class="sos-toast-body"><span class="sos-toast-title" style="color:${clr}">${title}</span><span class="sos-toast-detail">${detail}</span></div><button class="sos-toast-close" onclick="dismissToast(this.parentElement)">✕</button>`;
  document.body.appendChild(t);
  toastT = setTimeout(() => dismissToast(t), 4000);
}
function dismissToast(el) { if (!el||!el.parentElement) return; el.classList.add('toast-out'); setTimeout(() => { if (el.parentElement) el.remove(); }, 300); }

// ─── KEYBOARD ───
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (sosState.isActive) cancelSOS(); closeAddContact(); } });
