"use client";

/**
 * Magic-link auth for pilot players. A golfer signs in with the email the club
 * imported in the roster CSV, and one email covers both routes in:
 *
 *   the link  the default Supabase template already contains it. Tapping it
 *             returns to the app with the session in the URL, which the
 *             client picks up (detectSessionInUrl). Nothing to configure
 *             beyond allowing the redirect URL.
 *   the code  a six-digit token typed into the app. Nicer inside an installed
 *             PWA, because the player never leaves it, but it only appears in
 *             the email if the club's template includes `{{ .Token }}`.
 *
 * Supporting both means sign-in works out of the box, and gets better if the
 * club customises the template later.
 */

import type { Session } from "@supabase/supabase-js";

import { REMOTE_CONFIGURED, supabase } from "./client";

export const AUTH_AVAILABLE = REMOTE_CONFIGURED;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Email a sign-in link and code. Creates the auth user on first sign-in.
 * `emailRedirectTo` is where the link lands; it must be listed under
 * Authentication > URL Configuration > Redirect URLs in Supabase.
 */
export async function sendLoginCode(email: string): Promise<void> {
  const sb = await supabase();
  const { error } = await sb.auth.signInWithOtp({
    email: normalize(email),
    options: {
      shouldCreateUser: true,
      emailRedirectTo:
        typeof window === "undefined" ? undefined : `${window.location.origin}/app`,
    },
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
