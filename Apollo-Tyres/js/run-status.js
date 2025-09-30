// minimal SSE client to update per-row progress and a top status bar
(function(){
  if (!window.EventSource) return;
  const es = new EventSource('/events');
  es.addEventListener('run-status', (ev) => {
    try {
      const payload = JSON.parse(ev.data); // { run, status, progress, message }
      const badge = document.querySelector(`.queue-badge[data-run="${payload.run}"]`);
      const row = document.querySelector(`tr:has(button[data-run="${payload.run}"])`);
      if (badge) {
        if (payload.status === 'running') { badge.className = 'queue-badge running'; badge.textContent = Math.max(1, Math.round(payload.progress)) + '%'; }
        else if (payload.status === 'progress') { badge.className = 'queue-badge running'; badge.textContent = Math.round(payload.progress) + '%'; }
        else if (payload.status === 'done') { badge.className = 'queue-badge done'; badge.textContent = 'OK'; }
        else if (payload.status === 'failed') { badge.className = 'queue-badge failed'; badge.textContent = 'ERR'; }
      }
      // update per-row progress bar inside row (create if missing)
      if (row) {
        let pb = row.querySelector('.row-progress');
        if (!pb) {
          pb = document.createElement('div');
          pb.className = 'row-progress';
          pb.innerHTML = '<div class="row-progress-bar" style="width:0%"></div>';
          const statusCell = row.querySelector('.status-cell') || row.lastElementChild;
          statusCell.appendChild(pb);
        }
        const bar = pb.querySelector('.row-progress-bar');
        bar.style.width = (payload.progress || 0) + '%';
        bar.setAttribute('aria-valuenow', Math.round(payload.progress || 0));
      }
    } catch (e) { console.warn('bad run-status payload', e); }
  });
  es.addEventListener('error', ()=>{ /* handle reconnects, show offline indicator */ });
})();