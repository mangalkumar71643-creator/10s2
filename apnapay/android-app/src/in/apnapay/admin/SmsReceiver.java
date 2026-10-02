package in.apnapay.admin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/** Android calls this for every incoming SMS, even when the app is closed. */
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        final Context c = context.getApplicationContext();
        if (!SmsStore.enabled(c) || SmsStore.url(c).isEmpty()) return;

        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null) return;

        // Long SMS arrive in several parts; join them per sender.
        Map<String, StringBuilder> bodies = new LinkedHashMap<>();
        Map<String, Long> times = new LinkedHashMap<>();
        for (SmsMessage part : parts) {
            if (part == null) continue;
            String sender = part.getDisplayOriginatingAddress();
            if (sender == null) continue;
            StringBuilder b = bodies.get(sender);
            if (b == null) {
                b = new StringBuilder();
                bodies.put(sender, b);
                times.put(sender, part.getTimestampMillis());
            }
            b.append(part.getMessageBody());
        }

        boolean queued = false;
        for (Map.Entry<String, StringBuilder> e : bodies.entrySet()) {
            String text = e.getValue().toString();
            if (!SmsFilter.shouldForward(e.getKey(), text)) continue;
            SmsStore.enqueue(c, e.getKey(), text, times.get(e.getKey()));
            queued = true;
        }
        if (!queued) return;

        final PendingResult pending = goAsync();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (!SmsSender.flush(c)) SmsJobs.scheduleRetry(c);
                } finally {
                    pending.finish();
                }
            }
        }).start();
    }
}
