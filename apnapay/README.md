# ApnaPay ⚡ — Zero-fee UPI payment desk

Apni website par **seedha apne bank account mein UPI payment lo (0% fee)**, aur payment **apne aap confirm** ho jaye.
Bank ka SMS ya email padhkar system order ko "Paid" karta hai, aur aapki product website ko turant khabar deta hai.

> ⚠️ Ye system **sirf aapke apne business** ke liye hai. Doosre logon ke business ka paisa apne account mein lena
> "Payment Aggregator" ka kaam hai, jiske liye RBI licence chahiye.

---

## Ye kaise kaam karta hai

```
Product website ──(1) order banao (API)──▶ ApnaPay ──(2) QR / UPI link──▶ Customer pays (PhonePe/GPay/Paytm)
                                              ▲                                       │
                                              │(3) bank SMS / email                    ▼
                                         Phone listener / Email worker ◀────── Aapka bank account
                                              │
       (4) webhook "order.paid" ◀─────────────┘   → product SOLD, shipping shuru
```

1. **Unique amount:** ₹499 ke order par customer ko **₹499.37** jaisa amount dikhta hai. Ye extra paise har order ko alag pehchante hain.
2. Customer **QR scan** karta hai ya mobile par **UPI app button** dabata hai. Amount pehle se bhara hota hai.
3. Paisa aate hi bank ka **SMS** aata hai. Phone ki forwarder app use server ko bhej deti hai. Saath mein bank ka **email** bhi aata hai (backup).
4. Server amount aur UTR match karta hai, order **PAID** karta hai, aur aapki product website ko **signed webhook** bhejta hai.

Kuch galat ho jaye to ye backup kaam karte hain:
- **Customer UTR:** customer apna 12-digit UTR daal sakta hai. Bank ka SMS aate hi wo match ho jata hai.
- **Round amount:** customer ₹499 pay kare (₹499.37 nahi), aur us waqt ₹499 ka sirf ek hi open order ho, to bhi confirm ho jata hai.
- **Late payment:** link expire hone ke baad bhi (default 24 ghante tak) payment aaye to confirm ho jata hai.
- **Duplicate:** same payment ka SMS aur email dono aayein to sirf ek baar gina jata hai.
- **Bina match wala paisa:** "Bank Messages" mein dikhta hai, wahan se ek click mein sahi order se jod sakte ho.

---

## Admin panel mein kya hai

| Page | Kya kar sakte ho |
|---|---|
| **Dashboard** | Aaj kitna paisa aaya, 7 din ka chart, **har bank ka LIVE/OFF switch**, phones ka status, alerts |
| **Bank Accounts** | Bank jodo, **QR upload karo** (UPI ID apne aap padh li jaati hai), share %, **daily limit**, LIVE/OFF |
| **Orders** | Saare orders, search, **payment link banao** (WhatsApp par bhejo), haath se "Mark as paid", cancel |
| **Bank Messages** | Har credit SMS/email, bina match wale paise ko order se jodo, **bank SMS test tool** |
| **Phones** | SMS forwarder phones jodo/hatao, online status |
| **Websites & API** | Product websites ke liye API key, webhook URL, webhook test |
| **Settings** | Business naam, link kitni der chalega, Telegram alerts, email alerts, **2FA**, password, activity log |

**Bank control:** Dashboard ya Bank Accounts mein switch dabao.
- Naye orders sirf **LIVE** banks mein jaate hain.
- Jo customer pehle se pay kar raha hai, uska payment phir bhi confirm hota hai.
- **Daily limit** poori hote hi wo bank raat 12 baje tak **apne aap pause** ho jata hai, aur baaki LIVE bank kaam sambhal lete hain.

---

## 1. Computer par chalao (testing)

