const routeState = {
  map: null,
  routeLayer: null,
  startMarker: null,
  endMarker: null,
  progressMarker: null,
  coordinates: null,
  mode: 'driving',
  startPoint: null,
  requestId: 0
};

let nominatimLastRequest = 0;

const routeMapStyle = {
  color: '#187cf2',
  weight: 5,
  opacity: 0.95,
  lineCap: 'round',
  lineJoin: 'round'
};

document.addEventListener('DOMContentLoaded', () => {
  initializeRouteMap();
  bindRouteControls();
  const params = new URLSearchParams(window.location.search);
  const start = params.get('start');
  const destination = params.get('destination');
  const mode = params.get('mode');
  if (start) document.getElementById('routeStart').value = start;
  if (destination) document.getElementById('routeDestination').value = destination;
  if (['driving', 'cycling', 'foot'].includes(mode)) selectTravelMode(mode);
  if (start && destination) document.getElementById('routeForm').requestSubmit();
});

function initializeRouteMap() {
  routeState.map = L.map('routeMap', { zoomControl: false }).setView([28.6139, 77.209], 12);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
  }).addTo(routeState.map);
  L.control.zoom({ position: 'bottomright' }).addTo(routeState.map);
}

function bindRouteControls() {
  document.getElementById('routeForm').addEventListener('submit', event => {
    event.preventDefault();
    findRoute();
  });
  document.getElementById('routeStart').addEventListener('input', () => {
    routeState.startPoint = null;
  });
  document.querySelectorAll('.route-mode').forEach(button => {
    button.addEventListener('click', () => selectTravelMode(button.dataset.mode));
  });
  document.getElementById('useCurrentLocation').addEventListener('click', useCurrentLocation);
  document.getElementById('routeLocateButton').addEventListener('click', useCurrentLocation);
  document.getElementById('routeProgress').addEventListener('input', updateRouteProgress);
  document.getElementById('shareRouteButton').addEventListener('click', shareRoute);
}

function selectTravelMode(mode) {
  routeState.mode = mode;
  document.querySelectorAll('.route-mode').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (routeState.coordinates) findRoute();
}

function showRouteError(message) {
  const error = document.getElementById('routeMapError');
  error.textContent = message;
  error.hidden = false;
}

function clearRouteError() {
  const error = document.getElementById('routeMapError');
  error.textContent = '';
  error.hidden = true;
  error.classList.remove('route-success');
}

async function geocodeAddress(address) {
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.search = new URLSearchParams({ q: address, format: 'jsonv2', limit: '1' });
  const response = await fetchNominatim(endpoint);
  if (!response.ok) throw new Error('Location search is temporarily unavailable. Please try again.');
  const results = await response.json();
  if (!results.length) throw new Error(`Could not find "${address}". Try a nearby street, area, or city.`);
  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
    label: results[0].display_name
  };
}

async function findRoute() {
  const startText = document.getElementById('routeStart').value.trim();
  const destinationText = document.getElementById('routeDestination').value.trim();
  if (!startText || !destinationText) {
    showRouteError('Enter both a starting point and destination to plan your route.');
    return;
  }

  const requestId = ++routeState.requestId;
  const submit = document.getElementById('routeSubmit');
  submit.disabled = true;
  submit.innerHTML = '<span class="route-spinner"></span> Finding route…';
  clearRouteError();
  setRouteCaption('Searching for locations and calculating a route…');

  try {
    const start = routeState.startPoint || await geocodeAddress(startText);
    if (requestId !== routeState.requestId) return;
    const destination = await geocodeAddress(destinationText);
    if (requestId !== routeState.requestId) return;
    routeState.startPoint = null;

    const request = {
      locations: [
        { lat: start.lat, lon: start.lng },
        { lat: destination.lat, lon: destination.lng }
      ],
      costing: valhallaMode(routeState.mode),
      units: 'kilometers'
    };
    const endpoint = new URL('https://valhalla1.openstreetmap.de/route');
    endpoint.searchParams.set('json', JSON.stringify(request));
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('The route service could not be reached. Please try again.');
    const data = await response.json();
    if (requestId !== routeState.requestId) return;
    const leg = data.trip && data.trip.legs && data.trip.legs[0];
    if (!data.trip || data.trip.status !== 0 || !leg || !leg.shape) {
      throw new Error('No route found for these locations and travel mode. Try another mode or nearby address.');
    }

    routeState.coordinates = decodePolyline6(leg.shape).map(([lat, lng]) => [lng, lat]);
    renderRoute(start, destination, data.trip.summary);
  } catch (error) {
    if (requestId === routeState.requestId) {
      showRouteError(error.message || 'Could not plan this route. Check your connection and try again.');
      setRouteCaption('No route available yet.');
    }
  } finally {
    if (requestId === routeState.requestId) {
      submit.disabled = false;
      submit.innerHTML = '<svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M3 10h13m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Find route';
    }
  }
}

