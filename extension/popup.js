let on = false;
let source = 'agent';
let file = null;
let playing = false;
let duration = 0;
let currentTime = 0;

const modeEl = document.getElementById('mode');
const btn = document.getElementById('toggle');
const srcSel = null;
const fileInput = { style: { display: 'none' } };
const playBtn = { textContent: '', className: '' };
const resetBtn = { };
const vol = document.getElementById('vol');
const progress = document.getElementById('progress');
const errorEl = document.getElementById('error');
const modeDot = document.getElementById('modeDot');
const vizCanvas = document.getElementById('viz');
const ctx = vizCanvas ? vizCanvas.getContext('2d') : null;
let viz = new Array(64).fill(0);
const mon = document.getElementById('mon');
const capStart = document.getElementById('capStart');
const capStop = document.getElementById('capStop');
const capStatus = document.getElementById('capStatus');

function resizeCanvas(){
  if (!vizCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = vizCanvas.clientWidth || vizCanvas.width;
  const cssH = vizCanvas.clientHeight || vizCanvas.height;
  vizCanvas.width = Math.round(cssW * dpr);
  vizCanvas.height = Math.round(cssH * dpr);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
try { window.addEventListener('resize', resizeCanvas); } catch {}
resizeCanvas();

function setError(msg){ if (!msg){ errorEl && (errorEl.style.display='none'); errorEl && (errorEl.textContent=''); } else { errorEl && (errorEl.style.display='block'); errorEl && (errorEl.textContent=msg); } }

function render(){
  if (modeEl) modeEl.textContent = on ? 'on' : 'off';
  btn.textContent = on ? 'Disable' : 'Enable';
  btn.className = on ? 'on' : '';
  modeDot && (modeDot.className = on ? 'dot on' : 'dot');
  fileInput.style.display = (source==='file') ? 'block' : 'none';
  playBtn.textContent = playing ? 'Pause' : 'Play';
  playBtn.className = playing ? 'on' : '';
  // progress removed
  if (ctx && vizCanvas) {
    const w = vizCanvas.clientWidth || vizCanvas.width;
    const h = vizCanvas.clientHeight || vizCanvas.height;
    ctx.clearRect(0,0,w,h);
    // Draw background grid
    ctx.fillStyle = '#0b0c14';
    ctx.fillRect(0,0,w,h);
    const N = viz.length;
    const barW = Math.max(1, Math.floor((w - (N+1)) / N));
    const maxVal = 255;
    const progressX = (duration > 0) ? Math.min(w, Math.max(0, Math.round((currentTime / duration) * w))) : 0;
    for (let i=0;i<N;i++){
      const value = Math.max(0, Math.min(maxVal, viz[i]||0));
      const barH = Math.round((value / maxVal) * (h-4));
      const x = 2 + i*(barW+1);
      const y = h - barH - 2;
      const mid = x + barW/2;
      const isPast = mid <= progressX;
      ctx.fillStyle = isPast ? '#4dd9cf' : '#2a2d44';
      ctx.fillRect(x, y, barW, barH);
    }
    // Progress overlay line
    if (duration > 0) {
      ctx.fillStyle = '#ffffff22';
      ctx.fillRect(progressX, 0, 1, h);
    }
  }
  if (capStatus) capStatus.textContent = '';
}

chrome.runtime.onMessage.addListener((msg) => {
  const data = (msg && msg.__cb_space_mic_status) ? msg.payload : null;
  if (!data) return;
  if ('playing' in data) playing = !!data.playing;
  if ('duration' in data) duration = Number(data.duration||0);
  if ('currentTime' in data) currentTime = Number(data.currentTime||0);
  if ('viz' in data && Array.isArray(data.viz)) viz = data.viz;
  if ('source' in data) source = data.source;
  if ('micMode' in data) on = !!data.micMode;
  render();
});

async function sendToTabs(payload){
  try {
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*','https://twitter.com/*'] });
    if (!tabs || tabs.length === 0) { setError('Open an X tab first.'); return; }
    setError('');
    for (const t of tabs) { if (!t.id) continue; try { await chrome.tabs.sendMessage(t.id, { __cb_space_mic_forward: true, payload }); } catch(e){} }
  } catch(e) { setError('Unable to reach content script. Reload the extension.'); }
}

btn.addEventListener('click', async () => {
  on = !on; render();
  await sendToTabs({ type: 'mode', state: on ? 'on':'off' });
  try { chrome.runtime.sendMessage({ __cb_sw_broadcast: true, type: 'mode', state: on ? 'on' : 'off' }); } catch{}
});

vol.addEventListener('input', async (e) => { const gain = Number(e.target.value || 0.8); await sendToTabs({ type: 'volume', value: gain }); });
mon && mon.addEventListener('change', async (e) => { const on = !!e.target.checked; await sendToTabs({ type: 'monitor', value: on }); });

capStart && capStart.addEventListener('click', async () => {
  try {
    chrome.runtime.sendMessage({ __cb_popup_capture: true, action: 'start' }, (resp) => {
      if (chrome.runtime.lastError) { capStatus.textContent = 'Failed'; return; }
      capStatus.textContent = (resp && resp.ok) ? 'Capturing' : 'Failed';
    });
  } catch { capStatus.textContent = 'Failed'; }
});
capStop && capStop.addEventListener('click', async () => {
  try {
    chrome.runtime.sendMessage({ __cb_popup_capture: true, action: 'stop' }, (resp) => {
      if (chrome.runtime.lastError) { capStatus.textContent = 'Failed'; return; }
      capStatus.textContent = (resp && resp.ok) ? 'Stopped' : 'Failed';
    });
  } catch { capStatus.textContent = 'Failed'; }
});

// Initialize mic mode from persisted state
try {
  chrome.runtime.sendMessage({ __cb_sw_get_state: true }, (resp) => {
    if (chrome.runtime.lastError) {
      try { chrome.storage?.local?.get?.('cb_mic_mode', (it) => { try { on = it && it.cb_mic_mode === 'on'; render(); } catch{} }); } catch{}
      return;
    }
    try { on = resp && resp.cb_mic_mode === 'on'; render(); } catch{}
  });
} catch {
  try { chrome.storage?.local?.get?.('cb_mic_mode', (it) => { try { on = it && it.cb_mic_mode === 'on'; render(); } catch{} }); } catch{}
}

render();
