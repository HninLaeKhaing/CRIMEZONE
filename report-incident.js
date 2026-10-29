const form = document.getElementById('incidentForm');
const successModal = document.getElementById('successModal');
const photoInput = document.getElementById('incidentPhoto');
const previewImage = document.getElementById('previewImage');
const photoPreview = document.getElementById('photoPreview');
const flagReportBtn = document.getElementById('flagReportBtn');
const reportReference = document.getElementById('reportReference');
const incidentLocationInput = document.getElementById('incidentLocation');
const formMessage = document.getElementById('reportFormMessage');
const submitButton = document.getElementById('reportSubmitButton');

const state = {
  initialLocation: [28.6139, 77.2090],
  reportRef: null,
  isFlagged: false,
};

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function showFormMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle('error', isError);
  formMessage.hidden = false;
}

function clearFormMessage() {
  formMessage.textContent = '';
  formMessage.hidden = true;
  formMessage.classList.remove('error');
}

async function readApiResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Report services are unavailable on this static deployment. Deploy the CrimeZone server to submit reports.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || fallbackMessage);
  return result;
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Choose a photo that is 2 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The selected photo could not be read.'));
    reader.readAsDataURL(file);
  });
}

document.getElementById('incidentDate').value = localDateValue();
document.getElementById('incidentTime').value = new Date().toTimeString().slice(0, 5);

const map = L.map('reportMap', {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView(state.initialLocation, 13);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>',
  maxZoom: 19,
}).addTo(map);

const marker = L.marker(state.initialLocation).addTo(map);
marker.bindPopup('Reported incident area').openPopup();

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const latlng = [latitude, longitude];
      map.setView(latlng, 14, { animate: true });
      marker.setLatLng(latlng);
      marker.bindPopup('Your current location').openPopup();
      if (!incidentLocationInput.value.trim()) incidentLocationInput.value = 'Current location';
    },
    () => {
      console.warn('Location permission denied. Using default incident area.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

photoInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    previewImage.src = reader.result;
    photoPreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFormMessage();
  submitButton.disabled = true;
  submitButton.textContent = 'Submitting…';

  try {
    const photo = await readPhoto(photoInput.files[0]);
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: document.getElementById('incidentCategory').value,
        severity: document.getElementById('incidentSeverity').value,
        date: document.getElementById('incidentDate').value,
        time: document.getElementById('incidentTime').value,
        location: incidentLocationInput.value.trim(),
        description: document.getElementById('incidentDescription').value.trim(),
        privacy: form.querySelector('.switch input').checked,
        photo,
      }),
    });
    const result = await readApiResponse(response, 'The report could not be submitted.');

    state.reportRef = result.reference;
    state.isFlagged = false;
    reportReference.textContent = state.reportRef;
    flagReportBtn.disabled = false;
    flagReportBtn.textContent = 'Flag incorrect report';
    successModal.classList.remove('hidden');
    form.reset();
    photoPreview.hidden = true;
    previewImage.removeAttribute('src');
    document.getElementById('incidentDate').value = localDateValue();
    document.getElementById('incidentTime').value = new Date().toTimeString().slice(0, 5);
  } catch (error) {
    showFormMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit Report';
  }
});

flagReportBtn.addEventListener('click', async () => {
  if (!state.reportRef || state.isFlagged) return;
  flagReportBtn.disabled = true;
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(state.reportRef)}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    await readApiResponse(response, 'The report could not be flagged.');
    state.isFlagged = true;
    flagReportBtn.textContent = 'Report flagged for review';
  } catch (error) {
    showFormMessage(error.message, true);
    flagReportBtn.disabled = false;
  }
});

document.getElementById('closeSuccessButton').addEventListener('click', () => {
  successModal.classList.add('hidden');
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    successModal.classList.add('hidden');
  }
});
