/**
 * Where a prospective club can reach the people behind Shimo.
 *
 * Set NEXT_PUBLIC_CONTACT_EMAIL to show "Talk to us" on the landing page.
 * Without it the page offers the demo alone rather than a mailto that goes
 * nowhere: a contact that is not real is worse than none.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

export function contactHref(subject: string): string | null {
  if (!CONTACT_EMAIL) return null;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
