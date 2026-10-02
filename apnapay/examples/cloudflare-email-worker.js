// Cloudflare Email Worker (free): forwards bank alert emails to ApnaPay.
//
// 1. Cloudflare dashboard → your domain → Email → Email Routing → enable.
// 2. Workers & Pages → Create Worker → paste this file → Settings → Variables:
//      APNAPAY_EMAIL_URL = the "Email forwarding endpoint" from ApnaPay → Settings
// 3. Email Routing → Routes → create address e.g. alerts@yourdomain.in → Action "Send to Worker".
// 4. In Gmail: Settings → Forwarding → add alerts@yourdomain.in, then create a filter
//    from:(kotak.com OR centralbank.co.in OR finobank.com) "credited" → Forward to alerts@yourdomain.in.
//    (Or register alerts@yourdomain.in directly with your bank for email alerts.)

export default {
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const res = await fetch(env.APNAPAY_EMAIL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The From header keeps the bank's address even when Gmail forwarded the mail.
      body: JSON.stringify({ from: message.headers.get('from') || message.from, raw }),
    });
    if (!res.ok) {
      // Throwing makes Cloudflare report a delivery failure, so you notice in the dashboard.
      throw new Error(`ApnaPay responded ${res.status}`);
    }
  },
};
