import UIKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        registerNotificationCategories()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // MARK: - Notification Categories

    private func registerNotificationCategories() {
        // door_open: friend opened their door
        let goingAction = UNNotificationAction(
            identifier: "going",
            title: "Mark as Going",
            options: [.foreground]
        )
        let mute3dAction = UNNotificationAction(
            identifier: "mute_3d",
            title: "Mute for 3 days",
            options: []  // no .foreground — runs in background
        )
        let muteForeverAction = UNNotificationAction(
            identifier: "mute_forever",
            title: "Mute permanently",
            options: [.destructive]  // red styling, no foreground
        )
        let doorOpenCategory = UNNotificationCategory(
            identifier: "door_open",
            actions: [goingAction, mute3dAction, muteForeverAction],
            intentIdentifiers: [],
            options: []
        )

        // nudge / auto_nudge: open your door
        let openNowAction = UNNotificationAction(
            identifier: "open_now",
            title: "Open now",
            options: [.foreground]
        )
        let nudgeCategory = UNNotificationCategory(
            identifier: "nudge",
            actions: [openNowAction],
            intentIdentifiers: [],
            options: []
        )
        let autoNudgeCategory = UNNotificationCategory(
            identifier: "auto_nudge",
            actions: [openNowAction],
            intentIdentifiers: [],
            options: []
        )

        // closing_soon: your door closes soon
        let prolongAction = UNNotificationAction(
            identifier: "prolong",
            title: "Keep open",
            options: []
        )
        let closeAction = UNNotificationAction(
            identifier: "close",
            title: "Close now",
            options: [.destructive]
        )
        let closingSoonCategory = UNNotificationCategory(
            identifier: "closing_soon",
            actions: [prolongAction, closeAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([
            doorOpenCategory, nudgeCategory, autoNudgeCategory, closingSoonCategory
        ])
    }

    // MARK: - Background notification action handling (mute)

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionId = response.actionIdentifier
        let userInfo = response.notification.request.content.userInfo

        // Handle mute actions natively (background, no foreground)
        if actionId == "mute_3d" || actionId == "mute_forever" {
            guard let openerUserId = userInfo["openerUserId"] as? String else {
                completionHandler()
                return
            }
            let durationDays: Int? = actionId == "mute_3d" ? 3 : nil
            performMuteRequest(friendId: openerUserId, durationDays: durationDays) {
                completionHandler()
            }
            return
        }

        // For all other actions (going, open_now, prolong, close), let Capacitor handle via JS
        ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            didReceiveRemoteNotification: userInfo,
            fetchCompletionHandler: { _ in }
        )
        NotificationCenter.default.post(
            name: .capacitorPushNotificationActionPerformed,
            object: nil,
            userInfo: [
                "actionId": actionId,
                "notification": response.notification
            ]
        )
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    // MARK: - Native mute API call

    private func performMuteRequest(friendId: String, durationDays: Int?, completion: @escaping () -> Void) {
        guard let token = UserDefaults.standard.string(forKey: "CapacitorStorage.auth_token") else {
            print("[AppDelegate] No auth token for mute request")
            completion()
            return
        }

        let urlString = "https://drop-by.fly.dev/api/friends/\(friendId)/hide"
        guard let url = URL(string: urlString) else { completion(); return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [:]
        if let days = durationDays { body["duration_days"] = days }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                print("[AppDelegate] Mute request failed: \(error.localizedDescription)")
            } else if let httpResponse = response as? HTTPURLResponse {
                print("[AppDelegate] Mute response: \(httpResponse.statusCode)")
            }
            completion()
        }.resume()
    }

    // MARK: - Standard lifecycle

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

extension Notification.Name {
    static let capacitorPushNotificationActionPerformed = Notification.Name("capacitorPushNotificationActionPerformed")
}
