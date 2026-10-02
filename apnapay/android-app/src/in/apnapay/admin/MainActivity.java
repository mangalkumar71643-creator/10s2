package in.apnapay.admin;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * ApnaPay Admin: opens the admin panel of your ApnaPay server in a full-screen app.
 * First launch shows a setup screen (assets/setup.html) where you enter the server address.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "apnapay";
    private static final String KEY_SERVER = "server_url";
    private static final String ASSETS = "file:///android_asset/";
    private static final String SETUP_PAGE = ASSETS + "setup.html";
    private static final String SMS_PAGE = ASSETS + "sms.html";
    private static final int SMS_PERMISSION = 42;
    private static final int PICK_FILE = 41;

    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private volatile String currentUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#8B5CF6")));
        root.addView(progress, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4)));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " ApnaPayApp/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "ApnaPayApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            openHome();
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String server() {
        return prefs().getString(KEY_SERVER, "");
    }

    private void openHome() {
        String server = server();
        if (server.isEmpty()) {
            web.loadUrl(SETUP_PAGE);
        } else {
            web.loadUrl(server + "/admin");
        }
    }

    private void openSetup(String error) {
        String url = SETUP_PAGE + "?server=" + Uri.encode(server());
        if (error != null) url += "&error=" + Uri.encode(error);
        web.loadUrl(url);
    }

    private boolean isOwnServer(Uri uri) {
        String server = server();
        if (server.isEmpty()) return false;
        Uri s = Uri.parse(server);
        return s.getHost() != null && s.getHost().equalsIgnoreCase(uri.getHost()) && s.getPort() == uri.getPort();
    }

    /** UPI apps, WhatsApp, phone calls and other websites open outside the app. */
    private void openExternally(String url) {
        try {
            Intent intent;
            if (url.startsWith("intent:")) {
                intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Cannot open: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme();
            if (scheme.equals("apnapay")) {
                if ("sms".equals(uri.getHost())) { // apnapay://sms?url=... from admin → Phones
                    String link = uri.getQueryParameter("url");
                    web.loadUrl(SMS_PAGE + (link != null ? "?url=" + Uri.encode(link) : ""));
                } else { // apnapay://setup from "Change server"
                    openSetup(null);
                }
                return true;
            }
            if (scheme.equals("file")) return false;
            if ((scheme.equals("http") || scheme.equals("https")) && isOwnServer(uri)) return false;
            openExternally(uri.toString());
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            currentUrl = url;
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progress.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:")) {
                openSetup("Server se connect nahi ho paya (" + error.getDescription() + ")");
            }
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("image/*");
            try {
                startActivityForResult(Intent.createChooser(pick, "Choose QR image"), PICK_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                Toast.makeText(MainActivity.this, "No gallery app found", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[] { data.getData() };
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** Only pages bundled inside the app (setup.html, sms.html) may use these. */
    private class Bridge {
        private boolean trusted() {
            return currentUrl.startsWith(ASSETS);
        }

        private void js(final String code) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.evaluateJavascript(code, null);
                }
            });
        }

        @JavascriptInterface
        public String getServer() {
            return trusted() ? server() : "";
        }

        @JavascriptInterface
        public void saveServer(final String url) {
            if (!trusted()) return;
            prefs().edit().putString(KEY_SERVER, url).apply();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.clearHistory();
                    web.loadUrl(url + "/admin");
                }
            });
        }

        @JavascriptInterface
        public void openAdmin(final String hash) {
            if (!trusted()) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (server().isEmpty()) web.loadUrl(SETUP_PAGE);
                    else web.loadUrl(server() + "/admin" + (hash == null ? "" : hash));
                }
            });
        }

        @JavascriptInterface
        public String getSmsState() {
            if (!trusted()) return "{}";
            try {
                JSONObject o = new JSONObject();
                o.put("url", SmsStore.url(MainActivity.this));
                o.put("enabled", SmsStore.enabled(MainActivity.this));
                o.put("permission", hasSmsPermission());
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                o.put("battery_ok", pm != null && pm.isIgnoringBatteryOptimizations(getPackageName()));
                o.put("queue", SmsStore.queue(MainActivity.this).length());
                o.put("last_ok", SmsStore.lastOk(MainActivity.this));
                o.put("last_fail", SmsStore.lastFail(MainActivity.this));
                o.put("log", SmsStore.logs(MainActivity.this));
                o.put("server", server());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public String saveSms(String url, boolean enabled) {
            if (!trusted()) return "not allowed";
            url = url == null ? "" : url.trim();
            if (enabled && !url.matches("^https?://.+/ingest/sms/[A-Za-z0-9_-]{10,}$")) {
                return "Ye link sahi nahi lag raha. Admin panel → Phones se 'SMS forward URL' copy karein.";
            }
            if (enabled && !hasSmsPermission()) return "Pehle SMS permission allow karein (Step 1).";
            SmsStore.save(MainActivity.this, url, enabled);
            SmsJobs.setHeartbeat(MainActivity.this, enabled);
            SmsStore.log(MainActivity.this, enabled ? "SMS reader turned ON" : "SMS reader turned OFF");
            if (enabled) SmsJobs.scheduleRetry(MainActivity.this);
            return "";
        }

        @JavascriptInterface
        public void askSmsPermission() {
            if (!trusted()) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    requestPermissions(new String[] { Manifest.permission.RECEIVE_SMS }, SMS_PERMISSION);
                }
            });
        }

        @JavascriptInterface
        public void openBatterySettings() {
            if (!trusted()) return;
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } catch (Exception e) {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            }
        }

        @JavascriptInterface
        public void openAppSettings() {
            if (!trusted()) return;
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }

        /** Checks the phone link by pinging the server; result arrives in window.onTestResult(ok, message). */
        @JavascriptInterface
        public void testConnection(final String url) {
            if (!trusted()) return;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    SmsSender.Result r = SmsSender.request(url.trim().replace("/ingest/sms/", "/ingest/ping/"), "GET", null);
                    String msg = r.ok() ? "Connected! Server ne is phone ko pehchaan liya."
                        : r.code == 404 ? "Link galat hai ya reset ho chuka hai. Phones page se dobara copy karein."
                        : r.code == -1 ? "Server tak nahi pahunch paye. Internet aur address check karein."
                        : "Server error HTTP " + r.code;
                    js("window.onTestResult && onTestResult(" + r.ok() + "," + JSONObject.quote(msg) + ")");
                }
            }).start();
        }

        /** Sends any saved SMS right now. */
        @JavascriptInterface
        public void sendNow() {
            if (!trusted()) return;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    if (!SmsSender.flush(MainActivity.this)) SmsJobs.scheduleRetry(MainActivity.this);
                    SmsSender.ping(MainActivity.this);
                    js("window.refreshState && refreshState()");
                }
            }).start();
        }
    }

    private boolean hasSmsPermission() {
        return checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == SMS_PERMISSION) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (!granted && !shouldShowRequestPermissionRationale(Manifest.permission.RECEIVE_SMS)) {
                Toast.makeText(this, "Settings → Permissions → SMS → Allow karein", Toast.LENGTH_LONG).show();
            }
            web.evaluateJavascript("window.refreshState && refreshState()", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null && currentUrl.startsWith(ASSETS)) web.evaluateJavascript("window.refreshState && refreshState()", null);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
