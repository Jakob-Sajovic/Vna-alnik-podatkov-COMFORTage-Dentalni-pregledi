/* global Excel */

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
} from "../model/session";

const SHEET_NAME = "DentalExam_Data";
const IMAGE_SHEET_NAME = "DentalExam_Slike";

// Excel caps a single cell at 32 767 characters. Base64 image payloads are
// split across rows of the image sheet at a comfortable margin below that.
const MAX_CELL_CHARS = 32767;
const IMAGE_CHUNK_CHARS = 30000;

const IMAGE_HEADERS = [
  "session_id", "slot", "part", "parts",
  "file_name", "width", "height", "caption", "data",
];
const PB_SURFACES: PBSurface[] = ["mesial", "distal", "buccal", "lingual"];
const ICDAS_SURFACES: ICDASSurface[] = ["mesial", "distal", "buccal", "lingual", "occlusal"];

// ── Column definition ─────────────────────────────────────────────

function getColumnHeaders(): string[] {
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

function sessionToRow(s: ExaminationSession): (string | number | boolean | null)[] {
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
function radiographsToImageRows(s: ExaminationSession): (string | number)[][] {
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
function imageRowsToRadiographs(
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
async function saveRadiographImages(
  context: Excel.RequestContext,
  session: ExaminationSession
): Promise<void> {
  const rows = radiographsToImageRows(session);
  if (rows.length === 0) return;

  const sheets = context.workbook.worksheets;
  sheets.load("items/name");
  await context.sync();

  let sheet = sheets.items.find((sh) => sh.name === IMAGE_SHEET_NAME) || null;
  let nextRow: number;

  if (!sheet) {
    sheet = sheets.add(IMAGE_SHEET_NAME);
    const headerRange = sheet.getRangeByIndexes(0, 0, 1, IMAGE_HEADERS.length);
    headerRange.values = [IMAGE_HEADERS];
    headerRange.format.font.bold = true;
    nextRow = 1;
  } else {
    const used = sheet.getUsedRangeOrNullObject();
    used.load("rowCount");
    await context.sync();
    if (used.isNullObject) {
      const headerRange = sheet.getRangeByIndexes(0, 0, 1, IMAGE_HEADERS.length);
      headerRange.values = [IMAGE_HEADERS];
      headerRange.format.font.bold = true;
      nextRow = 1;
    } else {
      nextRow = used.rowCount;
    }
  }

  // Written in batches so a full mount does not push one sync over the
  // request size limit on Excel Online.
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const range = sheet.getRangeByIndexes(nextRow + i, 0, batch.length, IMAGE_HEADERS.length);
    range.values = batch;
    await context.sync();
  }

  sheet.visibility = Excel.SheetVisibility.hidden;
  await context.sync();
}

/** Read this session's images back off an image sheet, if one is present. */
async function readRadiographImages(
  context: Excel.RequestContext,
  sheet: Excel.Worksheet,
  sessionId: string
): Promise<RadiographData["images"]> {
  const used = sheet.getUsedRangeOrNullObject();
  used.load("rowCount, columnCount");
  await context.sync();
  if (used.isNullObject || used.rowCount < 2) return {};

  const headerRange = sheet.getRangeByIndexes(0, 0, 1, used.columnCount);
  headerRange.load("values");
  await context.sync();
  const headers = (headerRange.values[0] as string[]).map((h) => String(h ?? ""));

  // Read in row batches — a single load of many 30 000-character cells can
  // exceed the payload limit in Excel Online.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[][] = [];
  const BATCH = 5;
  for (let start = 1; start < used.rowCount; start += BATCH) {
    const count = Math.min(BATCH, used.rowCount - start);
    const range = sheet.getRangeByIndexes(start, 0, count, used.columnCount);
    range.load("values");
    await context.sync();
    for (const r of range.values) rows.push(r);
  }

  return imageRowsToRadiographs(headers, rows, sessionId);
}

// ── Save ──────────────────────────────────────────────────────────

/**
 * Save session to the current workbook in structured row format.
 * Appends a new row to the DentalExam_Data sheet (creates it if missing).
 * Row 1 = column headers, row 2+ = data (one row per examination).
 */
export async function saveSessionToExcel(session: ExaminationSession): Promise<void> {
  const headers = getColumnHeaders();
  const rowData = sessionToRow(session);

  await Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    sheets.load("items/name");
    await context.sync();

    let sheet = sheets.items.find((s) => s.name === SHEET_NAME) || null;
    let nextRow: number;

    if (!sheet) {
      // Create sheet and write headers
      sheet = sheets.add(SHEET_NAME);
      const headerRange = sheet.getRangeByIndexes(0, 0, 1, headers.length);
      headerRange.values = [headers];
      headerRange.format.font.bold = true;
      headerRange.format.horizontalAlignment = Excel.HorizontalAlignment.center;
      nextRow = 1; // 0-indexed: row index 1 = Excel row 2
    } else {
      // Find next empty row
      const usedRange = sheet.getUsedRangeOrNullObject();
      usedRange.load("rowCount");
      await context.sync();

      if (usedRange.isNullObject) {
        // Sheet exists but is empty — write headers
        const headerRange = sheet.getRangeByIndexes(0, 0, 1, headers.length);
        headerRange.values = [headers];
        headerRange.format.font.bold = true;
        nextRow = 1;
      } else {
        nextRow = usedRange.rowCount;
      }
    }

    // Write data row
    const dataRange = sheet.getRangeByIndexes(nextRow, 0, 1, headers.length);
    // Excel expects all values as primitives; convert booleans/nulls
    const excelRow = rowData.map((v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    });
    dataRange.values = [excelRow];

    await context.sync();

    await saveRadiographImages(context, session);
  });
}

// ── Load ──────────────────────────────────────────────────────────

/**
 * Load the most recent session from the current workbook.
 * Reads the last data row from DentalExam_Data and reconstructs via JSON backup.
 */
export async function loadSessionFromExcel(): Promise<ExaminationSession | null> {
  let result: ExaminationSession | null = null;

  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItemOrNullObject(SHEET_NAME);
    await context.sync();

    if (sheet.isNullObject) return;

    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load("rowCount, columnCount");
    await context.sync();

    if (usedRange.isNullObject || usedRange.rowCount < 2) return;

    // Read header row to find _json column
    const headerRange = sheet.getRangeByIndexes(0, 0, 1, usedRange.columnCount);
    headerRange.load("values");
    await context.sync();

    const headers = headerRange.values[0] as string[];
    const jsonColIdx = headers.indexOf("_json");

    // Read last data row
    const lastRowIdx = usedRange.rowCount - 1;
    const lastRowRange = sheet.getRangeByIndexes(lastRowIdx, 0, 1, usedRange.columnCount);
    lastRowRange.load("values");
    await context.sync();

    const values = lastRowRange.values[0];

    // Prefer JSON backup column for reliable reconstruction
    if (jsonColIdx >= 0 && values[jsonColIdx] && typeof values[jsonColIdx] === "string") {
      try {
        result = JSON.parse(values[jsonColIdx] as string) as ExaminationSession;
      } catch { /* fall through to column-based reconstruction */ }
    }

    // Fallback: reconstruct from structured columns
    if (!result) {
      result = rowToSession(headers, values);
    }

    // Backward compat: ensure fields exist for old files
    if (result) {
      if (!result.probing) result.probing = makeDefaultProbingData();
      if (!result.rootCaries) result.rootCaries = makeDefaultRootCariesData();
      if (!result.fdiQuestionnaire) result.fdiQuestionnaire = makeDefaultFdiQuestionnaire();
      if (!result.patient.checkup) result.patient.checkup = 1;
      if (!result.bop) result.bop = makeDefaultBOPData();
      if (!result.furcationInvolvement) result.furcationInvolvement = makeDefaultFurcationInvolvementData();
      if (!result.icdasRootCaries) result.icdasRootCaries = makeDefaultICDASRootCariesData();
      if (!result.radiographs) result.radiographs = makeDefaultRadiographs();
      if (!result.radiographs.images) result.radiographs.images = {};
    }

    // Radiograph images live on their own sheet, keyed by session id
    if (result) {
      const imgSheet = context.workbook.worksheets.getItemOrNullObject(IMAGE_SHEET_NAME);
      await context.sync();
      if (!imgSheet.isNullObject) {
        try {
          result.radiographs.images = await readRadiographImages(context, imgSheet, result.sessionId);
        } catch {
          // A missing or malformed image sheet must never block loading the exam.
        }
      }
    }
  });

  return result;
}

