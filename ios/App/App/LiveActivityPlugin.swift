import Foundation
import ActivityKit
import Capacitor

// Starts, updates and ends the open-door Live Activity for the web app
// (client/src/utils/liveActivity.ts). The web app calls `sync` with the current door
// whenever it changes; the server keeps the activity current while the app is closed,
// using the push token this plugin hands back through the `pushToken` event.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
    ]

    // Calls run one after another, so two quick syncs can't each start an activity.
    private var queue: Task<Void, Never>?
    // Activities whose push token we already forward.
    private var observed = Set<String>()

    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["active": false])
            return
        }
        guard let statusId = call.getString("statusId"), let closesAt = call.getDouble("closesAt") else {
            call.reject("statusId and closesAt are required")
            return
        }
        let state = DoorActivityAttributes.ContentState(
            closesAt: closesAt,
            note: call.getString("note"),
            location: call.getString("location"),
            going: call.getArray("going", String.self) ?? [],
            goingCount: call.getInt("goingCount") ?? 0
        )
        enqueue {
            let active = await self.show(statusId: statusId, state: state)
            call.resolve(["active": active])
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        enqueue {
            for activity in Activity<DoorActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    private func enqueue(_ work: @escaping @MainActor () async -> Void) {
        let previous = queue
        queue = Task { @MainActor in
            await previous?.value
            await work()
        }
    }

    // Shows this door: updates its activity if one is running, otherwise starts one.
    // Activities for any other door are ended — a host has one open door at a time.
    @available(iOS 16.2, *)
    @MainActor
    private func show(statusId: String, state: DoorActivityAttributes.ContentState) async -> Bool {
        let content = ActivityContent(state: state, staleDate: Date(timeIntervalSince1970: state.closesAt))
        var current: Activity<DoorActivityAttributes>?
        for activity in Activity<DoorActivityAttributes>.activities {
            if current == nil && activity.attributes.statusId == statusId && activity.activityState == .active {
                current = activity
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        if let current = current {
            if current.content.state != state {
                await current.update(content)
            }
            forwardPushToken(of: current)
            return true
        }

        // Off in Settings → dropby → Live Activities.
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        do {
            let activity = try Activity.request(
                attributes: DoorActivityAttributes(statusId: statusId),
                content: content,
                pushType: .token
            )
            forwardPushToken(of: activity)
            return true
        } catch {
            print("[LiveActivity] Could not start: \(error.localizedDescription)")
            return false
        }
    }

    @available(iOS 16.2, *)
    @MainActor
    private func forwardPushToken(of activity: Activity<DoorActivityAttributes>) {
        guard !observed.contains(activity.id) else { return }
        observed.insert(activity.id)
        let statusId = activity.attributes.statusId
        Task { @MainActor in
            for await data in activity.pushTokenUpdates {
                let token = data.map { String(format: "%02x", $0) }.joined()
                self.notifyListeners("pushToken", data: ["statusId": statusId, "token": token], retainUntilConsumed: true)
            }
        }
    }
}
