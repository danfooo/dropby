package cc.dropby.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

// The door notification's button, handled without opening the app: "Close now" closes
// the door, "Keep open +30" prolongs it. Signs the request with the token the web app
// mirrors into Capacitor Preferences (client/src/utils/notifications.ts).
public class DoorActionReceiver extends BroadcastReceiver {
    static final String ACTION_CLOSE = "cc.dropby.app.DOOR_CLOSE";
    static final String ACTION_PROLONG = "cc.dropby.app.DOOR_PROLONG";
    static final String EXTRA_STATUS_ID = "statusId";
    private static final String API = "https://dropby.cc/api";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String statusId = intent.getStringExtra(EXTRA_STATUS_ID);
        if (statusId == null || (!ACTION_CLOSE.equals(action) && !ACTION_PROLONG.equals(action))) return;
        String token = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("auth_token", null);
        if (token == null) return;

        Context app = context.getApplicationContext();
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                if (ACTION_CLOSE.equals(action)) {
                    if (request("DELETE", "/status", token) != null) DoorNotification.end(app, statusId);
                } else {
                    String body = request("POST", "/status/prolong", token);
                    if (body != null) DoorNotification.setClosesAt(app, statusId, new JSONObject(body).getLong("closes_at"));
                }
            } catch (Exception e) {
                Log.w("DoorActionReceiver", "Door action failed", e);
            } finally {
                pending.finish();
            }
        }).start();
    }

    // The response body on success, null otherwise.
    private static String request(String method, String path, String token) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(API + path).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                Log.w("DoorActionReceiver", method + " " + path + ": " + status);
                return null;
            }
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                return out.toString("UTF-8");
            }
        } finally {
            conn.disconnect();
        }
    }
}
