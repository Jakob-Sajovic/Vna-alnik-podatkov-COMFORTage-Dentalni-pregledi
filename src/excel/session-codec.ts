/**
 * Pure serialization between an ExaminationSession and the flat
 * DentalExam_Data / DentalExam_Slike sheet layout.
 *
 * Deliberately free of any Excel or DOM dependency: the Office add-in drives it
 * through the Excel JavaScript API, and the standalone PWA drives it through
 * SheetJS, so both produce and consume byte-compatible .xlsx files.
 */

import {
  ExaminationSession,
  FdiToothNumber,
  PBSurface,
  ICDASSurface,
  PBToothData,
  ProbingSite,
  FurcationScore,
  ICDASRootCariesScore,
  RadiographData,
  RadiographSlotId,
} from "../model/types";
import { ALL_TEETH, SCHEMA_VERSION, PROBING_ALL_SITES, ROOT_CARIES_ALL_TEETH, rootCariesEntryCount, RADIOGRAPH_SLOTS, RADIOGRAPH_SLOT_IDS } from "../model/constants";
import {
  makeDefaultProbingData,
  makeDefaultRootCariesData,
  makeDefaultFdiQuestionnaire,
  makeDefaultBOPData,
  makeDefaultFurcationInvolvementData,
  makeDefaultICDASRootCariesData,
  makeDefaultRadiographs,
  makeDefaultOhipExtra,
} from "../model/session";

export const SHEET_NAME = "DentalExam_Data";
export const IMAGE_SHEET_NAME = "DentalExam_Slike";

// Excel caps a single cell at 32 767 characters. Base64 image payloads are
// split across rows of the image sheet at a comfortable margin below that.
export const MAX_CELL_CHARS = 32767;
export const IMAGE_CHUNK_CHARS = 30000;

export const IMAGE_HEADERS = [
  "session_id", "slot", "part", "parts",
  "file_name", "width", "height", "caption", "data",
];
const PB_SURFACES: PBSurface[] = ["mesial", "distal", "buccal", "lingual"];
const ICDAS_SURFACES: ICDASSurface[] = ["mesial", "distal", "buccal", "lingual", "occlusal"];
// ── Column definition ─────────────────────────────────────────────

export function getColumnHeaders(): string[] {
  const h: string[] = [];

  // Meta
  h.push("session_id", "schema_version", "created_at", "modified_at");

  // Patient
  h.push("patient_date", "patient_firstName", "patient_lastName", "patient_code", "patient_checkup");

  // Examiner
  h.push("examiner_firstName", "examiner_lastName");

  // Computed scores
  h.push("vpi_score_pct", "gbi_score_pct", "bop_score_pct", "ohip_total", "present_teeth_count");

  // Plaque per tooth
  for (const t of ALL_TEETH) {
    h.push(`plaque_${t}_present`);
    for (const s of PB_SURFACES) h.push(`plaque_${t}_${s}`);
  }

  // Bleeding per tooth
  for (const t of ALL_TEETH) {
    h.push(`bleeding_${t}_present`);
    for (const s of PB_SURFACES) h.push(`bleeding_${t}_${s}`);
  }

  // ICDAS per tooth
  for (const t of ALL_TEETH) {
    h.push(`icdas_${t}_status`, `icdas_${t}_specialCode`);
    for (const s of ICDAS_SURFACES) {
      h.push(`icdas_${t}_${s}_rest`, `icdas_${t}_${s}_caries`);
    }
  }

  // Probing per tooth
  for (const t of ALL_TEETH) {
    h.push(`probing_${t}_present`);
    for (const s of PROBING_ALL_SITES) h.push(`probing_${t}_${s}`);
    h.push(`probing_${t}_furcation`);
  }

  // Root caries per measured tooth (legacy)
  for (const t of ROOT_CARIES_ALL_TEETH) {
    const count = rootCariesEntryCount(t);
    for (let i = 0; i < count; i++) h.push(`rootcaries_${t}_${i}`);
  }

  // BOP per tooth (6 sites each)
  for (const t of ALL_TEETH) {
    for (const s of PROBING_ALL_SITES) h.push(`bop_${t}_${s}`);
  }

  // Furcation involvement per measured tooth
  for (const t of ROOT_CARIES_ALL_TEETH) {
    const count = rootCariesEntryCount(t);
    for (let i = 0; i < count; i++) h.push(`furcation_${t}_${i}`);
  }

  // ICDAS root caries per tooth (6 sites each)
  for (const t of ALL_TEETH) {
    for (const s of PROBING_ALL_SITES) h.push(`ircaries_${t}_${s}`);
  }

  // Notes
  h.push("notes_diagnostic", "notes_qualitative");

  // OHIP 1–49
  for (let i = 1; i <= 49; i++) h.push(`ohip_${i}`);
  h.push("ohip_a_health", "ohip_b_appearance", "ohip_comment");

  // FDI questionnaire
  h.push("fdi_gender", "fdi_age", "fdi_smoking", "fdi_diabetes",
    "fdi_toothLoss", "fdi_plaque", "fdi_bleeding", "fdi_probingDepth", "fdi_country");

  // Radiographs — text only; the image payloads live on DentalExam_Slike
  h.push("radio_opinion");
  for (const slot of RADIOGRAPH_SLOTS) {
    h.push(`radio_${slot.id}_file`, `radio_${slot.id}_caption`);
  }

  // Full JSON backup for reliable reload
  h.push("_json");

  return h;
}