/**
 * Load from an externally selected file via insertWorksheetsFromBase64.
 * Imports the DentalExam_Data sheet temporarily, reads data, then removes it.
 */
export async function loadSessionFromFile(base64: string): Promise<ExaminationSession | null> {
  let result: ExaminationSession | null = null;

  await Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;

    // Insert worksheets from the external file
    const inserted = context.workbook.insertWorksheetsFromBase64(base64, {
      sheetNamesToInsert: [SHEET_NAME],
      positionType: Excel.WorksheetPositionType.end,
    });
    await context.sync();

    // Find the imported sheet (may be renamed if conflict)
    sheets.load("items/name");
    await context.sync();

    // Look for sheets matching "DentalExam_Data" or "DentalExam_Data (N)"
    const importedSheet = sheets.items
      .filter((s) => s.name === SHEET_NAME || s.name.startsWith(SHEET_NAME + " ("))
      .sort((a, b) => b.name.length - a.name.length)[0]; // longest name = most recent copy

    if (!importedSheet) return;

    const usedRange = importedSheet.getUsedRangeOrNullObject();
    usedRange.load("rowCount, columnCount");
    await context.sync();

    if (usedRange.isNullObject || usedRange.rowCount < 2) {
      importedSheet.delete();
      await context.sync();
      return;
    }

    // Read header + last data row
    const headerRange = importedSheet.getRangeByIndexes(0, 0, 1, usedRange.columnCount);
    headerRange.load("values");
    const lastRowIdx = usedRange.rowCount - 1;
    const lastRowRange = importedSheet.getRangeByIndexes(lastRowIdx, 0, 1, usedRange.columnCount);
    lastRowRange.load("values");
    await context.sync();

    const headers = headerRange.values[0] as string[];
    const values = lastRowRange.values[0];

    const jsonColIdx = headers.indexOf("_json");
    if (jsonColIdx >= 0 && values[jsonColIdx] && typeof values[jsonColIdx] === "string") {
      try {
        result = JSON.parse(values[jsonColIdx] as string) as ExaminationSession;
      } catch { /* fall through */ }
    }
    if (!result) {
      result = rowToSession(headers, values);
    }

    // Backward compat: ensure fields exist for old files
    if (result) {
      if (!result.probing) result.probing = makeDefaultProbingData();
      if (!result.rootCaries) result.rootCaries = makeDefaultRootCariesData();
      if (!result.fdiQuestionnaire) result.fdiQuestionnaire = makeDefaultFdiQuestionnaire();
      if (!result.patient.checkup) result.patient.checkup = 1;
      if (!result.bop) result.bop = makeDefaultBOPData();
      if (!result.furcationInvolvement) result.furcationInvolvement = makeDefaultFurcationInvolvementData();
      if (!result.icdasRootCaries) result.icdasRootCaries = makeDefaultICDASRootCariesData();
      if (!result.radiographs) result.radiographs = makeDefaultRadiographs();
      if (!result.radiographs.images) result.radiographs.images = {};
    }

    // Clean up imported sheet
    importedSheet.delete();
    await context.sync();
  });

  // Radiograph images are imported in a second pass, in their own Excel.run:
  // files written before this feature existed have no image sheet at all, and
  // asking insertWorksheetsFromBase64 for a missing sheet fails the whole call.
  // Assertion resets control-flow narrowing: TS cannot see the assignment
  // that happens inside the Excel.run callback above.
  const loaded = result as ExaminationSession | null;
  if (loaded) {
    try {
      loaded.radiographs.images = await loadRadiographImagesFromFile(base64, loaded.sessionId);
    } catch {
      // No image sheet, or an unreadable one — the exam still loads without films.
    }
  }

  return result;
}

async function loadRadiographImagesFromFile(
  base64: string,
  sessionId: string
): Promise<RadiographData["images"]> {
  let images: RadiographData["images"] = {};

  await Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;

    context.workbook.insertWorksheetsFromBase64(base64, {
      sheetNamesToInsert: [IMAGE_SHEET_NAME],
      positionType: Excel.WorksheetPositionType.end,
    });
    await context.sync();

    sheets.load("items/name");
    await context.sync();

    const imported = sheets.items
      .filter((sh) => sh.name === IMAGE_SHEET_NAME || sh.name.startsWith(IMAGE_SHEET_NAME + " ("))
      .sort((a, b) => b.name.length - a.name.length)[0];

    if (!imported) return;

    try {
      images = await readRadiographImages(context, imported, sessionId);
    } finally {
      imported.delete();
      await context.sync();
    }
  });

  return images;
}

// ── Row → Session reconstruction (fallback) ───────────────────────

function rowToSession(
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
