import Foundation
import ActivityKit

// Hands the server the tokens it needs to drive the open-door Live Activity:
// - each activity's own push token, so it can update and end it
// - on iOS 17.2+, this device's push-to-start token, so it can start one without the app
//
// Started at launch from AppDelegate. When the server starts an activity by push, iOS
// wakes the app in the background with no web view, so this runs natively and signs
// requests with the token the web app mirrors into UserDefaults (syncAuthTokenToNative).
@available(iOS 16.2, *)
@MainActor
final class DoorActivityCenter {
    static let shared = DoorActivityCenter()

    private var started = false
    private var observed = Set<String>()
    // Last token sent per API path, so a sign-in can send them again.
    private var sent: [String: String] = [:]

    func start() {
        guard !started else { return }
        started = true

        for activity in Activity<DoorActivityAttributes>.activities {
            observe(activity)
        }
        Task { @MainActor in
            for await activity in Activity<DoorActivityAttributes>.activityUpdates {
                self.adopt(activity)
            }
        }
        if #available(iOS 17.2, *) {
            Task { @MainActor in
                for await data in Activity<DoorActivityAttributes>.pushToStartTokenUpdates {
                    self.upload(path: "/status/live-activity/start-token", token: data.hexString)
                }
            }
        }
    }

    // Forward this activity's push token to the server whenever iOS issues one.
    func observe(_ activity: Activity<DoorActivityAttributes>) {
        guard !observed.contains(activity.id) else { return }
        observed.insert(activity.id)
        let path = "/status/\(activity.attributes.statusId)/live-activity"
        Task { @MainActor in
            for await data in activity.pushTokenUpdates {
                self.upload(path: path, token: data.hexString)
            }
        }
    }

    // Send every token again — after signing in, when earlier uploads had no account.
    func resend() {
        for (path, token) in sent {
            upload(path: path, token: token)
        }
    }

    // A new activity, possibly started by the server. If this door already has one
    // (the app started it too), the newcomer is the duplicate.
    private func adopt(_ activity: Activity<DoorActivityAttributes>) {
        let twin = Activity<DoorActivityAttributes>.activities.contains {
            $0.id != activity.id && $0.attributes.statusId == activity.attributes.statusId && $0.activityState == .active
        }
        if twin {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
            return
        }
        observe(activity)
    }

    private func upload(path: String, token: String) {
        sent[path] = token
        guard let auth = UserDefaults.standard.string(forKey: "CapacitorStorage.auth_token"),
              let url = URL(string: "https://dropby.cc/api\(path)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(auth)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token])
        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                print("[LiveActivity] Token upload failed: \(error.localizedDescription)")
            } else if let http = response as? HTTPURLResponse, http.statusCode >= 300 {
                print("[LiveActivity] Token upload \(path): \(http.statusCode)")
            }
        }.resume()
    }
}

private extension Data {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
