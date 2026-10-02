package in.apnapay.admin;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Sends queued bank SMS to the ApnaPay server. Anything that fails stays queued for the next try. */
final class SmsSender {
    private static final Object LOCK = new Object();

    private SmsSender() {}

    static final class Result {
        final int code;
        final String body;

        Result(int code, String body) {
            this.code = code;
            this.body = body;
        }

        boolean ok() {
            return code >= 200 && code < 300;
        }
    }

    static Result request(String url, String method, String json) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestMethod(method);
            conn.setRequestProperty("User-Agent", "ApnaPayApp/1.1");
            if (json != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                OutputStream out = conn.getOutputStream();
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.close();
            }
            int code = conn.getResponseCode();
            InputStream in = code < 400 ? conn.getInputStream() : conn.getErrorStream();
            StringBuilder body = new StringBuilder();
            if (in != null) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int n;
                while ((n = in.read(chunk)) > 0 && buf.size() < 65536) buf.write(chunk, 0, n);
                in.close();
                body.append(buf.toString("UTF-8"));
            }
            return new Result(code, body.toString());
        } catch (Exception e) {
            return new Result(-1, String.valueOf(e.getMessage()));
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** @return true when the queue is empty afterwards. */
    static boolean flush(Context c) {
        synchronized (LOCK) {
            String url = SmsStore.url(c);
            if (url.isEmpty()) return true;
            JSONArray q = SmsStore.queue(c);
            for (int i = 0; i < q.length(); i++) {
                JSONObject item = q.optJSONObject(i);
                if (item == null) continue;
                String from = item.optString("from");
                Result r;
                try {
                    JSONObject body = new JSONObject();
                    body.put("from", from);
                    body.put("text", item.optString("text"));
                    body.put("receivedStamp", item.optLong("ts"));
                    r = request(url, "POST", body.toString());
                } catch (Exception e) {
                    r = new Result(-1, e.getMessage());
                }

                if (r.ok()) {
                    SmsStore.remove(c, item.optString("id"));
                    SmsStore.setLastContact(c, true);
                    String matched = null;
                    String ignored = null;
                    try {
                        JSONObject res = new JSONObject(r.body);
                        matched = res.isNull("matched_order") ? null : res.optString("matched_order", null);
                        ignored = res.optString("ignored", null);
                    } catch (Exception ignoredErr) {
                    }
                    if (matched != null) SmsStore.log(c, "✅ Payment confirmed (" + from + ")");
                    else if (ignored != null) SmsStore.log(c, "Server ignored SMS from " + from + ": " + ignored);
                    else SmsStore.log(c, "Sent bank SMS from " + from + " — no matching order");
                } else if (r.code == 400 || r.code == 413) {
                    // The server will never accept this one; don't block the queue with it.
                    SmsStore.remove(c, item.optString("id"));
                    SmsStore.log(c, "Server rejected SMS from " + from + " (HTTP " + r.code + ")");
                } else {
                    SmsStore.setLastContact(c, false);
                    SmsStore.log(c, r.code == 404
                        ? "Phone link is wrong or was reset — copy it again from admin → Phones"
                        : r.code == -1 ? "No internet — SMS saved, will send automatically"
                        : "Server error HTTP " + r.code + " — will retry");
                    return false;
                }
            }
            return true;
        }
    }

    /** Heartbeat so the admin panel shows this phone as online. */
    static Result ping(Context c) {
        if (SmsStore.url(c).isEmpty()) return new Result(-1, "no link");
        Result r = request(SmsStore.pingUrl(c), "GET", null);
        SmsStore.setLastContact(c, r.ok());
        return r;
    }
}
