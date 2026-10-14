STOCKPAY — SHOP ME "ADD MONEY" JODNE KA CODE
=============================================

Kaise chalega:
  1. Customer app me ₹200 dabata hai
  2. App aapke SERVER se payment link maangta hai
  3. Server StockPay se link banwata hai → app QR wala payment page kholta hai
  4. Customer PhonePe / GPay / Paytm se pay karta hai
  5. StockPay aapke server ko webhook bhejta hai → balance APNE AAP add ho jata hai

Folder me kya hai:
  nodejs/stockpay.js        → server Node.js (Express) me hai to ye
  php/stockpay.php          → server PHP me hai to ye
  app/buttons.html          → website / WebView app ke ₹200-₹1000 buttons
  app/Android-AddMoney.kt   → Android (Kotlin) app ke liye

Sirf EK server file use karni hai (Node.js YA PHP).


STEP 1 — StockPay admin se 2 cheezein copy karo
-----------------------------------------------
  a) API Keys tab → TEST key (sk_test_...)
  b) Usi tab me → WEBHOOK SECRET (whsec_...)
  c) Usi tab me "Webhook URL (aapki website)" me daalo aur Save karo:
       Node.js:  https://AAPKI-SHOP-SITE.com/stockpay/webhook
       PHP:      https://AAPKI-SHOP-SITE.com/stockpay.php?action=webhook


STEP 2 — Server me code daalo
-----------------------------
NODE.JS:
  1. stockpay.js ko server ke folder me daalo
  2. Main server file (index.js / server.js / app.js) me ye line jodo:
        app.use('/stockpay', require('./stockpay'));
  3. Server ki settings (Environment Variables) me daalo:
        STOCKPAY_KEY = sk_test_...
        STOCKPAY_WEBHOOK_SECRET = whsec_...

PHP:
  1. stockpay.php ko website ke folder me upload karo
  2. File ke upar sk_test_PASTE_YOUR_KEY_HERE aur whsec_PASTE_YOUR_SECRET_HERE
     ki jagah apni key aur secret daalo (ya environment variables me)


STEP 3 — Sirf 2 jagah badalna hai (file me "EDIT 1" aur "EDIT 2" likha hai)
---------------------------------------------------------------------------
  EDIT 1: logged-in user ki ID kaise milti hai (jaise aapke baaki code me milti hai)
  EDIT 2: user ke wallet me balance kaise add hota hai (aapke database me)
          → Har payment ka orderId save karo, taaki ek payment ka paisa 2 baar add na ho

  Ye 2 cheezein har shop me alag hoti hain, isliye inhe aapko ya developer ko jodna hoga.
  Jab tak EDIT 2 nahi joda, balance add nahi hoga (StockPay baad me dobara try karta rahega).


STEP 4 — App me buttons
-----------------------
  Website / WebView app:  app/buttons.html wala code buttons ki jagah paste karo
                           (PHP ho to '/stockpay/add-money' ko
                            '/stockpay.php?action=add-money' kar do)
  WebView app:            Android-AddMoney.kt ka PART A zaroor jodo, warna
                           PhonePe/GPay buttons app ke andar nahi khulenge
  Native Android app:     Android-AddMoney.kt ka PART B


STEP 5 — Test karo (koi asli paisa nahi katega)
-----------------------------------------------
  1. App me ₹200 dabao → payment page khulega, upar "TEST" likha hoga
  2. "Simulate successful payment" dabao
  3. App me wallet check karo → ₹200 add hona chahiye
  4. StockPay admin → Orders me TEST order "Paid" dikhega


STEP 6 — Live karo
------------------
  Test sahi chale to sirf STOCKPAY_KEY ko sk_live_... se badal do. Bas!
  Ab asli UPI payment aayega aur bank SMS se confirm hoga.


ZAROORI SAAVDHANI
-----------------
  • sk_live / sk_test key KABHI app (APK) ya website ke page me mat daalo — sirf server par
  • Webhook secret bhi sirf server par
  • Amount sirf 200, 400, 600, 800, 1000 allowed hai (file me AMOUNTS badal sakte ho)
  • Docs: https://stockpay-in.vercel.app/docs
