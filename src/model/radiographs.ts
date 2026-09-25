/**
 * Radiograph data helpers shared by the RTG tab, the Excel codec and the
 * report: defaults, migration of the old 10-slot mount, figure locations and
 * the required-field check. Free of any DOM or Excel dependency.
 */

import {
  FdiToothNumber,
  RadiographData,
  RadiographFigure,
  RadiographImage,
  RadiographJaw,
} from "./types";
import { LEGACY_RADIOGRAPH_SLOTS, RADIOGRAPH_JAW_PREFIX, RADIOGRAPH_JAW_TEETH } from "./constants";

export const RADIOGRAPH_JAWS: RadiographJaw[] = ["upper", "lower"];

export function makeDefaultRadiographs(): RadiographData {
  return { mode: null, composite: null, upper: [], lower: [], opinion: "", unlocked: false };
}

export function makeFigure(image: RadiographImage | null = null): RadiographFigure {
  return { skip: false, image, toothFrom: null, toothTo: null, annotation: "" };
}

export function makeSkipFigure(): RadiographFigure {
  return { skip: true, image: null, toothFrom: null, toothTo: null, annotation: "" };
}

/**
 * Bring radiograph data from any earlier version into the current shape, in
 * place. Sessions saved with the fixed 10-slot mount become partial mode: the
 * top films go to the upper row, the bottom films to the lower row, each film
 * keeps the teeth its slot covered, and its caption becomes the annotation.
 * Empty slots before the last filled one become skipped positions so the
 * films stay where they were on the mount.
 */
export function normalizeRadiographs(r: RadiographData | null | undefined): RadiographData {
  const out = (r || makeDefaultRadiographs()) as RadiographData;
  if (out.mode !== "composite" && out.mode !== "partial") out.mode = null;
  if (!out.composite) out.composite = null;
  if (!Array.isArray(out.upper)) out.upper = [];
  if (!Array.isArray(out.lower)) out.lower = [];
  if (typeof out.opinion !== "string") out.opinion = "";
  out.unlocked = !!out.unlocked;

  const legacy = out.images;
  if (legacy && Object.keys(legacy).length > 0 && out.upper.length === 0 && out.lower.length === 0) {
    for (const jaw of RADIOGRAPH_JAWS) {
      const slots = LEGACY_RADIOGRAPH_SLOTS.filter((s) => s.jaw === jaw);
      let last = -1;
      slots.forEach((s, i) => { if (legacy[s.id]) last = i; });
      const figures: RadiographFigure[] = [];
      for (let i = 0; i <= last; i++) {
        const old = legacy[slots[i].id];
        if (!old) {
          figures.push(makeSkipFigure());
          continue;
        }
        figures.push({
          skip: false,
          image: old.dataUrl
            ? { dataUrl: old.dataUrl, fileName: old.fileName, width: old.width, height: old.height }
            : null,
          toothFrom: slots[i].from,
          toothTo: slots[i].to,
          annotation: old.caption || "",
        });
      }
      out[jaw] = figures;
    }
    if (!out.mode) out.mode = "partial";
  }
  delete out.images;
  return out;
}

/** True when the tab holds anything a mode switch would throw away. */
export function hasRadiographContent(r: RadiographData): boolean {
  return !!r.composite || r.upper.length > 0 || r.lower.length > 0;
}

// ── Figure location ──────────────────────────────────────────────

export function isJawTooth(jaw: RadiographJaw, tooth: number | null): tooth is FdiToothNumber {
  return tooth !== null && RADIOGRAPH_JAW_TEETH[jaw].indexOf(tooth as FdiToothNumber) >= 0;
}

/** "18–16", or "16" for a single tooth, or "" when not set. */
export function locationText(f: RadiographFigure): string {
  if (f.toothFrom === null) return "";
  if (f.toothTo === null || f.toothTo === f.toothFrom) return String(f.toothFrom);
  return `${f.toothFrom}–${f.toothTo}`;
}

