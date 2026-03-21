# dropby Test Scenarios

## Auth
- Register with a new email, verify via email link, log in successfully
- Attempting to log in before email verification is blocked

## Friendship
- Alice shares her invite link; Bob visits it and they become friends
- Both users see each other in their friends list after connecting

## Open door — spontaneous
- Alice opens her door with a note
- Bob (a friend) sees Alice's door in his feed within a few seconds
- The server has scheduled a push notification (notify_at is set)
- Bob taps Going — Alice sees Bob is on the way

## Friend invite — generic (no open door)
- Alice shares her friendship invite link from the Friends tab
- A brand new user (Carol) visits the link, registers, and they become friends
- An existing user (Bob, already registered) visits the link and they become friends
- Alice sees both Bob and Carol in her friends list

## Open door with session-specific invite
- Alice opens her door with a note
- Alice copies the door-open invite link (the one that shows the door is open)
- A new user (Carol) visits that link, sees Alice's door is open, registers, and becomes friends with Alice
- An existing user (Bob) visits that link, sees Alice's door is open and taps Going

## Profile editing
- User changes their display name — it updates everywhere it appears
- User changes their language preference — UI switches locale
- User adds a reminder (day + time) — it appears in the reminders list
- User removes a reminder — it disappears
- User changes their avatar — new avatar is shown on their profile and friend cards
- User removes their avatar — falls back to the generated avatar

## Multiple scheduled sessions
- Alice creates three scheduled sessions on different days/times
- All three appear in the upcoming sessions list
- Alice edits the note on the second session — only that session updates
- Alice changes the end time on the third session — only that session updates
- Alice cancels the first session — it disappears from the list

## Notification scheduling — newly added recipient
- Alice opens her door visible only to Bob
- Alice edits the recipients and adds Carol
- Carol's status gets a notify_at set (assert via /api/test/status)

## Muted users — no notification
- Alice and Bob are friends, Bob mutes Alice
- Alice opens her door visible to Bob
- Bob does NOT receive a notification (notify_at is null or notifications are not sent to Bob) — assert via /api/test/status that Bob is not in the recipients list, or that the status was not set to notify Bob

## Door invite edits
- Alice opens her door
- Alice edits the note — the note updates in Bob's view
- Alice changes the auto-close duration (30min / 1h / 2h / 4h) — the closes_at updates accordingly
- Alice closes the door manually — it disappears from Bob's feed
