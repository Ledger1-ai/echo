(async function(){
  let audioContext = null; let mixIn = null; let gain = null; let dest = null; let analyser = null; let tabStream = null; let tabNode = null;
  let workletNode = null;
  function status(payload){ try { chrome.runtime.sendMessage({ __cb_space_mic_status: true, payload }); } catch{} }
  async function init(){
    if (!audioContext) audioContext = new (self.AudioContext || self.webkitAudioContext)({ sampleRate: 16000 });
    if (!dest) dest = audioContext.createMediaStreamDestination();
    if (!gain) { gain = audioContext.createGain(); gain.gain.value = 0.9; gain.connect(dest); }
    if (!mixIn) { mixIn = audioContext.createGain(); mixIn.gain.value = 1; mixIn.connect(gain); }
    if (!analyser) { analyser = audioContext.createAnalyser(); analyser.fftSize = 256; mixIn.connect(analyser); }
    try { if (!workletNode) { await audioContext.audioWorklet.addModule('worklet.js'); workletNode = new AudioWorkletNode(audioContext, 'pcm16-worklet'); workletNode.connect(mixIn); } } catch {}
  }
  async function startCapture(tabId){
    await init();
    try {
      tabStream = await chrome.tabCapture.capture({ audio: true, video: false, targetTabId: tabId });
    } catch {}
    if (tabStream) {
      try {
        // ensure mono
        const src = audioContext.createMediaStreamSource(tabStream);
        // attenuate captured tab to reduce loop pickup
        const tabGain = audioContext.createGain(); tabGain.gain.value = 0.6;
        const merger = audioContext.createChannelMerger(1);
        src.connect(tabGain);
        tabGain.connect(merger, 0, 0);
        // Do NOT connect tab audio to mic mix to avoid feedback loops
        // Optionally monitor: merger.connect(audioContext.destination);
        tabNode = merger;
      } catch{}
    }
    status({ capturing: !!tabStream });
  }
  async function stopCapture(){ try { if (tabNode) tabNode.disconnect(); if (tabStream) tabStream.getTracks().forEach(t=>t.stop()); } catch{} tabNode = null; tabStream = null; status({ capturing: false }); }
  self.onmessage = (e)=>{};
  chrome.runtime.onMessage.addListener((msg) => {
    try {
      if (msg && msg.__cb_offscreen_control) {
        if (msg.action === 'start_capture') startCapture(msg.tabId);
        if (msg.action === 'stop_capture') stopCapture();
      }
      if (msg && msg.__cb_pcm16 && msg.buffer) {
        init().then(() => { try { workletNode?.port.postMessage({ type:'pcm16', buffer: msg.buffer }, [msg.buffer]); } catch{} });
      }
    } catch {}
  });
})();

