import JSZip from 'jszip';
import './style.css';

const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const levelInput = $('level');
const fileList = $('fileList');
const queueSection = $('queueSection');
const optimizeButton = $('optimizeButton');
const downloadZipButton = $('downloadZipButton');
const status = $('status');
const summary = $('summary');

let items = [];
let busy = false;
let nextId = 1;
let worker;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; value >= 1024 && i < units.length; i++) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

function optimizeBuffer(buffer, level, id) {
  return new Promise((resolve, reject) => {
    const currentWorker = getWorker();
    const onMessage = (event) => {
      if (event.data.id !== id) return;
      currentWorker.removeEventListener('message', onMessage);
      if (event.data.ok) resolve(new Uint8Array(event.data.buffer));
      else reject(new Error(event.data.error));
    };
    currentWorker.addEventListener('message', onMessage);
    currentWorker.postMessage({ id, buffer, level }, [buffer]);
  });
}

function render() {
  queueSection.classList.toggle('hidden', items.length === 0);
  $('fileCount').textContent = `${items.length} file${items.length === 1 ? '' : 's'}`;
  optimizeButton.disabled = busy || items.length === 0 || items.every((item) => item.output);
  optimizeButton.innerHTML = busy
    ? '<span class="spinner"></span> Optimizing…'
    : '<span class="button-icon">✦</span> Optimize PNGs';
  downloadZipButton.disabled = busy || !items.some((item) => item.output);
  $('clearButton').disabled = busy;
  fileList.innerHTML = items.map((item) => {
    const result = item.output
      ? `<span class="file-result ${item.saved > 0 ? 'positive' : 'neutral'}">${item.saved > 0 ? `−${formatBytes(item.saved)}` : 'Already optimal'}</span><button class="download-one" data-download="${item.id}" type="button">Download</button>`
      : item.error
        ? `<span class="file-error">${escapeHtml(item.error)}</span>`
        : item.progress
          ? '<span class="file-progress"><span class="mini-spinner"></span> Optimizing</span>'
          : `<span class="file-size">${formatBytes(item.file.size)}</span>`;
    const preview = item.url
      ? `<img src="${item.url}" alt="" />`
      : '<span class="file-placeholder">PNG</span>';
    return `<div class="file-item">
      <div class="file-preview">${preview}</div>
      <div class="file-info"><div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div><div class="file-meta">${formatBytes(item.file.size)}${item.output ? ` <span>→</span> ${formatBytes(item.output.size)}` : ''}</div></div>
      <div class="file-right">${result}</div>
      <button class="remove-button" data-remove="${item.id}" type="button" aria-label="Remove ${escapeHtml(item.file.name)}" ${busy ? 'disabled' : ''}>×</button>
    </div>`;
  }).join('');
  fileList.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', () => removeItem(Number(button.dataset.remove)));
  });
  fileList.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = items.find((entry) => entry.id === Number(button.dataset.download));
      if (item) downloadOne(item);
    });
  });
  updateSummary();
}

function updateSummary() {
  const complete = items.filter((item) => item.output);
  if (!complete.length) {
    summary.classList.add('hidden');
    return;
  }
  summary.classList.remove('hidden');
  const original = complete.reduce((sum, item) => sum + item.file.size, 0);
  const final = complete.reduce((sum, item) => sum + item.output.size, 0);
  const saved = original - final;
  $('savedValue').textContent = saved > 0 ? formatBytes(saved) : '0 B';
  $('savedCaption').textContent = original > 0 ? `${Math.max(0, saved / original * 100).toFixed(1)}% smaller` : 'No size change';
  $('originalValue').textContent = formatBytes(original);
  $('finalValue').textContent = formatBytes(final);
}

