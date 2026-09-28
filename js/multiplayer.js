export class JVNetwork {
  constructor({ onMessage, onStatus } = {}) {
    this.ws = null;
    this.onMessage = onMessage || (() => {});
    this.onStatus = onStatus || (() => {});
    this.tick = 0;
    this.url = '';
  }

  connect(url) {
    this.close();
    this.url = url;
    this.onStatus('connecting');

    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
          settled = true;
          this.onStatus('open');
          resolve();
        };
        this.ws.onerror = err => {
          this.onStatus('error');
          if (!settled) reject(err);
        };
        this.ws.onclose = () => {
          this.onStatus('closed');
          this.ws = null;
        };
        this.ws.onmessage = e => {
          try { this.onMessage(JSON.parse(e.data)); }
          catch { this.onMessage({ type: 'error', message: 'Respuesta de red inválida.' }); }
        };
      } catch (err) {
        this.onStatus('error');
        reject(err);
      }
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  createRoom(mode) {
    return this.send({ type: 'create-room', mode });
  }

  joinRoom(code) {
    return this.send({ type: 'join-room', code: String(code || '').trim().toUpperCase() });
  }

  sendInput(input) {
    this.send({ type: 'input', input, tick: ++this.tick });
  }

  sendSnapshot(snapshot) {
    this.send({ type: 'snapshot', snapshot });
  }

  leave() {
    this.send({ type: 'leave' });
    this.close();
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    this.ws = null;
  }
}