Node.js **20 ya naya** chahiye (https://nodejs.org se "LTS" download karein).

**Sabse aasaan:** Windows par `start-windows.bat` par double-click karo. Mac/Linux par `sh start-mac-linux.sh` chalao.
Browser mein admin panel khul jayega.

Ya terminal se:

```bash
npm install
npm start
```

Browser mein `http://localhost:3000/admin` kholo. Pehli baar admin username/password banega.

Tests chalane ke liye: `npm test`

## 📱 Admin panel Android app (ApnaPay-Admin.apk)

1. `ApnaPay-Admin.apk` ko phone mein copy karke install karo. Phone **"Unknown apps install karne ki permission"** maangega, use allow karo.
2. App kholo aur server ka address daalo:
   - **Test (same WiFi):** computer par server chalao. Terminal mein **"Phone se kholo: http://192.168.x.x:3000"** dikhega, wahi daalo. Windows Firewall poochhe to **Allow** karo.
   - **Online:** apna domain daalo, jaise `https://pay.yourdomain.in`
3. Login karo, aur admin panel ka poora kaam phone se karo: bank ON/OFF, QR upload (gallery se), payment link WhatsApp par bhejna, orders dekhna.
4. Server badalna ho to: **More → Change server**.

### 📩 SMS Reader (app hi bank SMS padhegi)

Jis phone mein bank ka SMS aata hai, usmein app install karo, phir:
1. Admin panel mein **Phones → Add phone** karo, phir **"Use THIS phone as SMS reader"** dabao.
2. **SMS permission allow** karo, phir **Save & turn ON** dabao.
3. **Battery saver** band karo. Xiaomi/Oppo/Vivo/Realme par **Autostart** bhi ON karna.

Isse kya hota hai:
- Bank ka credit SMS aate hi server ko jata hai, chahe app band ho.
- **Internet na ho** to SMS phone mein save rehta hai, aur net aate hi apne aap chala jata hai.
- Har 15 minute "main online hoon" signal jata hai, isliye admin mein phone **Active** dikhta hai.
- Phone restart ke baad bhi ye chalta rehta hai.
- **Privacy:** sirf bank sender ID (jaise `AX-KOTAKB`) ke credit SMS bheje jaate hain. OTP, debit aur personal SMS phone se bahar nahi jaate.
- Ek phone mein do bank (jaise CBI + Fino) ho to bhi chalega.

⚠️ Agar app ko Settings se **"Force stop"** kiya, to Android uske SMS rok deta hai. Aisa ho to app ek baar khol dena.

Ye app aapke server se judkar admin panel kholti hai. App mein koi paisa ya password save nahi hota, sirf login ka cookie rehta hai.

**APK dobara banana ho to** (code badalne ke baad): JDK 17+ aur Android SDK (`platforms;android-35`, `build-tools;35.0.0`) chahiye, phir:
```bash
ANDROID_HOME=/path/to/android-sdk sh android-app/build-apk.sh
```
`android-app/apnapay-release.keystore` file sambhal ke rakho. App update karne ke liye wahi key chahiye (password: `apnapay123`, build script mein badal sakte ho).

## 2. Internet par chalao (asli use)

### ⭐ Free: Vercel + Neon (sirf phone se ho jata hai)

- **Vercel:** website aur server
- **Neon:** Postgres database (dono ke free plan kaafi hain)

1. **Vercel par project banao:** is code ko Vercel par deploy karo. GitHub se import karo, ya Claude ki madad se seedha deploy karo. `vercel.json` pehle se bana hua hai, kuch set nahi karna.
2. **Neon database jodo:** Vercel dashboard → project → **Storage** → **Create Database** → **Neon** → apne project se **Connect** karo. Vercel `DATABASE_URL` apne aap daal deta hai.
3. **Redeploy** karo (Deployments → ⋯ → Redeploy).
4. `https://<aapka-project>.vercel.app/admin` kholo. Ye address **ApnaPay Admin app** mein bhi daalo.
5. (Optional) Settings → Environment Variables:
   - `CRON_SECRET` = koi bhi random text (daily cron ko surakshit karta hai)
   - `BASE_URL` = apna domain, agar custom domain lagaya hai

**Vercel par background kaam kaise hota hai:**
- Webhook retry har phone ke **15 minute wale signal** par, har bank SMS par, aur admin panel kholne par chalte hain.
- Saath mein ek **daily cron** bhi safety ke liye hai.

### Apna server (VPS / Termux)

Bina `DATABASE_URL` ke ApnaPay apna andar wala database (PGlite) `data/` folder mein chalata hai, jo computer, Termux aur VPS par kaam karta hai. Kisi bhi Postgres ka `DATABASE_URL` doge to wo use hoga.

**VPS par (Ubuntu) example:**

```bash
# Node 22 install karke
git clone <this repo> apnapay && cd apnapay
npm ci --omit=dev
cp .env.example .env      # BASE_URL=https://pay.yourdomain.in, TRUST_PROXY=1
npm install -g pm2 && pm2 start npm --name apnapay -- start && pm2 save && pm2 startup
```

HTTPS ke liye **Caddy** sabse aasaan hai. `/etc/caddy/Caddyfile` mein:

```
pay.yourdomain.in {
    reverse_proxy localhost:3000
}
```

**Docker se:**

```bash
docker build -t apnapay .
docker run -d --name apnapay -p 3000:3000 -v apnapay-data:/app/data \
  -e BASE_URL=https://pay.yourdomain.in -e TRUST_PROXY=1 apnapay
```

**Backup:** `data/` folder (ya Docker volume) ka roz backup lo. Saare orders usi mein hain.

---

## 3. Pehli baar setup (admin panel mein)

1. **Settings → Security → 2FA ON karo** (Google Authenticator). Ye bahut zaroori hai.
2. **Phones → Add phone** karo, har us phone ke liye jismein bank ka SMS aata hai (jaise "Phone 1 (Kotak)", "Phone 2 (CBI + Fino)").
3. **Bank Accounts → Add bank account:**
   - QR ka screenshot upload karo. UPI ID apne aap bhar jayegi.
   - Bank, last 4 digits, SMS sender ID (jaise `KOTAKB`) aur phone chuno.
   - Share aur daily limit set karo (Fino ke liye ₹2 lakh se kam rakhna).
4. **Phone mein SMS reader lagao:** sabse aasaan tareeka **ApnaPay Admin app** hai (upar dekho: "SMS Reader"). Ya koi bhi SMS forwarder app:
   - Android par **"SMS to URL Forwarder"** app install karo (F-Droid/Play Store, free, open-source).
   - Rule banao: Sender = `KOTAKB` (aapke bank ka ID), URL = admin ke **Phones** page se copy kiya hua URL.
   - App ko SMS permission do, aur **battery optimisation OFF** karo.
   - ⚠️ Sirf bank ke sender ka SMS forward karo, saare SMS nahi (OTP phone mein hi rahein).
5. **Test karo:**
   - **Bank Messages → Test a bank SMS** mein bank ka koi purana credit SMS paste karke "Check only" dabao.
   - Phir **Orders → New payment link** se ₹1 ka link banao, khud pay karo, aur dekho ki apne aap confirm hota hai ya nahi.
6. **Telegram alerts** (optional, free): Settings mein bot token aur chat id daalo. Har payment, login aur UPI ID change par alert aayega.
7. **Email backup** (optional, free): neeche dekho.

### Email alerts (phone band ho tab bhi chalega)

1. Apne domain ko Cloudflare par lagao, aur **Email Routing** ON karo.
2. `examples/cloudflare-email-worker.js` ko ek Worker banao. Variable `APNAPAY_EMAIL_URL` mein **Settings → Bank email alerts** wala URL daalo.
3. Ek address banao jaise `alerts-x7k2@yourdomain.in` (thoda random naam rakho) aur use Worker par bhejo.
4. Gmail filter se bank ke credit emails us address par forward karo, ya bank mein seedha wahi email register karo.
5. **Settings → Trusted bank email domains** mein apne bank ka domain hona chahiye.

Nakli email se bachav: sirf wahi email maane jaate hain jinke headers mein bank ke domain ka **DKIM/DMARC pass** ho.

---

## 4. Product website ko kaise jodein

**Websites & API → Connect website** se API key aur webhook secret lo. API key sirf aapke **server** par rahe, browser ke JavaScript mein kabhi nahi.

### Order banao

```http
POST https://pay.yourdomain.in/api/v1/orders
Authorization: Bearer ak_live_xxx
Content-Type: application/json

{
  "amount": 499,
  "reference": "ORDER-1001",
  "customer": { "name": "Rahul", "phone": "9876543210", "email": "r@x.com" },
  "note": "Cotton Kurta (M)",
  "return_url": "https://myshop.in/thanks"
}
```

Jawab (201):

```json
{
  "id": "ord_Ab12Cd34Ef56",
  "reference": "ORDER-1001",
  "status": "pending",
  "amount": "499.00",
  "amount_payable": "499.37",
  "payment_url": "https://pay.yourdomain.in/pay/ord_Ab12Cd34Ef56",
  "expires_at": "2026-10-02T10:15:00.000Z"
}
```

Customer ko `payment_url` par bhej do. Same `reference` dobara bhejoge to wahi order wapas milega, naya nahi banega.

Status kabhi bhi check kar sakte ho: `GET /api/v1/orders/{id}` ya `GET /api/v1/orders?reference=ORDER-1001`.
Order cancel karne ke liye: `POST /api/v1/orders/{id}/cancel`.

### Webhook: payment aate hi khabar

Payment confirm hote hi aapke webhook URL par ye `POST` aata hai:

```json
{
  "event": "order.paid",
  "created_at": "2026-10-02T10:05:12.000Z",
  "order": { "id": "ord_…", "reference": "ORDER-1001", "status": "paid", "amount": "499.00",
             "amount_paid": "499.37", "utr": "427512345678", "paid_at": "…", "customer": { … } }
}
```

Headers ye honge: `X-ApnaPay-Signature: sha256=<hex>`, `X-ApnaPay-Timestamp`, `X-ApnaPay-Event`, `X-ApnaPay-Delivery`.

- **Signature zaroor check karo.** `HMAC_SHA256(webhook_secret, timestamp + "." + raw_body)` banao aur header se milao.
- **2xx** jawab do. Agar aapki site down ho, to ApnaPay 1 min, 5 min, 30 min, 2 ghante… tak dobara bhejta rahega.
- Ek hi order ka webhook do baar aa sakta hai. Isliye "already paid hai to kuch mat karo" wala check rakho.
- `return_url` par aaye `?status=paid` par **bharosa mat karo**. Webhook ya API se confirm karo.

**Node.js:**

```js
const crypto = require('crypto');
function verify(rawBody, timestamp, signature, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

**PHP:**

```php
$raw = file_get_contents('php://input');
$ts  = $_SERVER['HTTP_X_APNAPAY_TIMESTAMP'] ?? '';
$sig = $_SERVER['HTTP_X_APNAPAY_SIGNATURE'] ?? '';
$expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, getenv('APNAPAY_WEBHOOK_SECRET'));
if (abs(time() - (int)$ts) > 300 || !hash_equals($expected, $sig)) { http_response_code(401); exit; }
$event = json_decode($raw, true);
if ($event['event'] === 'order.paid') {
    // $event['order']['reference'] wala order PAID karo, product SOLD karo (sirf ek baar)
}
http_response_code(200);
```

**Poora chalta hua example:** `examples/shop-demo/server.js`. Ye ek chhoti dukaan hai jo order banati hai, webhook verify karti hai, aur product SOLD karke stock kam karti hai.

```bash
APNAPAY_URL=http://localhost:3000 APNAPAY_API_KEY=ak_live_… APNAPAY_WEBHOOK_SECRET=whsec_… npm run demo-shop
# phir http://localhost:4000 kholo
```

---

## Security

- Admin login: password (scrypt hash) + optional **2FA (TOTP)**, brute-force lock, `HttpOnly`/`SameSite=Strict` cookie, CSRF header check.
- **UPI ID badalne**, naya bank/website jodne, ya password/2FA badalne par activity log aur Telegram mein **alert** aata hai.
- **Nakli SMS:** mobile number se aaya SMS hamesha reject hota hai. Sirf phone ke bank sender ID (`KOTAKB` etc.) wale SMS maane jaate hain.
- **Nakli email:** bank domain + DKIM/DMARC pass zaroori hai.
- **UTR:** ek UTR sirf ek order par chal sakta hai, aur kam paisa aaya to order confirm nahi hota.
- System ke paas bank login, PIN, ya paisa nikalne ka **koi access nahi**. Ye sirf aane wale paise ki khabar padhta hai.

## Dhyan rakhne wali baatein

- **Bank SMS ka format** har bank ka alag hota hai. Parser Kotak, Central Bank aur Fino jaise common formats padh leta hai, phir bhi **"Test a bank SMS"** mein apna asli SMS daal kar ek baar zaroor check karo. Koi format na padha jaye to SMS bhejo, parser update kar denge.
- Kuch UPI apps (khaaskar GPay) **personal UPI ID** par amount wale link kabhi-kabhi block kar dete hain. **Merchant/Business QR** (PhonePe Business, Paytm Business, bank merchant QR) use karo.
- Agar aapka merchant QR "signed" hai aur auto-amount QR par error aaye, to us bank ko **"My uploaded QR"** mode par daal do.
- Paise aate rahenge, par **GST/ITR** ka hisaab aapko rakhna hai. Admin mein saare orders aur UTR save rehte hain.

## Project structure

```
src/
  server.js        Express app, startup
  orders.js        Unique amount, bank selection, matching, UTR, late payment
  parser.js        Bank SMS / email parser
  webhooks.js      Signed webhooks + retry worker
  auth.js          Password, sessions, 2FA (TOTP)
  routes/          api (product websites), ingest (SMS/email), pay (customer page), admin
public/            Admin panel + payment page (no build step)
examples/          Demo shop, Cloudflare email worker
test/              npm test
```
