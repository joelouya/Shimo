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
export async function validateLogo(file: File): Promise<string | null> {
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
    if (Math.max(width, height) < MIN_SOURCE_PX)
      return `That image is ${width}×${height}. It needs to be at least ${MIN_SOURCE_PX}px on its longest side, or it will look soft on a poster.`;
  } catch {
    return "Shimo couldn't read that image. Try exporting it again.";
  }
  return null;
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
