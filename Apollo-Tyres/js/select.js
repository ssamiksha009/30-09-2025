// public/js/select.js

document.getElementById('logoutBtn').addEventListener('click', function () {
  window.location.href = '/login.html';
});

/* ---------------- helpers ---------------- */

function visibleDataTable() {
  return document.querySelector('.data-table:not([style*="display: none"])');
}

// protocol key for server scratch-table helpers: 'mf62' | 'mf52' | 'ftire' | 'cdtire' | 'custom'
function getVisibleProtocolKey() {
  const t = visibleDataTable();
  if (!t) return null;
  return t.id.replace('Table', ''); // e.g. mf62Table -> 'mf62'
}

// protocol name for TYDEX generator: 'MF6pt2' | 'MF5pt2' | 'FTire' | 'CDTire' | 'Custom'
function getProtocolFromCurrentTable() {
  const t = visibleDataTable();
  if (!t) return 'Unknown';
  switch (t.id) {
    case 'mf62Table': return 'MF6pt2';
    case 'mf52Table': return 'MF5pt2';
    case 'ftireTable': return 'FTire';
    case 'cdtireTable': return 'CDTire';
    case 'customTable': return 'Custom';
    default: return 'Unknown';
  }
}

// Resolve project id from URL, session, or by asking server (fallback)
async function findProjectId() {
  // a) URL
  const qs = new URLSearchParams(location.search);
  let id = qs.get('projectId');
  if (id) return id;

  // b) session
  id = sessionStorage.getItem('currentProjectId');
  if (id) return id;

  // c) server lookup by project name (last resort)
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) return null;

  const r = await fetch('/api/check-project-exists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectName })
  });
  const j = await r.json();
  if (j && j.success && j.exists && j.project && j.project.id) {
    sessionStorage.setItem('currentProjectId', String(j.project.id));
    return String(j.project.id);
  }
  return null;
}

/* ---------------- status indicators ---------------- */

async function updateStatusIndicators() {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) return;

  const protocolKey = getVisibleProtocolKey(); // 'mf62' | 'mf52' | ...
  if (!protocolKey) return;

  const rows = document.querySelectorAll('tbody tr');
  rows.forEach(async (row) => {
    const runNumberCell = row.cells && row.cells[0];
    if (!runNumberCell) return;

    const runNumber = runNumberCell.textContent;
    const statusCell = row.querySelector('.status-indicator');
    const runButton = row.querySelector(`.row-run-btn[data-run="${runNumber}"]`);
    const tydexButton = row.querySelector(`.tydex-btn[data-run="${runNumber}"]`);

    try {
      // Get row data to find the folder and job name
      const rowDataResponse = await fetch(`/api/get-row-data?protocol=${protocolKey}&runNumber=${runNumber}`);
      if (!rowDataResponse.ok) return;

      const rowDataResult = await rowDataResponse.json();
      const { p, l, job, tydex_name } = rowDataResult.data;
      const folderName = `${p}_${l}`;

      // Check if the job's ODB file exists
      const odbResponse = await fetch(`/api/check-odb-file?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocolKey)}&folderName=${encodeURIComponent(folderName)}&jobName=${encodeURIComponent(job)}`);
      const odbResult = await odbResponse.json();

      if (odbResult.exists) {
        statusCell.textContent = 'Completed ✓';
        statusCell.style.color = '#28a745';
        if (runButton) runButton.style.display = 'none';
        if (tydexButton) {
          tydexButton.style.display = 'inline-block';

          // Check if TYDEX file already exists
          if (tydex_name && tydex_name.trim() !== '') {
            const tydexResponse = await fetch(`/api/check-tydex-file?projectName=${encodeURIComponent(projectName)}&protocol=${encodeURIComponent(protocolKey)}&folderName=${encodeURIComponent(folderName)}&tydexName=${encodeURIComponent(tydex_name)}`);
            const tydexResult = await tydexResponse.json();

            if (tydexResult.exists) {
              // Show "Open File"
              tydexButton.textContent = 'Open File';
              tydexButton.style.backgroundColor = '#228496';
              tydexButton.classList.add('open-file');
              tydexButton.onclick = function () { openTydexFile(runNumber); };
            } else {
              // Show "Generate Tydex"
              tydexButton.textContent = 'Generate Tydex';
              tydexButton.style.backgroundColor = '#28a745';
              tydexButton.classList.remove('open-file');
              tydexButton.onclick = function () { generateTydex(runNumber); };
            }
          }
        }
      } else {
        statusCell.textContent = 'Not started ✕';
        statusCell.style.color = '#dc3545';
        if (runButton) runButton.style.display = 'inline-block';
        if (tydexButton) tydexButton.style.display = 'none';
      }
    } catch (error) {
      console.error('Error checking status for run', runNumber, error);
      statusCell.textContent = 'Error checking status ✕';
      statusCell.style.color = '#dc3545';
      if (runButton) runButton.style.display = 'inline-block';
      if (tydexButton) tydexButton.style.display = 'none';
    }
  });
}

