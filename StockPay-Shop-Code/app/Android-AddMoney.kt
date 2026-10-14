// StockPay "Add Money" for an Android app (Kotlin).
// Use ONE of the two parts below, depending on how your app is built.

// ───────────────────────────────────────────────────────────────────────────
// PART A — your app is a WebView (shows your website inside the app).
// The StockPay page has PhonePe / GPay / Paytm buttons that use "upi://" links.
// A WebView cannot open those by itself — add this to your WebView setup:

webView.webViewClient = object : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        if (url.startsWith("http://") || url.startsWith("https://")) return false // normal pages stay in the app
        return try {
            // upi://, intent://, tez://, phonepe://, paytmmp:// → open the UPI app
            val intent = if (url.startsWith("intent://")) Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                         else Intent(Intent.ACTION_VIEW, Uri.parse(url))
            view.context.startActivity(intent)
            true
        } catch (e: Exception) {
            Toast.makeText(view.context, "UPI app not found", Toast.LENGTH_SHORT).show()
            true
        }
    }
}

// ───────────────────────────────────────────────────────────────────────────
// PART B — your app is native (buttons in Kotlin, talks to your server).
// 1. Button → ask YOUR server for a payment link (never put the StockPay key in the app).
// 2. Open the link in the phone's browser — UPI app buttons work there automatically.

fun addMoney(activity: Activity, amount: Int, loginToken: String) {
    Thread {
        try {
            val conn = URL("https://YOUR-SHOP-SERVER.com/stockpay/add-money").openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $loginToken") // however your app logs in
            conn.doOutput = true
            conn.outputStream.use { it.write("""{"amount":$amount}""".toByteArray()) }
            val body = (if (conn.responseCode < 400) conn.inputStream else conn.errorStream)
                .bufferedReader().readText()
            val json = JSONObject(body)
            activity.runOnUiThread {
                if (json.has("payment_url")) {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(json.getString("payment_url"))))
                } else {
                    Toast.makeText(activity, json.optString("error", "Please try again"), Toast.LENGTH_SHORT).show()
                }
            }
        } catch (e: Exception) {
            activity.runOnUiThread { Toast.makeText(activity, "No internet, please try again", Toast.LENGTH_SHORT).show() }
        }
    }.start()
}

// Button example:
//   findViewById<Button>(R.id.btn200).setOnClickListener { addMoney(this, 200, myLoginToken) }
// When the user comes back to the app, reload the wallet balance from your server
// (the webhook has already added the money).