// ── Serialize session → row values ────────────────────────────────

export function sessionToRow(s: ExaminationSession): (string | number | boolean | null)[] {
  const row: (string | number | boolean | null)[] = [];

  // Meta
  row.push(s.sessionId, s.schemaVersion, s.createdAt, s.modifiedAt);

  // Patient
  row.push(s.patient.date, s.patient.firstName, s.patient.lastName, s.patient.code, s.patient.checkup || 1);

  // Examiner
  const examiner = s.examiner || { firstName: "", lastName: "" };
  row.push(examiner.firstName, examiner.lastName);

  // Computed scores
  row.push(calcPBPct(s.plaque), calcPBPct(s.bleeding), calcBOPPct(s), calcOhipTotal(s.ohip), calcPresentTeeth(s));

  // Plaque
  for (const t of ALL_TEETH) {
    const td = s.plaque[t];
    row.push(td.present);
    for (const sf of PB_SURFACES) row.push(td[sf]);
  }

  // Bleeding
  for (const t of ALL_TEETH) {
    const td = s.bleeding[t];
    row.push(td.present);
    for (const sf of PB_SURFACES) row.push(td[sf]);
  }

  // ICDAS
  for (const t of ALL_TEETH) {
    const td = s.icdas[t];
    row.push(td.status, td.specialCode);
    for (const sf of ICDAS_SURFACES) {
      const sd = td.surfaces[sf];
      row.push(sd.restoration, sd.caries);
    }
  }

  // Probing
  for (const t of ALL_TEETH) {
    const pt = s.probing[t];
    row.push(pt.present);
    for (const site of PROBING_ALL_SITES) row.push(pt[site]);
    row.push(pt.furcation);
  }

  // Root caries (legacy)
  const rc = s.rootCaries || {};
  for (const t of ROOT_CARIES_ALL_TEETH) {
    const count = rootCariesEntryCount(t);
    const entries = rc[t] || new Array(count).fill(null);
    for (let i = 0; i < count; i++) row.push(entries[i]);
  }

  // BOP
  const bop = s.bop || {};
  for (const t of ALL_TEETH) {
    for (const site of PROBING_ALL_SITES) {
      const td = bop[t];
      row.push(td ? (td as Record<string, boolean>)[site] : false);
    }
  }

  // Furcation involvement
  const fi = s.furcationInvolvement || {};
  for (const t of ROOT_CARIES_ALL_TEETH) {
    const count = rootCariesEntryCount(t);
    const entries = fi[t] || new Array(count).fill(0);
    for (let i = 0; i < count; i++) row.push(entries[i]);
  }

  // ICDAS root caries
  const icRC = s.icdasRootCaries || {};
  for (const t of ALL_TEETH) {
    for (const site of PROBING_ALL_SITES) {
      const td = icRC[t];
      row.push(td ? (td as Record<string, number | null>)[site] : null);
    }
  }

  // Notes
  row.push(s.notes.diagnosticNotes, s.notes.qualitativeNotes);

  // OHIP
  for (let i = 0; i < 49; i++) row.push(s.ohip[i]);
  const ohipExtra = s.ohipExtra || makeDefaultOhipExtra();
  row.push(ohipExtra.healthRating, ohipExtra.appearanceRating, ohipExtra.comment);

  // FDI questionnaire
  const fdi = s.fdiQuestionnaire || { gender: null, age: null, smoking: null, diabetes: null, toothLoss: null, plaque: null, bleeding: null, probingDepth: null, country: "" };
  row.push(fdi.gender, fdi.age, fdi.smoking, fdi.diabetes,
    fdi.toothLoss, fdi.plaque, fdi.bleeding, fdi.probingDepth, fdi.country);

  // Radiographs — file name and caption per slot, images go to their own sheet
  const radio = s.radiographs || { images: {}, opinion: "" };
  row.push(radio.opinion || "");
  for (const slot of RADIOGRAPH_SLOTS) {
    const img = radio.images[slot.id];
    row.push(img ? img.fileName : "", img ? img.caption : "");
  }

  // JSON backup. Image data URLs are excluded — they would blow past Excel's
  // 32 767-character cell limit on their own.
  row.push(buildJsonBackup(s));

  return row;
}

