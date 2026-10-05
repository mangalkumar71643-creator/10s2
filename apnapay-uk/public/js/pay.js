(() => {
  const orderId = location.pathname.split('/').filter(Boolean)[1];
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const icon = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    upi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
  };

  let data = null;
  let secondsLeft = 0;
  let pollTimer = null;
  let tickTimer = null;

  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  async function copy(text, label) {
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
    toast(label + ' copied', 'ok');
  }

  const fmt = (n) => Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function header() {
    const name = data.business.name || 'Store';
    return `
      <div class="brand">
        <div class="avatar">${esc(name.trim()[0] || 'S').toUpperCase()}</div>
        <div class="grow">
          <div class="bold" style="font-size:17px">${esc(name)}</div>
          <div class="secure">${icon.lock} Pay by bank transfer · no card fees</div>
        </div>
      </div>`;
  }

  const BANK_NAMES = { monzo: 'Monzo', starling: 'Starling', barclays: 'Barclays', hsbc: 'HSBC UK', lloyds: 'Lloyds', natwest: 'NatWest', santander: 'Santander', nationwide: 'Nationwide', revolut: 'Revolut' };
  const refPretty = (r) => r.slice(0, 2) + ' ' + r.slice(2, 5) + ' ' + r.slice(5);

  function detailRow(label, value, copyValue, extra = '') {
    return `<div class="drow ${extra}"><div class="grow"><div class="k">${label}</div><div class="v">${esc(value)}</div></div>
      <button class="btn btn-soft btn-sm" data-copy="${esc(copyValue ?? value)}" data-label="${label}">${icon.copy} Copy</button></div>`;
  }

  function renderPending() {
    const p = data.payee;
    const o = data.order;
    app.innerHTML = `
      ${header()}
      <section class="pay-card">
        <div class="amount-box">
          <div class="amount-label">Send exactly</div>
          <div class="big-amount">£${fmt(o.amount)}</div>
          ${o.note || o.reference ? `<p class="small muted" style="margin-top:6px">${esc(o.note || 'Order ' + o.reference)}</p>` : ''}
        </div>
        <div class="details">
          ${detailRow('Account name', p.name)}
          ${detailRow('Sort code', p.sort_code, p.sort_code.replace(/-/g, ''))}
          ${detailRow('Account number', p.account_number)}
          ${detailRow('Reference', refPretty(o.pay_ref), o.pay_ref, 'ref')}
          <div class="must">⚠ Use this reference exactly — it is how your payment is matched automatically.</div>
          <div class="tiny muted" style="margin:0 4px">${esc(BANK_NAMES[p.bank] || 'UK bank')} · Faster Payments usually arrive in seconds.</div>
        </div>
        <div class="sim">
          <div class="t">Demo only</div>
          <div class="small muted">No real bank is connected. Tap below to pretend your bank sent the transfer — the page and the shop update by themselves.</div>
          <button class="btn btn-primary btn-lg btn-block" data-sim="exact">${icon.check} Simulate bank transfer · £${fmt(o.amount)}</button>
          <button class="btn btn-ghost btn-sm" data-sim="no_ref">Simulate a transfer that forgot the reference</button>
        </div>
        <div class="status-bar">
          <span class="pulse"></span>
          <div>
            <div class="bold small">Waiting for your transfer…</div>
            <div class="tiny muted">Confirms automatically when it arrives</div>
          </div>
          <span class="timer" id="timer">${mmss(secondsLeft)}</span>
        </div>
      </section>
      <div class="steps">
        <div class="step"><span class="n">1</span><span>Open your banking app → <b>Pay someone new</b></span></div>
        <div class="step"><span class="n">2</span><span>Enter the account name, sort code and account number above</span></div>
        <div class="step"><span class="n">3</span><span>Send <b>£${fmt(o.amount)}</b> with reference <b>${esc(refPretty(o.pay_ref))}</b></span></div>
        <div class="step"><span class="n">4</span><span>Keep this page open — it updates by itself</span></div>
      </div>
      ${footer()}`;
  }

  function renderPaid() {
    stopTimers();
    app.innerHTML = `
      ${header()}
      <section class="pay-card result">
        <div class="check">${icon.check}</div>
        <h1 style="margin-top:8px">Payment received</h1>
        <p class="muted">Thank you! Your order is confirmed.</p>
        <span class="badge warn">Demo — no real money moved</span>
        <div class="receipt">
          <div><span>Amount</span><b>£${fmt(data.order.amount)}</b></div>
          <div><span>Payment reference</span><b class="mono">${esc(data.order.pay_ref)}</b></div>
          ${data.order.reference ? `<div><span>Order</span><b>${esc(data.order.reference)}</b></div>` : ''}
          ${data.payment_id ? `<div><span>Bank payment ID</span><b class="mono">${esc(data.payment_id)}</b></div>` : ''}
          ${data.paid_at ? `<div><span>Paid at</span><b>${new Date(data.paid_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</b></div>` : ''}
        </div>
        ${data.return_url ? `<a class="btn btn-primary btn-lg btn-block" style="margin-top:12px" href="${esc(data.return_url)}">Back to store <span id="redir"></span></a>` : ''}
      </section>
      ${footer()}`;
    if (data.return_url) {
      let n = 5;
      const el = document.getElementById('redir');
      const t = setInterval(() => {
        n -= 1;
        if (el) el.textContent = `(${n})`;
        if (n <= 0) {
          clearInterval(t);
          location.href = data.return_url;
        }
      }, 1000);
    }
  }

  function renderClosed(kind) {
    stopTimers();
    const expired = kind === 'expired';
    app.innerHTML = `
      ${header()}
      <section class="pay-card result">
        <div class="clock">${expired ? icon.clock : icon.x}</div>
        <h1 style="margin-top:8px">${expired ? 'Payment link expired' : 'Order cancelled'}</h1>
        <p class="muted">${expired ? 'This link is no longer active. Please start the payment again from the store.' : 'This order was cancelled by the store.'}</p>
        ${expired ? '<div class="notice warn small" style="text-align:left;margin-top:8px">Already sent the money? Don\'t worry — late transfers with your reference are still matched for 24 hours.</div>' : ''}
        ${data.return_url ? `<a class="btn btn-ghost btn-block" style="margin-top:8px" href="${esc(data.return_url)}">Back to store</a>` : ''}
      </section>
      ${footer()}`;
    if (expired) startPolling(15000);
  }

  function renderError(msg) {
    app.innerHTML = `<section class="pay-card result"><div class="clock">${icon.x}</div><h1>Payment not found</h1><p class="muted">${esc(msg)}</p></section>`;
  }

  const footer = () => `<div class="foot">${icon.lock} Paid directly to the merchant's UK bank account${data.business.support_email ? ` · Help: ${esc(data.business.support_email)}` : ''}</div>`;

  function render() {
    if (data.status === 'paid') return renderPaid();
    if (data.status === 'expired' || data.status === 'cancelled') return renderClosed(data.status);
    if (!data.payee) return renderError('No payment method is available right now. Please contact the store.');
    renderPending();
    startPolling(3000);
    startTick();
  }

  function stopTimers() {
    clearInterval(pollTimer);
    clearInterval(tickTimer);
    pollTimer = tickTimer = null;
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      secondsLeft = Math.max(0, secondsLeft - 1);
      const el = document.getElementById('timer');
      if (el) {
        el.textContent = mmss(secondsLeft);
        el.classList.toggle('low', secondsLeft < 120);
      }
      if (secondsLeft === 0) poll();
    }, 1000);
  }

  function startPolling(ms) {
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, ms);
  }

  let polling = false;
  async function poll() {
    if (polling || document.hidden) return;
    polling = true;
    try {
      const r = await fetch(`/pay/${orderId}/status`, { cache: 'no-store' });
      if (!r.ok) return;
      const s = await r.json();
      secondsLeft = s.seconds_left;
      const changed = s.status !== data.status;
      Object.assign(data, s);
      if (changed) render();
    } catch {
      /* network hiccup — try again next tick */
    } finally {
      polling = false;
    }
  }

  document.addEventListener('visibilitychange', () => !document.hidden && poll());

  app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.dataset.copy, b.dataset.label);
    const sim = e.target.closest('[data-sim]');
    if (sim) simulate(sim);
  });

  async function simulate(btn) {
    btn.disabled = true;
    const html = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Bank is sending…';
    try {
      await new Promise((r) => setTimeout(r, 900)); // feels like a real bank round trip
      const r = await fetch(`/pay/${orderId}/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: btn.dataset.sim }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Demo payment failed');
      secondsLeft = out.seconds_left;
      const changed = out.status !== data.status;
      Object.assign(data, out);
      if (changed) return render();
      toast('Transfer received, but it could not be matched automatically — the shop owner will link it by hand.', 'bad');
    } catch (err) {
      toast(err.message, 'bad');
    }
    btn.disabled = false;
    btn.innerHTML = html;
  }

  (async () => {
    try {
      const r = await fetch(`/pay/${orderId}/data`, { cache: 'no-store' });
      const out = await r.json();
      if (!r.ok) return renderError(out.error || 'This payment link is invalid.');
      data = out;
      secondsLeft = data.seconds_left;
      document.title = `Pay £${fmt(data.order.amount)} · ${data.business.name} (demo)`;
      render();
    } catch {
      renderError('Could not load the payment. Check your internet and refresh.');
    }
  })();
})();
