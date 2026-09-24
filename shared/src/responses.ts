// What the server returns. The server's formatters are typed against these, so a
// field added or renamed there fails to compile on both sides.

export type ReminderSetting = 'none' | 'day' | '120m' | '60m' | '30m' | '15m' | '0m';
export type NotifPref = 'none' | 'default' | 'all';

export interface User {
  id: string;
  email: string;
  display_name: string;
  timezone: string | null;
  auto_nudge_enabled: boolean;
  notif_friend_suggestions: boolean;
  notif_door_closed: boolean;
  going_reminder_1: string;
  going_reminder_2: string;
  avatar_seed: number;
  avatar_url: string | null;
  email_verified: boolean;
  default_door_minutes: number;
  created_at: number;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface PersonSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Friend extends PersonSummary {
  email: string;
  hidden: boolean;
  friendship_created_at: number;
  notif_pref: NotifPref;
  // The friend's own default recipient state for the next door.
  selected: boolean;
}

export interface GoingSignal {
  id: string;
  user_id: string | null;
  name: string;
  rsvp: string;
  note: string | null;
  created_at: number;
}

// One of the user's own doors — open now, or scheduled.
export interface Status {
  id: string;
  note: string | null;
  location: string | null;
  closes_at: number;
  closed_at: number | null;
  created_at: number;
  starts_at: number | null;
  ends_at: number | null;
  notify_at: number | null;
  notifications_sent: boolean;
  recipients: PersonSummary[];
  invite_links: Array<{ token: string; created_at: number }>;
  going_signals: GoingSignal[];
  my_going: boolean;
  my_rsvp: string | null;
  my_note: string | null;
}

// A friend's door that is visible to the user.
export interface FriendStatus {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_avatar_url: string | null;
  note: string | null;
  location: string | null;
  closes_at: number;
  starts_at: number | null;
  ends_at: number | null;
  my_going: boolean;
  my_rsvp: string | null;
  my_note: string | null;
}

export interface SavedNote {
  id: string;
  text: string;
  hidden: boolean;
  created_at: number;
}

export interface NudgeSchedule {
  id: string;
  day_of_week: string;
  hour: number;
  created_at?: number;
}

export interface Suggestion extends PersonSummary {
  link_name: string | null;
  link_size: number;
}

export interface IncomingInvite {
  token: string | null;
  source_name: string | null;
  created_at: number;
  inviter: PersonSummary;
}

export interface OpenLink {
  token: string;
  name: string | null;
  created_at: number;
  expires_at: number;
  url: string;
}

export interface PendingEmailInvite {
  token: string;
  invited_email: string;
  created_at: number;
  expires_at: number;
}

export interface CreatedInvite {
  token: string;
  name: string | null;
  url: string;
  expires_at: number;
}