/* ---------------- page load ---------------- */

document.addEventListener('DOMContentLoaded', function () {
  const referer = document.referrer || '';
  const mf62Table = document.getElementById('mf62Table');
  const mf52Table = document.getElementById('mf52Table');
  const ftireTable = document.getElementById('ftireTable');
  const cdtireTable = document.getElementById('cdtireTable');
  const customTable = document.getElementById('customTable');
  let fetchEndpoint;

  // ---- ARCHIVED MODE: open a completed project by id ----
  const qs = new URLSearchParams(location.search);
  const archivedProjectId = qs.get('projectId');

  if (archivedProjectId) {
    (async () => {
      try {
        // 1) Load project meta and stash name/id for status/TYDEX helpers
        const metaRes = await fetch(`/api/projects/${encodeURIComponent(archivedProjectId)}`);
        const meta = await metaRes.json();
        const ARCHIVED_PROJECT = meta.project; // keep for later (inputs, protocol, etc.)

        if (!meta.success || !meta.project) throw new Error('Project not found');

        const { id, project_name, protocol: archivedProtocolName } = meta.project;
        sessionStorage.setItem('currentProject', project_name);
        sessionStorage.setItem('currentProjectId', String(id));

        // Immediately set protocol title so UI does not look empty even if archived rows fail to load
        const titleEl = document.getElementById('protocol-title');
        if (titleEl) {
          const nice = (archivedProtocolName || '').toString();
          // keep previous friendly labels
          if (/mf6/i.test(nice)) titleEl.textContent = 'MF 6.2 Protocol';
          else if (/mf5/i.test(nice)) titleEl.textContent = 'MF 5.2 Protocol';
          else if (/ftire/i.test(nice)) titleEl.textContent = 'FTire Protocol';
          else if (/cdtire/i.test(nice)) titleEl.textContent = 'CDTire Protocol';
          else if (/custom/i.test(nice)) titleEl.textContent = 'Custom Protocol';
          else titleEl.textContent = nice || 'Protocol';
        }

        // 2) Try to load archived rows if API exists. If it fails, show friendly message but keep the page usable.
        let rows = [];
        try {
          const dataRes = await fetch(`/api/projects/${encodeURIComponent(archivedProjectId)}/data`);
          if (!dataRes.ok) throw new Error(`Archive rows not available (HTTP ${dataRes.status})`);
          const dataJson = await dataRes.json();
          if (!dataJson.success) throw new Error('Failed to load archived data');
          rows = dataJson.rows || [];
        } catch (archiveErr) {
          console.warn('Archived rows not loaded:', archiveErr);
          // show a non-blocking notice in the container
          const container = document.getElementById('data-container');
          if (container) {
            const notice = document.createElement('div');
            notice.className = 'error-message';
            notice.style.textAlign = 'center';
            notice.style.padding = '18px';
            notice.textContent = 'Archived rows are not available for this project. Status and run-times (if recorded) will still be shown below.';
            container.insertBefore(notice, container.firstChild);
          }
        }

        // 3) Hide all tables first
        mf62Table.style.display = 'none';
        mf52Table.style.display = 'none';
        ftireTable.style.display = 'none';
        cdtireTable.style.display = 'none';
        customTable.style.display = 'none';

        const show = (el, title, fn) => {
          el.style.display = 'table';
          if (titleEl) titleEl.textContent = title;
          if (typeof fn === 'function' && rows.length) fn(rows);
        };

        // show table matching archived protocol (if we know it)
        switch (archivedProtocolName) {
          case 'MF62': show(mf62Table, 'MF 6.2 Protocol', displayMF62Data); break;
          case 'MF52': show(mf52Table, 'MF 5.2 Protocol', displayMF52Data); break;
          case 'FTire': show(ftireTable, 'FTire Protocol', displayFTireData); break;
          case 'CDTire': show(cdtireTable, 'CDTire Protocol', displayCDTireData); break;
          case 'Custom': show(customTable, 'Custom Protocol', displayCustomData); break;
          default:
            // If protocol is unknown, default to MF62 table to keep UI usable.
            mf62Table.style.display = 'table';
            break;
        }

        // 4) Read-only UI for archived view: hide run controls and mark-in-progress
        document.querySelectorAll('.run-button-cell, .row-run-btn').forEach(n => { n.style.display = 'none'; });
        ['completeProjectBtn', 'runAllBtn', 'markInProgressBtn'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });

        // 5) Insert archived-only toolbar (Back / Export CSV / View Inputs)
        initArchivedToolbar({
          projectId: id,
          projectName: project_name,
          protocol: archivedProtocolName,
          rows
        });

        // 6) Keep TYDEX buttons and status checks running as normal (they will tolerate missing rows)
        updateStatusIndicators();
      } catch (e) {
        console.error('Archived view error:', e);
        const container = document.getElementById('data-container');
        if (container) {
          container.innerHTML =
            `<p class="error-message">Failed to load completed project: ${e.message}</p>`;
        }
      }
    })();

    // IMPORTANT: stop here so the old referer-based code doesn’t run
    return;
  }
  // ---- END ARCHIVED MODE ----

  // Hide all tables first
  mf62Table.style.display = 'none';
  mf52Table.style.display = 'none';
  ftireTable.style.display = 'none';
  cdtireTable.style.display = 'none';
  customTable.style.display = 'none';

  // Show appropriate table and set endpoint
  if (referer.includes('mf52.html')) {
    fetchEndpoint = '/api/get-mf52-data';
    mf52Table.style.display = 'table';
  } else if (referer.includes('mf.html')) {
    fetchEndpoint = '/api/get-mf-data';
    mf62Table.style.display = 'table';
  } else if (referer.includes('ftire.html')) {
    fetchEndpoint = '/api/get-ftire-data';
    ftireTable.style.display = 'table';
  } else if (referer.includes('cdtire.html')) {
    fetchEndpoint = '/api/get-cdtire-data';
    cdtireTable.style.display = 'table';
  } else if (referer.includes('custom.html')) {
    fetchEndpoint = '/api/get-custom-data';
    customTable.style.display = 'table';
  } else {
    document.getElementById('data-container').innerHTML =
      '<p class="error-message">Please select a protocol first</p>';
    return;
  }

  // Set protocol title based on referer
  const protocolTitle = document.getElementById('protocol-title');
  if (referer.includes('mf52.html')) {
    protocolTitle.textContent = 'MF 5.2 Protocol';
  } else if (referer.includes('mf.html')) {
    protocolTitle.textContent = 'MF 6.2 Protocol';
  } else if (referer.includes('ftire.html')) {
    protocolTitle.textContent = 'FTire Protocol';
  } else if (referer.includes('cdtire.html')) {
    protocolTitle.textContent = 'CDTire Protocol';
  } else if (referer.includes('custom.html')) {
    protocolTitle.textContent = 'Custom Protocol';
  }

  // Fetch and display appropriate data (scratch mode)
  fetch(fetchEndpoint)
    .then(response => response.json())
    .then(data => {
      if (referer.includes('mf52.html')) {
        displayMF52Data(data);
      } else if (referer.includes('mf.html')) {
        displayMF62Data(data);
      } else if (referer.includes('ftire.html')) {
        displayFTireData(data);
      } else if (referer.includes('cdtire.html')) {
        displayCDTireData(data);
      } else if (referer.includes('custom.html')) {
        displayCustomData(data);
      }
      updateStatusIndicators();
    })
    .catch(error => {
      console.error('Error:', error);
      document.getElementById('data-container').innerHTML =
        '<p class="error-message">Error loading data</p>';
    });
});

