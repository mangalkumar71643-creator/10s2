const config = require('./config');
const { pounds } = require('./util');

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

// The order shape shared with your product websites (API responses and webhooks).
// demo: true on everything — this server never moves real money.
function publicOrder(o) {
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    amount: pounds(o.base_amount),
    amount_payable: pounds(o.amount),
    amount_paid: o.paid_amount != null ? pounds(o.paid_amount) : null,
    currency: 'GBP',
    payment_reference: o.pay_ref,
    bank_payment_id: o.utr || null,
    matched_by: o.matched_by || null,
    customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email },
    note: o.note,
    payment_url: `${config.baseUrl}/pay/${o.id}`,
    created_at: iso(o.created_at),
    expires_at: iso(o.expires_at),
    paid_at: iso(o.paid_at),
    demo: true,
  };
}

module.exports = { publicOrder };
