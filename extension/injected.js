(function() {
  const CHANNEL = 'cb-space-mic';
  const bc = new BroadcastChannel(CHANNEL);
  let externalStream = null;
  let forceMode = false;
  let userActivated = false;
  let desiredPlaying = false;
  let keepAliveSource = null;
  let keepAliveGain = null;

  let BASE = '';
  try { const scripts = document.querySelectorAll('script[src]'); for (const el of scripts) { if (el.src && el.src.endsWith('/injected.js')) { BASE = el.dataset?.base || ''; break; } } } catch {}

  let audioContext = null; let destNode = null; let gainNode = null; let mixerInput = null; let workletNode = null; let analyserNode = null; let currentSource = 'agent'; let statusLoopStarted = false; let monitorOut = null; let pendingPcm = [];

  function status(payload){
    try { bc.postMessage({ type:'status', ...payload }); } catch{}
    try { window.postMessage({ __cb_space_mic_status: true, payload }, '*'); } catch{}
  }

  async function ensureAudioGraph() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    if (!destNode) destNode = audioContext.createMediaStreamDestination();
    if (!gainNode) { gainNode = audioContext.createGain(); gainNode.gain.value = 0.9; gainNode.connect(destNode); }
    if (!mixerInput) {
      try { await audioContext.audioWorklet.addModule((BASE || '') + 'worklet.js'); workletNode = new AudioWorkletNode(audioContext, 'pcm16-worklet', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }); } catch { workletNode = null; }
      mixerInput = new GainNode(audioContext, { gain: 1 });
      mixerInput.connect(gainNode);
      if (workletNode) { try { workletNode.connect(mixerInput); } catch {} }
      // Keep the graph delivering non-zero frames even when no music/file is playing
      try {
        if (!keepAliveSource) {
          keepAliveGain = new GainNode(audioContext, { gain: 0.00005 });
          keepAliveSource = new OscillatorNode(audioContext, { type: 'sine', frequency: 40 });
          keepAliveSource.connect(keepAliveGain);
          keepAliveGain.connect(mixerInput);
          keepAliveSource.start();
        }
      } catch {}
      // Attach analyser for visualization
      try {
        if (!analyserNode) {
          analyserNode = audioContext.createAnalyser();
          analyserNode.fftSize = 256;
          analyserNode.smoothingTimeConstant = 0.7;
          analyserNode.minDecibels = -90;
          analyserNode.maxDecibels = -20;
          mixerInput.connect(analyserNode);
          try { analyserNode.channelCount = 1; } catch {}
        }
      } catch {}
    }
    return { audioContext, destNode, gainNode, mixerInput, workletNode };
  }

  function disconnect(node){ try { node && node.disconnect(); } catch{} }

  async function startAgentGenerator() {
    const g = await ensureAudioGraph();
    if (!g.workletNode) {
      const osc = g.audioContext.createOscillator(); osc.frequency.value = 440; const oG = new GainNode(g.audioContext, { gain: 0.0001 }); osc.connect(oG); oG.connect(g.gainNode); osc.start(); setTimeout(()=>{ try{osc.stop(); osc.disconnect(); oG.disconnect();}catch{} }, 300);
      return;
    }
  }

  async function makeBlobUrl(url){
    try {
      if (!url) return url;
      if (typeof url === 'string') {
        if (url.startsWith('blob:') || url.startsWith('data:')) return url;
        if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) return url;
      }
      const res = await fetch(url, { cache:'no-store' });
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch { return url; }
  }

  // music/file paths removed

  function setVolume(v) { ensureAudioGraph().then(g => { try { g.gainNode.gain.value = Math.max(0, Math.min(1, Number(v)||0)); status({ volume: g.gainNode.gain.value }); } catch{} }); }
  function ensureDestSync(){
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      if (!destNode) destNode = audioContext.createMediaStreamDestination();
      if (!gainNode) { gainNode = audioContext.createGain(); gainNode.gain.value = 0.9; gainNode.connect(destNode); }
      if (!mixerInput) { mixerInput = new GainNode(audioContext, { gain: 1 }); mixerInput.connect(gainNode); }
    } catch {}
  }
  function ensureExternalStream() { try { ensureDestSync(); if (!destNode) return null; return destNode.stream; } catch { return null; } }
  function ensureMicTrack(){ try { const s = ensureExternalStream(); return s ? s.getAudioTracks()[0] : null; } catch { return null; } }
  function playActive() { desiredPlaying = true; try { localStorage.setItem('cb_playing','1'); } catch{} }
  function pauseActive() { desiredPlaying = false; try { localStorage.setItem('cb_playing','0'); } catch{} }
  function resetActive() {}
  function seekActive(t) {}

  try { const saved = localStorage.getItem('cb_mic_mode'); if (saved === 'on') forceMode = true; } catch{}

  bc.onmessage = async (ev) => {
    try {
      const msg = ev.data || {};
      if (msg.type === 'pcm16') {
        if (!userActivated) { try { pendingPcm.push(msg); } catch {} return; }
        const g = await ensureAudioGraph();
        await startAgentGenerator();
        ensureExternalStream();
        if (g.workletNode && msg.buffer) {
          try {
            if (msg.format === 'f32' && msg.buffer instanceof Float32Array?.constructor) {
              const f32 = new Float32Array(msg.buffer);
              const i16 = new Int16Array(f32.length);
              for (let i=0;i<f32.length;i++){ let v = Math.max(-1, Math.min(1, f32[i]||0)); i16[i] = v < 0 ? v * 32768 : v * 32767; }
              g.workletNode.port.postMessage({ type:'pcm16', buffer: i16.buffer }, [i16.buffer]);
            } else {
              g.workletNode.port.postMessage({ type:'pcm16', buffer: msg.buffer }, [msg.buffer]);
            }
          } catch {
            g.workletNode.port.postMessage({ type:'pcm16', buffer: msg.buffer }, [msg.buffer]);
          }
        }
      }
      if (msg.type === 'toggle' && msg.state === 'off') { const g = await ensureAudioGraph(); if (g.workletNode) g.workletNode.port.postMessage({ type:'flush' }); }
      if (msg.type === 'mode') { forceMode = msg.state === 'on'; status({ micMode: forceMode }); }
      if (msg.type === 'source') { currentSource = 'agent'; status({ source: currentSource }); }
      if (msg.type === 'play') playActive(); if (msg.type === 'pause') pauseActive(); if (msg.type === 'reset') resetActive(); if (msg.type === 'seek') seekActive(Number(msg.value||0)); if (msg.type === 'volume') setVolume(msg.value);
      if (msg.type === 'monitor') {
        try {
          if (msg.value) {
            // route to speakers for monitoring
            const g = await ensureAudioGraph();
            if (!monitorOut) { monitorOut = new GainNode(g.audioContext, { gain: 1 }); }
            g.mixerInput.connect(monitorOut).connect(g.audioContext.destination);
          } else if (monitorOut) {
            monitorOut.disconnect();
          }
          status({ monitor: !!msg.value });
        } catch {}
      }
    } catch {}
  };

  // Unlock audio on first in-page user gesture so playback can start
  function tryUnlockAudio() {
    ensureAudioGraph().then(async (g) => {
      try {
        await g.audioContext.resume();
        userActivated = true;
        // flush any queued pcm frames
        if (pendingPcm.length && g.workletNode) {
          for (const m of pendingPcm.splice(0)) {
            try { g.workletNode.port.postMessage({ type:'pcm16', buffer: m.buffer }, [m.buffer]); } catch {}
          }
        }
      } catch {}
    });
  }
  ['pointerdown','keydown','touchstart'].forEach((evt) => {
    try { window.addEventListener(evt, tryUnlockAudio, { once: true, capture: true }); } catch {}
  });

  // Periodically broadcast playback time and visualization data
  function startStatusLoop(){
    if (statusLoopStarted) return; statusLoopStarted = true;
    const bins = 64; const freqData = new Uint8Array(256);
    function tick(){
      try {
        if (analyserNode) {
          analyserNode.getByteFrequencyData(freqData);
          const step = Math.max(1, Math.floor(freqData.length / bins));
          const viz = new Array(bins);
          for (let i=0;i<bins;i++) {
            let sum = 0; let count = 0;
            const start = i*step; const end = Math.min((i+1)*step, freqData.length);
            for (let j=start;j<end;j++){ sum += freqData[j]; count++; }
            viz[i] = count ? Math.round(sum / count) : 0;
          }
          status({ viz });
        }
      } catch {}
      try { requestAnimationFrame(tick); } catch { setTimeout(tick, 100); }
    }
    tick();
  }
  try { startStatusLoop(); } catch {}

  const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
  navigator.mediaDevices.enumerateDevices = async function() { try { const list = await origEnum(); const virtual = { kind: 'audioinput', deviceId: 'cb-space-mic', label: 'VoiceHub (Virtual)', groupId: '' }; return list.concat([virtual]); } catch (e) { return origEnum(); } };
  function wantsCBMic(constraints){ try { if (!constraints || typeof constraints !== 'object') return false; const a = constraints.audio; if (!a) return false; if (a === 'cb-space-mic') return true; const id = (a && typeof a === 'object' && ('deviceId' in a)) ? a.deviceId : null; if (!id) return false; if (typeof id === 'string') return id === 'cb-space-mic'; if (id && typeof id === 'object') { if (id.exact && (id.exact === 'cb-space-mic' || (Array.isArray(id.exact) && id.exact.includes('cb-space-mic')))) return true; if (id.ideal && (id.ideal === 'cb-space-mic' || (Array.isArray(id.ideal) && id.ideal.includes('cb-space-mic')))) return true; } if (Array.isArray(constraints.audio)) { for (const c of constraints.audio) { if (wantsCBMic({ audio: c })) return true; } } return false; } catch { return false; }
  }
  navigator.mediaDevices.getUserMedia = async function(constraints) {
    try {
      const wantsAudio = constraints && (typeof constraints === 'object') && ('audio' in constraints) && constraints.audio;
      if (wantsCBMic(constraints) || (forceMode && wantsAudio)) {
        ensureDestSync();
        const base = destNode && destNode.stream;
        // Build a proper MediaStream with our track so downstream code sees a real track id
        const stream = new MediaStream();
        const t = ensureMicTrack();
        if (t) stream.addTrack(t.clone());
        try {
          const track = stream.getAudioTracks()[0];
          if (track) {
            try { track.contentHint = 'music'; } catch {}
            try { track.enabled = true; } catch {}
            try { track.applyConstraints && track.applyConstraints({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: 16000 }).catch(()=>{}); } catch {}
          }
        } catch {}
        return stream;
      }
    } catch {}
    return origGUM(constraints);
  };

  try { Object.defineProperty(window, '__CB_SPACE_MIC__', { value: true, configurable: false }); } catch {}
  // Emit initial micMode so popup reflects persisted state
  status({ micMode: forceMode });

  // Persist desired playing across popup closes
  try { const sp = localStorage.getItem('cb_playing'); if (sp === '1') { desiredPlaying = true; } } catch {}

  // Intercept PeerConnection to force our virtual mic when enabled
  try {
    const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (RTCPeer && !RTCPeer.__cbWrapped) {
      const origAddTrack = RTCPeer.prototype.addTrack;
      const origAddTransceiver = RTCPeer.prototype.addTransceiver;
      const origReplaceTrack = (window.RTCRtpSender || {}).prototype && window.RTCRtpSender.prototype.replaceTrack;

      function getVirtualTrackSync(){ return ensureMicTrack(); }

      if (typeof origAddTrack === 'function') {
        RTCPeer.prototype.addTrack = function(track){
          try {
            if (forceMode && track && track.kind === 'audio') {
              const vt = getVirtualTrackSync();
              if (vt) { const streams = Array.prototype.slice.call(arguments, 1); return origAddTrack.apply(this, [vt].concat(streams && streams.length ? streams : [])); }
            }
          } catch {}
          return origAddTrack.apply(this, arguments);
        };
      }

      if (typeof origAddTransceiver === 'function') {
        RTCPeer.prototype.addTransceiver = function(trackOrKind, init){
          try {
            const kind = typeof trackOrKind === 'string' ? trackOrKind : (trackOrKind && trackOrKind.kind);
            if (forceMode && kind === 'audio') {
              const vt = getVirtualTrackSync();
              if (vt) { return origAddTransceiver.apply(this, ['audio', { ...init, direction: (init && init.direction) || 'sendonly' }]); }
            }
          } catch {}
          return origAddTransceiver.apply(this, arguments);
        };
      }

      if (origReplaceTrack && typeof origReplaceTrack === 'function') {
        const SenderProto = window.RTCRtpSender.prototype;
        SenderProto.replaceTrack = function(newTrack){
          try {
            if (forceMode && newTrack && newTrack.kind === 'audio') {
              const vt = getVirtualTrackSync();
              if (vt) { return origReplaceTrack.call(this, vt); }
            }
          } catch {}
          return origReplaceTrack.call(this, newTrack);
        };
      }

      Object.defineProperty(RTCPeer, '__cbWrapped', { value: true });
    }
  } catch {}
})();