/* ---------------- visibility ---------------- */

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    updateStatusIndicators();
  }
});

/* ---------------- table renderers ---------------- */

function createRunButton(runNumber) {
  // Initially create all buttons but hidden
  return `<button class="row-run-btn" data-run="${runNumber}" style="display: none">Run</button>`;
}

function createTydexButton(runNumber) {
  return `<button class="tydex-btn" data-run="${runNumber}" style="display: none">Generate Tydex</button>`;
}

function displayMF62Data(data) {
  const tableBody = document.getElementById('mf62TableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.ips}</td>
      <td>${row.loads}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.slip_angle}</td>
      <td>${row.slip_ratio}</td>
      <td>${row.test_velocity}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      runSingleAnalysis(runNumber);
    });
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayMF52Data(data) {
  const tableBody = document.getElementById('mf52TableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.loads}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.slip_angle}</td>
      <td>${row.slip_ratio}</td>
      <td>${row.test_velocity}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      runSingleAnalysis(runNumber);
    });
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayFTireData(data) {
  const tableBody = document.getElementById('ftireTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.loads}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.test_velocity}</td>
      <td>${row.longitudinal_slip}</td>
      <td>${row.slip_angle}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.cleat_orientation}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      runSingleAnalysis(runNumber);
    });
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayCDTireData(data) {
  const tableBody = document.getElementById('cdtireTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.test_name && row.test_name.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.test_name}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.velocity}</td>
      <td>${row.preload}</td>
      <td>${row.camber}</td>
      <td>${row.slip_angle}</td>
      <td>${row.displacement}</td>
      <td>${row.slip_range}</td>
      <td>${row.cleat}</td>
      <td>${row.road_surface}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      runSingleAnalysis(runNumber);
    });
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

