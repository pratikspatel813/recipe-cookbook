// Recipe photos: shrink in the browser, then upload to Supabase Storage.
// The bucket and its rules are in supabase/migrations/009_recipe_photos.sql.

import { supabase, ensureUser } from "./supabase";

const BUCKET = "recipe-photos";
const MAX_SIDE = 1600; // px. Sharp on a phone or laptop, a fraction of the original size.
const QUALITY = 0.85;

// Phone photos are often 4000px and several MB. Shrinking them first makes
// uploads fast on mobile data and pages quick to load. Everything becomes a
// JPEG: every browser and link-preview service can show one.
export async function shrinkPhoto(file: File): Promise<Blob> {
  // imageOrientation: "from-image" applies the phone's rotation flag, so
  // portrait photos don't come out sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image"))), "image/jpeg", QUALITY),
  );
}

// Uploads into your own folder (<user id>/...) and returns the public URL.
// The random name means nobody can guess the URLs of other photos.
export async function uploadPhoto(photo: Blob): Promise<string> {
  const userId = await ensureUser();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, photo, {
    contentType: "image/jpeg",
    cacheControl: "31536000", // a year: a given URL never changes, so browsers can keep it
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
