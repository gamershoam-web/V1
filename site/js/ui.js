// Small UI helpers: toasts, modals, tabs, clipboard.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, { type = 'info', icon = '', duration = 2800 } = {}) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-icon">${icon || (type === 'success' ? '✔' : type === 'error' ? '⚠' : '✦')}</span><span></span>`;
  el.lastElementChild.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, duration);
}

export const Modals = {
  stack: [],
  onEmpty: null,
  isOpen(id) { return this.stack.includes(id); },
  top() { return this.stack[this.stack.length - 1]; },
  open(id) {
    const el = document.getElementById(id);
    if (!el || this.isOpen(id)) return;
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('open');
    this.stack.push(id);
    document.body.classList.add('modal-open');
    const focusable = el.querySelector('[autofocus], .modal-panel button, .modal-panel [tabindex]');
    focusable?.focus({ preventScroll: true });
  },
  close(id, { silent = false } = {}) {
    const el = document.getElementById(id);
    if (!el || !this.isOpen(id)) return;
    el.classList.remove('open');
    setTimeout(() => { if (!this.isOpen(id)) el.classList.add('hidden'); }, 220);
    this.stack = this.stack.filter((m) => m !== id);
    if (!this.stack.length) {
      document.body.classList.remove('modal-open');
      if (!silent) this.onEmpty?.();
    }
  },
  closeAll({ silent = true } = {}) { [...this.stack].forEach((id) => this.close(id, { silent })); },
};

export function initTabs(root) {
  $$('[data-tabs]', root).forEach((group) => {
    const buttons = $$(':scope > [data-tablist] [data-tab]', group);
    const panels = $$(':scope > [data-panels] > [data-panel]', group);
    const select = (name) => {
      buttons.forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
      });
      panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    };
    buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.tab)));
    if (buttons[0]) select(buttons[0].dataset.tab);
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const fmt = (n) => Number(n || 0).toLocaleString('en-US');