/** Inverse of locationText, restricted to teeth of the given jaw. */
export function parseLocation(
  jaw: RadiographJaw,
  text: string
): { toothFrom: FdiToothNumber | null; toothTo: FdiToothNumber | null } {
  const m = /^\s*(\d{2})(?:\s*[–-]\s*(\d{2}))?\s*$/.exec(text || "");
  if (!m) return { toothFrom: null, toothTo: null };
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : null;
  if (!isJawTooth(jaw, from)) return { toothFrom: null, toothTo: null };
  return { toothFrom: from, toothTo: isJawTooth(jaw, to) && to !== from ? to : null };
}

/** Display number of each figure ("Z1", "S3"); skipped positions get "". */
export function figureLabels(jaw: RadiographJaw, figures: RadiographFigure[]): string[] {
  let n = 0;
  return figures.map((f) => (f.skip ? "" : `${RADIOGRAPH_JAW_PREFIX[jaw]}${++n}`));
}

// ── Flat Excel columns ───────────────────────────────────────────
// One cell per jaw: "18–16: text | — | 15–13: text", "—" marking a skipped
// position. Readable in the compiled table and parseable as a fallback when
// the _json backup is missing.

const FLAT_SEPARATOR = " | ";
const FLAT_SKIP = "—";

export function figuresToFlatText(figures: RadiographFigure[]): string {
  return figures
    .map((f) => {
      if (f.skip) return FLAT_SKIP;
      const loc = locationText(f) || "?";
      const note = (f.annotation || "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();
      return note ? `${loc}: ${note}` : loc;
    })
    .join(FLAT_SEPARATOR);
}

export function flatTextToFigures(jaw: RadiographJaw, text: string): RadiographFigure[] {
  if (!(text || "").trim()) return [];
  return text.split(FLAT_SEPARATOR).map((part) => {
    const p = part.trim();
    if (p === FLAT_SKIP) return makeSkipFigure();
    const colon = p.indexOf(":");
    const loc = colon >= 0 ? p.slice(0, colon) : p;
    const note = colon >= 0 ? p.slice(colon + 1).trim() : "";
    return { ...makeFigure(), ...parseLocation(jaw, loc), annotation: note };
  });
}

// ── Required fields ──────────────────────────────────────────────

export interface RadiographIssues {
  missingLocation: Record<RadiographJaw, number[]>; // figure indexes
  missingOpinion: boolean;
  count: number;
}

/**
 * Required fields left empty: every film's location in partial mode, the
 * diagnosis / opinion in composite mode. Nothing is required once the
 * operator unlocks the tab for this patient.
 */
export function radiographIssues(r: RadiographData): RadiographIssues {
  const issues: RadiographIssues = { missingLocation: { upper: [], lower: [] }, missingOpinion: false, count: 0 };
  if (r.unlocked) return issues;

  if (r.mode === "partial") {
    for (const jaw of RADIOGRAPH_JAWS) {
      r[jaw].forEach((f, i) => {
        if (!f.skip && f.toothFrom === null) issues.missingLocation[jaw].push(i);
      });
    }
  } else if (r.mode === "composite") {
    issues.missingOpinion = !r.opinion.trim();
  }
  issues.count =
    issues.missingLocation.upper.length + issues.missingLocation.lower.length + (issues.missingOpinion ? 1 : 0);
  return issues;
}

/** One-line Slovenian summary of the open issues, or "" when there are none. */
export function radiographIssueText(r: RadiographData): string {
  const i = radiographIssues(r);
  if (i.count === 0) return "";
  if (i.missingOpinion) return "Manjka rentgenska diagnoza / mnenje.";
  const labels: string[] = [];
  for (const jaw of RADIOGRAPH_JAWS) {
    const names = figureLabels(jaw, r[jaw]);
    for (const idx of i.missingLocation[jaw]) labels.push(names[idx]);
  }
  return `Manjka lokacija posnetka: ${labels.join(", ")}.`;
}
