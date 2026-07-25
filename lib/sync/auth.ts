"use client";

/**
 * Magic-link (email OTP) auth for pilot players. A golfer signs in with the
 * email the club imported in the roster CSV; a 6-digit code is emailed and
 * verified in-app. We deliberately use the code flow rather than a link
 * redirect — it's the most reliable path inside an installed PWA on a phone,
 * with no deep-link or redirect-URL configuration to get wrong.
 *
 * The club's Supabase email template must surface the code — include
 * `{{ .Token }}` in the Magic Link / Confirm-signup template.
 */

import type { Session } from "@supabase/supabase-js";

import { REMOTE_CONFIGURED, supabase } from "./client";

export const AUTH_AVAILABLE = REMOTE_CONFIGURED;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/** Email a 6-digit sign-in code. Creates the auth user on first sign-in. */
export async function sendLoginCode(email: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOtp({
    email: normalize(email),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Verify the emailed code and open a session. */
export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<Session | null> {
  const sb = await supabase();
  const { data, error } = await sb.auth.verifyOtp({
    email: normalize(email),
    token: code.trim(),
    type: "email",
  });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  const sb = await supabase();
  await sb.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onAuthChange(
  cb: (session: Session | null) => void,
): () => void {
  let unsub = () => {};
  supabase().then((sb) => {
    const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
    unsub = () => data.subscription.unsubscribe();
  });
  return () => unsub();
}