function displayCustomData(data) {
  const tableBody = document.getElementById('customTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  const filteredData = data.filter(row => row.tests && row.tests.trim() !== '');
  filteredData.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.number_of_runs}</td>
      <td>${row.tests}</td>
      <td>${row.inflation_pressure}</td>
      <td>${row.loads}</td>
      <td>${row.inclination_angle}</td>
      <td>${row.slip_angle}</td>
      <td>${row.slip_ratio}</td>
      <td>${row.test_velocity}</td>
      <td>${row.cleat_orientation}</td>
      <td>${row.displacement}</td>
      <td class="status-cell"><span class="status-indicator">Not started ✕</span></td>
      <td class="run-button-cell">${createRunButton(row.number_of_runs)}</td>
      <td class="tidex-button-cell">${createTydexButton(row.number_of_runs)}</td>
    `;
    tableBody.appendChild(tr);
  });

  document.querySelectorAll('.row-run-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      runSingleAnalysis(runNumber);
    });
  });

  document.querySelectorAll('.tydex-btn').forEach(button => {
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      const runNumber = this.getAttribute('data-run');
      generateTydex(runNumber);
    });
  });
}

/* ---------------- run, tydex, open ---------------- */

async function runSingleAnalysis(runNumber) {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) {
    window.location.href = '/index.html';
    return;
  }

  const protocolKey = getVisibleProtocolKey();

  const row = document.querySelector(`tr:has(button[data-run="${runNumber}"])`);
  const statusCell = row.querySelector('.status-indicator');
  const runButton = row.querySelector('.row-run-btn');
  const tydexButton = row.querySelector('.tydex-btn');

  // fetch job + dependency
  let jobName = '';
  let oldJobName = '';
  try {
    const rowDataResponse = await fetch(`/api/get-row-data?protocol=${protocolKey}&runNumber=${runNumber}`);
    if (rowDataResponse.ok) {
      const rowDataResult = await rowDataResponse.json();
      jobName = rowDataResult.data?.job || '';
      oldJobName = rowDataResult.data?.old_job || '';
    }
  } catch (_) {}

  // status msg
  let jobDisplay = jobName ? jobName : '';
  if (oldJobName && oldJobName !== '-' && oldJobName !== jobName) {
    jobDisplay = `${oldJobName} (dependency)`;
  }
  statusCell.textContent = jobDisplay ? `Processing: ${jobDisplay} ⌛` : 'Processing... ⌛';
  statusCell.style.color = '#ffc107';
  runButton.disabled = true;

  try {
    const response = await fetch('/api/resolve-job-dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, protocol: protocolKey, runNumber })
    });

    if (!response.ok) {
      const errorResult = await response.json();
      throw new Error(errorResult.message || 'Failed to resolve dependencies');
    }

    const result = await response.json();

    if (result.success) {
      statusCell.textContent = 'Completed ✓';
      statusCell.style.color = '#28a745';
      runButton.style.display = 'none';
      if (tydexButton) tydexButton.style.display = 'inline-block';
    } else {
      throw new Error(result.message || 'Job execution failed');
    }

  } catch (error) {
    console.error('Error during job execution:', error);
    statusCell.textContent = 'Error ⚠️';
    statusCell.style.color = '#dc3545';
    runButton.disabled = false;
    alert('Error during job execution: ' + error.message);
  }
}

async function generateTydex(runNumber) {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { window.location.href = '/index.html'; return; }

  const protocolKey = getVisibleProtocolKey();

  const row = document.querySelector(`tr:has(button[data-run="${runNumber}"])`);
  const tydexButton = row.querySelector('.tydex-btn');

  try {
    const rowDataResponse = await fetch(`/api/get-row-data?protocol=${protocolKey}&runNumber=${runNumber}`);
    if (!rowDataResponse.ok) throw new Error('Failed to get row data');

    const rowDataResult = await rowDataResponse.json();
    const rowData = rowDataResult.data;

    if (!rowData.template_tydex || rowData.template_tydex.trim() === '') {
      throw new Error('No template_tydex found for this row');
    }

    tydexButton.disabled = true;
    tydexButton.textContent = 'Generating...';

    const response = await fetch('/api/generate-tydex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: getProtocolFromCurrentTable(),
        projectName: projectName,
        rowData: rowData
      })
    });

    const result = await response.json();

    if (result.success) {
      tydexButton.textContent = 'Open File';
      tydexButton.style.backgroundColor = '#228496';
      tydexButton.classList.add('open-file');
      tydexButton.disabled = false;
      tydexButton.onclick = function () { openTydexFile(runNumber); };
    } else {
      throw new Error(result.message || 'Failed to generate TYDEX file');
    }

  } catch (error) {
    console.error('Error generating Tydex:', error);
    tydexButton.disabled = false;
    tydexButton.textContent = 'Generate Tydex';
    alert('Error generating Tydex: ' + error.message);
  }
}

async function openTydexFile(runNumber) {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { window.location.href = '/index.html'; return; }

  const protocolKey = getVisibleProtocolKey();

  try {
    const rowDataResponse = await fetch(`/api/get-row-data?protocol=${protocolKey}&runNumber=${runNumber}`);
    if (!rowDataResponse.ok) throw new Error('Failed to get row data');
    const rowDataResult = await rowDataResponse.json();
    const { p, l, tydex_name } = rowDataResult.data;

    const response = await fetch('/api/open-tydex-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: getProtocolFromCurrentTable(),
        projectName: projectName,
        p, l,
        tydex_name
      })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Failed to open TYDEX file');

  } catch (error) {
    console.error('Error opening Tydex file:', error);
    alert('Error opening Tydex file: ' + error.message);
  }
}

/* Optional global generator (kept from your code) */
document.addEventListener('click', function (e) {
  if (e.target && e.target.classList.contains('tydex-btn')) {
    const button = e.target;
    if (button.classList.contains('open-file')) return; // already wired to open
    const row = button.closest('tr');
    const protocol = getProtocolFromCurrentTable();
    const projectName = sessionStorage.getItem('currentProject') || 'DefaultProject';

    const rowData = extractRowData(row, protocol);
    if (!rowData) { alert('Unable to extract row data'); return; }

    button.disabled = true;
    button.textContent = 'Generating...';

    generateTydexFile(protocol, projectName, rowData)
      .then(result => {
        if (result.success) {
          button.textContent = 'Generated';
          button.style.backgroundColor = '#6c757d';
          alert('TYDEX file generated successfully!');
        } else {
          throw new Error(result.message || 'Failed to generate TYDEX file');
        }
      })
      .catch(error => {
        console.error('Error generating TYDEX:', error);
        button.disabled = false;
        button.textContent = 'Generate Tydex';
        alert('Error generating TYDEX file: ' + error.message);
      });
  }
});

function extractRowData(row, protocol) {
  const cells = row.querySelectorAll('td');
  if (cells.length === 0) return null;

  const data = { protocol, tydex_name: '', p: '', l: '' };

  switch (protocol) {
    case 'MF6pt2':
    case 'MF5pt2':
      data.tydex_name = cells[10]?.textContent.trim() || '';
      data.p = cells[11]?.textContent.trim() || '';
      data.l = cells[12]?.textContent.trim() || '';
      break;
    case 'FTire':
      data.tydex_name = cells[11]?.textContent.trim() || '';
      data.p = cells[12]?.textContent.trim() || '';
      data.l = cells[13]?.textContent.trim() || '';
      break;
    case 'CDTire':
      data.tydex_name = cells[13]?.textContent.trim() || '';
      data.p = cells[14]?.textContent.trim() || '';
      data.l = cells[15]?.textContent.trim() || '';
      break;
    case 'Custom':
      data.tydex_name = cells[12]?.textContent.trim() || '';
      data.p = cells[13]?.textContent.trim() || '';
      data.l = cells[14]?.textContent.trim() || '';
      break;
  }
  return data;
}

function generateTydexFile(protocol, projectName, rowData) {
  return fetch('/api/generate-tydex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocol, projectName, rowData })
  }).then(r => r.json());
}

/* ---------------- Complete / In-Progress ---------------- */

// Complete: archive + mark completed
document.getElementById('completeProjectBtn').addEventListener('click', async function () {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { alert('No project selected'); return; }

  if (!confirm('Archive current test matrix and mark this project Completed?')) return;

  try {
    const projectId = await findProjectId();
    if (!projectId) {
      alert('Missing project id – open this page via History or save the project first.');
      return;
    }

    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/complete`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    alert('Archived and marked Completed!');
    window.location.href = '/history.html';
  } catch (err) {
    console.error('Complete error:', err);
    alert(`Failed to complete project: ${err.message}`);
  }
});