/**
 * Serialize the session for the `_json` backup cell with image payloads
 * stripped. If the result would still exceed Excel's per-cell limit the cell is
 * left empty rather than written truncated — the flat columns alongside it
 * carry the same data and the readers already fall back to them.
 */
function buildJsonBackup(s: ExaminationSession): string {
  const radio = s.radiographs || { images: {}, opinion: "" };
  const slim: Record<string, unknown> = {};
  for (const id of RADIOGRAPH_SLOT_IDS) {
    const img = radio.images[id];
    if (!img) continue;
    slim[id] = { fileName: img.fileName, width: img.width, height: img.height, caption: img.caption };
  }

  const copy = { ...s, radiographs: { opinion: radio.opinion || "", images: slim } };
  const json = JSON.stringify(copy);
  if (json.length > MAX_CELL_CHARS) {
    // eslint-disable-next-line no-console
    console.warn(`_json backup is ${json.length} chars, over Excel's ${MAX_CELL_CHARS} limit — omitted.`);
    return "";
  }
  return json;
}

function calcPBPct(data: Record<FdiToothNumber, PBToothData>): number {
  let total = 0;
  let active = 0;
  for (const t of ALL_TEETH) {
    const td = data[t];
    if (!td.present) continue;
    for (const sf of PB_SURFACES) {
      total++;
      if (td[sf]) active++;
    }
  }
  return total > 0 ? Math.round((active / total) * 1000) / 10 : 0;
}

function calcBOPPct(s: ExaminationSession): number {
  if (!s.bop || !s.probing) return 0;
  let total = 0;
  let active = 0;
  for (const t of ALL_TEETH) {
    if (!s.probing[t].present) continue;
    for (const site of PROBING_ALL_SITES) {
      total++;
      if ((s.bop[t] as Record<string, boolean>)[site]) active++;
    }
  }
  return total > 0 ? Math.round((active / total) * 1000) / 10 : 0;
}

