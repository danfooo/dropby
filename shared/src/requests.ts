import { z } from 'zod';

// Request bodies the server accepts. The server validates every body against these
// before the handler runs (server/src/middleware/validate.ts); the client builds its
// calls from the inferred types. They check shape and type only — business rules and
// their specific error codes (e.g. "Note max 160 chars", INVITE_REQUIRED) stay in the
// handlers. Unknown extra keys are allowed so an older client never gets refused for
// sending something the server stopped reading.

const text = z.string().nullish();
// Unix seconds. Numeric strings are accepted and converted.
const unixTime = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]);
const ids = z.array(z.string());

// ── Auth ──────────────────────────────────────────────────────

export const signupBody = z.looseObject({
  email: z.string(),
  password: z.string(),
  display_name: text,
  locale: text,
  redirect_url: text,
  invite_token: text,
});

export const loginBody = z.looseObject({ email: z.string(), password: z.string() });
export const verifyEmailBody = z.looseObject({ token: z.string() });
export const resendVerificationBody = z.looseObject({ email: z.string(), redirect_url: text });
export const forgotPasswordBody = z.looseObject({ email: z.string() });
export const resetPasswordBody = z.looseObject({ token: z.string(), password: z.string() });
export const googleSignInBody = z.looseObject({ credential: z.string(), invite_token: text });
export const appleSignInBody = z.looseObject({
  identityToken: z.string(),
  fullName: z.looseObject({ givenName: text, familyName: text }).nullish(),
  invite_token: text,
});

export const updateMeBody = z.looseObject({
  display_name: z.string().optional(),
  auto_nudge_enabled: z.boolean().optional(),
  notif_door_closed: z.boolean().optional(),
  notif_friend_suggestions: z.boolean().optional(),
  going_reminder_1: z.string().optional(),
  going_reminder_2: z.string().optional(),
  avatar_seed: unixTime.optional(),
});

// Platform is checked (and logged when wrong) by the handler.
export const pushTokenBody = z.looseObject({
  token: z.string().optional(),
  platform: z.string().optional(),
  door_live: z.boolean().optional(),
});
export const removePushTokenBody = z.looseObject({ token: z.string().optional() });

// ── Doors ─────────────────────────────────────────────────────

export const createStatusBody = z.looseObject({
  note: text,
  location: text,
  recipient_ids: ids.optional(),
  starts_at: unixTime.nullish(),
  ends_at: unixTime.nullish(),
  reminder_minutes: z.number().nullish(),
});

export const updateStatusBody = z.looseObject({
  note: text,
  location: text,
  recipient_ids: ids.optional(),
  ends_at: unixTime.nullish(),
});

export const updateStatusByIdBody = updateStatusBody.extend({ starts_at: unixTime.nullish() });

export const setDurationBody = z.looseObject({ minutes: unixTime });

export const liveActivityTokenBody = z.looseObject({ token: z.string().min(1).max(512) });

// ── Going ─────────────────────────────────────────────────────

export const goingBody = z.looseObject({ note: text });
export const claimGuestBody = z.looseObject({ signal_id: z.string() });
export const guestGoingBody = z.looseObject({
  name: z.string(),
  contact: text,
  marketing_consent: z.boolean().optional(),
  note: text,
});

// ── Friends & invites ─────────────────────────────────────────

export const hideFriendBody = z.looseObject({ duration_days: z.number().optional() });
export const notifPrefBody = z.looseObject({ pref: z.string() });
export const userIdsBody = z.looseObject({ user_ids: ids.optional() });
export const fromUserIdsBody = z.looseObject({ from_user_ids: ids.optional() });
export const createInviteBody = z.looseObject({ status_id: text, name: text });
export const renameInviteBody = z.looseObject({ name: text });
export const acceptInviteBody = z.looseObject({ also: ids.optional() });
export const emailInviteBody = z.looseObject({ email: z.string() });

// ── Everything else ───────────────────────────────────────────

export const saveNoteBody = z.looseObject({ text: z.string() });
export const hideNoteBody = z.looseObject({ hidden: z.boolean() });
export const addNudgeBody = z.looseObject({ day_of_week: z.string(), hour: z.number() });
export const feedbackBody = z.looseObject({ type: z.string(), message: z.string(), reply_email: text });
export const trackBody = z.looseObject({ event: z.string(), data: z.record(z.string(), z.unknown()).nullish() });

export type SignupBody = z.input<typeof signupBody>;
export type UpdateMeBody = z.input<typeof updateMeBody>;
export type CreateStatusBody = z.input<typeof createStatusBody>;
export type UpdateStatusBody = z.input<typeof updateStatusBody>;
export type UpdateStatusByIdBody = z.input<typeof updateStatusByIdBody>;
export type GuestGoingBody = z.input<typeof guestGoingBody>;
export type FeedbackBody = z.input<typeof feedbackBody>;