function renderRoute(start, destination, summary) {
  const path = routeState.coordinates.map(point => [point[1], point[0]]);
  if (routeState.routeLayer) routeState.map.removeLayer(routeState.routeLayer);
  if (routeState.startMarker) routeState.map.removeLayer(routeState.startMarker);
  if (routeState.endMarker) routeState.map.removeLayer(routeState.endMarker);
  if (routeState.progressMarker) {
    routeState.map.removeLayer(routeState.progressMarker);
    routeState.progressMarker = null;
  }

  routeState.routeLayer = L.polyline(path, routeMapStyle).addTo(routeState.map);
  routeState.startMarker = createLocationMarker(start, 'start', 'Starting point');
  routeState.endMarker = createLocationMarker(destination, 'end', 'Destination');
  routeState.startMarker.addTo(routeState.map);
  routeState.endMarker.addTo(routeState.map);
  const panelWidth = document.querySelector('.route-panel').getBoundingClientRect().width;
  const leftPadding = window.innerWidth <= 760 ? 28 : Math.round(panelWidth + 64);
  routeState.map.fitBounds(routeState.routeLayer.getBounds(), {
    paddingTopLeft: [leftPadding, 60],
    paddingBottomRight: [40, 60]
  });

  const distanceKm = summary.length;
  const minutes = Math.max(1, Math.round(summary.time / 60));
  document.getElementById('routeDuration').textContent = formatDuration(minutes);
  document.getElementById('routeDistance').textContent = `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km`;
  document.getElementById('routeCaption').textContent = `${modeLabel(routeState.mode)} route · Estimates based on mapped roads.`;
  document.getElementById('routeProgressWrap').hidden = false;
  document.getElementById('routeProgress').value = '0';
  document.getElementById('routeProgressValue').textContent = '0%';
  document.getElementById('shareRouteButton').disabled = false;
  document.getElementById('shareRouteButton').textContent = 'Share route';
  routeState.map.invalidateSize();
  updateRouteProgress();
}

