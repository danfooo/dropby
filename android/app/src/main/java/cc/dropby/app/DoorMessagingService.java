package cc.dropby.app;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

// Replaces the push plugin's messaging service (see AndroidManifest.xml) so door updates
// are handled natively, even with the app closed. Everything else goes to the plugin as
// before.
public class DoorMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        if ("door_live".equals(remoteMessage.getData().get("type"))) {
            DoorNotification.handle(this, remoteMessage.getData());
            return;
        }
        super.onMessageReceived(remoteMessage);
    }
}
