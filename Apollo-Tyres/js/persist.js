/**
 * Persist a protocol draft and (optionally) one or more Tydex files.
 * Call this RIGHT AFTER you've computed the matrix and built the notepad text(s).
 *
 * @param {number|string} projectId
 * @param {string} protocol - one of 'MF6.2','MF5.2','FTire','CDTire','Custom'
 * @param {object} inputsObject - raw inputs (form values you used to compute)
 * @param {object|null} matrixObject - computed matrix (null if not applicable)
 * @param {Array<{filename:string, content:string}>} tydexFiles
 */
async function persistDraftAndTydex(projectId, protocol, inputsObject, matrixObject, tydexFiles) {
  // 1) Save/Update Draft
  await fetch('/api/drafts', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      projectId,
      protocol,
      inputs: inputsObject,
      matrix: matrixObject || null
    })
  });

  // 2) Save all Tydex text files (if any)
  if (Array.isArray(tydexFiles)) {
    for (const f of tydexFiles) {
      if (!f || !f.filename || !f.content) continue;
      await fetch('/api/tydex', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          projectId,
          protocol,
          filename: f.filename,
          content: f.content
        })
      });
    }
  }
}

// Small helper to pull projectId from URL if you need it client-side
function getProjectIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('projectId');
}

// Export to window so protocol pages can call it
window.persistDraftAndTydex = persistDraftAndTydex;
window.getProjectIdFromURL  = getProjectIdFromURL;
