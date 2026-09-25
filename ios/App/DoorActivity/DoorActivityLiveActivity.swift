import ActivityKit
import SwiftUI
import WidgetKit

// The host's open door on the Lock Screen and in the Dynamic Island: how long until it
// closes, and who is on their way. Tapping it opens the app.

private let doorGreen = Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255) // emerald-500

struct DoorActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DoorActivityAttributes.self) { context in
            LockScreenView(state: context.state, isStale: context.isStale)
                .activitySystemActionForegroundColor(doorGreen)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("🚪")
                        .font(.title2)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if !context.isStale {
                        ClosesIn(closesAt: context.state.closesAt)
                            .font(.title3.monospacedDigit())
                            .padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.isStale ? "Your door closed" : "Your door is open")
                        .font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 2) {
                        if let detail = context.state.detail {
                            Text(detail)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        if let going = context.state.goingLine {
                            Text(going)
                                .font(.subheadline)
                                .foregroundStyle(doorGreen)
                                .lineLimit(1)
                        }
                    }
                }
            } compactLeading: {
                Text("🚪")
            } compactTrailing: {
                if context.state.goingCount > 0 {
                    Text("\(context.state.goingCount) 🏃")
                        .foregroundStyle(doorGreen)
                } else if !context.isStale {
                    ClosesIn(closesAt: context.state.closesAt)
                        .monospacedDigit()
                        .frame(maxWidth: 56)
                }
            } minimal: {
                Text("🚪")
            }
            .keylineTint(doorGreen)
        }
    }
}

private struct LockScreenView: View {
    let state: DoorActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("🚪")
                .font(.system(size: 32))
            VStack(alignment: .leading, spacing: 2) {
                Text(isStale ? "Your door closed" : "Your door is open")
                    .font(.headline)
                if let detail = state.detail {
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let going = state.goingLine {
                    Text(going)
                        .font(.subheadline)
                        .foregroundStyle(doorGreen)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if !isStale {
                VStack(alignment: .trailing, spacing: 0) {
                    Text("closes in")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ClosesIn(closesAt: state.closesAt)
                        .font(.title3.monospacedDigit())
                }
            }
        }
        .padding(16)
    }
}

// A countdown the system ticks on its own, no updates needed.
private struct ClosesIn: View {
    let closesAt: Double

    var body: some View {
        let end = Date(timeIntervalSince1970: closesAt)
        Text(timerInterval: Date.now...max(end, Date.now), countsDown: true)
            .multilineTextAlignment(.trailing)
    }
}

extension DoorActivityAttributes.ContentState {
    var detail: String? {
        if let note = note, !note.isEmpty { return note }
        if let location = location, !location.isEmpty { return location }
        return nil
    }

    // "Ana is on their way", "Ana and Ben are on their way", "Ana, Ben, Cleo +2 on their way"
    var goingLine: String? {
        guard goingCount > 0 else { return nil }
        let extra = goingCount - going.count
        switch (going.count, extra) {
        case (0, _):
            return "\(goingCount) on their way"
        case (1, 0):
            return "\(going[0]) is on their way"
        case (2, 0):
            return "\(going[0]) and \(going[1]) are on their way"
        case (_, 0):
            return "\(going.joined(separator: ", ")) are on their way"
        default:
            return "\(going.joined(separator: ", ")) +\(extra) on their way"
        }
    }
}
