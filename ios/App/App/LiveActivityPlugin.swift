import Foundation
import ActivityKit
import Capacitor

// Starts, updates and ends the open-door Live Activity for the web app
// (client/src/utils/liveActivity.ts). The web app calls `sync` with the current door
// whenever it changes; the server keeps the activity current while the app is closed,
// using the push tokens DoorActivityCenter sends it.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resendTokens", returnType: CAPPluginReturnPromise),
    ]

    // Calls run one after another, so two quick syncs can't each start an activity.
    private var queue: Task<Void, Never>?

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

    // After signing in: tokens issued while signed out never reached the server.
    @objc func resendTokens(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        enqueue {
            DoorActivityCenter.shared.resend()
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

    // Shows this door: updates its activity if one is running (started here or by the
    // server), otherwise starts one. Activities for any other door are ended — a host
    // has one open door at a time.
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
            DoorActivityCenter.shared.observe(current)
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
            DoorActivityCenter.shared.observe(activity)
            return true
        } catch {
            print("[LiveActivity] Could not start: \(error.localizedDescription)")
            return false
        }
    }
}
