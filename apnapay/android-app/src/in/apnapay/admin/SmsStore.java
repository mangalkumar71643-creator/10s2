package in.apnapay.admin;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

/** Settings, the offline queue of bank SMS waiting to be sent, and a short activity log. */
final class SmsStore {
    private static final String PREFS = "apnapay_sms";
    private static final int MAX_QUEUE = 500;
    private static final int MAX_LOG = 40;

    private SmsStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String url(Context c) {
        return prefs(c).getString("url", "");
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("enabled", false);
    }

    static void save(Context c, String url, boolean enabled) {
        prefs(c).edit().putString("url", url).putBoolean("enabled", enabled).apply();
    }

    /** ".../ingest/sms/TOKEN" -> ".../ingest/ping/TOKEN" */
    static String pingUrl(Context c) {
        return url(c).replace("/ingest/sms/", "/ingest/ping/");
    }

    static synchronized JSONArray queue(Context c) {
        try {
            return new JSONArray(prefs(c).getString("queue", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized void enqueue(Context c, String from, String text, long timestamp) {
        JSONArray q = queue(c);
        JSONArray out = new JSONArray();
        // Drop the oldest items if the phone was offline for a very long time.
        for (int i = Math.max(0, q.length() - MAX_QUEUE + 1); i < q.length(); i++) out.put(q.opt(i));
        try {
            JSONObject item = new JSONObject();
            item.put("id", UUID.randomUUID().toString());
            item.put("from", from);
            item.put("text", text);
            item.put("ts", timestamp);
            out.put(item);
        } catch (JSONException ignored) {
        }
        prefs(c).edit().putString("queue", out.toString()).commit();
    }

    static synchronized void remove(Context c, String id) {
        JSONArray q = queue(c);
        JSONArray out = new JSONArray();
        for (int i = 0; i < q.length(); i++) {
            JSONObject item = q.optJSONObject(i);
            if (item != null && !id.equals(item.optString("id"))) out.put(item);
        }
        prefs(c).edit().putString("queue", out.toString()).commit();
    }

    static synchronized void log(Context c, String message) {
        JSONArray logs = logs(c);
        JSONArray out = new JSONArray();
        String time = new SimpleDateFormat("dd MMM, hh:mm a", Locale.ENGLISH).format(new Date());
        try {
            out.put(new JSONObject().put("t", time).put("m", message));
        } catch (JSONException ignored) {
        }
        for (int i = 0; i < logs.length() && i < MAX_LOG - 1; i++) out.put(logs.opt(i));
        prefs(c).edit().putString("log", out.toString()).apply();
    }

    static synchronized JSONArray logs(Context c) {
        try {
            return new JSONArray(prefs(c).getString("log", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static void setLastContact(Context c, boolean ok) {
        prefs(c).edit().putLong(ok ? "last_ok" : "last_fail", System.currentTimeMillis()).apply();
    }

    static long lastOk(Context c) {
        return prefs(c).getLong("last_ok", 0);
    }

    static long lastFail(Context c) {
        return prefs(c).getLong("last_fail", 0);
    }
}