function createLocationMarker(point, type, title) {
  const icon = L.divIcon({
    className: 'route-marker-shell',
    html: `<div class="route-pin ${type}"><span></span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 25]
  });
  return L.marker([point.lat, point.lng], { icon }).bindPopup(`<strong>${title}</strong><small>${escapeHtml(point.label)}</small>`);
}

function updateRouteProgress() {
  if (!routeState.coordinates || !routeState.coordinates.length) return;
  const slider = document.getElementById('routeProgress');
  const percent = Number(slider.value);
  document.getElementById('routeProgressValue').textContent = `${percent}%`;
  const latLng = pointAtProgress(percent);
  if (!routeState.progressMarker) {
    const icon = L.divIcon({
      className: 'route-progress-shell',
      html: '<div class="route-progress-marker"><svg width="19" height="19" viewBox="0 0 20 20" fill="none"><path d="m4 12 1.5-4h9L16 12v3H4v-3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5 12h10M6 15v1m8-1v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    routeState.progressMarker = L.marker(latLng, { icon, interactive: false, zIndexOffset: 1000 }).addTo(routeState.map);
  } else {
    routeState.progressMarker.setLatLng(latLng);
    if (!routeState.map.hasLayer(routeState.progressMarker)) routeState.progressMarker.addTo(routeState.map);
  }
}

function pointAtProgress(percent) {
  const points = routeState.coordinates;
  if (points.length === 1) return [points[0][1], points[0][0]];
  const segmentLengths = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index++) {
    const length = distanceBetween(points[index - 1], points[index]);
    segmentLengths.push(length);
    totalLength += length;
  }
  let remaining = totalLength * percent / 100;
  for (let index = 0; index < segmentLengths.length; index++) {
    const length = segmentLengths[index];
    if (remaining <= length || index === segmentLengths.length - 1) {
      const ratio = length ? Math.min(1, remaining / length) : 0;
      const longitude = points[index][0] + (points[index + 1][0] - points[index][0]) * ratio;
      const latitude = points[index][1] + (points[index + 1][1] - points[index][1]) * ratio;
      return [latitude, longitude];
    }
    remaining -= length;
  }
  const last = points[points.length - 1];
  return [last[1], last[0]];
}

function distanceBetween(first, second) {
  const radians = value => value * Math.PI / 180;
  const lat1 = radians(first[1]);
  const lat2 = radians(second[1]);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(second[0] - first[0]);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showRouteError('This browser does not support location access.');
    return;
  }
  clearRouteError();
  const button = document.getElementById('useCurrentLocation');
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Finding location…';
  navigator.geolocation.getCurrentPosition(async position => {
    const point = { lat: position.coords.latitude, lng: position.coords.longitude, label: 'Your current location' };
    routeState.startPoint = point;
    try {
      const address = await reverseGeocode(point.lat, point.lng);
      point.label = address || point.label;
      document.getElementById('routeStart').value = point.label;
    } catch (error) {
      document.getElementById('routeStart').value = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    }
    routeState.map.setView([point.lat, point.lng], 15);
    button.disabled = false;
    button.textContent = originalLabel;
  }, error => {
    button.disabled = false;
    button.textContent = originalLabel;
    showRouteError(error.code === 1 ? 'Location permission was denied. Allow location access in your browser settings.' : 'Could not get your location. Please try again.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}

async function reverseGeocode(lat, lng) {
  const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
  endpoint.search = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2' });
  const response = await fetchNominatim(endpoint);
  if (!response.ok) return '';
  const data = await response.json();
  return data.display_name || '';
}

async function fetchNominatim(url) {
  const wait = Math.max(0, 1000 - (Date.now() - nominatimLastRequest));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  nominatimLastRequest = Date.now();
  return fetch(url, { headers: { 'Accept-Language': 'en' } });
}

async function shareRoute() {
  const start = document.getElementById('routeStart').value.trim();
  const destination = document.getElementById('routeDestination').value.trim();
  const routeUrl = new URL(window.location.href);
  routeUrl.search = new URLSearchParams({ start, destination, mode: routeState.mode });
  const shareData = {
    title: 'CrimeZone Route',
    text: `${start} to ${destination} · ${document.getElementById('routeDuration').textContent} · ${document.getElementById('routeDistance').textContent}`,
    url: routeUrl.href
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(routeUrl.href);
      showRouteError('Route link copied to clipboard.');
      document.getElementById('routeMapError').classList.add('route-success');
    } else {
      window.prompt('Copy this route link:', routeUrl.href);
    }
  } catch (error) {
    if (error.name !== 'AbortError') showRouteError('Could not share the route. Please try again.');
  }
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} hr ${remainder} min` : `${remainder} min`;
}

function modeLabel(mode) {
  return mode === 'cycling' ? 'Bike' : mode === 'foot' ? 'Walking' : 'Driving';
}

function valhallaMode(mode) {
  return mode === 'cycling' ? 'bicycle' : mode === 'foot' ? 'pedestrian' : 'auto';
}

function decodePolyline6(encoded) {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([latitude / 1e6, longitude / 1e6]);
  }
  return points;
}

function setRouteCaption(text) {
  document.getElementById('routeCaption').textContent = text;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
