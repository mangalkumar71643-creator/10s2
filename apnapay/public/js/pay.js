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

  const fmt = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function header() {
    const name = data.business.name || 'Store';
    return `
      <div class="brand">
        <div class="avatar">${esc(name.trim()[0] || 'S').toUpperCase()}</div>
        <div class="grow">
          <div class="bold" style="font-size:17px">${esc(name)}</div>
          <div class="secure">${icon.lock} Secure UPI payment · 0 extra fee</div>
        </div>
      </div>`;
  }

  function amountHtml() {
    const [rs, ps] = data.order.amount.split('.');
    return `₹${Number(rs).toLocaleString('en-IN')}<span class="paise">.${ps}</span>`;
  }

  function appLinks(uri) {
    const q = uri.slice(uri.indexOf('?'));
    const apps = [
      { name: 'PhonePe', href: 'phonepe://pay' + q, bg: '#5f259f', t: 'Pe' },
      { name: 'GPay', href: 'tez://upi/pay' + q, bg: '#1a73e8', t: 'G' },
      { name: 'Paytm', href: 'paytmmp://pay' + q, bg: '#00b9f1', t: 'P' },
      { name: 'Any UPI', href: uri, bg: 'linear-gradient(135deg,#5b4cf0,#8b5cf6)', t: '⚡' },
    ];
    return `<div class="apps">${apps
      .map((a) => `<a class="app" href="${esc(a.href)}"><i style="background:${a.bg}">${a.t}</i>${a.name}</a>`)
      .join('')}</div>`;
  }

  function utrForm(open = false) {
    return `
      <details class="utr" ${open ? 'open' : ''}>
        <summary>Paid but not confirmed yet?</summary>
        <div class="body">
          <p class="small muted">Enter the <b>12-digit UPI Ref / UTR number</b> from your UPI app's payment receipt. We will confirm as soon as the bank shows it.
          <span class="hi">UPI app ki receipt me 12 ank ka UTR / Ref number dekh kar yahan daalein.</span></p>
          <form id="utrForm" class="row">
            <input class="input grow mono" id="utr" inputmode="numeric" maxlength="12" placeholder="e.g. 412345678901" autocomplete="off" required>
            <button class="btn btn-primary" type="submit">Submit</button>
          </form>
          ${data.utr_submitted ? '<div class="notice ok small">UTR received — we are checking it with the bank.</div>' : ''}
        </div>
      </details>`;
  }

  function renderPending() {
    const p = data.payee;
    const isStatic = p.qr_mode === 'static';
    const qrBlock = `
      <div class="qr-frame"><img src="${esc(p.qr)}" alt="UPI QR code"></div>
      <div class="upi-line">UPI ID: <code>${esc(p.upi_id)}</code>
        <button class="icon-btn" style="width:30px;height:30px" data-copy="${esc(p.upi_id)}" data-label="UPI ID" aria-label="Copy UPI ID">${icon.copy}</button></div>`;
    const appBlock = `
      <a class="btn btn-primary btn-lg btn-block" href="${esc(p.upi_uri)}">${icon.upi} Pay ₹${fmt(data.order.amount)} with UPI app</a>
      ${appLinks(p.upi_uri)}`;

    app.innerHTML = `
      ${header()}
      <section class="pay-card">
        <div class="amount-box">
          <div class="amount-label">${isStatic ? 'Enter this exact amount' : 'Pay exactly'}</div>
          <div class="big-amount">${amountHtml()}</div>
          ${data.order.extra_paise ? `<p class="why">Includes <b>₹${(data.order.extra_paise / 100).toFixed(2)}</b> so your payment is confirmed automatically.<span class="hi">Exact amount pay karein, payment apne aap confirm ho jayega.</span></p>` : ''}
          ${isStatic ? `<button class="btn btn-soft btn-sm copy-amt" data-copy="${esc(data.order.amount)}" data-label="Amount">${icon.copy} Copy amount</button>` : ''}
          ${data.order.note || data.order.reference ? `<p class="small muted" style="margin-top:10px">${esc(data.order.note || 'Order ' + data.order.reference)}</p>` : ''}
        </div>
        <div class="qr-zone">
          ${isMobile && !isStatic ? appBlock + '<div class="or">OR SCAN QR</div>' + qrBlock : qrBlock + (isStatic ? '' : '<div class="or">ON MOBILE?</div>' + appBlock)}
        </div>
        <div class="status-bar">
          <span class="pulse"></span>
          <div>
            <div class="bold small">Waiting for payment…</div>
            <div class="tiny muted">Confirms automatically after you pay</div>
          </div>
          <span class="timer" id="timer">${mmss(secondsLeft)}</span>
        </div>
      </section>
      <div class="steps">
        <div class="step"><span class="n">1</span><span>${isStatic ? 'Scan the QR with any UPI app' : 'Tap your UPI app or scan the QR'}</span></div>
        <div class="step"><span class="n">2</span><span>${isStatic ? `Enter <b>₹${fmt(data.order.amount)}</b> exactly and pay` : `Check the amount is <b>₹${fmt(data.order.amount)}</b> and pay`}</span></div>
        <div class="step"><span class="n">3</span><span>Keep this page open — it updates by itself</span></div>
      </div>
      ${utrForm()}
      ${footer()}`;
  }

  function renderPaid() {
    stopTimers();
    app.innerHTML = `
      ${header()}
      <section class="pay-card result">
        <div class="check">${icon.check}</div>
        <h1 style="margin-top:8px">Payment received</h1>
        <p class="muted">Thank you! Your order is confirmed.<span class="hi">Dhanyavaad! Aapka payment mil gaya hai.</span></p>
        <div class="receipt">
          <div><span>Amount</span><b>₹${fmt(data.order.amount)}</b></div>
          ${data.order.reference ? `<div><span>Order</span><b>${esc(data.order.reference)}</b></div>` : ''}
          ${data.utr ? `<div><span>UPI Ref / UTR</span><b class="mono">${esc(data.utr)}</b></div>` : ''}
          ${data.paid_at ? `<div><span>Paid at</span><b>${new Date(data.paid_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b></div>` : ''}
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
        ${expired ? '<div class="notice warn small" style="text-align:left;margin-top:8px">Already paid? Don\'t worry — enter your UTR below and we will match it.</div>' : ''}
        ${data.return_url ? `<a class="btn btn-ghost btn-block" style="margin-top:8px" href="${esc(data.return_url)}">Back to store</a>` : ''}
      </section>
      ${expired ? utrForm(true) : ''}
      ${footer()}`;
    if (expired) startPolling(15000);
  }

  function renderError(msg) {
    app.innerHTML = `<section class="pay-card result"><div class="clock">${icon.x}</div><h1>Payment not found</h1><p class="muted">${esc(msg)}</p></section>`;
  }

  const footer = () => `<div class="foot">${icon.lock} Paid directly to the merchant's bank via UPI${data.business.support_phone ? ` · Help: ${esc(data.business.support_phone)}` : ''}</div>`;

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
  });

  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'utrForm') return;
    e.preventDefault();
    const input = document.getElementById('utr');
    const utr = input.value.replace(/\D/g, '');
    if (utr.length !== 12) return toast('UTR must be 12 digits', 'bad');
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const r = await fetch(`/pay/${orderId}/utr`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ utr }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Could not submit');
      Object.assign(data, out);
      if (out.status === 'paid') return render();
      toast('Thanks! We will confirm as soon as the bank shows it.', 'ok');
      data.utr_submitted = true;
      render();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      btn.disabled = false;
    }
  });

  (async () => {
    try {
      const r = await fetch(`/pay/${orderId}/data`, { cache: 'no-store' });
      const out = await r.json();
      if (!r.ok) return renderError(out.error || 'This payment link is invalid.');
      data = out;
      secondsLeft = data.seconds_left;
      document.title = `Pay ₹${fmt(data.order.amount)} · ${data.business.name}`;
      render();
    } catch {
      renderError('Could not load the payment. Check your internet and refresh.');
    }
  })();
})();
