# Friendship data model — story walkthrough

## Schema (current)

```
friendships   (id, user_a_id, user_b_id, created_at)   — one row per pair, lower UUID sorts first
friend_mutes  (id, user_id, muted_user_id, created_at) — directional; excluded from this doc
invite_links  (id, token, created_by, invited_email, status_id, revoked, expires_at)
```

---

## 1. Anna invites Ben via link

Anna copies her invite link and sends it to Ben over WhatsApp.

```
invite_links: { token: "abc123", created_by: anna, invited_email: null, expires_at: +24h }
friendships:  (empty)
```

Ben opens the link while logged in. He hits "Accept."

```
friendships:  { user_a_id: anna, user_b_id: ben }   ← lower UUID wins; order is arbitrary
invite_links: unchanged (link stays valid; Ben or anyone else could accept again → INSERT OR IGNORE)
```

**By design:** The link is multi-use. Anna can share it in a group chat and everyone who taps it becomes a friend. Each accept is idempotent (`INSERT OR IGNORE`).

---

## 2. Anna invites Carl by email

Anna types carl@example.com in the Friends tab.

```
invite_links: { token: "def456", created_by: anna, invited_email: "carl@example.com", expires_at: +30d }
friendships:  (still just anna↔ben)
```

Carl signs up, clicks the email link, hits "Accept."

```
friendships:  { anna↔ben }, { anna↔carl }
```

Carl invites Anna back using *his own* invite link (he doesn't know she already invited him).

```
→ areFriends(carl, anna) = true → INSERT OR IGNORE → no duplicate row added
friendships:  { anna↔ben }, { anna↔carl }   ← unchanged
```

**Observation:** The model handles the "both invite each other" race cleanly because the friendship row is deduplicated and symmetric.

---

## 3. Anna opens her door; Ben and Carl see it

Anna opens her door, selects Ben and Carl as recipients.

```
statuses:          { id: s1, user_id: anna, closes_at: +30min }
status_recipients: { status_id: s1, user_id: ben }
                   { status_id: s1, user_id: carl }
```

Ben hits "I'm on my way."

```
going_signals: { status_id: s1, user_id: ben }
```

Carl also hits "I'm on my way."

```
going_signals: { status_id: s1, user_id: carl }
```

Anna sees both on her open-door screen. Neither Ben nor Carl sees the other — going signals are only shown to the door owner.

---

## 4. Ben opens his door at the same time; Anna sees both

Ben opens his door, selects Anna.

```
statuses:          { id: s2, user_id: ben, closes_at: +30min }
status_recipients: { status_id: s2, user_id: anna }
```

Anna's home screen: Anna's own door is open (s1), and Ben appears in "Friends available" (s2). Carl's door is closed so he's not listed.

Ben does not see Anna in his "Friends available" — he didn't add her as a recipient, so no row in status_recipients for Anna↔s1. He'd need to check the app to see Anna is also open.

**Observation:** Visibility is fully controlled by status_recipients, not the friendship row itself. The friendship row only gates *who can be selected* as a recipient.

---

## 5. Anna removes Ben

Anna goes to Friends, removes Ben.

```
DELETE FROM friendships WHERE (user_a_id=anna AND user_b_id=ben) OR (user_a_id=ben AND user_b_id=anna)

→ also deletes Ben from Anna's active status recipients (s1), and Anna from Ben's (s2)

friendships:       { anna↔carl }
status_recipients: { status_id: s1, user_id: carl }   ← ben removed
                   (s2 recipients: anna removed)
```

Ben still has his own active status (s2) but Anna is no longer a recipient, so Anna's home screen stops showing Ben as available. Ben's door page still shows "1 going" (Carl isn't going, that was on s1) — actually 0 going signals remain on s2 since Anna was just a recipient, not going.

Ben goes to his Friends tab — Anna is gone. He has no friends now.

**Observation:** Removal cascades cleanly into status_recipients via the explicit DELETE in the route, not via SQL CASCADE. This is a deliberate application-level choice (the friendship row CASCADE would delete friendships on user delete, but recipient cleanup for *active* statuses has to be manual).

---

## 6. Carl removes Anna (from Carl's side)

```
DELETE FROM friendships WHERE ... anna↔carl

friendships:  (empty)
```

Both users now have no friends. Anna's status s1 has no recipients left. It stays open (closes_at not changed) but nobody sees it.

---

## Model assessment

| Property | How it works today |
|---|---|
| Friendship is symmetric | ✅ One row, both directions queried with OR |
| No duplicates | ✅ UNIQUE(user_a_id, user_b_id) + canonical sort |
| Pending/requested state | ❌ Not modelled — accepting an invite immediately creates the friendship |
| Who initiated | ❌ Not stored — invite_links has `created_by` but after accept the friendship row has no memory of direction |
| Mutual visibility control | ❌ Friendship ≠ visibility; each open-door is a separate opt-in via status_recipients |
| Re-friending after remove | ✅ Works — accept any invite again, new row inserted |

The single table works well for dropby's model because friendship here is always immediate and mutual (no "request → accept" social graph flow). The complexity lives elsewhere: in invite_links (who invited whom, expiry, single vs. multi-use) and in status_recipients (who actually sees your open door).

**The one real gap:** there's no concept of a *pending* friendship. If you want to add "Anna sent Ben a friend request, Ben hasn't accepted yet" — that's not in the model. Right now the invite_link *is* the pending state, and it disappears from Ben's view once he accepts or ignores it.
