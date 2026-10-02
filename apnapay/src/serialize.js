const config = require('./config');
const { rupees } = require('./util');

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

// The order shape shared with your product websites (API responses and webhooks).
function publicOrder(o) {
  return {
    id: o.id,
    reference: o.reference,
    status: o.status,
    amount: rupees(o.base_amount),
    amount_payable: rupees(o.amount),
    amount_paid: o.paid_amount != null ? rupees(o.paid_amount) : null,
    currency: 'INR',
    utr: o.utr || null,
    matched_by: o.matched_by || null,
    customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email },
    note: o.note,
    payment_url: `${config.baseUrl}/pay/${o.id}`,
    created_at: iso(o.created_at),
    expires_at: iso(o.expires_at),
    paid_at: iso(o.paid_at),
  };
}

module.exports = { publicOrder };
