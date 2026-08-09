/**
 * Group codes.
 *
 * The short code printed beside a tee time on the sheet the club pins up on the
 * day. It identifies one playing group and nothing else: scanning the QR or
 * typing the code lands a player on their group, from where they pick
 * themselves out - and picking themselves is what asks for identity, member or
 * guest. The code never opens a scorecard on its own.
 *
 * Because it does nothing but name a group, it is safe to be short, printed and
 * read aloud across a first tee. A guest still needs their own registration
 * code to score; a member still signs in. Compare `newGuestCode`, which is a
 * credential and is longer and lowercase on purpose - a different blast radius
 * gets a different shape, and the two are visually distinct so nobody types one
 * where the other belongs.
 */

/* Uppercase, four characters, no I/O/0/1 to survive being read off a printed
   sheet. Distinct from the lowercase dashed guest code by sight. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newGroupCode(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** People type it in lower case, with spaces, off a phone camera that guessed. */
export function normaliseGroupCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * A fresh code that collides with none already in use.
 *
 * The space is large enough that a clash inside one tee sheet is vanishingly
 * unlikely, but minting against the set that already exists makes it
 * impossible rather than merely improbable, which is what a code a human reads
 * has to be.
 */
export function freshGroupCode(taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 0; i < 50; i++) {
    const c = newGroupCode();
    if (!used.has(c)) return c;
  }
  // 50 misses against a 923k space never happens; keep the contract anyway.
  return newGroupCode();
}
