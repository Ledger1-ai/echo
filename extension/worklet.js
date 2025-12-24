class PCM16Worklet extends AudioWorkletProcessor {
  constructor(){
    super();
    this.queue = [];
    this.port.onmessage = (e) => {
      const data = e.data;
      if (data && data.type === 'pcm16' && data.buffer) {
        this.queue.push(new Int16Array(data.buffer));
      }
      if (data && data.type === 'flush') this.queue = [];
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    if (this.queue.length === 0) { out.fill(0); return true; }
    const buf = this.queue.shift();
    const N = Math.min(buf.length, out.length);
    for (let i = 0; i < N; i++) out[i] = buf[i] / 32768;
    for (let i = N; i < out.length; i++) out[i] = 0;
    return true;
  }
}
registerProcessor('pcm16-worklet', PCM16Worklet);