function calcOhipTotal(ohip: (number | null)[]): number {
  let total = 0;
  for (const v of ohip) { if (v !== null) total += v; }
  return total;
}

function calcPresentTeeth(s: ExaminationSession): number {
  let present = 0;
  for (const t of ALL_TEETH) {
    const isMissing =
      (s.icdas[t].status === "special" &&
        s.icdas[t].specialCode !== null &&
        s.icdas[t].specialCode !== "96") ||
      !s.plaque[t].present ||
      !s.bleeding[t].present ||
      !s.probing[t].present;
    if (!isMissing) present++;
  }
  return present;
}
// ── Radiograph images: chunked base64 on a dedicated sheet ────────

interface ImageChunkRow {
  sessionId: string;
  slot: RadiographSlotId;
  part: number;
  parts: number;
  fileName: string;
  width: number;
  height: number;
  caption: string;
  data: string;
}

/** Split each stored image into cell-sized base64 chunks, one chunk per row. */
export function radiographsToImageRows(s: ExaminationSession): (string | number)[][] {
  const radio = s.radiographs;
  if (!radio) return [];

  const rows: (string | number)[][] = [];
  for (const slot of RADIOGRAPH_SLOTS) {
    const img = radio.images[slot.id];
    if (!img || !img.dataUrl) continue;

    const parts = Math.max(1, Math.ceil(img.dataUrl.length / IMAGE_CHUNK_CHARS));
    for (let i = 0; i < parts; i++) {
      rows.push([
        s.sessionId,
        slot.id,
        i + 1,
        parts,
        img.fileName || "",
        img.width || 0,
        img.height || 0,
        i === 0 ? (img.caption || "") : "",
        img.dataUrl.slice(i * IMAGE_CHUNK_CHARS, (i + 1) * IMAGE_CHUNK_CHARS),
      ]);
    }
  }
  return rows;
}

/** Reassemble chunk rows belonging to one session back into image records. */
export function imageRowsToRadiographs(
  headers: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[][],
  sessionId: string
): RadiographData["images"] {
  const idx = (name: string) => headers.indexOf(name);
  const cSession = idx("session_id");
  const cSlot = idx("slot");
  const cPart = idx("part");
  const cParts = idx("parts");
  const cFile = idx("file_name");
  const cWidth = idx("width");
  const cHeight = idx("height");
  const cCaption = idx("caption");
  const cData = idx("data");
  if (cSession < 0 || cSlot < 0 || cData < 0) return {};

  const chunks: ImageChunkRow[] = [];
  for (const r of rows) {
    if (String(r[cSession] ?? "") !== sessionId) continue;
    const slot = String(r[cSlot] ?? "") as RadiographSlotId;
    if (RADIOGRAPH_SLOT_IDS.indexOf(slot) < 0) continue;
    chunks.push({
      sessionId,
      slot,
      part: Number(r[cPart] ?? 1) || 1,
      parts: Number(r[cParts] ?? 1) || 1,
      fileName: String(r[cFile] ?? ""),
      width: Number(r[cWidth] ?? 0) || 0,
      height: Number(r[cHeight] ?? 0) || 0,
      caption: String(r[cCaption] ?? ""),
      data: String(r[cData] ?? ""),
    });
  }

  const images: RadiographData["images"] = {};
  for (const slot of RADIOGRAPH_SLOT_IDS) {
    const forSlot = chunks.filter((c) => c.slot === slot).sort((a, b) => a.part - b.part);
    if (forSlot.length === 0) continue;
    // A partially written image (interrupted save) is dropped rather than shown broken.
    if (forSlot.length !== forSlot[0].parts) continue;

    images[slot] = {
      dataUrl: forSlot.map((c) => c.data).join(""),
      fileName: forSlot[0].fileName,
      width: forSlot[0].width,
      height: forSlot[0].height,
      caption: forSlot[0].caption,
    };
  }
  return images;
}

