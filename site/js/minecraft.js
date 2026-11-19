// Orbitnetwork.cloud live status (the hub's own /api/mc/status, else mcsrvstat.us) + one-click IP copy.
import { CONFIG } from './config.js';
import { $$, copyText, toast, fmt } from './ui.js';
import { audio } from './audio.js';
import { Store } from './storage.js';

export class MinecraftPortal {
  constructor() {
    this.data = null;
    this.loading = false;
    this.copiedOnce = false;
    this.timer = null;
  }

  start() {
    this.refresh();
    this.timer = setInterval(() => { if (!document.hidden) this.refresh(); }, CONFIG.statusRefreshMs);
    $$('[data-mc-refresh]').forEach((b) => b.addEventListener('click', () => this.refresh(true)));
    $$('[data-copy-ip]').forEach((b) => b.addEventListener('click', () => this.copyIP()));
    $$('[data-copy-text]').forEach((b) => b.addEventListener('click', async () => {
      if (await copyText(b.dataset.copyText)) { audio.pickup(); toast(`Copied: ${b.dataset.copyText}`, { type: 'success' }); }
    }));
    $$('[data-ip]').forEach((el) => { el.textContent = CONFIG.serverIp; });
    $$('[data-java-port]').forEach((el) => { el.textContent = CONFIG.javaPort; });
    $$('[data-bedrock-port]').forEach((el) => { el.textContent = CONFIG.bedrockPort; });
  }

  async copyIP() {
    const ok = await copyText(CONFIG.serverIp);
    if (ok) {
      audio.chime();
      toast(`${CONFIG.serverIp} copied — paste it in Multiplayer → Add Server`, { type: 'success', icon: 'pickaxe', duration: 3600 });
      if (!this.copiedOnce) { this.copiedOnce = true; Store.addXP(10); }
    } else {
      audio.error();
      toast(`Copy failed — the server IP is ${CONFIG.serverIp}`, { type: 'error', duration: 4500 });
    }
  }

  async refresh(manual = false) {
    if (this.loading) return;
    this.loading = true;
    this.setAll('[data-mc-refresh]', (el) => el.classList.add('spinning'));
    if (!this.data) this.renderState('checking');
    try {
      this.data = await this.fetchStatus();
      this.render();
      if (manual) toast('Server status refreshed', { icon: 'radar' });
    } catch (err) {
      console.warn('Status lookup failed', err);
      this.renderState('unknown');
      if (manual) toast('Could not reach the status service', { type: 'error' });
    } finally {
      this.loading = false;
      this.setAll('[data-mc-refresh]', (el) => el.classList.remove('spinning'));
    }
  }

  // The hub's own server pings the Minecraft server on the same VPS (live, no third party).
  // If that isn't available (site hosted without the API), fall back to the public status service.
  async fetchStatus() {
    const get = async (url) => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 9000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally { clearTimeout(timeout); }
    };
    if (this.localApi !== false) {
      try {
        const d = await get(CONFIG.localStatusApi);
        if (d && typeof d.online === 'boolean') { this.localApi = true; return d; }
        throw new Error('not the status API');
      } catch (err) {
        if (this.localApi) throw err; // it worked before: a real outage, don't switch services
        this.localApi = false;
      }
    }
    return get(CONFIG.statusApi + encodeURIComponent(CONFIG.serverIp.toLowerCase()));
  }

  setAll(sel, fn) { $$(sel).forEach(fn); }

  renderState(state) {
    const labels = { checking: 'Scanning…', unknown: 'Status unavailable', online: 'Online', offline: 'Offline' };
    this.setAll('[data-mc-state]', (el) => { el.textContent = labels[state]; });
    this.setAll('[data-mc-dot]', (el) => { el.dataset.state = state; });
    if (state !== 'online') {
      this.setAll('[data-mc-players]', (el) => { el.textContent = '–'; });
      this.setAll('[data-mc-max]', (el) => { el.textContent = '–'; });
      this.setAll('[data-mc-bar]', (el) => { el.style.width = '0%'; });
    }
    if (state === 'offline') this.setAll('[data-mc-motd]', (el) => { el.textContent = 'The server is currently offline. Check back soon!'; });
    if (state === 'unknown') this.setAll('[data-mc-motd]', (el) => { el.textContent = 'Live status could not be loaded right now.'; });
  }

  render() {
    const d = this.data || {};
    const online = !!d.online;
    this.renderState(online ? 'online' : 'offline');
    if (online) {
      const p = d.players || {};
      const cur = Number(p.online) || 0, max = Number(p.max) || 0;
      this.setAll('[data-mc-players]', (el) => { el.textContent = fmt(cur); });
      this.setAll('[data-mc-max]', (el) => { el.textContent = fmt(max); });
      this.setAll('[data-mc-bar]', (el) => { el.style.width = `${max ? Math.min(100, (cur / max) * 100) : 0}%`; });
      const motd = Array.isArray(d.motd?.clean) ? d.motd.clean.map((l) => String(l).trim()).filter(Boolean).join('\n') : '';
      this.setAll('[data-mc-motd]', (el) => { el.textContent = motd || 'Welcome to Orbit Network!'; });
    }
    this.setAll('[data-mc-version]', (el) => { el.textContent = d.version ? String(d.version).slice(0, 40) : '—'; });
    const icon = typeof d.icon === 'string' && d.icon.startsWith('data:image/') ? d.icon : null;
    this.setAll('[data-mc-icon]', (el) => {
      if (icon) { el.src = icon; el.classList.remove('hidden'); } else el.classList.add('hidden');
    });
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.setAll('[data-mc-updated]', (el) => { el.textContent = `Updated ${time}`; });
  }
}
