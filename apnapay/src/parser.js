// Reads bank SMS / email alerts and pulls out: is it a credit, amount, UPI reference (UTR),
// account last digits and payer VPA. Written to be forgiving because every bank words it differently.

const CREDIT_WORDS = /\b(credited|credit(?:ed)? to|received|deposited|added to|cr\.?)\b/i;
const DEBIT_WORDS = /\b(debited|debit(?:ed)? from|sent|withdrawn|spent|paid to|transferred to|dr\.?|purchase)\b/i;
const IGNORE_WORDS = /\b(otp|one time password|will be debited|request(?:ed)? money|collect request|is due|failed|reversed|declined)\b/i;

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

const UTR_LABELLED_RE =
  /(?:upi\s*ref(?:erence)?|ref(?:erence)?|utr|rrn|txn\s*id|transaction\s*id|imps\s*ref|upi)\s*(?:no\.?|number|id)?\s*[:.\-#]?\s*(\d{12})\b/i;
const UTR_ANY_RE = /(?<![\dA-Za-z])(\d{12})(?!\d)/;

const LAST4_RE = /\b(?:a\/?c|acct|account|ac)\b\.?\s*(?:no\.?|number)?\s*[:\-]?\s*[x*X\d]*?[x*X]+(\d{3,6})\b/i;
const VPA_RE = /\b([a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,30})\b/i;

function firstIndex(re, text) {
  const m = re.exec(text);
  return m ? m.index : -1;
}

/**
 * @returns {{ type: 'credit'|'debit'|'ignore', amount: number|null, utr: string|null,
 *            last4: string|null, payer: string|null, reason?: string }}
 * amount is in paise.
 */
function parseBankMessage(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  const result = { type: 'ignore', amount: null, utr: null, last4: null, payer: null };
  if (!text) return { ...result, reason: 'empty message' };

  if (IGNORE_WORDS.test(text)) return { ...result, reason: 'not a completed payment (OTP / request / failed)' };

  const credit = firstIndex(CREDIT_WORDS, text);
  const debit = firstIndex(DEBIT_WORDS, text);
  if (credit === -1 && debit === -1) return { ...result, reason: 'no credit/debit words found' };

  // When both appear ("debited from A and credited to B") the first one describes our account.
  result.type = debit !== -1 && (credit === -1 || debit < credit) ? 'debit' : 'credit';

  const amount = AMOUNT_RE.exec(text);
  if (amount) result.amount = Math.round(parseFloat(amount[1].replace(/,/g, '')) * 100);

  const labelled = UTR_LABELLED_RE.exec(text);
  const anyUtr = labelled || UTR_ANY_RE.exec(text);
  if (anyUtr) result.utr = anyUtr[1];

  const last4 = LAST4_RE.exec(text);
  if (last4) result.last4 = last4[1].slice(-4);

  const vpa = VPA_RE.exec(text);
  if (vpa) result.payer = vpa[1].toLowerCase();

  if (result.type === 'credit' && !result.amount) {
    return { ...result, type: 'ignore', reason: 'credit without an amount' };
  }
  return result;
}

// --- Email helpers --------------------------------------------------------------------------

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&[a-z]+;/gi, ' ');
}

/**
 * Turns a raw MIME email (or already-plain text) into readable text.
 * Handles the common cases bank alerts use: multipart, base64, quoted-printable, HTML-only.
 */
function extractEmailText(raw) {
  const source = String(raw || '');
  if (!/^[\w-]+:\s/m.test(source.slice(0, 2000)) || !/\r?\n\r?\n/.test(source)) {
    return /<\w+[^>]*>/.test(source) ? htmlToText(source) : source;
  }

  const parts = [];
  const walk = (chunk) => {
    const split = chunk.search(/\r?\n\r?\n/);
    const headers = split === -1 ? chunk : chunk.slice(0, split);
    let body = split === -1 ? '' : chunk.slice(split).replace(/^\r?\n\r?\n/, '');
    const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ');
    const type = (/^content-type:\s*([^;\r\n]+)/im.exec(unfolded) || [, 'text/plain'])[1].trim().toLowerCase();
    const encoding = (/^content-transfer-encoding:\s*([^\r\n]+)/im.exec(unfolded) || [, ''])[1].trim().toLowerCase();

    if (type.startsWith('multipart/')) {
      const boundary = /boundary="?([^";\r\n]+)"?/i.exec(unfolded);
      if (!boundary) return;
      for (const piece of body.split('--' + boundary[1]).slice(1)) {
        if (piece.startsWith('--')) break;
        walk(piece.replace(/^\r?\n/, ''));
      }
      return;
    }
    if (!type.startsWith('text/')) return;
    if (encoding === 'base64') body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    else if (encoding === 'quoted-printable') body = decodeQuotedPrintable(body);
    parts.push({ type, text: type === 'text/html' ? htmlToText(body) : body });
  };
  walk(source);

  const subject = (/^subject:\s*(.+)$/im.exec(source) || [, ''])[1];
  const plain = parts.find((p) => p.type === 'text/plain') || parts[0];
  return [subject, plain ? plain.text : ''].join('\n').replace(/[ \t]+/g, ' ').trim();
}

module.exports = { parseBankMessage, extractEmailText };
