'use strict';

const categoryColors = ['#ff2040', '#32c9ee', '#7772ff', '#00d996', '#ffbd51', '#fa7e55'];
const statusLabels = {
  pending: 'Pending review',
  under_review: 'Under review',
  actioned: 'Action recorded',
  dismissed: 'Dismissed',
};
let overviewData = null;
let toastTimer;
let currentReportPage = 1;
const reportsPerPage = 5;

const elements = {
  total: document.getElementById('totalReports'),
  pending: document.getElementById('pendingReports'),
  underReview: document.getElementById('reviewReports'),
  flagged: document.getElementById('flaggedReports'),
  pendingBadge: document.getElementById('navPendingCount'),
  categoryTotal: document.getElementById('categoryTotal'),
  categoryChart: document.getElementById('categoryChart'),
  categoryLegend: document.getElementById('categoryLegend'),
  sources: document.getElementById('sourceList'),
  activity: document.getElementById('activityList'),
  reports: document.getElementById('reportTableBody'),
  reportCount: document.getElementById('reportTableCount'),
  pagination: document.getElementById('reportPagination'),
  categoryFilter: document.getElementById('reportCategoryFilter'),
  statusFilter: document.getElementById('reportStatusFilter'),
  username: document.getElementById('adminSidebarUsername'),
  avatar: document.getElementById('adminAvatar'),
  toast: document.getElementById('adminToast'),
};

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', isError);
  elements.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 3200);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (response.status === 401) {
    window.location.replace('/admin/login');
    throw new Error('Your administrator session has expired.');
  }
  if (!response.ok) throw new Error(result.error || 'The server request failed.');
  return result;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Unknown date'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function renderCategories(categories, total) {
  elements.categoryTotal.textContent = total.toLocaleString();
  elements.categoryLegend.replaceChildren();

  if (!categories.length || !total) {
    elements.categoryChart.style.background = 'conic-gradient(#292938 0deg 360deg)';
    const empty = document.createElement('span');
    empty.className = 'activity-empty';
    empty.textContent = 'No reports have been submitted yet.';
    elements.categoryLegend.append(empty);
    return;
  }

  let cursor = 0;
  const slices = categories.map((item, index) => {
    const start = cursor;
    cursor += Number(item.count) / total * 360;
    return `${categoryColors[index % categoryColors.length]} ${start}deg ${cursor}deg`;
  });
  elements.categoryChart.style.background = `conic-gradient(${slices.join(', ')})`;

  categories.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = categoryColors[index % categoryColors.length];
    const name = document.createElement('span');
    name.className = 'legend-name';
    name.textContent = item.category;
    const count = document.createElement('strong');
    count.className = 'legend-count';
    count.textContent = Number(item.count).toLocaleString();
    row.append(swatch, name, count);
    elements.categoryLegend.append(row);
  });
}

function renderSources(sources) {
  elements.sources.replaceChildren();
  const sourceSymbols = { connected: '✓', not_configured: '!', external: '↗' };
  const sourceLabels = { connected: 'CONNECTED', not_configured: 'NOT CONFIGURED', external: 'EXTERNAL' };

  sources.forEach((source) => {
    const row = document.createElement('div');
    row.className = 'source-row';
    const icon = document.createElement('span');
    icon.className = 'source-icon';
    icon.textContent = sourceSymbols[source.status] || '•';
    const copy = document.createElement('span');
    copy.className = 'source-copy';
    const name = document.createElement('strong');
    name.textContent = source.name;
    const detail = document.createElement('small');
    detail.textContent = source.detail;
    copy.append(name, detail);
    const status = document.createElement('span');
    status.className = `source-state ${source.status}`;
    status.textContent = sourceLabels[source.status] || 'UNKNOWN';
    row.append(icon, copy, status);
    elements.sources.append(row);
  });
}

