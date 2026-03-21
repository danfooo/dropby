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

## More to come as the app grows