function addFiles(fileCollection) {
  const incoming = Array.from(fileCollection);
  let added = 0;
  for (const file of incoming) {
    if (!file.name.toLowerCase().endsWith('.png') && file.type !== 'image/png') continue;
    if (items.some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    items.push({
      id: nextId++,
      file,
      url: URL.createObjectURL(file),
      output: null,
      saved: 0,
      progress: false,
      error: ''
    });
    added++;
  }
  if (incoming.length && !added) setStatus('No new PNG files were added. Check the file type or duplicates.', 'warning');
  else if (added) setStatus(`${added} PNG file${added === 1 ? '' : 's'} added. Ready when you are.`, 'success');
  render();
}

function removeItem(id) {
  const item = items.find((entry) => entry.id === id);
  if (item?.url) URL.revokeObjectURL(item.url);
  items = items.filter((entry) => entry.id !== id);
  render();
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status ${kind}`;
}

function isPng(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const bytes = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  return bytes.length === 8 && signature.every((value, index) => bytes[index] === value);
}

async function optimizeAll() {
  if (busy || !items.length) return;
  busy = true;
  summary.classList.add('hidden');
  const level = Number(levelInput.value);
  const pending = items.filter((item) => !item.output);
  setStatus(`Preparing ${pending.length} file${pending.length === 1 ? '' : 's'}…`);
  render();

  let completed = 0;
  for (const item of pending) {
    item.progress = true;
    item.error = '';
    render();
    setStatus(`Optimizing ${item.file.name} (${completed + 1} of ${pending.length})…`);
    try {
      const input = await item.file.arrayBuffer();
      if (!isPng(input)) throw new Error('This file is not a valid PNG.');
      // Transfer a copy: the original File remains available for comparison/download.
      const optimized = await optimizeBuffer(input, level, item.id);
      const blob = new Blob([optimized], { type: 'image/png' });
      // Keep the original when Oxipng cannot make the file smaller.
      item.output = blob.size < item.file.size ? blob : item.file;
      item.saved = Math.max(0, item.file.size - item.output.size);
    } catch (error) {
      item.error = error?.message || 'Optimization failed';
    } finally {
      item.progress = false;
      completed++;
      render();
    }
  }

  busy = false;
  render();
  const failed = items.filter((item) => item.error).length;
  const saved = items.reduce((sum, item) => sum + (item.output ? item.saved : 0), 0);
  if (failed) setStatus(`Finished with ${failed} file${failed === 1 ? '' : 's'} that could not be optimized.`, 'warning');
  else setStatus(saved > 0 ? `Done! Saved ${formatBytes(saved)} across your PNGs.` : 'Done! These files are already optimally sized at this setting.', 'success');
}

async function downloadZip() {
  const ready = items.filter((item) => item.output);
  if (!ready.length) return;
  downloadZipButton.disabled = true;
  downloadZipButton.textContent = 'Creating ZIP…';
  try {
    const zip = new JSZip();
    const usedNames = new Map();
    for (const item of ready) {
      let name = item.file.name;
      const count = usedNames.get(name) || 0;
      usedNames.set(name, count + 1);
      if (count) {
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}` : `${name}-${count + 1}`;
      }
      zip.file(name, item.output);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oxipng-optimized.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus(`ZIP created with ${ready.length} optimized PNG${ready.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    setStatus(`Could not create ZIP: ${error.message}`, 'warning');
  } finally {
    downloadZipButton.textContent = 'Download all (.zip)';
    render();
  }
}

function downloadOne(item) {
  if (!item.output) return;
  const url = URL.createObjectURL(item.output);
  const link = document.createElement('a');
  link.href = url;
  link.download = item.file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  fileInput.value = '';
});
for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
}
dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
optimizeButton.addEventListener('click', optimizeAll);
downloadZipButton.addEventListener('click', downloadZip);
$('clearButton').addEventListener('click', () => {
  if (busy) return;
  items.forEach((item) => item.url && URL.revokeObjectURL(item.url));
  items = [];
  summary.classList.add('hidden');
  setStatus('Choose PNG files to begin.');
  render();
});

render();