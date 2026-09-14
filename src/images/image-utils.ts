/* global document, FileReader, Image, HTMLCanvasElement, ImageBitmap, createImageBitmap */

import { RADIOGRAPH_MAX_DIMENSION, RADIOGRAPH_JPEG_QUALITY } from "../model/constants";

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png"];

export function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_TYPES.indexOf(file.type.toLowerCase()) >= 0) return true;
  // Some tablet file pickers hand over an empty MIME type — fall back to the extension.
  return /\.(jpe?g|png)$/i.test(file.name);
}

// Read a File into a data URL. FileReader is used rather than createObjectURL
// because object URLs are unreliable inside the Office task-pane iframe on iPad.
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Datoteke "${file.name}" ni bilo mogoče prebrati.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Slike ni bilo mogoče odpreti. Podprta sta formata JPEG in PNG."));
    img.src = src;
  });
}

function toJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", RADIOGRAPH_JPEG_QUALITY);
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode a picked file with its EXIF orientation already applied.
 *
 * Phone cameras record orientation as an EXIF flag rather than rotating the
 * pixels. Drawing such a file straight onto a canvas ignores that flag, which
 * is why photos taken on a tablet or phone came out sideways. createImageBitmap
 * with imageOrientation "from-image" bakes the rotation in; where it is
 * unavailable we fall back to the plain decode and the operator can use the
 * manual rotate button.
 */
// createImageBitmap decodes off the main thread and has been observed not to
// settle at all on some large images. It is raced against this deadline so a
// stalled decode degrades to the plain path instead of freezing the import.
const BITMAP_DECODE_TIMEOUT_MS = 4000;

async function decodeViaBitmap(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap !== "function") return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), BITMAP_DECODE_TIMEOUT_MS);
  });

  try {
    const bitmap = await Promise.race([
      createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null),
      deadline,
    ]);
    if (!bitmap) return null;
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function decodeOriented(file: File): Promise<DecodedImage> {
  const bitmap = await decodeViaBitmap(file);
  if (bitmap) return bitmap;

  // Fallback: current Chrome and Safari already apply EXIF orientation when
  // decoding into an <img>, so this path is correct on every browser we target.
  const img = await loadImage(await readFileAsDataUrl(file));
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => undefined,
  };
}

/**
 * Downscale to RADIOGRAPH_MAX_DIMENSION on the longest edge and re-encode as
 * JPEG, so that ten films stay small enough to round-trip through Excel cells.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const decoded = await decodeOriented(file);
  try {
    const longest = Math.max(decoded.width, decoded.height);
    const scale = longest > RADIOGRAPH_MAX_DIMENSION ? RADIOGRAPH_MAX_DIMENSION / longest : 1;
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Brskalnik ne podpira obdelave slik (canvas).");
    ctx.drawImage(decoded.source, 0, 0, width, height);

    return { dataUrl: toJpeg(canvas), width, height };
  } finally {
    // Ten full-resolution phone photos are a lot of memory to hold on a tablet.
    decoded.release();
  }
}

/**
 * Shorten a file name for the cramped slot label, keeping both ends: the head
 * carries any ordering prefix ("01_...") and the tail distinguishes camera
 * names that differ only in their final digits ("IMG_20260914_101523").
 */
export function shortFileName(name: string, max = 16): string {
  const base = name.replace(/\.[^.]+$/, "");
  if (base.length <= max) return base;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${base.slice(0, head)}…${base.slice(-tail)}`;
}

/** Rotate a data URL by a quarter turn, baking the rotation into the pixels. */
export async function rotateDataUrl(dataUrl: string, degrees: 90 | 180 | 270): Promise<ProcessedImage> {
  const img = await loadImage(dataUrl);
  const swap = degrees === 90 || degrees === 270;
  const width = swap ? img.naturalHeight : img.naturalWidth;
  const height = swap ? img.naturalWidth : img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brskalnik ne podpira obdelave slik (canvas).");
  ctx.translate(width / 2, height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return { dataUrl: toJpeg(canvas), width, height };
}

/** Approximate byte size of a data URL payload, for the "size used" readout. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Natural sort so that "slika2.jpg" comes before "slika10.jpg". */
export function compareFileNames(a: string, b: string): number {
  return a.localeCompare(b, "sl", { numeric: true, sensitivity: "base" });
}

/**
 * Some Android gallery pickers hand back files with no usable name, or the
 * same name for every item. File-name ordering is meaningless then, so fall
 * back to capture time — shooting the mount in sequence is the natural
 * workflow, which makes that the right order anyway.
 */
export type SortBasis = "name" | "time";

export function sortPickedFiles(files: File[]): { files: File[]; basis: SortBasis } {
  const names = files.map((f) => (f.name || "").trim());
  const allNamed = names.every((n) => n.length > 0);
  const allDistinct = new Set(names).size === names.length;

  if (allNamed && allDistinct) {
    return {
      files: [...files].sort((a, b) => compareFileNames(a.name, b.name)),
      basis: "name",
    };
  }
  return {
    files: [...files].sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0)),
    basis: "time",
  };
}

/**
 * A name to show and store for a picked file. When the picker supplies none,
 * the capture time stands in — it is what distinguishes the films.
 */
export function displayNameFor(file: File): string {
  const name = (file.name || "").trim();
  if (name) return name;
  const t = file.lastModified ? new Date(file.lastModified) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `slika_${pad(t.getHours())}-${pad(t.getMinutes())}-${pad(t.getSeconds())}.jpg`;
}