// In Progress
document.getElementById('markInProgressBtn').addEventListener('click', async function () {
  const projectName = sessionStorage.getItem('currentProject');
  if (!projectName) { alert('No project selected'); return; }

  if (!confirm('Mark this project as In Progress?')) return;

  try {
    const res = await fetch('/api/mark-project-in-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Failed to update project status');
    window.location.href = '/history.html';
  } catch (err) {
    console.error(err);
    alert('Failed to mark project as In Progress: ' + (err.message || err));
  }
});

/* ---------------- archived loader (utility if needed) ---------------- */

async function loadCompletedProject(projectId) {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/data`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Failed to load archived data: ' + (err.message || res.statusText));
      return;
    }
    const j = await res.json();
    if (!j.success) { alert('Failed to load archived data'); return; }
    const { protocol, rows } = j;

    if (protocol === 'MF62') displayMF62Data(rows);
    else if (protocol === 'MF52') displayMF52Data(rows);
    else if (protocol === 'FTire') displayFTireData(rows);
    else if (protocol === 'CDTire') displayCDTireData(rows);
    else displayCustomData(rows);

    updateStatusIndicators();
  } catch (error) {
    console.error('loadCompletedProject error', error);
    alert('Error loading archived project: ' + (error.message || error));
  }
}

function initArchivedToolbar({ projectId, projectName, protocol, rows }) {
  injectArchivedStyles();

  let bar = document.getElementById('archivedToolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'archivedToolbar';
    bar.className = 'archived-toolbar';

    // Place right under the main header if it exists, else at top of body
    const header = document.querySelector('.main-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(bar, header.nextSibling);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  bar.innerHTML = `
    <div class="archived-toolbar-inner">
      <button id="backToHistoryBtn" class="btn-secondary">← Back to History</button>
      <div class="archived-spacer"></div>
      <button id="exportCsvBtn" class="btn-secondary">Export CSV</button>
      <button id="showInputsBtn" class="btn-secondary">View Inputs</button>
    </div>
  `;

  document.getElementById('backToHistoryBtn').onclick = () => {
    window.location.href = '/history.html';
  };

  document.getElementById('exportCsvBtn').onclick = () => {
    exportRowsToCSV(rows, protocol, projectName);
  };

  document.getElementById('showInputsBtn').onclick = () => {
    showInputsModal(projectId);
  };
}

function injectArchivedStyles() {
  if (document.getElementById('archivedToolbarStyles')) return;
  const s = document.createElement('style');
  s.id = 'archivedToolbarStyles';
  s.textContent = `
    /* toolbar surface */
    .archived-toolbar {
      background: linear-gradient(180deg, #fbf6fc 0%, #fff8f2 40%, #f9f4ef 100%);
      border-bottom: 1px solid rgba(88,44,124,0.06);
      box-shadow: 0 6px 18px rgba(88,44,124,0.03);
    }
    .archived-toolbar-inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 12px 18px;
      display:flex;
      align-items:center;
      gap:12px;
    }
    .archived-spacer { flex: 1; }

    /* base button style (fallback) */
    .btn-secondary {
      appearance: none;
      border: 1px solid rgba(88,44,124,0.08);
      background: linear-gradient(180deg,#ffffff 0%,#fbf8fd 100%);
      color: #2d2140;
      padding: 9px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: 0.2px;
      transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
      box-shadow: 0 4px 10px rgba(30,30,30,0.04);
    }

    /* Back button — purple theme */
    #backToHistoryBtn, #backToHistoryBtn.btn-secondary {
      border: 1px solid rgba(88,44,124,0.16);
      background: linear-gradient(135deg,#6b3a9b 0%, #582C7C 55%, #4a2264 100%);
      color: #fff;
      box-shadow: 0 8px 20px rgba(88,44,124,0.12);
    }
    #backToHistoryBtn:hover {
      background: linear-gradient(135deg,#7a49ad 0%, #65358e 55%, #5a2e7a 100%);
      transform: translateY(-2px);
    }

    /* Export CSV — orange accent */
    #exportCsvBtn, #exportCsvBtn.btn-secondary {
      border: 1px solid rgba(217,111,58,0.18);
      background: linear-gradient(135deg,#f6a25d 0%, #e07a3c 55%, #d96f3a 100%);
      color: #23120a;
      box-shadow: 0 8px 20px rgba(217,111,58,0.10);
    }
    #exportCsvBtn:hover {
      background: linear-gradient(135deg,#ffb46f 0%, #f08a4a 55%, #e27631 100%);
      transform: translateY(-2px);
    }

    /* View Inputs — teal/cyan accent */
    #showInputsBtn, #showInputsBtn.btn-secondary {
      border: 1px solid rgba(34,132,150,0.12);
      background: linear-gradient(135deg,#26a5a5 0%, #228496 60%, #1b6b75 100%);
      color: #fff;
      box-shadow: 0 8px 20px rgba(34,132,150,0.08);
    }
    #showInputsBtn:hover {
      background: linear-gradient(135deg,#34b4b4 0%, #2b9aa0 60%, #1f7580 100%);
      transform: translateY(-2px);
    }

    /* focus & accessibility */
    .btn-secondary:focus, #backToHistoryBtn:focus, #exportCsvBtn:focus, #showInputsBtn:focus {
      outline: none;
      box-shadow: 0 0 0 4px rgba(88,44,124,0.07);
    }

    /* modal and inputs panel */
    .inputs-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:9999;
    }
    .inputs-modal {
      background:#fff;
      width:min(880px, 94vw);
      max-height: 84vh;
      border-radius:14px;
      overflow:hidden;
      box-shadow:0 18px 50px rgba(30,30,30,0.18);
      display:flex;
      flex-direction:column;
      border: 1px solid rgba(88,44,124,0.04);
    }
    .inputs-modal header {
      padding:14px 18px;
      border-bottom:1px solid rgba(88,44,124,0.06);
      display:flex;
      justify-content:space-between;
      align-items:center;
      background: linear-gradient(90deg, rgba(88,44,124,0.03), rgba(217,111,58,0.02));
    }
    .inputs-modal .body { padding:14px 18px; overflow:auto; background: linear-gradient(180deg,#fff,#fbfbfc); }
    .inputs-modal pre { margin:0; white-space:pre-wrap; word-break:break-word; font-size: 13px; color:#222; }

    /* small responsive tweaks */
    @media (max-width:720px) {
      .archived-toolbar-inner { padding:10px; gap:8px; }
      .btn-secondary { padding:8px 10px; font-size:0.95rem; border-radius:8px; }
    }
  `;
  document.head.appendChild(s);
}

function exportRowsToCSV(rows, protocol, projectName) {
  if (!rows || !rows.length) { alert('No rows to export.'); return; }

  const order = {
    MF62: ['number_of_runs','tests','ips','loads','inclination_angle','slip_angle','slip_ratio','test_velocity','job','old_job','template_tydex','tydex_name','p','l'],
    MF52: ['number_of_runs','tests','inflation_pressure','loads','inclination_angle','slip_angle','slip_ratio','test_velocity','job','old_job','template_tydex','tydex_name','p','l'],
    FTire:['number_of_runs','tests','loads','inflation_pressure','test_velocity','longitudinal_slip','slip_angle','inclination_angle','cleat_orientation','job','old_job','template_tydex','tydex_name','p','l'],
    CDTire:['number_of_runs','test_name','inflation_pressure','velocity','preload','camber','slip_angle','displacement','slip_range','cleat','road_surface','job','old_job','template_tydex','tydex_name','p','l'],
    Custom:['number_of_runs','tests','inflation_pressure','loads','inclination_angle','slip_angle','slip_ratio','test_velocity','cleat_orientation','displacement','job','old_job','template_tydex','tydex_name','p','l']
  }[protocol] || Object.keys(rows[0] || {});

  const quoted = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g,'""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };

  const header = order;
  const data = rows.map(r => order.map(k => quoted(r[k])));

  const csv = [header.map(quoted).join(','), ...data.map(line => line.join(','))].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (projectName || 'project').replace(/[^\w\-]+/g,'_');
  a.download = `${safeName}_${protocol}_archive.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/*
  Enhanced "View Inputs" modal + helpers.
  - showInputsModal(arg) accepts either a projectId (string/number) or an inputs object (or a project object).
  - INPUT_LABELS / INPUT_ORDER control label mapping and display order.
*/
const INPUT_LABELS = {
  l1: 'Load 1 (kg)', l2: 'Load 2 (kg)', l3: 'Load 3 (kg)', l4: 'Load 4 (kg)', l5: 'Load 5 (kg)',
  load1_kg: 'Load 1 (kg)', load2_kg: 'Load 2 (kg)', load3_kg: 'Load 3 (kg)', load4_kg: 'Load 4 (kg)', load5_kg: 'Load 5 (kg)',
  p1: 'Pressure 1 (PSI)', p2: 'Pressure 2 (PSI)', p3: 'Pressure 3 (PSI)',
  pressure1: 'Pressure 1 (PSI)', pressure2: 'Pressure 2 (PSI)', pressure3: 'Pressure 3 (PSI)',
  ia: 'Inclination Angle (deg)', IA: 'Inclination Angle (deg)',
  sa: 'Slip Angle (deg)', SA: 'Slip Angle (deg)',
  sr: 'Slip Ratio (%)', SR: 'Slip Ratio (%)',
  vel: 'Test Velocity (km/h)', speed_kmph: 'Test Velocity (km/h)',
  rimWidth: 'Rim Width (mm)', width: 'Rim Width (mm)',
  rimDiameter: 'Rim Diameter (in)', diameter: 'Rim Diameter (mm)',
  nominalWidth: 'Nominal Width (mm)', nomwidth: 'Nominal Width (mm)',
  outerDiameter: 'Outer Diameter (mm)', Outer_diameter: 'Outer Diameter (mm)',
  aspectRatio: 'Aspect Ratio (%)', aspratio: 'Aspect Ratio (%)'
};

const INPUT_ORDER = [
  'l1','l2','l3','l4','l5',
  'p1','p2','p3',
  'vel','ia','sa','sr',
  'rimWidth','rimDiameter','nominalWidth','outerDiameter',
  'width','diameter','nomwidth','Outer_diameter',
  'aspectRatio','aspratio',
  'load1_kg','load2_kg','load3_kg','load4_kg','load5_kg',
  'pressure1','pressure2','pressure3','speed_kmph','IA','SA','SR'
];

function orderIndex(k) {
  const i = INPUT_ORDER.indexOf(k);
  return i === -1 ? 9999 : i;
}

function renderInputsModal(inputs, protocol) {
  const entries = Object.entries(inputs || {});
  entries.sort((a, b) => orderIndex(a[0]) - orderIndex(b[0]));

  const rowsHtml = entries.map(([key, value]) => {
    const label = INPUT_LABELS[key] || key;
    const val = (value == null) ? '' : String(value);
    return `
      <div class="inputs-row">
        <div class="inputs-label">${escapeHtml(label)}</div>
        <div class="inputs-value">${escapeHtml(val)}</div>
      </div>
    `;
  }).join('') || `<div class="inputs-empty">No inputs saved for this project.</div>`;

  const modal = document.createElement('div');
  modal.className = 'inputs-modal-backdrop';
  modal.innerHTML = `
    <div class="inputs-modal">
      <div class="inputs-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee;background:linear-gradient(90deg, rgba(88,44,124,0.03), rgba(217,111,58,0.02));">
        <div style="font-weight:700">Saved Inputs ${protocol ? `· <span class="inputs-proto">${escapeHtml(protocol)}</span>` : ''}</div>
        <div style="display:flex;gap:8px">
          <button class="inputs-copy btn-secondary" title="Copy JSON">Copy</button>
          <button class="inputs-close btn-secondary" title="Close">Close</button>
        </div>
      </div>
      <div class="inputs-grid" style="padding:14px 16px;max-height:70vh;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${rowsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('.inputs-close');
  const copyBtn = modal.querySelector('.inputs-copy');

  closeBtn.onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(inputs, null, 2));
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 900);
    } catch {
      alert('Copy failed.');
    }
  };
}

/*
  Show inputs helper:
  - If arg is projectId (string/number) -> fetch project and display inputs.
  - If arg is an object (project or inputs) -> render directly.
*/
async function showInputsModal(arg) {
  // If arg is falsy, do nothing
  if (!arg) return;

  // If arg looks like an id (string/number), fetch project
  if (typeof arg === 'string' || typeof arg === 'number') {
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(arg)}`);
      const j = await r.json();
      if (!j.success || !j.project) throw new Error('Project not found');
      let inputs = j.project.inputs || {};
      // inputs might be JSON string
      if (typeof inputs === 'string') {
        try { inputs = JSON.parse(inputs); } catch (_) { /* keep string */ }
      }
      renderInputsModal(inputs, j.project.protocol || '');
    } catch (e) {
      alert('Failed to load inputs: ' + (e.message || e));
    }
    return;
  }

  // If arg is an object — could be { project: {...} } or inputs directly
  let inputs = arg.inputs || arg.project?.inputs || arg;
  let protocol = arg.protocol || arg.project?.protocol || '';
  if (typeof inputs === 'string') {
    try { inputs = JSON.parse(inputs); } catch (_) { /* leave as-is */ }
  }
  renderInputsModal(inputs || {}, protocol || '');
}

// small sanitizer reused by modal
function escapeHtml(unsafe) {
  const s = unsafe == null ? '' : String(unsafe);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
