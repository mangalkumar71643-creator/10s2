(() => {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const root = document.getElementById('root');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const inr = (v) => '£' + Number(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inrShort = (v) => '£' + Number(v || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  const when = (t) => {
    if (!t) return '—';
    const d = new Date(t);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
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
    rupee: I('<path d="M17 6.5A4 4 0 0 0 10 9v11M7 13h7M6 20h12"/>'),
    shop: I('<path d="M4 8h16l-1.5 12h-13z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
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
    monzo: { name: 'Monzo', short: 'MZ', color: '#e8505b' },
    starling: { name: 'Starling', short: 'ST', color: '#6935d3' },
    barclays: { name: 'Barclays', short: 'BRC', color: '#00aeef' },
    hsbc: { name: 'HSBC UK', short: 'HSBC', color: '#db0011' },
    lloyds: { name: 'Lloyds', short: 'LLY', color: '#006a4d' },
    natwest: { name: 'NatWest', short: 'NW', color: '#5a287d' },
    santander: { name: 'Santander', short: 'SAN', color: '#ec0000' },
    nationwide: { name: 'Nationwide', short: 'NWD', color: '#1c2a5b' },
    revolut: { name: 'Revolut', short: 'RV', color: '#191c1f' },
    other: { name: 'Other UK bank', short: 'GBP', color: '#5b4cf0' },
  };
  const bankLogo = (b, size = 42) => {
    const bank = BANKS[b] || BANKS.other;
    const fs = bank.short.length > 3 ? 11 : 13;
    return `<div class="bank-logo" style="background:${bank.color};width:${size}px;height:${size}px;font-size:${fs}px">${bank.short}</div>`;
  };
  const statusBadge = (s) => `<span class="badge ${esc(s)}">${esc(s[0].toUpperCase() + s.slice(1))}</span>`;
  const sourceLabel = { demo: 'Customer (demo)', manual: 'Admin test' };

  // ---------------------------------------------------------------- auth screens
  function authScreen(inner) {
    root.innerHTML = `<div class="auth"><div class="card">
      <div class="logo" style="justify-content:center;padding-bottom:6px"><span class="logo-mark">${icon.bolt}</span>ApnaPay UK <span class="badge warn">DEMO</span></div>
      ${inner}</div></div>`;
  }

  function renderSetup() {
    authScreen(`
      <p class="center muted" style="margin-bottom:22px">Welcome! Create your admin login.<br><span class="small">This is a demo — no real money, payments are simulated.</span></p>
      <form id="f" class="stack">
        <div class="field"><label>Business name</label><input class="input" name="business_name" placeholder="e.g. Demo Store Ltd" required></div>
        <div class="field"><label>Username</label><input class="input" name="username" autocomplete="username" minlength="3" required></div>
        <div class="field"><label>Password</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required>
          <span class="hint">At least 8 characters.</span></div>
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
    { id: 'messages', label: 'Bank Notifications', short: 'Bank', icon: 'msg' },
    { id: 'sites', label: 'Websites & API', icon: 'globe' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
  ];
  const MOBILE_NAV = ['dashboard', 'orders', 'accounts', 'messages'];
  let badges = { messages: 0 };

  function renderShell() {
    root.innerHTML = `
      <div class="shell">
        <aside class="side">
          <div class="logo"><span class="logo-mark">${icon.bolt}</span>ApnaPay UK</div>
          <nav class="nav">${NAV.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${icon[n.icon]}${n.label}<span class="count" data-badge="${n.id}" hidden></span></a>`).join('')}
            <a href="/shop" target="_blank" rel="noopener">${icon.shop}Demo Shop ↗</a></nav>
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
          <a href="/shop" target="_blank" rel="noopener">${icon.shop}Demo Shop ↗</a>
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
      ${topbar(`Hello 👋`, `${esc(d.business_name)} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
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
            <p class="muted" style="margin:6px auto 16px;max-width:420px">Enter a sort code and account number. Customers pay by bank transfer — no card fees.</p>
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
                <span>${new Date(c.date).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              </div>`).join('')}</div>
          </div>
        </div>
        <div class="grid cols-2">
          <div class="card flush">
            <div class="card-head" style="padding:18px 20px 0"><h2>Recent orders</h2><a class="btn btn-ghost btn-sm" href="#/orders">View all</a></div>
            ${d.recent.length ? d.recent.map(orderListItem).join('') : `<div class="empty">${icon.receipt}<div>No orders yet. Create a payment link to test.</div></div>`}
          </div>
          <div class="card stack">
            <div class="card-head" style="margin:0"><div><h2>Try the full flow</h2><div class="sub">Demo shop → API → payment → webhook → SOLD</div></div></div>
            <ol class="steps-list small">
              <li><div>Open the <a href="/shop" target="_blank" rel="noopener"><b>Demo Shop</b></a> and tap <b>Buy</b> on a product.</div></li>
              <li><div>On the payment page tap <b>Simulate bank transfer</b>.</div></li>
              <li><div>The order turns <b>Paid</b> here, and the shop gets a signed <code>order.paid</code> webhook and marks the product <b>SOLD</b>.</div></li>
            </ol>
            <div class="row wrap"><a class="btn btn-primary btn-sm" href="/shop" target="_blank" rel="noopener">${icon.shop} Open demo shop</a>
              <a class="btn btn-ghost btn-sm" href="#/sites">${icon.globe} API keys (${d.sites})</a></div>
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
          <input class="input" name="q" placeholder="Search name, reference, amount" value="${esc(orderFilter.q)}"></form>
      </div>
      <div class="card flush">
        ${d.orders.length ? `
          <table class="table hide-mobile"><thead><tr><th>Customer / Ref</th><th>From</th><th>Bank</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${d.orders.map((o) => `
            <tr class="click" data-order="${esc(o.id)}">
              <td><div class="bold">${esc(o.customer.name || '—')}</div><div class="tiny muted mono">${esc(o.payment_reference)}${o.reference ? ' · ' + esc(o.reference) : ''}</div></td>
              <td class="small">${esc(o.site)}</td>
              <td class="small">${esc(o.account || '—')}</td>
              <td class="amount">${inr(o.amount_paid || o.amount_payable)}</td>
              <td>${statusBadge(o.status)}</td>
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
            <dt>Bank reference</dt><dd class="mono bold">${esc(o.payment_reference)}</dd>
            ${o.reference ? `<dt>Your reference</dt><dd class="mono">${esc(o.reference)}</dd>` : ''}
            <dt>From</dt><dd>${esc(o.site)}</dd>
            <dt>Customer</dt><dd>${esc([o.customer.name, o.customer.email, o.customer.phone].filter(Boolean).join(' · ') || '—')}</dd>
            ${o.note ? `<dt>Note</dt><dd>${esc(o.note)}</dd>` : ''}
            <dt>Bank</dt><dd>${esc(o.account || '—')}</dd>
            <dt>Created</dt><dd>${new Date(o.created_at).toLocaleString('en-GB')}</dd>
            <dt>Expires</dt><dd>${new Date(o.expires_at).toLocaleString('en-GB')}</dd>
            ${o.paid_at ? `<dt>Paid</dt><dd>${new Date(o.paid_at).toLocaleString('en-GB')} <span class="badge info plain">via ${esc(o.matched_by)}</span></dd>` : ''}
            ${o.bank_payment_id ? `<dt>Bank payment ID</dt><dd class="mono">${esc(o.bank_payment_id)}</dd>` : ''}
          </dl>
          ${t ? `<div><div class="label" style="margin-bottom:6px">Bank notification (${esc(sourceLabel[t.source] || t.source)})</div><div class="raw">${esc(t.raw_text)}</div></div>` : ''}
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
          <div class="notice warn">${icon.alert}<div>In real life, only do this after you have <b>checked your bank app</b> and the money is really there.</div></div>
          <div class="field"><label>Bank payment ID (optional)</label><input class="input mono" id="mpUtr" maxlength="40"></div></div>`,
        foot: `<button class="btn btn-ghost" data-close>Back</button><button class="btn btn-ok" id="mpGo">${icon.check} Confirm payment</button>`,
      });
      $('#mpGo', mp.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
        await api(`/orders/${o.id}/mark-paid`, { method: 'POST', body: { payment_id: $('#mpUtr', mp.el).value.trim() } });
        mp.close();
        toast('Marked as paid ✅', 'ok');
        route();
      }));
    });
  }

  let minOrder = '1';
  function newPaymentLink() {
    let createdLink = false;
    const m = modal({
      title: 'New payment link',
      // Refresh the list behind the modal once it is closed.
      onClose: () => createdLink && (currentPage === 'orders' || currentPage === 'dashboard') && setTimeout(route),
      body: `<form id="pl" class="stack">
        <p class="muted small" style="margin-top:-6px">Send this link by WhatsApp, email or Instagram. The customer pays by bank transfer and it confirms automatically.</p>
        <div class="field"><label>Amount</label><div class="input-group"><span class="prefix">£</span><input class="input" name="amount" inputmode="decimal" placeholder="24.99" required style="font-size:20px;font-weight:700;height:52px"></div>
          <span class="hint">Minimum £${esc(minOrder)} (change it in Settings)</span></div>
        <div class="form-grid">
          <div class="field"><label>Customer name</label><input class="input" name="customer_name" placeholder="Optional"></div>
          <div class="field"><label>Email</label><input class="input" name="customer_email" inputmode="email" placeholder="Optional"></div>
          <div class="field full"><label>What is it for?</label><input class="input" name="note" placeholder="e.g. Blue hoodie size M"></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block">${icon.link} Create link</button>
      </form>`,
    });
    $('#pl', m.el).addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', e.target), async () => {
        const o = await api('/orders', { method: 'POST', body: formData(e.target) });
        const msg = `Hi${o.customer.name ? ' ' + o.customer.name : ''}, please pay £${o.amount_payable} here: ${o.payment_url}`;
        $('.modal-body', m.el).innerHTML = `
          <div class="stack lg center">
            <div style="font-size:44px">🔗</div>
            <div><div class="muted small">Customer will pay</div><div style="font-size:32px;font-weight:800">${inr(o.amount_payable)}</div>
            <div class="tiny muted">Bank reference <b class="mono">${esc(o.payment_reference)}</b> identifies this payment</div></div>
            ${copyField(o.payment_url, 'Link')}
            <div class="row" style="justify-content:center;flex-wrap:wrap">
              <a class="btn btn-ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${icon.whatsapp} Send on WhatsApp</a>
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
    const { accounts } = await api('/accounts');
    const totalWeight = accounts.filter((a) => a.live).reduce((s, a) => s + a.weight, 0);
    page.innerHTML = `
      ${topbar('Bank Accounts', 'Where customers send money. Turn an account LIVE or OFF anytime.', `<button class="btn btn-primary" id="addAcc">${icon.plus}<span class="hide-mobile">Add bank account</span><span class="show-mobile">Add</span></button>`)}
      ${accounts.length ? `<div class="grid cols-2">${accounts.map((a) => `
        <div class="card bank-card ${a.live ? 'is-live' : ''}">
          <div class="row">
            ${bankLogo(a.bank)}
            <div class="grow">
              <div class="bold ellipsis" style="font-size:16px">${esc(a.label)}</div>
              <div class="small muted ellipsis">${esc(BANKS[a.bank]?.name || 'Bank')} · ••${esc(a.account_number.slice(-4))}</div>
            </div>
            <span class="live-label ${a.live ? 'on' : 'off'}" data-live-label="${a.id}">${a.live ? 'LIVE' : 'OFF'}</span>
            <label class="switch" title="Turn on/off"><input type="checkbox" data-live="${a.id}" ${a.live ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="kv">
            <div><div class="k">Account name</div><div class="v small ellipsis" title="${esc(a.holder_name)}">${esc(a.holder_name)}</div></div>
            <div><div class="k">Sort code</div><div class="v mono small">${esc(a.sort_code)}</div></div>
            <div><div class="k">Account no.</div><div class="v mono small">${esc(a.account_number)}</div></div>
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
          <p style="margin:6px 0 16px">Add Monzo, Starling, Barclays or any UK bank account.</p>
          <button class="btn btn-primary" id="addAcc2">${icon.plus} Add bank account</button></div>`}
      <div class="notice mt">${icon.info}<div class="small"><b>How it works:</b> every new order goes to one LIVE account (by Share). When an account reaches its daily limit it pauses by itself until midnight (UK time). Turning an account OFF does not affect people who are already paying.</div></div>`;

    $('#addAcc').addEventListener('click', () => accountForm(null));
    $('#addAcc2')?.addEventListener('click', () => accountForm(null));
    $$('[data-edit]', page).forEach((b) => b.addEventListener('click', () => accountForm(accounts.find((a) => a.id === Number(b.dataset.edit)))));
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

  function accountForm(a) {
    const edit = !!a;
    a = a || { bank: 'monzo', weight: 1, daily_limit: '' };
    const m = modal({
      title: edit ? `Edit ${esc(a.label)}` : 'Add bank account',
      wide: true,
      body: `<form id="af" class="stack lg" autocomplete="off">
        <div class="notice warn">${icon.alert}<div class="small">Demo: use made-up details (e.g. 12-34-56 / 12345678). No real bank is connected.</div></div>
        <div class="form-grid">
          <div class="field"><label>Bank</label><select class="input" name="bank">${Object.entries(BANKS).map(([k, b]) => `<option value="${k}" ${a.bank === k ? 'selected' : ''}>${b.name}</option>`).join('')}</select></div>
          <div class="field"><label>Name for this account</label><input class="input" name="label" value="${esc(a.label || '')}" placeholder="e.g. Monzo Business" required></div>
          <div class="field full"><label>Account name</label><input class="input" name="holder_name" value="${esc(a.holder_name || '')}" placeholder="e.g. Demo Store Ltd" required>
            <span class="hint">Shown to customers. Must match the bank's records so Confirmation of Payee passes.</span></div>
          <div class="field"><label>Sort code</label><input class="input mono" name="sort_code" value="${esc(a.sort_code || '')}" inputmode="numeric" maxlength="8" placeholder="12-34-56" required></div>
          <div class="field"><label>Account number</label><input class="input mono" name="account_number" value="${esc(a.account_number || '')}" inputmode="numeric" maxlength="8" placeholder="12345678" required></div>
          <div class="field"><label>Share of new orders</label><input class="input" type="number" min="0" max="100" name="weight" value="${esc(a.weight)}">
            <span class="hint">e.g. Monzo 2, Barclays 1 → 67% / 33%</span></div>
          <div class="field"><label>Daily limit (£)</label><div class="input-group"><span class="prefix">£</span><input class="input" name="daily_limit" inputmode="decimal" value="${esc(a.daily_limit)}" placeholder="Empty = no limit"></div>
            <span class="hint">When today's payments reach this, the account pauses till midnight.</span></div>
        </div>
        ${edit ? '' : `<label class="row" style="gap:10px"><label class="switch"><input type="checkbox" name="live" checked><span class="track"></span></label><span class="bold">Make it LIVE now</span></label>`}
      </form>`,
      foot: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="saveAcc">${icon.check} ${edit ? 'Save changes' : 'Add account'}</button>`,
    });
    const form = $('#af', m.el);
    form.sort_code.addEventListener('input', () => {
      const d = form.sort_code.value.replace(/\D/g, '').slice(0, 6);
      form.sort_code.value = d.replace(/(\d{2})(?=\d)/g, '$1-');
    });
    $('#saveAcc', m.el).addEventListener('click', (e) => {
      if (!form.reportValidity()) return;
      busy(e.currentTarget, async () => {
        const body = formData(form);
        body.weight = Number(body.weight || 0);
        body.live = !!form.live?.checked;
        const changed = edit && (a.sort_code.replace(/-/g, '') !== body.sort_code.replace(/\D/g, '') || a.account_number !== body.account_number.replace(/\D/g, ''));
        if (changed && !(await confirmBox('Change bank details?', 'New payments will go to the new sort code / account number. You will get an alert about this change.', { ok: 'Yes, change it' }))) return;
        await api(edit ? `/accounts/${a.id}` : '/accounts', { method: edit ? 'PUT' : 'POST', body });
        m.close();
        toast(edit ? 'Saved' : 'Bank account added 🎉', 'ok');
        route();
      });
    });
  }

  // ---------------------------------------------------------------- bank notifications
  let msgFilter = '';

  pages.messages = async (page) => {
    const [list, { accounts }, open] = await Promise.all([
      api('/transactions' + (msgFilter ? '?status=' + msgFilter : '')),
      api('/accounts'),
      api('/orders?status=pending'),
    ]);
    if (msgFilter === 'unmatched') {
      badges.messages = list.length;
      setBadges();
    }
    const tabs = [['', 'All'], ['unmatched', 'Needs attention'], ['matched', 'Matched']];
    page.innerHTML = `
      ${topbar('Bank Notifications', 'Every "money in" notification from your banks — matched to orders automatically')}
      <div class="notice" style="margin-bottom:16px">${icon.info}<div class="small"><b>Demo:</b> in a real setup these come from your bank (Open Banking / bank app notifications). Here they are created when a customer taps <b>Simulate bank transfer</b>, or by you with the simulator.</div></div>
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
                <div class="tiny muted">${t.reference ? 'Ref <span class="mono">' + esc(t.reference) + '</span>' : '<span style="color:var(--warn)">No reference</span>'}${t.payer ? ' · from ' + esc(t.payer) : ''}${t.order_id ? ` · <a href="#" data-open-order="${esc(t.order_id)}">view order</a>` : ''}</div>
                <details style="width:100%"><summary class="tiny muted" style="cursor:pointer">Show notification</summary><div class="raw" style="margin-top:6px">${esc(t.raw_text)}</div></details>
                ${t.status === 'unmatched' ? `<div class="row"><button class="btn btn-soft btn-sm" data-link="${t.id}" data-amt="${esc(t.amount)}">${icon.link} Link to order</button><button class="btn btn-ghost btn-sm" data-ignore="${t.id}">Not an order</button></div>` : ''}
              </div>`).join('') : `<div class="empty">${icon.inbox}<div>${msgFilter === 'unmatched' ? 'All clear! Every payment is matched. 🎉' : 'Nothing yet. Make a payment in the demo shop, or use the simulator.'}</div></div>`}
          </div>
        </div>
        <div class="card stack">
          <div><h2>🧪 Payment simulator</h2><p class="small muted" style="margin-top:4px">Pretend a customer's bank sent money to one of your accounts.</p></div>
          <form id="sf2" class="stack">
            <div class="field"><label>Open order (fills the fields)</label><select class="input" id="simOrder"><option value="">— choose, or type below —</option>
              ${open.orders.map((o) => `<option value="${esc(o.id)}" data-amt="${esc(o.amount_payable)}" data-ref="${esc(o.payment_reference)}" data-name="${esc(o.customer.name)}">${esc(o.payment_reference)} · ${inr(o.amount_payable)}${o.customer.name ? ' · ' + esc(o.customer.name) : ''}</option>`).join('')}</select></div>
            <div class="form-grid">
              <div class="field"><label>Amount (£)</label><input class="input" name="amount" inputmode="decimal" placeholder="24.99" required></div>
              <div class="field"><label>Reference</label><input class="input mono" name="reference" placeholder="AP… (empty = forgot it)"></div>
              <div class="field"><label>Payer name</label><input class="input" name="payer" placeholder="John Smith"></div>
              <div class="field"><label>Into account</label><select class="input" name="account_id">${accounts.map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join('')}</select></div>
            </div>
            <button class="btn btn-primary btn-block">${icon.send} Send test payment</button>
          </form>
          <div id="simOut"></div>
          <details><summary class="small muted" style="cursor:pointer">Advanced: paste a notification text</summary>
            <form id="tf" class="stack" style="margin-top:10px">
              <textarea class="input" name="text" placeholder="You received £24.99 from John Smith. Reference: AP7KQ2XM. Payment ID: FP4A9C2E71" required></textarea>
              <div class="row"><button class="btn btn-ghost grow" data-mode="parse">Check only</button><button class="btn btn-primary grow" data-mode="run">Process</button></div>
            </form>
            <div id="testOut"></div>
          </details>
        </div>
      </div>`;

    $$('[data-mf]', page).forEach((b) => b.addEventListener('click', () => { msgFilter = b.dataset.mf; route(); }));
    $$('[data-open-order]', page).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openOrder(a.dataset.openOrder); }));
    $$('[data-ignore]', page).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      await api(`/transactions/${b.dataset.ignore}/ignore`, { method: 'POST' });
      route();
    })));
    $$('[data-link]', page).forEach((b) => b.addEventListener('click', () => linkTransaction(b.dataset.link, b.dataset.amt)));

    const showResult = (box, r) => {
      box.innerHTML = r.order
        ? `<div class="notice ok">${icon.check}<div>Matched and confirmed order <b>${esc(r.order.payment_reference)}</b> 🎉${r.order.site !== 'Payment link' ? ' — webhook sent to ' + esc(r.order.site) : ''}</div></div>`
        : `<div class="notice warn">${icon.alert}<div>${r.type !== 'credit' ? 'Not a money-in notification' + (r.reason ? ': ' + esc(r.reason) : '') : r.duplicate ? 'Already received this payment (duplicate).' : 'Saved, but no order matched. See "Needs attention".'}</div></div>`;
      setTimeout(route, 1800);
    };
    const sf = $('#sf2', page);
    $('#simOrder', page).addEventListener('change', (e) => {
      const opt = e.target.selectedOptions[0];
      if (!opt.value) return;
      sf.amount.value = opt.dataset.amt;
      sf.reference.value = opt.dataset.ref;
      sf.payer.value = opt.dataset.name || 'John Smith';
    });
    sf.addEventListener('submit', (e) => {
      e.preventDefault();
      busy($('button', sf), async () => {
        const b = formData(sf);
        const amount = Number(String(b.amount).replace(/[£,\s]/g, ''));
        if (!(amount > 0)) throw new Error('Enter an amount like 24.99');
        const payer = (b.payer || 'John Smith').replace(/[^A-Za-z .'&-]/g, '') || 'John Smith';
        const id = 'FP' + Math.random().toString(16).slice(2, 12).toUpperCase();
        const text = `You received £${amount.toFixed(2)} from ${payer}.${b.reference ? ' Reference: ' + b.reference.trim() + '.' : ''} Payment ID: ${id}`;
        showResult($('#simOut', page), await api('/tools/simulate', { method: 'POST', body: { text, account_id: b.account_id } }));
      });
    });

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
          out.innerHTML = `<div class="notice ${p.type === 'credit' ? 'ok' : 'warn'}" style="margin-top:10px">${p.type === 'credit' ? icon.check : icon.alert}<div class="stack" style="gap:4px">
            <div><b>${p.type === 'credit' ? 'Money in ✓' : p.type === 'debit' ? 'Money out (ignored)' : 'Ignored'}</b>${p.reason ? ' — ' + esc(p.reason) : ''}</div>
            <div class="small">Amount: <b>${p.amount ? inr(p.amount) : '—'}</b> · Ref: <b class="mono">${esc(p.reference || '—')}</b> · Payment ID: <b class="mono">${esc(p.utr || '—')}</b></div>
            <div class="small">Bank account: <b>${esc(r.account || 'not sure')}</b>${p.payer ? ' · Payer: ' + esc(p.payer) : ''}</div>
            <div class="small">${r.candidates.length ? `Would confirm: <b>${r.candidates.map((c) => esc(c.payment_reference)).join(', ')}</b>` : 'No open order matches.'}</div></div></div>`;
        } else {
          showResult(out, await api('/tools/simulate', { method: 'POST', body: formData(form) }));
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
      <div class="notice warn" style="margin-bottom:16px">${icon.shield}<div class="small"><b>Demo API.</b> Keys start with <code>ak_demo_</code> and never move real money. In real life, only connect your own websites — collecting money for other businesses needs FCA authorisation.</div></div>
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
          <h2>API in 3 steps</h2>
          <ol class="steps-list">
            <li><div>Customer clicks <b>Buy</b>. Your website's <b>server</b> creates an order:</div></li>
          </ol>
          <div class="raw">curl -X POST ${esc(base)}/api/v1/orders \\
  -H "Authorization: Bearer ak_demo_…" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 24.99, "reference": "INV-1001",
        "customer": { "name": "John Smith", "email": "john@example.com" },
        "return_url": "https://myshop.co.uk/thanks" }'</div>
          <p class="small muted" style="margin:0">Reply includes <code>payment_url</code>, <code>payment_reference</code> (e.g. AP7KQ2XM) and <code>status: "pending"</code>.</p>
          <ol class="steps-list" start="2" style="counter-reset:s 1">
            <li><div>Send the customer to the <code>payment_url</code>. They pay by bank transfer with the reference.</div></li>
            <li><div>When the money arrives we POST <code>order.paid</code> to your <b>webhook URL</b>. Check the signature, then mark the product SOLD:</div></li>
          </ol>
          <div class="raw">// Node.js — verify X-ApnaPay-Signature
const ts = req.headers['x-apnapay-timestamp'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(ts + '.' + rawBody).digest('hex');
if (expected !== req.headers['x-apnapay-signature']) return res.sendStatus(401);
if (body.event === 'order.paid') markSold(body.order.reference);</div>
          <div class="divider"></div>
          <div class="small"><b>Other endpoints</b></div>
          <div class="raw">GET  /api/v1/orders/{id}
GET  /api/v1/orders?reference=INV-1001
POST /api/v1/orders/{id}/cancel</div>
          <div class="notice ok">${icon.shop}<div class="small">See it working: the <a href="/shop" target="_blank" rel="noopener"><b>Demo Shop</b></a> is a website connected here as <b>"Demo Shop (built-in)"</b>. Its purchases go through this API and its webhook marks products SOLD.</div></div>
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
        <div class="field"><label>Webhook URL</label><input class="input mono" name="webhook_url" value="${esc(s?.webhook_url || '')}" placeholder="https://myshop.co.uk/api/payment-webhook">
          <span class="hint">We call this the moment a payment is confirmed.</span></div>
        <div class="field"><label>Default return URL</label><input class="input mono" name="return_url" value="${esc(s?.return_url || '')}" placeholder="https://myshop.co.uk/thank-you">
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
            <div class="field"><label>Support email (optional)</label><input class="input" name="support_email" value="${esc(st.support_email)}"></div>
            <div class="field"><label>Minimum order amount (£)</label><div class="input-group"><span class="prefix">£</span><input class="input" type="number" min="1" max="50000" name="min_order_amount" value="${esc(st.min_order_amount)}"></div>
              <span class="hint">Orders and payment links below this are refused.</span></div>
            <div class="form-grid">
              <div class="field"><label>Payment link valid for (minutes)</label><input class="input" type="number" min="2" max="120" name="order_expiry_minutes" value="${esc(st.order_expiry_minutes)}"></div>
              <div class="field"><label>Accept late payments for (hours)</label><input class="input" type="number" min="1" max="168" name="late_match_hours" value="${esc(st.late_match_hours)}"></div>
            </div>
            <label class="row" style="gap:12px;align-items:flex-start"><label class="switch"><input type="checkbox" name="accept_amount_only" ${st.accept_amount_only === '1' ? 'checked' : ''}><span class="track"></span></label>
              <span class="small"><b>Match payments without a reference</b><br><span class="muted">If a customer forgets the reference, still confirm it — but only when exactly one open order has that amount.</span></span></label>
            <div><button class="btn btn-primary">Save</button></div>
          </form>

          <form class="card stack" id="tgForm">
            <div><h2>Telegram alerts</h2><p class="small muted" style="margin-top:4px">Free instant alerts on your phone for every payment, login and security change.</p></div>
            <ol class="steps-list small"><li><div>Open Telegram, message <b>@BotFather</b> → <code>/newbot</code> → copy the token.</div></li>
              <li><div>Send <b>/start</b> to your new bot, then message <b>@userinfobot</b> to get your chat id.</div></li></ol>
            <div class="field"><label>Bot token</label><input class="input mono" name="telegram_bot_token" value="${esc(st.telegram_bot_token)}" placeholder="123456:ABC…" autocomplete="off"></div>
            <div class="field"><label>Your chat id</label><input class="input mono" name="telegram_chat_id" value="${esc(st.telegram_chat_id)}" placeholder="123456789"></div>
            <div class="row"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-ghost" id="tgTest">${icon.send} Send test</button></div>
          </form>

        </div>

        <div class="stack lg">
          <div class="card stack">
            <h2>${icon.shield.replace('<svg', '<svg width="20" height="20" style="vertical-align:-4px;color:var(--brand)"')} Security</h2>
            <div class="row between"><div><div class="bold">Two-factor login (2FA)</div><div class="small muted">Code from Google Authenticator on every login</div></div>
              ${s.totp_enabled ? '<span class="badge live">ON</span>' : '<span class="badge warn">OFF</span>'}</div>
            <div id="twofa">${s.totp_enabled
              ? `<button class="btn btn-ghost btn-sm" id="tfOff">Turn off 2FA</button>`
              : `<div class="notice warn">${icon.alert}<div class="small">Strongly recommended. If someone steals your password they still can't change your bank details.</div></div><button class="btn btn-primary mt" id="tfOn">Turn on 2FA</button>`}</div>
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
              <span class="badge ${a.level === 'alert' ? 'warn' : a.level === 'success' ? 'paid' : 'info'} plain" style="margin-top:1px">${a.level === 'alert' ? '!' : a.level === 'success' ? '£' : 'i'}</span>
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
    saveForm('#bizForm', (b, f) => ({ ...b, accept_amount_only: f.accept_amount_only.checked }));
    saveForm('#tgForm');
    $('#tgTest', page).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      await api('/settings', { method: 'PUT', body: formData($('#tgForm', page)) });
      await api('/settings/telegram-test', { method: 'POST' });
      toast('Test message sent — check Telegram', 'ok');
    }));
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
