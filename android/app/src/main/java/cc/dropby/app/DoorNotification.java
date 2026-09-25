package cc.dropby.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

// The host's own open door as an ongoing notification: a countdown to closing, the note,
// and who is on their way. On Android 16+ it asks to be promoted to a Live Update
// (status bar chip, top of the lock screen). The server drives it with data-only FCM
// messages (server/src/services/live-activity.ts), so it stays current while the app is
// closed. It has one button: "Close now". In the last five minutes it reads "Your door
// closes soon" and the button becomes "Keep open +30"; the server's message at that
// point asks it to sound once. That is the only "closes soon" prompt on Android — the
// server skips the 10-minute push for installs that have this.
final class DoorNotification {
    static final String CHANNEL_ID = "door_open";
    // Same notification, posted here once so it sounds when it turns into "closes soon".
    private static final String CLOSING_CHANNEL_ID = "door_closing";
    private static final int NOTIFICATION_ID = 7201;
    private static final String PREFS = "dropby_door";
    private static final long KEEP_OPEN_LEAD_SECONDS = 300;
    // Clears itself this long after the closing time if the server's "end" never comes.
    private static final long TIMEOUT_GRACE_SECONDS = 120;
    private static final int MAX_NAMES = 3;

    private DoorNotification() {}

    // A `door_live` message from the server.
    static void handle(Context ctx, Map<String, String> data) {
        String statusId = data.get("statusId");
        if (statusId == null) return;
        SharedPreferences prefs = prefs(ctx);
        // Messages can arrive out of order; one older than the last we acted on is stale.
        long sentAt = parseLong(data.get("sentAt"));
        if (sentAt < prefs.getLong("lastSentAt", 0)) return;
        prefs.edit().putLong("lastSentAt", sentAt).apply();

        if ("end".equals(data.get("event"))) {
            end(ctx, statusId);
            return;
        }
        try {
            JSONObject door = new JSONObject();
            door.put("statusId", statusId);
            door.put("closesAt", parseLong(data.get("closesAt")));
            door.put("note", nonNull(data.get("note")));
            door.put("location", nonNull(data.get("location")));
            door.put("going", new JSONArray(data.get("going") != null ? data.get("going") : "[]"));
            door.put("goingCount", parseLong(data.get("goingCount")));
            prefs.edit().putString("door", door.toString()).apply();
            show(ctx, door, "1".equals(data.get("alert")));
        } catch (Exception e) {
            android.util.Log.w("DoorNotification", "Bad door message", e);
        }
    }

    // Remove it, if it is showing this door.
    static void end(Context ctx, String statusId) {
        JSONObject door = current(ctx);
        if (door == null || !statusId.equals(door.optString("statusId"))) return;
        prefs(ctx).edit().remove("door").apply();
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
    }

    // After "Keep open": show the new closing time straight away.
    static void setClosesAt(Context ctx, String statusId, long closesAt) {
        JSONObject door = current(ctx);
        if (door == null || !statusId.equals(door.optString("statusId"))) return;
        try {
            door.put("closesAt", closesAt);
            prefs(ctx).edit().putString("door", door.toString()).apply();
            show(ctx, door, false);
        } catch (Exception ignored) {}
    }

    static JSONObject current(Context ctx) {
        String json = prefs(ctx).getString("door", null);
        if (json == null) return null;
        try {
            return new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    private static void show(Context ctx, JSONObject door, boolean alert) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        ensureChannels(nm);

        String statusId = door.optString("statusId");
        long closesAt = door.optLong("closesAt");
        long now = System.currentTimeMillis() / 1000;
        if (closesAt <= now) {
            end(ctx, statusId);
            return;
        }

        boolean closingSoon = closesAt - now <= KEEP_OPEN_LEAD_SECONDS;
        boolean sound = alert && closingSoon;
        String channel = sound ? CLOSING_CHANNEL_ID : CHANNEL_ID;
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(ctx, channel)
            : new Notification.Builder(ctx);
        if (!sound) b.setOnlyAlertOnce(true);
        if (sound && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setDefaults(Notification.DEFAULT_SOUND);
        }
        b.setSmallIcon(R.drawable.ic_stat_door)
            .setContentTitle(closingSoon ? "Your door closes soon" : "Your door is open")
            .setOngoing(true)
            .setShowWhen(true)
            .setWhen(closesAt * 1000)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openApp(ctx));

        String detail = detail(door);
        String going = goingLine(door);
        String text = going != null ? going : detail;
        if (text != null) b.setContentText(text);
        if (going != null && detail != null) {
            b.setStyle(new Notification.BigTextStyle().bigText(detail + "\n" + going));
        }

        String action = closingSoon ? DoorActionReceiver.ACTION_PROLONG : DoorActionReceiver.ACTION_CLOSE;
        String label = closingSoon ? "Keep open +30" : "Close now";
        b.addAction(new Notification.Action.Builder(
            Icon.createWithResource(ctx, R.drawable.ic_stat_door), label, actionIntent(ctx, action, statusId)
        ).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b.setTimeoutAfter((closesAt - now + TIMEOUT_GRACE_SECONDS) * 1000);
        }
        if (Build.VERSION.SDK_INT >= 36) {
            // Notification.EXTRA_REQUEST_PROMOTED_ONGOING; its setter needs SDK 36.1.
            Bundle extras = new Bundle();
            extras.putBoolean("android.requestPromotedOngoing", true);
            b.addExtras(extras);
        }

        try {
            nm.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // Notifications not allowed: nothing to show.
        }
    }

    private static void ensureChannels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Your open door", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Shows your door while it's open");
            // It updates as people say they're coming; the push about each of them makes the sound.
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
        if (nm.getNotificationChannel(CLOSING_CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CLOSING_CHANNEL_ID, "Your door closes soon", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Once, 5 minutes before your door closes, with a button to keep it open");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
    }

    private static PendingIntent openApp(Context ctx) {
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (intent == null) intent = new Intent(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent actionIntent(Context ctx, String action, String statusId) {
        Intent intent = new Intent(ctx, DoorActionReceiver.class)
            .setAction(action)
            .putExtra(DoorActionReceiver.EXTRA_STATUS_ID, statusId);
        return PendingIntent.getBroadcast(ctx, 1, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static String detail(JSONObject door) {
        String note = door.optString("note");
        if (!note.isEmpty()) return note;
        String location = door.optString("location");
        return location.isEmpty() ? null : location;
    }

    // Same wording as the iOS Live Activity: "Ana is on their way", "Ana and Ben are on
    // their way", "Ana, Ben, Cleo +2 on their way".
    private static String goingLine(JSONObject door) {
        long count = door.optLong("goingCount");
        if (count <= 0) return null;
        List<String> names = new ArrayList<>();
        JSONArray arr = door.optJSONArray("going");
        for (int i = 0; arr != null && i < arr.length() && names.size() < MAX_NAMES; i++) names.add(arr.optString(i));
        long extra = count - names.size();
        if (names.isEmpty()) return count + " on their way";
        if (extra > 0) return String.join(", ", names) + " +" + extra + " on their way";
        if (names.size() == 1) return names.get(0) + " is on their way";
        if (names.size() == 2) return names.get(0) + " and " + names.get(1) + " are on their way";
        return String.join(", ", names) + " are on their way";
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static long parseLong(String s) {
        try {
            return s == null ? 0 : Long.parseLong(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String nonNull(String s) {
        return s == null ? "" : s;
    }
}
