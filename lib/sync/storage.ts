"use client";

/**
 * Club logo upload.
 *
 * The logo ends up on tournament cards, the leaderboard, and generated
 * posters, so it lives in a public bucket and is referenced by URL. A URL,
 * rather than a data URI, because posters are rendered server-side and the
 * renderer has to be able to fetch the image.
 *
 * Whatever the club uploads is squared and scaled down to 512px before it
 * leaves the browser. Clubs hand over 3MB photographs of a signboard; without
 * this, every device would pull that down on every load.
 */

import { supabase } from "./client";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB
export const TARGET_PX = 512;
export const MIN_SOURCE_PX = 400;

export interface LogoResult {
  url: string;
  width: number;
  height: number;
}

/**
 * Fit the image onto a transparent square canvas without cropping or
 * stretching it, so a wide crest keeps its proportions.
 */
async function squareAndShrink(file: File): Promise<Blob> {
  // SVG is already resolution-independent; leave it alone.
  if (file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file);
  const side = Math.min(TARGET_PX, Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  const scale = Math.min(side / bitmap.width, side / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);
  bitmap.close();

  // PNG, to keep transparency; clubs' crests almost always have it
  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/png"),
  );
}

/** Reject early, with a reason a club administrator can act on. */
export async function validateLogo(
  file: File,
  opts: { minPx?: number } = {},
): Promise<string | null> {
  const minPx = opts.minPx ?? MIN_SOURCE_PX;
  const ok = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!ok.includes(file.type))
    return "That file type isn't supported. Use PNG, JPG, WebP or SVG.";
  if (file.size > MAX_UPLOAD_BYTES)
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 2MB.`;
  if (file.type === "image/svg+xml") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    bitmap.close();
    if (Math.max(width, height) < minPx)
      return `That image is ${width}×${height}. It needs to be at least ${minPx}px on its longest side, or it will look soft on a poster.`;
  } catch {
    return "Shimo couldn't read that image. Try exporting it again.";
  }
  return null;
}

/**
 * Shrink without squaring, keeping the aspect ratio.
 *
 * Club crests are square, but a sponsor's mark is almost always a wide
 * wordmark. Padding one into a square and then rendering it at a fixed height
 * would show it far smaller than the crests beside it, which is the opposite
 * of what a sponsor is paying for.
 */
async function shrinkOnly(file: File): Promise<Blob> {
  if (file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, TARGET_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/png"),
  );
}

/** Sponsor marks live in the same bucket, filed under the club that owns them. */
export async function uploadSponsorLogo(
  clubId: string,
  sponsorId: string,
  file: File,
): Promise<LogoResult> {
  const sb = await supabase();
  const blob = await shrinkOnly(file); // wordmarks keep their proportions
  const ext = file.type === "image/svg+xml" ? "svg" : "png";
  const path = `${clubId}/sponsors/${sponsorId}-${Date.now().toString(36)}.${ext}`;
  const { error } = await sb.storage.from("club-assets").upload(path, blob, {
    contentType: file.type === "image/svg+xml" ? "image/svg+xml" : "image/png",
    upsert: true,
  });
  if (error) throw error;
  const { data } = sb.storage.from("club-assets").getPublicUrl(path);
  return { url: data.publicUrl, width: TARGET_PX, height: TARGET_PX };
}

/** Upload and return the public URL. Overwrites the club's previous logo. */
export async function uploadClubLogo(
  clubId: string,
  file: File,
): Promise<LogoResult> {
  const sb = await supabase();
  const blob = await squareAndShrink(file);
  const ext = file.type === "image/svg+xml" ? "svg" : "png";
  // a version in the name, so a replaced logo is not served from cache
  const path = `${clubId}/logo-${Date.now().toString(36)}.${ext}`;

  const { error } = await sb.storage.from("club-assets").upload(path, blob, {
    contentType: file.type === "image/svg+xml" ? "image/svg+xml" : "image/png",
    upsert: true,
  });
  if (error) throw error;

  const { data } = sb.storage.from("club-assets").getPublicUrl(path);
  return { url: data.publicUrl, width: TARGET_PX, height: TARGET_PX };
}

/**
 * A photograph of a paper card, kept as evidence against the card it belongs to.
 *
 * Private bucket, unlike crests and sponsor marks. A photograph of a scorecard
 * is a different kind of object from a club logo: it carries a player's
 * handwriting and usually two signatures, and it exists to settle a dispute. A
 * crest is published on purpose; a member's signature is not, and a guessable
 * public URL is the wrong default for it even though the scores themselves are
 * on a public board. Reads are short-lived signed URLs, minted by the club's
 * own admin screens.
 */
export async function uploadCardPhoto(
  tournamentId: string,
  round: number,
  playerId: string,
  file: File,
): Promise<string> {
  const sb = await supabase();
  const blob = await shrinkOnly(file); // a card is wider than it is tall
  const path = `${tournamentId}/${round}/${playerId}-${Date.now().toString(36)}.png`;
  const { error } = await sb.storage.from("card-evidence").upload(path, blob, {
    contentType: "image/png",
    upsert: false, // evidence is written once, never quietly replaced
  });
  if (error) throw error;
  return path;
}

/** A link to a card photograph that expires. Admin screens only. */
export async function signedCardPhoto(path: string, seconds = 300) {
  const sb = await supabase();
  const { data, error } = await sb.storage
    .from("card-evidence")
    .createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * The club's hero image, shown behind TV mode.
 *
 * Wider limits than a crest: this fills a television, and a 512px photograph
 * of the 18th green looks like a 512px photograph of the 18th green on a
 * 4K panel. It is still shrunk, because a club will hand over whatever came
 * off the camera and the screen has to load it on a stick.
 */
export const TV_BACKGROUND_PX = 2560;

export async function uploadTvBackground(
  clubId: string,
  file: File,
): Promise<LogoResult> {
  const sb = await supabase();
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, TV_BACKGROUND_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // JPEG, not PNG: a photograph has no transparency to preserve and a PNG of
  // one is several times the size for no visible gain on a screen across a room
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.82),
  );

  const path = `${clubId}/tv-${Date.now().toString(36)}.jpg`;
  const { error } = await sb.storage.from("club-assets").upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = sb.storage.from("club-assets").getPublicUrl(path);
  return { url: data.publicUrl, width: w, height: h };
}
