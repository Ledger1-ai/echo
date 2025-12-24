(function inject() {
  function isRuntimeActive(){ try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch { return false; } }
  function safeSendRuntimeMessage(message){
    if (!isRuntimeActive()) return;
    try { chrome.runtime.sendMessage(message, () => { void chrome.runtime.lastError; }); } catch {}
  }
  try {
    if (!chrome.runtime || !chrome.runtime.id) return;
    if (!window.__CB_SPACE_INJECTED__) {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL('injected.js');
      s.dataset.base = chrome.runtime.getURL('');
      s.dataset.musicUrl = '';
      (document.documentElement || document.head).appendChild(s);
      window.__CB_SPACE_INJECTED__ = true;
    }
  } catch {}

  // Forward messages from service worker to injected script via BroadcastChannel
  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        try {
          if (msg && msg.__cb_space_mic_forward) {
            const p = msg.payload || {};
            // Forward immediately
            try { const bc = new BroadcastChannel('cb-space-mic'); bc.postMessage(p); bc.close(); } catch {}
            try { window.postMessage({ __cb_space_mic_control: p }, '*'); } catch {}
            // offscreen mixing: forward agent PCM to offscreen
            try { if (p && p.type === 'pcm16' && p.buffer) chrome.runtime.sendMessage({ __cb_offscreen_control: false, __cb_pcm16: true, buffer: p.buffer }); } catch {}
          }
        } catch {}
      });
    }
  } catch {}

  // Forward status from injected script to extension popup
  try {
    const bc2 = new BroadcastChannel('cb-space-mic');
    bc2.onmessage = (ev) => {
      const data = ev.data || {};
      if (data && data.type === 'status') {
        safeSendRuntimeMessage({ __cb_space_mic_status: true, payload: data });
      }
    };
    window.addEventListener('message', (ev) => {
      try {
        const d = ev.data || {};
        if (d && d.__cb_space_mic_status) {
          safeSendRuntimeMessage({ __cb_space_mic_status: true, payload: d.payload });
        }
      } catch {}
    }, false);
  } catch {}
})();
