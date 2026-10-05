(() => {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const root = document.getElementById('root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inrShort = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const when = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };

  const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const icon = {
    bolt: I('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
    home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    receipt: I('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    bank: I('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>'),
    phone: I('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    msg: I('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'),
    globe: I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
    gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    more: I('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    link: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
    edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
    trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    alert: I('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>'),
    check: I('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    qr: I('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3"/>'),
    rupee: I('<path d="M6 4h12M6 9h12M14 4c3 0 4 2.5 4 5s-2 5-6 5H6l8 7"/>'),
    clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
    logout: I('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'),
    send: I('<path d="M4 12l16-8-6 16-2-6z"/>'),
    refresh: I('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    whatsapp: I('<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1-1.2 2 .8-.4 1.6c-3.8.2-7.8-3.8-7.6-7.6l1.6-.4.8 2z"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    inbox: I('<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>'),
    upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'),
  };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/admin/api' + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'apnapay' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (res.status === 401 && path !== '/login') {
      boot();
      throw new Error(data.error || 'Please log in');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  async function copy(text, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(`${label} copied`, 'ok');
  }

  // Generic modal. Returns { el, close }.
  function modal({ title, body, foot = '', wide = false, onClose }) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon.x}</button></div>
        <div class="modal-body">${body}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>`;
    const close = () => {
      ov.remove();
      document.removeEventListener('keydown', onKey);
      onClose && onClose();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    ov.addEventListener('mousedown', (e) => e.target === ov && close());
    $$('[data-close]', ov).forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    const first = $('input:not([type=hidden]):not([type=file]), textarea, select', ov);
    if (first && window.innerWidth > 700) setTimeout(() => first.focus(), 50);
    return { el: ov, close };
  }

  function confirmBox(title, text, { ok = 'Yes, continue', danger = false } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title,
        body: `<p class="muted">${text}</p>`,
        foot: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${ok}</button>`,
        onClose: () => !done && resolve(false),
      });
      $('[data-ok]', m.el).addEventListener('click', () => {
        done = true;
        m.close();
        resolve(true);
      });
    });
  }

  // Disable a button with a spinner while fn runs.
  async function busy(btn, fn) {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      return await fn();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      btn.disabled = false;
      btn.innerHTML = html;
    }
  }

  const formData = (form) => Object.fromEntries(new FormData(form).entries());
  const copyField = (text, label) =>
    `<div class="copy"><code title="${esc(text)}">${esc(text)}</code><button type="button" class="btn btn-soft btn-sm" data-copy="${esc(text)}" data-label="${esc(label)}">${icon.copy} Copy</button></div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.dataset.copy, b.dataset.label || 'Text');
  });

  const BANKS = {
    kotak: { name: 'Kotak Mahindra', short: 'KMB', color: '#ed1c24' },
    cbi: { name: 'Central Bank of India', short: 'CBI', color: '#1f4e9c' },
    fino: { name: 'Fino Payments Bank', short: 'FINO', color: '#f58220' },
    sbi: { name: 'State Bank of India', short: 'SBI', color: '#2d6db5' },
    hdfc: { name: 'HDFC Bank', short: 'HDFC', color: '#004c8f' },
    icici: { name: 'ICICI Bank', short: 'ICICI', color: '#b02a30' },
    axis: { name: 'Axis Bank', short: 'AXIS', color: '#97144d' },
    pnb: { name: 'Punjab National Bank', short: 'PNB', color: '#a6192e' },
    bob: { name: 'Bank of Baroda', short: 'BOB', color: '#f15a29' },
    other: { name: 'Other bank', short: 'UPI', color: '#5b4cf0' },
  };
  const bankLogo = (b, size = 42) => {
    const bank = BANKS[b] || BANKS.other;
    const fs = bank.short.length > 3 ? 11 : 13;
    return `<div class="bank-logo" style="background:${bank.color};width:${size}px;height:${size}px;font-size:${fs}px">${bank.short}</div>`;
  };
  const statusBadge = (s) => `<span class="badge ${esc(s)}">${esc(s[0].toUpperCase() + s.slice(1))}</span>`;
  const sourceLabel = { sms: 'SMS', email: 'Email', manual: 'Test' };

  // ---------------------------------------------------------------- auth screens
  function authScreen(inner) {
    root.innerHTML = `<div class="auth"><div class="card">
      <div class="logo" style="justify-content:center;padding-bottom:6px"><span class="logo-mark">${icon.bolt}</span>ApnaPay</div>
      ${inner}</div></div>`;
  }

  function renderSetup() {
    authScreen(`
      <p class="center muted" style="margin-bottom:22px">Welcome! Create your admin login.<br><span class="small">Pehli baar — apna admin account banayein.</span></p>
      <form id="f" class="stack">
        <div class="field"><label>Business name</label><input class="input" name="business_name" placeholder="e.g. Sharma Electronics" required></div>
        <div class="field"><label>Username</label><input class="input" name="username" autocomplete="username" minlength="3" required></div>
        <div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required>
          <span class="hint">At least 8 characters. Use a strong one — this protects your money settings.</span></div>
        <button class="btn btn-primary btn-lg btn-block">Create account</button>
      </form>`);
    $('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      busy(e.submitter || $('button', e.target), async () => {
        await api('/setup', { method: 'POST', body: formData(e.target) });
        startApp();
      });
    });
  }

  function renderLogin() {
    authScreen(`
      <p class="center muted" style="margin-bottom:22px">Log in to your payment desk</p>
      <form id="f" class="stack">
        <div class="field"><label>Username</label><input class="input" name="username" autocomplete="username" required></div>
        <div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="current-password" required></div>
        <div class="field" id="totpField" hidden><label>2FA code</label><input class="input mono" name="totp" inputmode="numeric" maxlength="6" placeholder="6-digit code from Authenticator" autocomplete="one-time-code"></div>
        <button class="btn btn-primary btn-lg btn-block">Log in</button>
      </form>`);
    $('#f').addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', e.target), async () => {
        const out = await api('/login', { method: 'POST', body: formData(e.target) });
        if (out.need_totp) {
          $('#totpField').hidden = false;
          $('[name=totp]').focus();
          toast('Enter the code from your Authenticator app');
          return;
        }
        startApp();
      });
    });
  }

  // ---------------------------------------------------------------- shell & router
  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'orders', label: 'Orders', icon: 'receipt' },
    { id: 'accounts', label: 'Bank Accounts', short: 'Banks', icon: 'bank' },
    { id: 'messages', label: 'Bank Messages', short: 'Messages', icon: 'msg' },
    { id: 'devices', label: 'Phones', icon: 'phone' },
    { id: 'sites', label: 'Websites & API', icon: 'globe' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
  ];
  const MOBILE_NAV = ['dashboard', 'orders', 'accounts', 'messages'];
  const IN_APP = /ApnaPayApp/.test(navigator.userAgent);
  let badges = { messages: 0 };

  function renderShell() {
    root.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="logo"><span class="logo-mark">${icon.bolt}</span>ApnaPay</div>
          <nav class="nav">${NAV.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${icon[n.icon]}${n.label}<span class="count" data-badge="${n.id}" hidden></span></a>`).join('')}</nav>
          <div class="side-foot">
            <div class="bold" id="bizName">…</div>
            <a href="#" id="logout" class="small muted row" style="gap:6px;margin-top:6px">${icon.logout.replace('<svg', '<svg width="15" height="15"')} Log out</a>
          </div>
        </aside>
        <main class="main" id="page"></main>
      </div>
      <nav class="bottom-nav">
        ${MOBILE_NAV.map((id) => {
          const n = NAV.find((x) => x.id === id);
          return `<a href="#/${id}" data-nav="${id}">${icon[n.icon]}${n.short || n.label}<span class="dot" data-badge-dot="${id}" hidden></span></a>`;
        }).join('')}
        <a href="#" id="moreBtn" data-nav="more">${icon.more}More</a>
      </nav>`;
    $('#logout').addEventListener('click', async (e) => {
      e.preventDefault();
      await api('/logout', { method: 'POST' });
      boot();
    });
    $('#moreBtn').addEventListener('click', (e) => {
      e.preventDefault();
      const m = modal({
        title: 'More',
        body: `<div class="more-menu">
          ${NAV.filter((n) => !MOBILE_NAV.includes(n.id)).map((n) => `<a href="#/${n.id}">${icon[n.icon]}${n.label}</a>`).join('')}
          ${IN_APP ? `<a href="apnapay://sms">${icon.msg}SMS reader (this phone)</a><a href="apnapay://setup">${icon.globe}Change server</a>` : ''}
          <a href="#" data-logout>${icon.logout}Log out</a></div>`,
      });
      $$('a', m.el).forEach((a) => a.addEventListener('click', () => m.close()));
      $('[data-logout]', m.el).addEventListener('click', async (ev) => {
        ev.preventDefault();
        await api('/logout', { method: 'POST' });
        boot();
      });
    });
  }

  function setBadges() {
    $$('[data-badge]').forEach((el) => {
      const n = badges[el.dataset.badge] || 0;
      el.hidden = !n;
      el.textContent = n;
    });
    $$('[data-badge-dot]').forEach((el) => (el.hidden = !badges[el.dataset.badgeDot]));
  }

  function topbar(title, sub = '', actions = '') {
    return `<div class="topbar"><div class="grow"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="row">${actions}</div></div>`;
  }

  const pages = {};
  let currentPage = null;
  let refreshTimer = null;

  async function route() {
    const id = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
    const pageId = pages[id] ? id : 'dashboard';
    currentPage = pageId;
    clearInterval(refreshTimer);
    $$('.overlay').forEach((o) => o.remove());
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === pageId));
    const page = $('#page');
    page.innerHTML = `<div class="skeleton" style="height:34px;width:220px;margin-bottom:24px"></div><div class="grid cols-4">${'<div class="card skeleton" style="height:96px"></div>'.repeat(4)}</div>`;
    window.scrollTo(0, 0);
    try {
      await pages[pageId](page);
    } catch (err) {
      page.innerHTML = `<div class="notice bad">${icon.alert}<div>${esc(err.message)}</div></div>`;
    }
  }

  // ---------------------------------------------------------------- dashboard
  pages.dashboard = async (page) => {
    const d = await api('/dashboard');
    if (d.min_order_amount) minOrder = d.min_order_amount;
    $('#bizName').textContent = d.business_name;
    badges.messages = d.unmatched;
    setBadges();
    const max = Math.max(1, ...d.chart.map((c) => Number(c.amount)));
    const live = d.accounts.filter((a) => a.live);

    page.innerHTML = `
      ${topbar(`Namaste 👋`, `${esc(d.business_name)} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`,
        `<button class="btn btn-primary" id="newLink">${icon.plus}<span class="hide-mobile">New payment link</span><span class="show-mobile">Link</span></button>`)}
      <div class="stack lg">
        ${d.alerts.length ? `
          <div class="notice warn">${icon.alert}<div class="grow stack" style="gap:4px">
            ${d.alerts.map((a) => `<div>${esc(a.message)} <span class="faint tiny">· ${when(a.created_at)}</span></div>`).join('')}
            <div><button class="btn btn-ghost btn-sm" id="seenAlerts" style="margin-top:6px">Mark as seen</button></div>
          </div></div>` : ''}
        ${!d.accounts.length ? `
          <div class="card" style="text-align:center;padding:34px 20px">
            <div style="font-size:40px">🏦</div><h2 style="margin-top:8px">Add your first bank account</h2>
            <p class="muted" style="margin:6px auto 16px;max-width:420px">Upload your UPI QR or enter your UPI ID. Payments go straight to your bank — 0% fee.</p>
            <a class="btn btn-primary" href="#/accounts">${icon.plus} Add bank account</a></div>` : ''}
        ${d.accounts.length && !live.length ? `<div class="notice bad">${icon.alert}<div><b>No bank account is LIVE.</b> Customers cannot pay right now. Turn one on below.</div></div>` : ''}
        <div class="grid cols-4">
          <div class="card stat hero"><div class="k">${icon.rupee} Received today</div><div class="v">${inr(d.today.amount)}</div></div>
          <div class="card stat"><div class="k">${icon.check} Paid orders today</div><div class="v">${d.today.count}</div></div>
          <div class="card stat"><div class="k">${icon.clock} Waiting for payment</div><div class="v">${d.pending}</div></div>
          <a class="card stat" href="#/messages" style="text-decoration:none;color:inherit"><div class="k">${icon.msg} Unmatched money</div><div class="v" style="color:${d.unmatched ? 'var(--warn)' : 'inherit'}">${d.unmatched}</div></a>
        </div>
        <div class="grid cols-2">
          <div class="card">
            <div class="card-head"><div><h2>Bank accounts</h2><div class="sub">Turn a bank ON/OFF — new payments only go to LIVE banks</div></div><a class="btn btn-ghost btn-sm" href="#/accounts">Manage</a></div>
            ${d.accounts.length ? d.accounts.map((a) => `
              <div class="ctrl">
                ${bankLogo(a.bank, 38)}
                <div class="grow">
                  <div class="bold ellipsis">${esc(a.label)}</div>
                  <div class="tiny muted">${inr(a.today_paid)} today${a.daily_limit ? ` · limit ${inrShort(a.daily_limit)}` : ''}</div>
                  ${a.limit_used_pct !== null ? `<div class="meter ${a.limit_used_pct > 90 ? 'bad' : a.limit_used_pct > 70 ? 'warn' : ''}" style="margin-top:6px"><span style="width:${a.limit_used_pct}%"></span></div>` : ''}
                </div>
                <span class="live-label ${a.live ? 'on' : 'off'}" data-live-label="${a.id}">${a.live ? 'LIVE' : 'OFF'}</span>
                <label class="switch"><input type="checkbox" data-live="${a.id}" ${a.live ? 'checked' : ''}><span class="track"></span></label>
              </div>`).join('') : '<p class="muted small">No accounts yet.</p>'}
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Last 7 days</h2><div class="sub">${d.week_count} payments received</div></div></div>
            <div class="bars">${d.chart.map((c) => `
              <div class="bar ${Number(c.amount) ? '' : 'zero'}" title="${inr(c.amount)}">
                <span class="tiny">${Number(c.amount) ? inrShort(c.amount) : ''}</span>
                <i style="height:${Math.max(3, (Number(c.amount) / max) * 100)}%"></i>
                <span>${new Date(c.date).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              </div>`).join('')}</div>
          </div>
        </div>
        <div class="grid cols-2">
          <div class="card flush">
            <div class="card-head" style="padding:18px 20px 0"><h2>Recent orders</h2><a class="btn btn-ghost btn-sm" href="#/orders">View all</a></div>
            ${d.recent.length ? d.recent.map(orderListItem).join('') : `<div class="empty">${icon.receipt}<div>No orders yet. Create a payment link to test.</div></div>`}
          </div>
          <div class="card">
            <div class="card-head"><div><h2>Phones</h2><div class="sub">SMS readers that confirm payments</div></div><a class="btn btn-ghost btn-sm" href="#/devices">Manage</a></div>
            ${d.devices.length ? d.devices.map((v) => `
              <div class="ctrl">
                <div class="bank-logo" style="background:var(--surface-2);color:var(--muted)">${icon.phone}</div>
                <div class="grow"><div class="bold">${esc(v.name)}</div><div class="tiny muted">Last message: ${when(v.last_seen_at)}</div></div>
                ${!v.active ? '<span class="badge off">Disconnected</span>' : v.online ? '<span class="badge online">Active</span>' : '<span class="badge warn">Quiet</span>'}
              </div>`).join('') : `<p class="muted small">No phone connected yet. <a href="#/devices">Connect a phone</a> so bank SMS confirm payments automatically.</p>`}
          </div>
        </div>
      </div>`;

    $('#newLink').addEventListener('click', newPaymentLink);
    $('#seenAlerts')?.addEventListener('click', async () => {
      await api('/activity/seen', { method: 'POST' });
      route();
    });
    bindLiveSwitches(page);
    bindOrderClicks(page);
    refreshTimer = setInterval(() => currentPage === 'dashboard' && !$('.overlay') && pages.dashboard(page).catch(() => {}), 30000);
  };

  function bindLiveSwitches(scope) {
    $$('[data-live]', scope).forEach((input) =>
      input.addEventListener('change', async () => {
        const live = input.checked;
        try {
          const a = await api(`/accounts/${input.dataset.live}/live`, { method: 'POST', body: { live } });
          $$(`[data-live-label="${a.id}"]`).forEach((l) => {
            l.textContent = live ? 'LIVE' : 'OFF';
            l.className = `live-label ${live ? 'on' : 'off'}`;
          });
          input.closest('.bank-card')?.classList.toggle('is-live', live);
          toast(`${a.label} is now ${live ? 'LIVE ✅' : 'OFF'}`, live ? 'ok' : '');
        } catch (err) {
          input.checked = !live;
          toast(err.message, 'bad');
        }
      }),
    );
  }

  // ---------------------------------------------------------------- orders
  function orderListItem(o) {
    return `<div class="list-item click" data-order="${esc(o.id)}">
      <div class="grow">
        <div class="row" style="gap:8px"><span class="bold ellipsis">${esc(o.customer.name || o.reference || o.id)}</span></div>
        <div class="tiny muted ellipsis">${esc(o.site)}${o.reference ? ' · ' + esc(o.reference) : ''} · ${when(o.created_at)}</div>
      </div>
      <div style="text-align:right">
        <div class="amount">${inr(o.amount_paid || o.amount_payable)}</div>
        <div style="margin-top:2px">${statusBadge(o.status)}</div>
      </div></div>`;
  }

  function bindOrderClicks(scope) {
    $$('[data-order]', scope).forEach((el) => el.addEventListener('click', () => openOrder(el.dataset.order)));
  }

  let orderFilter = { status: '', q: '', page: 1 };
  pages.orders = async (page) => {
    const qs = new URLSearchParams({ status: orderFilter.status, q: orderFilter.q, page: orderFilter.page });
    const d = await api('/orders?' + qs);
    const tabs = [['', 'All'], ['pending', 'Waiting'], ['paid', 'Paid'], ['expired', 'Expired'], ['cancelled', 'Cancelled']];
    const pages_ = Math.max(1, Math.ceil(d.total / 30));
    page.innerHTML = `
      ${topbar('Orders', `${d.total} order${d.total === 1 ? '' : 's'}`, `<button class="btn btn-primary" id="newLink">${icon.plus}<span class="hide-mobile">New payment link</span><span class="show-mobile">Link</span></button>`)}
      <div class="row wrap between" style="margin-bottom:14px">
        <div class="tabs">${tabs.map(([v, l]) => `<button data-status="${v}" class="${orderFilter.status === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <form id="search" class="input-group" style="min-width:min(100%,280px)"><span class="prefix" style="display:flex">${icon.search.replace('<svg', '<svg width="16" height="16"')}</span>
          <input class="input" name="q" placeholder="Search name, ref, UTR, amount" value="${esc(orderFilter.q)}"></form>
      </div>
      <div class="card flush">
        ${d.orders.length ? `
          <table class="table hide-mobile"><thead><tr><th>Customer / Ref</th><th>From</th><th>Bank</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${d.orders.map((o) => `
            <tr class="click" data-order="${esc(o.id)}">
              <td><div class="bold">${esc(o.customer.name || '—')}</div><div class="tiny muted mono">${esc(o.reference || o.id)}</div></td>
              <td class="small">${esc(o.site)}</td>
              <td class="small">${esc(o.account || '—')}</td>
              <td class="amount">${inr(o.amount_paid || o.amount_payable)}</td>
              <td>${statusBadge(o.status)}${o.customer_utr && o.status !== 'paid' ? ' <span class="badge info plain">UTR given</span>' : ''}</td>
              <td class="small muted nowrap">${when(o.created_at)}</td>
            </tr>`).join('')}</tbody></table>
          <div class="show-mobile">${d.orders.map(orderListItem).join('')}</div>`
          : `<div class="empty">${icon.receipt}<div>No orders found</div></div>`}
      </div>
      ${pages_ > 1 ? `<div class="row" style="justify-content:center;margin-top:16px">
        <button class="btn btn-ghost btn-sm" data-pg="-1" ${d.page <= 1 ? 'disabled' : ''}>← Prev</button>
        <span class="small muted">Page ${d.page} of ${pages_}</span>
        <button class="btn btn-ghost btn-sm" data-pg="1" ${d.page >= pages_ ? 'disabled' : ''}>Next →</button></div>` : ''}`;

    $('#newLink').addEventListener('click', newPaymentLink);
    $$('[data-status]', page).forEach((b) => b.addEventListener('click', () => {
      orderFilter = { ...orderFilter, status: b.dataset.status, page: 1 };
      route();
    }));
    $$('[data-pg]', page).forEach((b) => b.addEventListener('click', () => {
      orderFilter.page += Number(b.dataset.pg);
      route();
    }));
    $('#search').addEventListener('submit', (e) => {
      e.preventDefault();
      orderFilter = { ...orderFilter, q: e.target.q.value.trim(), page: 1 };
      route();
    });
    bindOrderClicks(page);
    refreshTimer = setInterval(() => currentPage === 'orders' && !$('.overlay') && pages.orders(page).catch(() => {}), 20000);
  };

  async function openOrder(id) {
    const { order: o, transaction: t, deliveries } = await api('/orders/' + encodeURIComponent(id));
    const open = ['pending', 'expired'].includes(o.status);
    const m = modal({
      title: `Order ${statusBadge(o.status)}`,
      wide: true,
      body: `
        <div class="stack lg">
          <div class="row between wrap">
            <div><div class="muted small">Amount ${o.amount !== o.amount_payable ? `(price ${inr(o.amount)})` : ''}</div><div style="font-size:30px;font-weight:800">${inr(o.amount_paid || o.amount_payable)}</div></div>
            ${o.status === 'pending' ? `<a class="btn btn-ghost btn-sm" href="${esc(o.payment_url)}" target="_blank" rel="noopener">${icon.link} Open payment page</a>` : ''}
          </div>
          ${o.status === 'pending' ? copyField(o.payment_url, 'Payment link') : ''}
          <dl class="detail-grid">
            <dt>Order ID</dt><dd class="mono">${esc(o.id)}</dd>
            ${o.reference ? `<dt>Reference</dt><dd class="mono">${esc(o.reference)}</dd>` : ''}
            <dt>From</dt><dd>${esc(o.site)}</dd>
            <dt>Customer</dt><dd>${esc([o.customer.name, o.customer.phone, o.customer.email].filter(Boolean).join(' · ') || '—')}</dd>
            ${o.note ? `<dt>Note</dt><dd>${esc(o.note)}</dd>` : ''}
            <dt>Bank</dt><dd>${esc(o.account || '—')}</dd>
            <dt>Created</dt><dd>${new Date(o.created_at).toLocaleString('en-IN')}</dd>
            <dt>Expires</dt><dd>${new Date(o.expires_at).toLocaleString('en-IN')}</dd>
            ${o.paid_at ? `<dt>Paid</dt><dd>${new Date(o.paid_at).toLocaleString('en-IN')} <span class="badge info plain">via ${esc(o.matched_by)}</span></dd>` : ''}
            ${o.utr ? `<dt>UTR</dt><dd class="mono">${esc(o.utr)}</dd>` : ''}
            ${o.customer_utr && o.customer_utr !== o.utr ? `<dt>UTR from customer</dt><dd class="mono">${esc(o.customer_utr)} <span class="faint small">(not yet seen in bank messages)</span></dd>` : ''}
          </dl>
          ${t ? `<div><div class="label" style="margin-bottom:6px">Bank message (${esc(sourceLabel[t.source] || t.source)})</div><div class="raw">${esc(t.raw_text)}</div></div>` : ''}
          ${deliveries.length ? `<div><div class="label" style="margin-bottom:6px">Website notifications (webhooks)</div>
            ${deliveries.map((w) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--border)">
              ${statusBadge(w.status)}<span class="small grow">${esc(w.event)} · ${w.attempts} tr${w.attempts === 1 ? 'y' : 'ies'}${w.last_error ? ` · <span style="color:var(--bad)">${esc(w.last_error)}</span>` : ''}</span>
              <button class="btn btn-ghost btn-sm" data-retry="${w.id}">${icon.refresh} Resend</button></div>`).join('')}</div>` : ''}
        </div>`,
      foot: open
        ? `<button class="btn btn-danger" id="cancelOrder">Cancel order</button><button class="btn btn-ok" id="markPaid">${icon.check} Mark as paid</button>`
        : `<button class="btn btn-ghost" data-close>Close</button>`,
    });
    $$('[data-retry]', m.el).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      await api(`/deliveries/${b.dataset.retry}/retry`, { method: 'POST' });
      toast('Sending again…', 'ok');
    })));
    $('#cancelOrder', m.el)?.addEventListener('click', async () => {
      if (!(await confirmBox('Cancel this order?', 'The customer will not be able to pay with this link any more.', { ok: 'Cancel order', danger: true }))) return;
      try {
        await api(`/orders/${o.id}/cancel`, { method: 'POST' });
        m.close();
        toast('Order cancelled');
        route();
      } catch (err) {
        toast(err.message, 'bad');
      }
    });
    $('#markPaid', m.el)?.addEventListener('click', () => {
      m.close();
      const mp = modal({
        title: 'Mark as paid',
        body: `<div class="stack">
          <div class="notice warn">${icon.alert}<div>Only do this after you have <b>checked your bank app</b> and the money is really there.</div></div>
          <div class="field"><label>UTR / UPI Ref (optional)</label><input class="input mono" id="mpUtr" inputmode="numeric" maxlength="12" value="${esc(o.customer_utr || '')}"></div></div>`,
        foot: `<button class="btn btn-ghost" data-close>Back</button><button class="btn btn-ok" id="mpGo">${icon.check} Confirm payment</button>`,
      });
      $('#mpGo', mp.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
        await api(`/orders/${o.id}/mark-paid`, { method: 'POST', body: { utr: $('#mpUtr', mp.el).value.trim() } });
        mp.close();
        toast('Marked as paid ✅', 'ok');
        route();
      }));
    });
  }

  let minOrder = '100';
  function newPaymentLink() {
    let createdLink = false;
    const m = modal({
      title: 'New payment link',
      // Refresh the list behind the modal once it is closed.
      onClose: () => createdLink && (currentPage === 'orders' || currentPage === 'dashboard') && setTimeout(route),
      body: `<form id="pl" class="stack">
        <p class="muted small" style="margin-top:-6px">Send this link on WhatsApp/Instagram. The customer pays by UPI and it confirms automatically.</p>
        <div class="field"><label>Amount</label><div class="input-group"><span class="prefix">₹</span><input class="input" name="amount" inputmode="decimal" placeholder="499" required style="font-size:20px;font-weight:700;height:52px"></div>
          <span class="hint">Minimum ₹${esc(minOrder)} (Settings mein badal sakte ho)</span></div>
        <div class="form-grid">
          <div class="field"><label>Customer name</label><input class="input" name="customer_name" placeholder="Optional"></div>
          <div class="field"><label>Phone</label><input class="input" name="customer_phone" inputmode="tel" placeholder="Optional"></div>
          <div class="field full"><label>What is it for?</label><input class="input" name="note" placeholder="e.g. Blue kurta size M"></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block">${icon.link} Create link</button>
      </form>`,
    });
    $('#pl', m.el).addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', e.target), async () => {
        const o = await api('/orders', { method: 'POST', body: formData(e.target) });
        const msg = `Hi${o.customer.name ? ' ' + o.customer.name : ''}, please pay ₹${o.amount_payable} here: ${o.payment_url}`;
        $('.modal-body', m.el).innerHTML = `
          <div class="stack lg center">
            <div style="font-size:44px">🔗</div>
            <div><div class="muted small">Customer will pay</div><div style="font-size:32px;font-weight:800">${inr(o.amount_payable)}</div>
            <div class="tiny muted">Price ${inr(o.amount)} + ${Math.round((o.amount_payable - o.amount) * 100)} paise to identify this payment</div></div>
            ${copyField(o.payment_url, 'Link')}
            <div class="row" style="justify-content:center;flex-wrap:wrap">
              <a class="btn btn-ok" target="_blank" rel="noopener" href="https://wa.me/${o.customer.phone ? '91' + o.customer.phone.replace(/\D/g, '').slice(-10) : ''}?text=${encodeURIComponent(msg)}">${icon.whatsapp} Send on WhatsApp</a>
              <a class="btn btn-ghost" target="_blank" rel="noopener" href="${esc(o.payment_url)}">${icon.link} Open</a>
            </div>
            <p class="tiny muted">Link is valid for a limited time (see Settings).</p>
          </div>`;
        createdLink = true;
      });
    });
  }

  // ---------------------------------------------------------------- bank accounts
  pages.accounts = async (page) => {
    const { accounts, devices } = await api('/accounts');
    const totalWeight = accounts.filter((a) => a.live).reduce((s, a) => s + a.weight, 0);
    page.innerHTML = `
      ${topbar('Bank Accounts', 'Where customers pay. Turn a bank LIVE or OFF anytime.', `<button class="btn btn-primary" id="addAcc">${icon.plus}<span class="hide-mobile">Add bank account</span><span class="show-mobile">Add</span></button>`)}
      ${accounts.length ? `<div class="grid cols-2">${accounts.map((a) => `
        <div class="card bank-card ${a.live ? 'is-live' : ''}">
          <div class="row">
            ${bankLogo(a.bank)}
            <div class="grow">
              <div class="bold ellipsis" style="font-size:16px">${esc(a.label)}</div>
              <div class="small muted ellipsis">${esc(BANKS[a.bank]?.name || 'Bank')}${a.account_last4 ? ' · ••' + esc(a.account_last4) : ''}</div>
            </div>
            <span class="live-label ${a.live ? 'on' : 'off'}" data-live-label="${a.id}">${a.live ? 'LIVE' : 'OFF'}</span>
            <label class="switch" title="Turn on/off"><input type="checkbox" data-live="${a.id}" ${a.live ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="row">
            ${a.qr_image ? `<img class="qr-thumb" src="${esc(a.qr_image)}" alt="QR">` : `<div class="qr-thumb" style="display:grid;place-items:center;color:var(--faint)">${icon.qr}</div>`}
            <div class="grow stack" style="gap:4px;min-width:0">
              <div class="mono small ellipsis">${esc(a.upi_id)}</div>
              <div class="tiny muted">${a.qr_mode === 'static' ? 'Shows your uploaded QR (customer types amount)' : 'Auto QR with amount filled in'}</div>
              <div class="tiny muted">${a.device_id ? '📱 ' + esc(devices.find((d) => d.id === a.device_id)?.name || 'Phone') : '<span style="color:var(--warn)">No phone linked</span>'}</div>
            </div>
          </div>
          <div class="kv">
            <div><div class="k">Today</div><div class="v" title="${inr(a.today_paid)}">${inrShort(a.today_paid)}</div></div>
            <div><div class="k">Share</div><div class="v">${a.live && totalWeight ? Math.round((a.weight / totalWeight) * 100) + '%' : '—'}</div></div>
            <div><div class="k">Daily limit</div><div class="v">${a.daily_limit ? inrShort(a.daily_limit) : 'None'}</div></div>
          </div>
          ${a.limit_used_pct !== null ? `<div><div class="row between tiny muted" style="margin-bottom:4px"><span>Limit used (incl. waiting)</span><span>${a.limit_used_pct}%</span></div><div class="meter ${a.limit_used_pct > 90 ? 'bad' : a.limit_used_pct > 70 ? 'warn' : ''}"><span style="width:${a.limit_used_pct}%"></span></div></div>` : ''}
          <div class="row">
            <button class="btn btn-ghost btn-sm grow" data-edit="${a.id}">${icon.edit} Edit</button>
            <button class="icon-btn" data-del="${a.id}" title="Delete" aria-label="Delete">${icon.trash}</button>
          </div>
        </div>`).join('')}</div>` : `
        <div class="card empty" style="padding:48px 20px">${icon.bank}<h2 style="color:var(--text)">No bank accounts yet</h2>
          <p style="margin:6px 0 16px">Add Kotak, Central Bank, Fino or any bank. Just upload the UPI QR.</p>
          <button class="btn btn-primary" id="addAcc2">${icon.plus} Add bank account</button></div>`}
      <div class="notice mt">${icon.info}<div class="small"><b>How it works:</b> every new order goes to one LIVE bank (by Share). When a bank reaches its daily limit it pauses by itself until tomorrow. Turning a bank OFF does not affect people who are already paying.</div></div>`;

    $('#addAcc').addEventListener('click', () => accountForm(null, devices));
    $('#addAcc2')?.addEventListener('click', () => accountForm(null, devices));
    $$('[data-edit]', page).forEach((b) => b.addEventListener('click', () => accountForm(accounts.find((a) => a.id === Number(b.dataset.edit)), devices)));
    $$('[data-del]', page).forEach((b) => b.addEventListener('click', async () => {
      const a = accounts.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmBox(`Delete ${esc(a.label)}?`, 'Old orders stay saved. You can add it again later.', { ok: 'Delete', danger: true }))) return;
      try {
        await api('/accounts/' + a.id, { method: 'DELETE' });
        toast('Deleted');
        route();
      } catch (err) {
        toast(err.message, 'bad');
      }
    }));
    bindLiveSwitches(page);
  };

  // Read a QR image in the browser: shrink it, decode with jsQR.
  function readQrFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image (PNG/JPG screenshot of your QR)'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not open the image'));
        img.onload = () => {
          const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let text = null;
          if (window.jsQR) {
            const found = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
            text = found ? found.data : null;
          }
          // Store a smaller copy for the payment page.
          const s2 = Math.min(1, 700 / Math.max(w, h));
          const c2 = document.createElement('canvas');
          c2.width = Math.round(w * s2);
          c2.height = Math.round(h * s2);
          const ctx2 = c2.getContext('2d');
          ctx2.fillStyle = '#fff';
          ctx2.fillRect(0, 0, c2.width, c2.height);
          ctx2.drawImage(c, 0, 0, c2.width, c2.height);
          resolve({ text, dataUrl: c2.toDataURL('image/jpeg', 0.9) });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function accountForm(a, devices) {
    const edit = !!a;
    a = a || { bank: 'kotak', weight: 1, qr_mode: 'dynamic', daily_limit: '', sender_hints: '' };
    let qrImage = a.qr_image || null;
    let qrText = '';
    const senderDefaults = { kotak: 'KOTAKB', cbi: 'CBIBNK,CENTBK', fino: 'FINOBK,FINOPB', sbi: 'SBIUPI,SBIINB', hdfc: 'HDFCBK', icici: 'ICICIB', axis: 'AXISBK', pnb: 'PNBSMS', bob: 'BOBTXN' };
    const m = modal({
      title: edit ? `Edit ${esc(a.label)}` : 'Add bank account',
      wide: true,
      body: `<form id="af" class="stack lg" autocomplete="off">
        <div>
          <div class="label" style="margin-bottom:8px">1. Your UPI QR code</div>
          <label class="drop" id="drop">
            <div class="ph" id="qrPh">${qrImage ? `<img src="${esc(qrImage)}" alt="">` : icon.upload}</div>
            <div class="grow">
              <div class="bold">Upload QR screenshot</div>
              <div class="small muted">From PhonePe Business, Paytm Business, Kotak, BHIM… We read the UPI ID from it automatically.</div>
              <div class="small" id="qrMsg" style="margin-top:6px"></div>
            </div>
            <input type="file" accept="image/*" id="qrFile" hidden>
          </label>
        </div>
        <div>
          <div class="label" style="margin-bottom:8px">2. Account details</div>
          <div class="form-grid">
            <div class="field"><label>Bank</label><select class="input" name="bank">${Object.entries(BANKS).map(([k, b]) => `<option value="${k}" ${a.bank === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
            <div class="field"><label>Name for this account</label><input class="input" name="label" value="${esc(a.label || '')}" placeholder="e.g. Kotak Main" required></div>
            <div class="field full"><label>UPI ID</label><input class="input mono" name="upi_id" value="${esc(a.upi_id || '')}" placeholder="yourname@kotak" required>
              <span class="hint">Money goes to this UPI ID. Double-check it!</span></div>
            <div class="field"><label>Name shown to customer</label><input class="input" name="payee_name" value="${esc(a.payee_name || '')}" placeholder="Sharma Electronics"></div>
            <div class="field"><label>Account holder</label><input class="input" name="holder_name" value="${esc(a.holder_name || '')}" placeholder="As in bank"></div>
            <div class="field"><label>Last 4 digits of account</label><input class="input mono" name="account_last4" value="${esc(a.account_last4 || '')}" inputmode="numeric" maxlength="6" placeholder="1234">
              <span class="hint">Helps tell banks apart when one phone gets SMS from two banks.</span></div>
            <div class="field"><label>Bank SMS sender ID</label><input class="input mono" name="sender_hints" value="${esc(a.sender_hints || senderDefaults[a.bank] || '')}" placeholder="KOTAKB">
              <span class="hint">From the SMS header, e.g. AX-<b>KOTAKB</b>. Comma for more. SMS from other senders are ignored.</span></div>
          </div>
        </div>
        <div>
          <div class="label" style="margin-bottom:8px">3. QR shown to customers</div>
          <div class="choice">
            <label><input type="radio" name="qr_mode" value="dynamic" ${a.qr_mode !== 'static' ? 'checked' : ''}><div><div class="bold">Auto amount QR <span class="badge info plain">Best</span></div><div class="small muted">Amount is already filled. Fewer mistakes.</div></div></label>
            <label><input type="radio" name="qr_mode" value="static" ${a.qr_mode === 'static' ? 'checked' : ''}><div><div class="bold">My uploaded QR</div><div class="small muted">Shows your exact QR. Customer types the amount.</div></div></label>
          </div>
        </div>
        <div>
          <div class="label" style="margin-bottom:8px">4. Confirmation & limits</div>
          <div class="form-grid">
            <div class="field"><label>Phone that gets this bank's SMS</label><select class="input" name="device_id"><option value="">— None yet —</option>${devices.map((d) => `<option value="${d.id}" ${a.device_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
              ${devices.length ? '' : '<span class="hint">Add a phone in <a href="#/devices">Phones</a> first.</span>'}</div>
            <div class="field"><label>Share of new orders</label><input class="input" type="number" min="0" max="100" name="weight" value="${esc(a.weight)}">
              <span class="hint">e.g. Kotak 5, CBI 4, Fino 1 → 50% / 40% / 10%</span></div>
            <div class="field full"><label>Daily limit (₹)</label><div class="input-group"><span class="prefix">₹</span><input class="input" name="daily_limit" inputmode="decimal" value="${esc(a.daily_limit)}" placeholder="Leave empty for no limit"></div>
              <span class="hint">When today's payments reach this, the bank pauses itself till midnight. Fino: keep under ₹2,00,000 balance.</span></div>
          </div>
        </div>
        ${edit ? '' : `<label class="row" style="gap:10px"><label class="switch"><input type="checkbox" name="live" checked><span class="track"></span></label><span class="bold">Make it LIVE now</span></label>`}
      </form>`,
      foot: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="saveAcc">${icon.check} ${edit ? 'Save changes' : 'Add account'}</button>`,
    });
    const form = $('#af', m.el);
    const msg = $('#qrMsg', m.el);
    const drop = $('#drop', m.el);

    form.bank.addEventListener('change', () => {
      if (!form.sender_hints.value || Object.values(senderDefaults).includes(form.sender_hints.value)) {
        form.sender_hints.value = senderDefaults[form.bank.value] || '';
      }
    });

    async function handleFile(file) {
      msg.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span> Reading QR…';
      try {
        const { text, dataUrl } = await readQrFile(file);
        qrImage = dataUrl;
        $('#qrPh', m.el).innerHTML = `<img src="${dataUrl}" alt="">`;
        if (!text) {
          msg.innerHTML = '<span style="color:var(--warn)">Image saved, but the QR could not be read. Type your UPI ID below.</span>';
          return;
        }
        const info = await api('/accounts/decode-qr', { method: 'POST', body: { text } });
        qrText = text;
        form.upi_id.value = info.upiId;
        if (info.payeeName && !form.payee_name.value) form.payee_name.value = info.payeeName;
        const guess = Object.keys(senderDefaults).find((k) => info.upiId.toLowerCase().includes(k));
        if (guess && !edit) {
          form.bank.value = guess;
          form.bank.dispatchEvent(new Event('change'));
        }
        msg.innerHTML = `<span style="color:var(--ok)">✓ Found UPI ID <b class="mono">${esc(info.upiId)}</b>${info.payeeName ? ' · ' + esc(info.payeeName) : ''}</span>` +
          (info.signed ? '<div class="tiny muted">This is a signed merchant QR. If customers see an error with "Auto amount QR", switch to "My uploaded QR".</div>' : '');
      } catch (err) {
        msg.innerHTML = `<span style="color:var(--bad)">${esc(err.message)}</span>`;
      }
    }
    $('#qrFile', m.el).addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));

    $('#saveAcc', m.el).addEventListener('click', (e) => {
      if (!form.reportValidity()) return;
      busy(e.currentTarget, async () => {
        const body = formData(form);
        body.qr_image = qrImage;
        if (qrText) body.qr_text = qrText;
        body.weight = Number(body.weight || 0);
        body.live = !!form.live?.checked;
        if (edit && a.upi_id !== body.upi_id.trim().toLowerCase()) {
          if (!(await confirmBox('Change UPI ID?', `Payments will now go to <b class="mono">${esc(body.upi_id)}</b>. You will get an alert about this change.`, { ok: 'Yes, change it' }))) return;
        }
        await api(edit ? `/accounts/${a.id}` : '/accounts', { method: edit ? 'PUT' : 'POST', body });
        m.close();
        toast(edit ? 'Saved' : 'Bank account added 🎉', 'ok');
        route();
      });
    });
  }

  // ---------------------------------------------------------------- phones
  pages.devices = async (page) => {
    const devices = await api('/devices');
    page.innerHTML = `
      ${topbar('Phones', 'Phones that read bank SMS and confirm payments', `<button class="btn btn-primary" id="addDev">${icon.plus}<span class="hide-mobile">Add phone</span><span class="show-mobile">Add</span></button>`)}
      <div class="grid cols-2">
        <div class="stack">
          ${devices.length ? devices.map((d) => `
            <div class="card stack">
              <div class="row">
                <div class="bank-logo" style="background:var(--brand-soft);color:var(--brand)">${icon.phone}</div>
                <div class="grow"><div class="bold">${esc(d.name)}</div><div class="tiny muted">Last message: ${when(d.last_seen_at)}</div></div>
                ${!d.active ? '<span class="badge off">Disconnected</span>' : d.online ? '<span class="badge online">Active</span>' : d.last_seen_at ? '<span class="badge warn">Quiet</span>' : '<span class="badge off">Never connected</span>'}
              </div>
              ${IN_APP ? `<a class="btn btn-primary btn-block" href="apnapay://sms?url=${encodeURIComponent(d.sms_url)}">${icon.phone} Use THIS phone as SMS reader</a>` : ''}
              <div class="field"><label>SMS forward URL</label>${copyField(d.sms_url, 'SMS URL')}</div>
              <details><summary class="small muted" style="cursor:pointer">Heartbeat URL (optional)</summary><div style="margin-top:8px">${copyField(d.ping_url, 'Ping URL')}
                <p class="tiny muted" style="margin-top:6px">Open this every 15 minutes with MacroDroid/Tasker so you can see the phone is online even when no payment comes.</p></div></details>
              <div class="row wrap">
                <button class="btn btn-ghost btn-sm" data-toggle="${d.id}" data-active="${d.active ? 1 : 0}">${d.active ? 'Disconnect' : 'Reconnect'}</button>
                <button class="btn btn-ghost btn-sm" data-token="${d.id}">${icon.refresh} New URL</button>
                <button class="icon-btn" data-deldev="${d.id}" aria-label="Delete">${icon.trash}</button>
              </div>
            </div>`).join('') : `<div class="card empty">${icon.phone}<div>No phones yet. Add one for each phone that receives bank SMS.</div></div>`}
        </div>
        <div class="card">
          <h2>Set up a phone (2 minutes)</h2>
          <div class="notice ok" style="margin:10px 0 16px">${icon.check}<div class="small"><b>Easiest: ApnaPay Admin app.</b> Install the app on the phone that gets bank SMS → open <b>Phones</b> → tap <b>"Use THIS phone as SMS reader"</b> → allow SMS → done.</div></div>
          <p class="small muted" style="margin:0 0 12px">Or use any SMS-to-URL forwarder app:</p>
          <ol class="steps-list">
            <li><div>Install <b>"SMS to URL Forwarder"</b> from F-Droid or Play Store (or any app that can POST SMS to a URL).</div></li>
            <li><div>Click <b>Add phone</b> here and copy its <b>SMS forward URL</b>.</div></li>
            <li><div>In the app add a rule: <b>Sender</b> = your bank's ID (e.g. <code>KOTAKB</code>), <b>URL</b> = the copied URL. Keep the default JSON template: <code>{"from":"%from%","text":"%text%"}</code></div></li>
            <li><div>Allow SMS permission, and in Android settings turn <b>battery optimisation OFF</b> for the app.</div></li>
            <li><div>In <a href="#/accounts">Bank Accounts</a> → Edit, choose this phone for the bank.</div></li>
            <li><div>Test: pay ₹1 using a payment link, or paste an old bank SMS in <a href="#/messages">Bank Messages → Test</a>.</div></li>
          </ol>
          <div class="notice warn mt">${icon.shield}<div class="small">Only forward SMS from your <b>bank sender IDs</b> — never forward all SMS (OTPs stay on your phone). SMS from normal mobile numbers are always rejected, so nobody can fake a payment by sending you a message.</div></div>
        </div>
      </div>`;

    $('#addDev').addEventListener('click', () => {
      const m = modal({
        title: 'Add phone',
        body: `<form id="df" class="stack"><div class="field"><label>Phone name</label><input class="input" name="name" placeholder="e.g. Phone 1 (Kotak)" required></div>
          <button class="btn btn-primary btn-block">Add phone</button></form>`,
      });
      $('#df', m.el).addEventListener('submit', (e) => {
        e.preventDefault();
        busy($('button', e.target), async () => {
          await api('/devices', { method: 'POST', body: formData(e.target) });
          m.close();
          toast('Phone added. Copy its URL into the SMS app.', 'ok');
          route();
        });
      });
    });
    $$('[data-toggle]', page).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      await api('/devices/' + b.dataset.toggle, { method: 'PUT', body: { active: b.dataset.active !== '1' } });
      route();
    })));
    $$('[data-token]', page).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Make a new URL?', 'The old URL stops working right away. You must paste the new one into the SMS app.'))) return;
      busy(b, async () => {
        await api(`/devices/${b.dataset.token}/new-token`, { method: 'POST' });
        route();
      });
    }));
    $$('[data-deldev]', page).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this phone?', 'Its SMS will no longer be accepted.', { ok: 'Delete', danger: true }))) return;
      await api('/devices/' + b.dataset.deldev, { method: 'DELETE' });
      route();
    }));
  };

  // ---------------------------------------------------------------- bank messages
  let msgFilter = 'unmatched';
  const SMS_STATUS = {
    matched: ['paid', '✅ Payment confirmed'],
    unmatched: ['warn', 'Money received · no order'],
    duplicate: ['off', 'Duplicate'],
    not_credit: ['off', 'Sent · not a credit'],
    rejected: ['bad', 'Rejected'],
    skipped: ['off', 'Skipped on phone'],
  };

  function smsActivityHtml(act) {
    const yesNo = (v, yes, no) => (v === 1 ? `<span class="badge live">${yes}</span>` : v === 0 ? `<span class="badge bad">${no}</span>` : '');
    const phones = act.phones.map((p) => {
      const warn = [];
      if (p.sms_permission === 0) warn.push(`<b>SMS permission OFF.</b> Phone par app → More → SMS reader → <b>Allow SMS permission</b>. Android 13+: Settings → Apps → ApnaPay Admin → ⋮ → <b>Allow restricted settings</b>, phir permission do.`);
      if (p.reader_enabled === 0) warn.push('SMS reader is turned <b>OFF</b> on this phone.');
      if (!p.app_version) warn.push('Status unknown — install the latest ApnaPay Admin app (v1.3+) on this phone and open SMS reader once.');
      else if (!p.today.read && !p.last_sms_at) warn.push('Phone ne abhi tak koi SMS nahi padha. Ek ₹1 payment karke dekho, ya SMS reader mein <b>Sync last 24h SMS</b> dabao.');
      return `
        <div class="card stack" style="gap:12px">
          <div class="row">
            <div class="bank-logo" style="background:var(--brand-soft);color:var(--brand)">${icon.phone}</div>
            <div class="grow"><div class="bold">${esc(p.name)}</div>
              <div class="tiny muted">Online: ${when(p.last_seen_at)} · Last SMS: ${when(p.last_sms_at)}${p.app_version ? ' · app v' + esc(p.app_version) : ''}</div></div>
            ${!p.active ? '<span class="badge off">Disconnected</span>' : p.online ? '<span class="badge online">Active</span>' : '<span class="badge warn">Quiet</span>'}
          </div>
          <div class="row wrap" style="gap:6px">
            ${yesNo(p.sms_permission, 'SMS permission ✓', 'SMS permission ✗')}
            ${yesNo(p.reader_enabled, 'Reader ON', 'Reader OFF')}
            ${p.reader_queue ? `<span class="badge warn">${p.reader_queue} waiting for internet</span>` : ''}
          </div>
          <div class="kv" style="grid-template-columns:repeat(4,1fr)">
            <div><div class="k">Read today</div><div class="v">${p.today.read}</div></div>
            <div><div class="k">Sent</div><div class="v">${p.today.forwarded}</div></div>
            <div><div class="k">Confirmed</div><div class="v" style="color:var(--ok)">${p.today.matched}</div></div>
            <div><div class="k">Skipped</div><div class="v">${p.today.skipped}</div></div>
          </div>
          ${warn.map((w) => `<div class="notice warn small">${icon.alert}<div>${w}</div></div>`).join('')}
        </div>`;
    }).join('');
    const events = act.events.map((e) => {
      const [cls, label] = SMS_STATUS[e.status] || ['off', e.status];
      return `<div class="list-item" style="align-items:flex-start;flex-direction:column;gap:6px">
        <div class="row" style="width:100%">
          <div class="grow"><span class="bold mono small">${esc(e.sender || '—')}</span>
            <span class="tiny muted"> · ${esc(e.phone)} · ${when(e.created_at)}</span></div>
          ${e.amount ? `<span class="amount">${inr(e.amount)}</span>` : ''}
        </div>
        <div class="row wrap" style="gap:6px"><span class="badge ${cls}">${label}</span>
          ${e.reason ? `<span class="tiny muted">${esc(e.reason)}</span>` : ''}
          ${e.order_id ? `<a href="#" class="tiny" data-open-order="${esc(e.order_id)}">view order</a>` : ''}</div>
        ${e.text ? `<details style="width:100%"><summary class="tiny muted" style="cursor:pointer">Show SMS</summary><div class="raw" style="margin-top:6px">${esc(e.text)}</div></details>` : ''}
      </div>`;
    }).join('');
    return `
      <div class="card-head" style="margin:0 0 10px"><div><h2>📱 SMS Reader activity</h2><div class="sub">What your phones read — updates every few seconds</div></div></div>
      ${act.phones.length ? `<div class="grid cols-2">${phones}</div>` : `<div class="notice">${icon.info}<div>No phone added yet. Go to <a href="#/devices">Phones</a>.</div></div>`}
      <div class="card flush mt">
        <div class="card-head" style="padding:16px 18px 0"><h3>Recent SMS seen by phones</h3><span class="tiny muted">${act.events.length} latest</span></div>
        ${events || `<div class="empty">${icon.inbox}<div>No SMS seen yet. When a bank SMS arrives on a phone with the reader ON, it shows up here.</div></div>`}
      </div>`;
  }

  pages.messages = async (page) => {
    const [list, devices, act] = await Promise.all([api('/transactions' + (msgFilter ? '?status=' + msgFilter : '')), api('/devices'), api('/sms-activity')]);
    if (msgFilter === 'unmatched') {
      badges.messages = list.length;
      setBadges();
    }
    const tabs = [['unmatched', 'Needs attention'], ['matched', 'Matched'], ['', 'All']];
    page.innerHTML = `
      ${topbar('Bank Messages', 'SMS your phones read, and every bank credit we received')}
      <div id="smsAct">${smsActivityHtml(act)}</div>
      <h2 style="margin:26px 0 12px">💰 Bank credits</h2>
      <div class="grid cols-2" style="align-items:start">
        <div class="stack">
          <div class="tabs">${tabs.map(([v, l]) => `<button data-mf="${v}" class="${msgFilter === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="card flush">
            ${list.length ? list.map((t) => `
              <div class="list-item" style="align-items:flex-start;flex-direction:column;gap:8px">
                <div class="row" style="width:100%">
                  <div class="grow"><span class="amount" style="font-size:17px">${t.amount ? inr(t.amount) : '—'}</span>
                    <span class="tiny muted"> · ${esc(sourceLabel[t.source] || t.source)}${t.account ? ' · ' + esc(t.account) : ''} · ${when(t.received_at)}</span></div>
                  ${statusBadge(t.status)}
                </div>
                <div class="tiny muted">${t.utr ? 'UTR <span class="mono">' + esc(t.utr) + '</span>' : 'No UTR found'}${t.payer ? ' · from ' + esc(t.payer) : ''}${t.order_id ? ` · <a href="#" data-open-order="${esc(t.order_id)}">view order</a>` : ''}</div>
                <details style="width:100%"><summary class="tiny muted" style="cursor:pointer">Show message</summary><div class="raw" style="margin-top:6px">${esc(t.raw_text)}</div></details>
                ${t.status === 'unmatched' ? `<div class="row"><button class="btn btn-soft btn-sm" data-link="${t.id}" data-amt="${esc(t.amount)}">${icon.link} Link to order</button><button class="btn btn-ghost btn-sm" data-ignore="${t.id}">Not an order</button></div>` : ''}
              </div>`).join('') : `<div class="empty">${icon.inbox}<div>${msgFilter === 'unmatched' ? 'All clear! Every payment is matched. 🎉' : 'No messages yet'}</div></div>`}
          </div>
        </div>
        <div class="card stack">
          <div><h2>Test a bank SMS</h2><p class="small muted" style="margin-top:4px">Paste a real credit SMS from your bank to check we read it correctly.</p></div>
          <form id="tf" class="stack">
            <textarea class="input" name="text" placeholder="e.g. Received Rs.499.37 in your Kotak Bank AC X1234 from rahul@okaxis on 02-10-26.UPI Ref:427512345678" required></textarea>
            <div class="form-grid">
              <div class="field"><label>Sender</label><input class="input mono" name="sender" placeholder="AX-KOTAKB"></div>
              <div class="field"><label>Phone</label><select class="input" name="device_id"><option value="">Any</option>${devices.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
            </div>
            <div class="row"><button class="btn btn-ghost grow" data-mode="parse">Check only</button><button class="btn btn-primary grow" data-mode="run">Process for real</button></div>
          </form>
          <div id="testOut"></div>
        </div>
      </div>`;

    $$('[data-mf]', page).forEach((b) => b.addEventListener('click', () => { msgFilter = b.dataset.mf; route(); }));
    const bindOrderLinks = (scope) => $$('[data-open-order]', scope).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openOrder(a.dataset.openOrder); }));
    refreshTimer = setInterval(async () => {
      if (currentPage !== 'messages' || $('.overlay') || document.hidden) return;
      try {
        const box = $('#smsAct', page);
        const open = $$('details[open]', box).length;
        if (open) return; // don't collapse an SMS the admin is reading
        box.innerHTML = smsActivityHtml(await api('/sms-activity'));
        bindOrderLinks(box);
      } catch {}
    }, 8000);
    $$('[data-open-order]', page).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openOrder(a.dataset.openOrder); }));
    $$('[data-ignore]', page).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      await api(`/transactions/${b.dataset.ignore}/ignore`, { method: 'POST' });
      route();
    })));
    $$('[data-link]', page).forEach((b) => b.addEventListener('click', () => linkTransaction(b.dataset.link, b.dataset.amt)));

    const form = $('#tf', page);
    form.addEventListener('submit', (e) => e.preventDefault());
    $$('[data-mode]', form).forEach((btn) => btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const run = btn.dataset.mode === 'run';
      busy(btn, async () => {
        const out = $('#testOut', page);
        if (!run) {
          const r = await api('/tools/parse', { method: 'POST', body: formData(form) });
          const p = r.parsed;
          out.innerHTML = `<div class="notice ${p.type === 'credit' ? 'ok' : 'warn'}">${p.type === 'credit' ? icon.check : icon.alert}<div class="stack" style="gap:4px">
            <div><b>${p.type === 'credit' ? 'Money received ✓' : p.type === 'debit' ? 'Money sent (ignored)' : 'Ignored'}</b>${p.reason ? ' — ' + esc(p.reason) : ''}</div>
            <div class="small">Amount: <b>${p.amount ? inr(p.amount) : '—'}</b> · UTR: <b class="mono">${esc(p.utr || '—')}</b> · A/c: <b>${esc(p.last4 || '—')}</b></div>
            <div class="small">Bank account: <b>${esc(r.account || 'not sure')}</b>${p.payer ? ' · Payer: ' + esc(p.payer) : ''}</div>
            <div class="small">${r.candidates.length ? `Would confirm: <b>${r.candidates.map((c) => esc(c.reference || c.id)).join(', ')}</b>` : 'No open order has this exact amount.'}</div></div></div>`;
        } else {
          if (!(await confirmBox('Process for real?', 'If an open order matches this amount it will be marked PAID and the website will be notified.'))) return;
          const r = await api('/tools/simulate', { method: 'POST', body: formData(form) });
          out.innerHTML = r.order
            ? `<div class="notice ok">${icon.check}<div>Matched and confirmed order <b>${esc(r.order.reference || r.order.id)}</b> 🎉</div></div>`
            : `<div class="notice warn">${icon.alert}<div>${r.type !== 'credit' ? 'Not a credit message' + (r.reason ? ': ' + esc(r.reason) : '') : r.duplicate ? 'Already received this payment (duplicate).' : 'Saved, but no order matched. See "Needs attention".'}</div></div>`;
          setTimeout(route, 1500);
        }
      });
    }));
  };

  async function linkTransaction(txId, amount) {
    const [pending, expired] = await Promise.all([api('/orders?status=pending'), api('/orders?status=expired')]);
    const options = [...pending.orders, ...expired.orders];
    options.sort((x, y) => Math.abs(Number(x.amount_payable) - Number(amount)) - Math.abs(Number(y.amount_payable) - Number(amount)));
    const m = modal({
      title: `Link ${inr(amount)} to an order`,
      body: options.length
        ? `<p class="small muted" style="margin-bottom:10px">Closest amounts first. Choose the order this money belongs to.</p>
           <div class="card flush">${options.slice(0, 20).map((o) => `<div class="list-item click" data-pick="${esc(o.id)}">
             <div class="grow"><div class="bold">${esc(o.customer.name || o.reference || o.id)}</div><div class="tiny muted">${esc(o.site)} · ${when(o.created_at)}</div></div>
             <div style="text-align:right"><div class="amount">${inr(o.amount_payable)}</div>${statusBadge(o.status)}</div></div>`).join('')}</div>`
        : '<div class="empty">No open or expired orders to link.</div>',
    });
    $$('[data-pick]', m.el).forEach((el) => el.addEventListener('click', async () => {
      if (!(await confirmBox('Confirm this order?', 'The order will be marked PAID using this bank message.'))) return;
      try {
        await api(`/orders/${el.dataset.pick}/mark-paid`, { method: 'POST', body: { transaction_id: Number(txId) } });
        m.close();
        toast('Linked and confirmed ✅', 'ok');
        route();
      } catch (err) {
        toast(err.message, 'bad');
      }
    }));
  }

  // ---------------------------------------------------------------- websites
  pages.sites = async (page) => {
    const sites = await api('/sites');
    const base = location.origin;
    page.innerHTML = `
      ${topbar('Websites & API', 'Your own shops that send customers here to pay', `<button class="btn btn-primary" id="addSite">${icon.plus}<span class="hide-mobile">Connect website</span><span class="show-mobile">Add</span></button>`)}
      <div class="notice warn" style="margin-bottom:16px">${icon.shield}<div class="small"><b>Only connect your own websites.</b> Taking payments for other people's businesses into your account needs an RBI licence, and their complaints could freeze your account.</div></div>
      <div class="grid cols-2" style="align-items:start">
        <div class="stack">
          ${sites.length ? sites.map((s) => `
            <div class="card stack" style="${s.active ? '' : 'opacity:.6'}">
              <div class="row"><div class="bank-logo" style="background:var(--brand-soft);color:var(--brand)">${icon.globe}</div>
                <div class="grow"><div class="bold">${esc(s.name)}</div><div class="tiny muted">${s.orders} orders${s.failed_webhooks ? ` · <span style="color:var(--bad)">${s.failed_webhooks} failed notifications</span>` : ''}</div></div>
                ${s.active ? '<span class="badge live">Active</span>' : '<span class="badge off">Disabled</span>'}</div>
              <div class="field"><label>API key</label><div class="copy"><code>${esc(s.api_key_hint)}</code><span class="tiny muted">hidden</span></div></div>
              <div class="field"><label>Webhook URL</label><div class="small mono" style="overflow-wrap:anywhere">${esc(s.webhook_url || '— not set —')}</div></div>
              <div class="field"><label>Webhook secret</label>${copyField(s.webhook_secret, 'Webhook secret')}</div>
              <div class="row wrap">
                <button class="btn btn-ghost btn-sm" data-sedit="${s.id}">${icon.edit} Edit</button>
                <button class="btn btn-ghost btn-sm" data-stest="${s.id}">${icon.send} Test webhook</button>
                <button class="btn btn-ghost btn-sm" data-skey="${s.id}">${icon.refresh} New API key</button>
                ${s.active ? `<button class="btn btn-danger btn-sm" data-soff="${s.id}">Disable</button>` : `<button class="btn btn-soft btn-sm" data-son="${s.id}">Enable</button>`}
              </div>
            </div>`).join('') : `<div class="card empty">${icon.globe}<div>No website connected yet.</div></div>`}
        </div>
        <div class="card stack">
          <h2>How your product website connects</h2>
          <ol class="steps-list">
            <li><div>Customer clicks <b>Buy</b>. Your website's <b>server</b> creates an order:</div></li>
          </ol>
          <div class="raw">POST ${esc(base)}/api/v1/orders
Authorization: Bearer ak_live_…
{ "amount": 499, "reference": "P-101",
  "customer": { "name": "Rahul", "phone": "98…" },
  "return_url": "https://myshop.in/thanks" }</div>
          <ol class="steps-list" start="2" style="counter-reset:s 1">
            <li><div>Send the customer to the <code>payment_url</code> from the reply.</div></li>
            <li><div>When the money arrives we POST <code>order.paid</code> to your <b>webhook URL</b>, signed with the secret. Mark the product SOLD there.</div></li>
            <li><div>Not sure? Ask anytime: <code>GET /api/v1/orders/{id}</code></div></li>
          </ol>
          <p class="small muted">Full guide with ready code: <code>README.md</code> and <code>examples/shop-demo</code> in the project.</p>
        </div>
      </div>`;

    $('#addSite').addEventListener('click', () => siteForm(null));
    $$('[data-sedit]', page).forEach((b) => b.addEventListener('click', () => siteForm(sites.find((s) => s.id === Number(b.dataset.sedit)))));
    $$('[data-stest]', page).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      const r = await api(`/sites/${b.dataset.stest}/test-webhook`, { method: 'POST' });
      toast(r.ok ? `Webhook OK (HTTP ${r.status}) ✅` : `Webhook failed: ${r.error || 'HTTP ' + r.status}`, r.ok ? 'ok' : 'bad');
    })));
    $$('[data-skey]', page).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Make a new API key?', 'The old key stops working immediately. Update it on your website right after.'))) return;
      const s = await api(`/sites/${b.dataset.skey}/new-key`, { method: 'POST' });
      showKey(s);
    }));
    $$('[data-soff]', page).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Disable this website?', 'It will not be able to create new orders.', { ok: 'Disable', danger: true }))) return;
      await api('/sites/' + b.dataset.soff, { method: 'PUT', body: { active: false } });
      route();
    }));
    $$('[data-son]', page).forEach((b) => b.addEventListener('click', async () => {
      await api('/sites/' + b.dataset.son, { method: 'PUT', body: { active: true } });
      route();
    }));
  };

  function showKey(s) {
    const m = modal({
      title: 'Save your API key',
      body: `<div class="stack">
        <div class="notice warn">${icon.alert}<div>This key is shown <b>only once</b>. Put it in your website's server settings (never in browser/JS code).</div></div>
        <div class="field"><label>API key</label>${copyField(s.api_key, 'API key')}</div>
        <div class="field"><label>Webhook secret</label>${copyField(s.webhook_secret, 'Webhook secret')}</div></div>`,
      foot: '<button class="btn btn-primary" data-close>I saved it</button>',
      onClose: route,
    });
    return m;
  }

  function siteForm(s) {
    const edit = !!s;
    const m = modal({
      title: edit ? 'Edit website' : 'Connect a website',
      body: `<form id="sf" class="stack">
        <div class="field"><label>Website name</label><input class="input" name="name" value="${esc(s?.name || '')}" placeholder="e.g. My Shop" required></div>
        <div class="field"><label>Webhook URL</label><input class="input mono" name="webhook_url" value="${esc(s?.webhook_url || '')}" placeholder="https://myshop.in/api/payment-webhook">
          <span class="hint">We call this the moment a payment is confirmed.</span></div>
        <div class="field"><label>Default return URL</label><input class="input mono" name="return_url" value="${esc(s?.return_url || '')}" placeholder="https://myshop.in/thank-you">
          <span class="hint">Where the customer goes after paying.</span></div>
        <button class="btn btn-primary btn-block">${edit ? 'Save' : 'Create API key'}</button></form>`,
    });
    $('#sf', m.el).addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', e.target), async () => {
        const out = await api(edit ? '/sites/' + s.id : '/sites', { method: edit ? 'PUT' : 'POST', body: formData(e.target) });
        m.close();
        if (out.api_key) showKey(out);
        else {
          toast('Saved', 'ok');
          route();
        }
      });
    });
  }

  // ---------------------------------------------------------------- settings
  pages.settings = async (page) => {
    const [s, activity] = await Promise.all([api('/settings'), api('/activity')]);
    const st = s.settings;
    minOrder = st.min_order_amount || minOrder;
    page.innerHTML = `
      ${topbar('Settings')}
      <div class="grid cols-2" style="align-items:start">
        <div class="stack lg">
          <form class="card stack" id="bizForm">
            <h2>Business & payments</h2>
            <div class="field"><label>Business name</label><input class="input" name="business_name" value="${esc(st.business_name)}"><span class="hint">Shown on the payment page.</span></div>
            <div class="field"><label>Support phone (optional)</label><input class="input" name="support_phone" value="${esc(st.support_phone)}"></div>
            <div class="field"><label>Minimum order amount (₹)</label><div class="input-group"><span class="prefix">₹</span><input class="input" type="number" min="1" max="99999" name="min_order_amount" value="${esc(st.min_order_amount)}"></div>
              <span class="hint">Isse kam ka payment link / order nahi banega.</span></div>
            <div class="form-grid">
              <div class="field"><label>Payment link valid for (minutes)</label><input class="input" type="number" min="2" max="120" name="order_expiry_minutes" value="${esc(st.order_expiry_minutes)}"></div>
              <div class="field"><label>Accept late payments for (hours)</label><input class="input" type="number" min="1" max="168" name="late_match_hours" value="${esc(st.late_match_hours)}"></div>
            </div>
            <label class="row" style="gap:12px;align-items:flex-start"><label class="switch"><input type="checkbox" name="accept_base_amount" ${st.accept_base_amount === '1' ? 'checked' : ''}><span class="track"></span></label>
              <span class="small"><b>Accept round amounts</b><br><span class="muted">If a customer pays ₹499 instead of ₹499.37, still confirm it — but only when exactly one open order is for ₹499.</span></span></label>
            <div><button class="btn btn-primary">Save</button></div>
          </form>

          <form class="card stack" id="topupForm">
            <div class="row between"><div><h2>💰 Add Money page</h2><p class="small muted" style="margin-top:4px">Customer ready amount (₹100, ₹200…) tap kare, turant bill ban kar UPI payment khul jaye.</p></div>
              <label class="switch"><input type="checkbox" name="topup_enabled" ${st.topup_enabled === '1' ? 'checked' : ''}><span class="track"></span></label></div>
            <div class="field"><label>Page link (app / WhatsApp mein lagao)</label>${copyField(s.topup_url, 'Add money link')}
              <span class="hint">Customer pehchanne ke liye link ke end mein uska number jodo: <code>${esc(s.topup_url)}?user=9876543210</code></span></div>
            <div class="field"><label>Ready amounts (₹)</label><input class="input mono" name="topup_amounts" value="${esc(st.topup_amounts)}" placeholder="100, 200, 400, 1000">
              <span class="hint">Comma lagakar likho. Minimum order (₹${esc(st.min_order_amount)}) se kam wale nahi dikhenge.</span></div>
            <div class="form-grid">
              <div class="field"><label>Page title</label><input class="input" name="topup_title" value="${esc(st.topup_title)}"></div>
              <div class="field"><label>Apna amount max (₹)</label><input class="input" type="number" min="1" max="99999" name="topup_max" value="${esc(st.topup_max)}"></div>
            </div>
            <label class="row" style="gap:12px"><label class="switch"><input type="checkbox" name="topup_custom" ${st.topup_custom === '1' ? 'checked' : ''}><span class="track"></span></label>
              <span class="small"><b>Customer apna amount bhi daal sake</b></span></label>
            <div class="form-grid">
              <div class="field"><label>Webhook kis website ko jaye (optional)</label><select class="input" name="topup_site_id"><option value="">— Koi nahi —</option>
                ${s.sites.map((x) => `<option value="${x.id}" ${String(st.topup_site_id) === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
              <div class="field"><label>Payment ke baad kahan bheje (optional)</label><input class="input mono" name="topup_return_url" value="${esc(st.topup_return_url)}" placeholder="https://myshop.in/thanks"></div>
            </div>
            <div class="row"><button class="btn btn-primary">Save</button><a class="btn btn-ghost" href="${esc(s.topup_url)}" target="_blank" rel="noopener">${icon.link} Page kholo</a></div>
          </form>

          <form class="card stack" id="tgForm">
            <div><h2>Telegram alerts</h2><p class="small muted" style="margin-top:4px">Free instant alerts on your phone for every payment, login and security change.</p></div>
            <ol class="steps-list small"><li><div>Open Telegram, message <b>@BotFather</b> → <code>/newbot</code> → copy the token.</div></li>
              <li><div>Send <b>/start</b> to your new bot, then message <b>@userinfobot</b> to get your chat id.</div></li></ol>
            <div class="field"><label>Bot token</label><input class="input mono" name="telegram_bot_token" value="${esc(st.telegram_bot_token)}" placeholder="123456:ABC…" autocomplete="off"></div>
            <div class="field"><label>Your chat id</label><input class="input mono" name="telegram_chat_id" value="${esc(st.telegram_chat_id)}" placeholder="123456789"></div>
            <div class="row"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-ghost" id="tgTest">${icon.send} Send test</button></div>
          </form>

          <form class="card stack" id="emailForm">
            <div><h2>Bank email alerts</h2><p class="small muted" style="margin-top:4px">Backup that works even when your phone is off. Forward bank credit emails to this link (see README: Cloudflare Email Worker, free).</p></div>
            <div class="field"><label>Email forwarding endpoint</label>${copyField(s.email_url, 'Email URL')}</div>
            <div class="field"><label>Trusted bank email domains</label><input class="input mono" name="email_allowed_domains" value="${esc(st.email_allowed_domains)}">
              <span class="hint">Emails from any other domain are ignored. Check the "From" of your bank's alert email and add its domain here.</span></div>
            <div class="row"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-ghost" id="newEmailTok">${icon.refresh} New link</button></div>
          </form>
        </div>

        <div class="stack lg">
          <div class="card stack">
            <h2>${icon.shield.replace('<svg', '<svg width="20" height="20" style="vertical-align:-4px;color:var(--brand)"')} Security</h2>
            <div class="row between"><div><div class="bold">Two-factor login (2FA)</div><div class="small muted">Code from Google Authenticator on every login</div></div>
              ${s.totp_enabled ? '<span class="badge live">ON</span>' : '<span class="badge warn">OFF</span>'}</div>
            <div id="twofa">${s.totp_enabled
              ? `<button class="btn btn-ghost btn-sm" id="tfOff">Turn off 2FA</button>`
              : `<div class="notice warn">${icon.alert}<div class="small">Strongly recommended. If someone steals your password they still can't change your UPI ID.</div></div><button class="btn btn-primary mt" id="tfOn">Turn on 2FA</button>`}</div>
            <div class="divider"></div>
            <form id="pwForm" class="stack">
              <div class="bold">Change password <span class="muted small">(user: ${esc(s.username)})</span></div>
              <input class="input" type="password" name="current" placeholder="Current password" autocomplete="current-password" required>
              <input class="input" type="password" name="next" placeholder="New password (8+ characters)" minlength="8" autocomplete="new-password" required>
              <div><button class="btn btn-ghost">Change password</button></div>
            </form>
            <div class="divider"></div>
            <div class="row between"><div class="small muted">Lost a phone or laptop?</div><button class="btn btn-danger btn-sm" id="logoutAll">Log out everywhere</button></div>
          </div>

          <div class="card flush">
            <div class="card-head" style="padding:18px 20px 0"><h2>Activity log</h2></div>
            ${activity.length ? activity.slice(0, 40).map((a) => `<div class="list-item" style="align-items:flex-start">
              <span class="badge ${a.level === 'alert' ? 'warn' : a.level === 'success' ? 'paid' : 'info'} plain" style="margin-top:1px">${a.level === 'alert' ? '!' : a.level === 'success' ? '₹' : 'i'}</span>
              <div class="grow small">${esc(a.message)}<div class="tiny faint">${when(a.created_at)}</div></div></div>`).join('') : '<div class="empty">Nothing yet</div>'}
          </div>
        </div>
      </div>`;

    const saveForm = (id, transform = (b) => b) => $(id, page).addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button:not([type=button])', e.target), async () => {
        await api('/settings', { method: 'PUT', body: transform(formData(e.target), e.target) });
        toast('Saved', 'ok');
      });
    });
    saveForm('#bizForm', (b, f) => ({ ...b, accept_base_amount: f.accept_base_amount.checked }));
    saveForm('#tgForm');
    saveForm('#topupForm', (b, f) => ({ ...b, topup_enabled: f.topup_enabled.checked, topup_custom: f.topup_custom.checked }));
    saveForm('#emailForm');
    $('#tgTest', page).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      await api('/settings', { method: 'PUT', body: formData($('#tgForm', page)) });
      await api('/settings/telegram-test', { method: 'POST' });
      toast('Test message sent — check Telegram', 'ok');
    }));
    $('#newEmailTok', page).addEventListener('click', async () => {
      if (!(await confirmBox('Make a new email link?', 'The old link stops working. Update your email worker after this.'))) return;
      await api('/settings/new-email-token', { method: 'POST' });
      route();
    });
    $('#pwForm', page).addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', e.target), async () => {
        await api('/security/password', { method: 'POST', body: formData(e.target) });
        e.target.reset();
        toast('Password changed. Other devices were logged out.', 'ok');
      });
    });
    $('#logoutAll', page).addEventListener('click', async () => {
      if (!(await confirmBox('Log out everywhere?', 'You will need to log in again on this device too.', { ok: 'Log out all', danger: true }))) return;
      await api('/security/logout-all', { method: 'POST' });
      boot();
    });
    $('#tfOn', page)?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await api('/security/2fa/start', { method: 'POST' });
      $('#twofa', page).innerHTML = `<div class="stack">
        <ol class="steps-list small"><li><div>Install <b>Google Authenticator</b> (or Microsoft Authenticator).</div></li><li><div>Tap <b>+</b> → <b>Scan QR</b> and scan this:</div></li></ol>
        <img src="${r.qr}" alt="2FA QR" style="width:180px;height:180px;background:#fff;border-radius:12px;padding:8px;border:1px solid var(--border)">
        <div class="tiny muted">Can't scan? Enter key: <code>${esc(r.secret)}</code></div>
        <form id="tfForm" class="row"><input class="input mono grow" name="code" inputmode="numeric" maxlength="6" placeholder="6-digit code" required><button class="btn btn-primary">Turn on</button></form></div>`;
      $('#tfForm', page).addEventListener('submit', (ev) => {
        ev.preventDefault();
        busy($('button', ev.target), async () => {
          await api('/security/2fa/enable', { method: 'POST', body: formData(ev.target) });
          toast('2FA is ON 🔐', 'ok');
          route();
        });
      });
    }));
    $('#tfOff', page)?.addEventListener('click', () => {
      const m = modal({
        title: 'Turn off 2FA',
        body: `<form id="tfd" class="stack"><input class="input" type="password" name="password" placeholder="Password" required>
          <input class="input mono" name="code" inputmode="numeric" maxlength="6" placeholder="Current 2FA code" required>
          <button class="btn btn-danger btn-block">Turn off</button></form>`,
      });
      $('#tfd', m.el).addEventListener('submit', (e) => {
        e.preventDefault();
        busy($('button', e.target), async () => {
          await api('/security/2fa/disable', { method: 'POST', body: formData(e.target) });
          m.close();
          toast('2FA turned off');
          route();
        });
      });
    });
  };

  // ---------------------------------------------------------------- boot
  let shellReady = false;
  async function startApp() {
    renderShell();
    shellReady = true;
    window.onhashchange = route;
    await route();
  }

  async function boot() {
    shellReady = false;
    window.onhashchange = null;
    clearInterval(refreshTimer);
    $$('.overlay').forEach((o) => o.remove());
    try {
      const r = await fetch('/admin/api/state', { credentials: 'same-origin' });
      const s = await r.json();
      if (s.setup_needed) return renderSetup();
      if (!s.logged_in) return renderLogin();
      startApp();
    } catch {
      root.innerHTML = '<div class="auth"><div class="card center">Cannot reach the server. Check your internet and refresh.</div></div>';
    }
  }

  boot();
})();
