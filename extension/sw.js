let modeState = 'off';
let offscreenReady = false;
let captureTabId = null;

async function setBadgeForMode(){
  try {
    if (modeState === 'on') {
      await chrome.action.setBadgeBackgroundColor({ color: '#27d17f' });
      await chrome.action.setBadgeText({ text: 'ON' });
    } else {
      await chrome.action.setBadgeBackgroundColor({ color: '#4dd9cf' });
      await chrome.action.setBadgeText({ text: 'OFF' });
    }
  } catch {}
}

async function sendToTab(tabId, payload){
  try { await chrome.tabs.sendMessage(tabId, { __cb_space_mic_forward: true, payload }); } catch {}
}
async function ensureOffscreen() {
  try {
    const clients = await chrome.offscreen?.hasDocument?.();
    if (clients) { offscreenReady = true; return; }
  } catch {}
  try {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Mix agent PCM with tabCapture audio' });
    offscreenReady = true;
  } catch {}
}

async function startTabCapture() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*','https://twitter.com/*'] });
    if (!tabs || tabs.length === 0) return false;
    const tab = tabs[0]; captureTabId = tab.id || null;
    await ensureOffscreen();
    chrome.runtime.sendMessage({ __cb_offscreen_control: true, action: 'start_capture', tabId: captureTabId });
    return true;
  } catch { return false; }
}

async function stopTabCapture() {
  try {
    chrome.runtime.sendMessage({ __cb_offscreen_control: true, action: 'stop_capture' });
    captureTabId = null; return true;
  } catch { return false; }
}
async function broadcastToXTabs(payload){ try { const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] }); for (const t of tabs) { if (!t.id) continue; await sendToTab(t.id, payload); } } catch {} }

self.addEventListener('message', async (event) => {
  try {
    const msg = event.data || {};
    if (msg.__cb_sw_broadcast && msg.type) {
      if (msg.type === 'mode') { modeState = msg.state === 'on' ? 'on' : 'off'; chrome.storage?.local?.set?.({ cb_mic_mode: modeState }); setBadgeForMode(); }
      await broadcastToXTabs(msg);
    }
  } catch {}
});

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  try {
    if (msg && msg.__cb_sw_broadcast && msg.type) {
      if (msg.type === 'mode') { modeState = msg.state === 'on' ? 'on' : 'off'; chrome.storage?.local?.set?.({ cb_mic_mode: modeState }); setBadgeForMode(); }
      await broadcastToXTabs(msg);
    }
    if (msg && msg.__cb_sw_get_state) {
      const stored = await chrome.storage?.local?.get?.('cb_mic_mode');
      const state = (stored && stored.cb_mic_mode) ? stored.cb_mic_mode : modeState;
      sendResponse && sendResponse({ cb_mic_mode: state || 'off' });
    }
    if (msg && msg.__cb_popup_capture) {
      if (msg.action === 'start') { const ok = await startTabCapture(); sendResponse && sendResponse({ ok }); }
      if (msg.action === 'stop') { const ok = await stopTabCapture(); sendResponse && sendResponse({ ok }); }
    }
  } catch {}
  return true; // async
});

chrome.runtime.onInstalled.addListener(async () => { try { const stored = await chrome.storage?.local?.get?.('cb_mic_mode'); modeState = (stored && stored.cb_mic_mode) || 'off'; await setBadgeForMode(); } catch{} });
chrome.runtime.onStartup?.addListener(async () => { try { const stored = await chrome.storage?.local?.get?.('cb_mic_mode'); modeState = (stored && stored.cb_mic_mode) || modeState; await setBadgeForMode(); await broadcastToXTabs({ type: 'mode', state: modeState }); } catch{} });
