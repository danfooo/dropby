import ActivityKit
import Foundation

// The Live Activity for the host's own open door. Compiled into both the app (which
// starts it) and the DoorActivity widget extension (which draws it).
//
// ContentState must match what the server pushes (server/src/services/live-activity.ts).
// closesAt is a plain Unix timestamp rather than a Date: ActivityKit decodes pushed
// Dates as seconds since 2001, which is easy to get wrong on the server.
@available(iOS 16.1, *)
struct DoorActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var closesAt: Double
        var note: String?
        var location: String?
        // The first few people on their way; goingCount counts all of them.
        var going: [String]
        var goingCount: Int
    }

    var statusId: String
}