function renderActivity(activity) {
  elements.activity.replaceChildren();
  if (!activity.length) {
    const empty = document.createElement('div');
    empty.className = 'activity-empty';
    empty.textContent = 'No report activity yet. Submitted reports will appear here.';
    elements.activity.append(empty);
    return;
  }

  activity.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'activity-item';
    const marker = document.createElement('span');
    marker.className = 'activity-marker';
    const copy = document.createElement('div');
    copy.className = 'activity-copy';
    const action = document.createElement('strong');
    action.textContent = entry.action;
    const report = document.createElement('span');
    report.textContent = `${entry.reference} · ${entry.category}`;
    const time = document.createElement('time');
    time.dateTime = entry.createdAt;
    time.textContent = formatDate(entry.createdAt);
    copy.append(action, report, time);
    item.append(marker, copy);
    elements.activity.append(item);
  });
}

function makeStatusSelect(report) {
  const select = document.createElement('select');
  select.className = 'report-status-select';
  select.setAttribute('aria-label', `Update review status for ${report.reference}`);
  Object.entries(statusLabels).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = report.status === value;
    select.append(option);
  });
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      await requestJson(`/api/admin/reports/${encodeURIComponent(report.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value }),
      });
      showToast(`Review status updated for ${report.reference}.`);
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
      select.disabled = false;
      select.value = report.status;
    }
  });
  return select;
}

function renderReports(reports) {
  const query = document.getElementById('reportSearch').value.trim().toLowerCase();
  const selectedCategory = elements.categoryFilter.value;
  const selectedStatus = elements.statusFilter.value;
  const filtered = reports.filter((report) => [
    report.reference,
    report.category,
    report.severity,
    report.location,
    report.description,
  ].some((value) => String(value || '').toLowerCase().includes(query))
    && (!selectedCategory || report.category === selectedCategory)
    && (!selectedStatus || report.status === selectedStatus));

  const pageCount = Math.max(1, Math.ceil(filtered.length / reportsPerPage));
  currentReportPage = Math.min(currentReportPage, pageCount);
  const startIndex = (currentReportPage - 1) * reportsPerPage;
  const visibleReports = filtered.slice(startIndex, startIndex + reportsPerPage);
  elements.reports.replaceChildren();
  elements.reportCount.textContent = filtered.length
    ? `Showing ${startIndex + 1}–${Math.min(startIndex + reportsPerPage, filtered.length)} of ${filtered.length} reports`
    : `Showing 0 of ${reports.length} recent reports`;
  elements.pagination.replaceChildren();
  if (!visibleReports.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'table-empty';
    cell.colSpan = 6;
    cell.textContent = reports.length ? 'No reports match your search.' : 'No reports yet. Community submissions will be shown here as unverified.';
    row.append(cell);
    elements.reports.append(row);
    elements.pagination.hidden = true;
    return;
  }

  elements.pagination.hidden = pageCount < 2;
  if (pageCount > 1) {
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'page-button page-arrow';
    previous.textContent = 'Previous';
    previous.disabled = currentReportPage === 1;
    previous.setAttribute('aria-label', 'Previous reports page');
    previous.addEventListener('click', () => {
      currentReportPage -= 1;
      renderReports(reports);
    });

    const pageLabel = document.createElement('span');
    pageLabel.className = 'page-current';
    pageLabel.textContent = `${currentReportPage} / ${pageCount}`;
    pageLabel.setAttribute('aria-current', 'page');

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'page-button page-arrow';
    next.textContent = 'Next';
    next.disabled = currentReportPage === pageCount;
    next.setAttribute('aria-label', 'Next reports page');
    next.addEventListener('click', () => {
      currentReportPage += 1;
      renderReports(reports);
    });

    elements.pagination.append(previous, pageLabel, next);
  }

  visibleReports.forEach((report) => {
    const row = document.createElement('tr');
    const idCell = document.createElement('td');
    const idCopy = document.createElement('div');
    idCopy.className = 'report-id';
    const reference = document.createElement('strong');
    reference.textContent = report.reference;
    const date = document.createElement('small');
    date.textContent = formatDate(report.createdAt);
    idCopy.append(reference, date);
    idCell.append(idCopy);

    const categoryCell = document.createElement('td');
    const category = document.createElement('span');
    category.className = 'report-category';
    category.textContent = report.category;
    categoryCell.append(category);

    const detailsCell = document.createElement('td');
    const details = document.createElement('div');
    details.className = 'report-detail';
    const incident = document.createElement('strong');
    incident.textContent = `${report.severity} · ${report.date} ${report.time}`;
    const location = document.createElement('small');
    location.textContent = `${report.privacy ? 'Private location' : report.location} · ${report.description || 'No description'}`;
    details.append(incident, location);
    if (report.hasPhoto) {
      const photoLink = document.createElement('a');
      photoLink.className = 'report-photo-link';
      photoLink.href = `/api/admin/reports/${encodeURIComponent(report.id)}/photo`;
      photoLink.target = '_blank';
      photoLink.rel = 'noopener';
      photoLink.textContent = 'View attached photo';
      details.append(photoLink);
    }
    detailsCell.append(details);

    const flagsCell = document.createElement('td');
    flagsCell.className = Number(report.flags) ? 'report-flags flagged' : 'report-flags';
    flagsCell.textContent = Number(report.flags) ? `${report.flags} flag${Number(report.flags) === 1 ? '' : 's'}` : '—';

    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = `workflow-status ${report.status}`;
    status.textContent = statusLabels[report.status] || 'Unknown';
    statusCell.append(status);

    const actionCell = document.createElement('td');
    actionCell.append(makeStatusSelect(report));
    row.append(idCell, categoryCell, detailsCell, flagsCell, statusCell, actionCell);
    elements.reports.append(row);
  });
}

function renderOverview(data) {
  overviewData = data;
  elements.total.textContent = Number(data.counts.total).toLocaleString();
  elements.pending.textContent = Number(data.counts.pending).toLocaleString();
  elements.underReview.textContent = Number(data.counts.underReview).toLocaleString();
  elements.flagged.textContent = Number(data.counts.flagged).toLocaleString();
  elements.pendingBadge.textContent = Number(data.counts.pending).toLocaleString();
  elements.username.textContent = data.username;
  elements.avatar.textContent = data.username.slice(0, 1).toUpperCase();
  const selectedCategory = elements.categoryFilter.value;
  elements.categoryFilter.replaceChildren(new Option('All categories', ''));
  data.categories.forEach((entry) => {
    elements.categoryFilter.add(new Option(entry.category, entry.category));
  });
  elements.categoryFilter.value = data.categories.some((entry) => entry.category === selectedCategory)
    ? selectedCategory
    : '';
  renderCategories(data.categories, data.counts.total);
  renderSources(data.sources);
  renderActivity(data.recentActivity);
  renderReports(data.recentReports);
}

async function loadOverview() {
  const data = await requestJson('/api/admin/overview');
  renderOverview(data);
}

document.getElementById('refreshButton').addEventListener('click', async () => {
  try {
    await loadOverview();
    showToast('Overview refreshed.');
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('reportSearch').addEventListener('input', () => {
  currentReportPage = 1;
  if (overviewData) renderReports(overviewData.recentReports);
});

elements.categoryFilter.addEventListener('change', () => {
  currentReportPage = 1;
  if (overviewData) renderReports(overviewData.recentReports);
});

elements.statusFilter.addEventListener('change', () => {
  currentReportPage = 1;
  if (overviewData) renderReports(overviewData.recentReports);
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    await requestJson('/api/admin/logout', { method: 'POST', body: '{}' });
    window.location.replace('/admin/login');
  } catch (error) {
    showToast(error.message, true);
  }
});

loadOverview().catch((error) => showToast(error.message, true));