/** Append this session's image chunks to DentalExam_Slike, creating it if needed. */
// ── Row → Session reconstruction (fallback) ───────────────────────

export function rowToSession(
  headers: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any[]
): ExaminationSession | null {
  const col = (name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? values[idx] : null;
  };

  const str = (name: string): string => String(col(name) ?? "");
  const num = (name: string): number | null => {
    const v = col(name);
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const bool = (name: string): boolean => {
    const v = col(name);
    return v === true || v === 1 || v === "1" || v === "TRUE";
  };

  const session: ExaminationSession = {
    sessionId: str("session_id") || "imported",
    schemaVersion: num("schema_version") ?? SCHEMA_VERSION,
    createdAt: str("created_at") || new Date().toISOString(),
    modifiedAt: str("modified_at") || new Date().toISOString(),
    patient: {
      date: str("patient_date"),
      firstName: str("patient_firstName"),
      lastName: str("patient_lastName"),
      code: str("patient_code"),
      checkup: num("patient_checkup") ?? 1,
    },
    examiner: {
      firstName: str("examiner_firstName"),
      lastName: str("examiner_lastName"),
    },
    plaque: {} as ExaminationSession["plaque"],
    bleeding: {} as ExaminationSession["bleeding"],
    icdas: {} as ExaminationSession["icdas"],
    probing: makeDefaultProbingData(),
    rootCaries: makeDefaultRootCariesData(),
    bop: makeDefaultBOPData(),
    furcationInvolvement: makeDefaultFurcationInvolvementData(),
    icdasRootCaries: makeDefaultICDASRootCariesData(),
    notes: {
      diagnosticNotes: str("notes_diagnostic"),
      qualitativeNotes: str("notes_qualitative"),
    },
    radiographs: makeDefaultRadiographs(),
    ohip: [],
    ohipExtra: makeDefaultOhipExtra(),
    fdiQuestionnaire: makeDefaultFdiQuestionnaire(),
  };

  // Radiograph text columns — image payloads are restored from the image sheet
  session.radiographs.opinion = str("radio_opinion");
  for (const slot of RADIOGRAPH_SLOTS) {
    const fileName = str(`radio_${slot.id}_file`);
    const caption = str(`radio_${slot.id}_caption`);
    if (!fileName && !caption) continue;
    session.radiographs.images[slot.id] = { dataUrl: "", fileName, width: 0, height: 0, caption };
  }

  // Plaque & bleeding
  for (const t of ALL_TEETH) {
    session.plaque[t] = {
      present: bool(`plaque_${t}_present`),
      mesial: bool(`plaque_${t}_mesial`),
      distal: bool(`plaque_${t}_distal`),
      buccal: bool(`plaque_${t}_buccal`),
      lingual: bool(`plaque_${t}_lingual`),
    };
    session.bleeding[t] = {
      present: bool(`bleeding_${t}_present`),
      mesial: bool(`bleeding_${t}_mesial`),
      distal: bool(`bleeding_${t}_distal`),
      buccal: bool(`bleeding_${t}_buccal`),
      lingual: bool(`bleeding_${t}_lingual`),
    };
  }

  // ICDAS
  for (const t of ALL_TEETH) {
    const status = str(`icdas_${t}_status`);
    session.icdas[t] = {
      status: status === "special" ? "special" : "normal",
      specialCode: str(`icdas_${t}_specialCode`) || null,
      surfaces: {} as ExaminationSession["icdas"][FdiToothNumber]["surfaces"],
    } as ExaminationSession["icdas"][FdiToothNumber];

    for (const sf of ICDAS_SURFACES) {
      (session.icdas[t].surfaces as Record<string, { restoration: number | null; caries: number | null }>)[sf] = {
        restoration: num(`icdas_${t}_${sf}_rest`),
        caries: num(`icdas_${t}_${sf}_caries`),
      };
    }
  }

  // Probing
  for (const t of ALL_TEETH) {
    const hasProbingCol = headers.indexOf(`probing_${t}_present`) >= 0;
    if (hasProbingCol) {
      session.probing[t] = {
        present: bool(`probing_${t}_present`),
        distoBuccal: num(`probing_${t}_distoBuccal`),
        buccal: num(`probing_${t}_buccal`),
        mesioBuccal: num(`probing_${t}_mesioBuccal`),
        distoLingual: num(`probing_${t}_distoLingual`),
        lingual: num(`probing_${t}_lingual`),
        mesioLingual: num(`probing_${t}_mesioLingual`),
        furcation: num(`probing_${t}_furcation`),
      };
    }
  }

  // Root caries (legacy)
  for (const t of ROOT_CARIES_ALL_TEETH) {
    const count = rootCariesEntryCount(t);
    const hasCol = headers.indexOf(`rootcaries_${t}_0`) >= 0;
    if (hasCol) {
      const entries: (number | null)[] = [];
      for (let i = 0; i < count; i++) entries.push(num(`rootcaries_${t}_${i}`));
      session.rootCaries[t] = entries as ExaminationSession["rootCaries"][typeof t];
    }
  }

  // BOP
  for (const t of ALL_TEETH) {
    const hasCol = headers.indexOf(`bop_${t}_distoBuccal`) >= 0;
    if (hasCol) {
      for (const site of PROBING_ALL_SITES) {
        (session.bop[t] as Record<string, boolean>)[site] = bool(`bop_${t}_${site}`);
      }
    }
  }

  // Furcation involvement
  for (const t of ROOT_CARIES_ALL_TEETH) {
    const count = rootCariesEntryCount(t);
    const hasCol = headers.indexOf(`furcation_${t}_0`) >= 0;
    if (hasCol) {
      const entries: number[] = [];
      for (let i = 0; i < count; i++) entries.push((num(`furcation_${t}_${i}`) ?? 0) as FurcationScore);
      session.furcationInvolvement[t] = entries as FurcationScore[];
    }
  }

  // ICDAS root caries
  for (const t of ALL_TEETH) {
    const hasCol = headers.indexOf(`ircaries_${t}_distoBuccal`) >= 0;
    if (hasCol) {
      for (const site of PROBING_ALL_SITES) {
        (session.icdasRootCaries[t] as Record<string, number | null>)[site] = num(`ircaries_${t}_${site}`);
      }
    }
  }

  // OHIP
  for (let i = 1; i <= 49; i++) {
    session.ohip.push(num(`ohip_${i}`) as ExaminationSession["ohip"][number]);
  }
  session.ohipExtra = {
    healthRating: str("ohip_a_health"),
    appearanceRating: str("ohip_b_appearance"),
    comment: str("ohip_comment"),
  };

  // FDI questionnaire
  session.fdiQuestionnaire = {
    gender: (str("fdi_gender") || null) as ExaminationSession["fdiQuestionnaire"]["gender"],
    age: (str("fdi_age") || null) as ExaminationSession["fdiQuestionnaire"]["age"],
    smoking: (str("fdi_smoking") || null) as ExaminationSession["fdiQuestionnaire"]["smoking"],
    diabetes: (str("fdi_diabetes") || null) as ExaminationSession["fdiQuestionnaire"]["diabetes"],
    toothLoss: (str("fdi_toothLoss") || null) as ExaminationSession["fdiQuestionnaire"]["toothLoss"],
    plaque: (str("fdi_plaque") || null) as ExaminationSession["fdiQuestionnaire"]["plaque"],
    bleeding: (str("fdi_bleeding") || null) as ExaminationSession["fdiQuestionnaire"]["bleeding"],
    probingDepth: (str("fdi_probingDepth") || null) as ExaminationSession["fdiQuestionnaire"]["probingDepth"],
    country: str("fdi_country"),
  };

  return session;
}

