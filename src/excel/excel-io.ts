/* global Excel */

import {
  ExaminationSession,
  FdiToothNumber,
  PBSurface,
  ICDASSurface,
  PBToothData,
  ProbingSite,
} from "../model/types";
import { ALL_TEETH, SCHEMA_VERSION, PROBING_ALL_SITES } from "../model/constants";
import { makeDefaultProbingData } from "../model/session";

const SHEET_NAME = "DentalExam_Data";
const PB_SURFACES: PBSurface[] = ["mesial", "distal", "buccal", "lingual"];
const ICDAS_SURFACES: ICDASSurface[] = ["mesial", "distal", "buccal", "lingual", "occlusal"];

// ── Column definition ─────────────────────────────────────────────

function getColumnHeaders(): string[] {
  const h: string[] = [];

  // Meta
  h.push("session_id", "schema_version", "created_at", "modified_at");

  // Patient
  h.push("patient_date", "patient_firstName", "patient_lastName", "patient_code");

  // Examiner
  h.push("examiner_firstName", "examiner_lastName");

  // Computed scores
  h.push("vpi_score_pct", "gbi_score_pct", "ohip_total");

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

  // Notes
  h.push("notes_diagnostic", "notes_qualitative");

  // OHIP 1–49
  for (let i = 1; i <= 49; i++) h.push(`ohip_${i}`);

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
  row.push(s.patient.date, s.patient.firstName, s.patient.lastName, s.patient.code);

  // Examiner
  const examiner = s.examiner || { firstName: "", lastName: "" };
  row.push(examiner.firstName, examiner.lastName);

  // Computed scores
  row.push(calcPBPct(s.plaque), calcPBPct(s.bleeding), calcOhipTotal(s.ohip));

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

  // Notes
  row.push(s.notes.diagnosticNotes, s.notes.qualitativeNotes);

  // OHIP
  for (let i = 0; i < 49; i++) row.push(s.ohip[i]);

  // JSON backup
  row.push(JSON.stringify(s));

  return row;
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

function calcOhipTotal(ohip: (number | null)[]): number {
  let total = 0;
  for (const v of ohip) { if (v !== null) total += v; }
  return total;
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

    // Backward compat: ensure probing field exists for old files
    if (result && !result.probing) {
      result.probing = makeDefaultProbingData();
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

    // Backward compat: ensure probing field exists for old files
    if (result && !result.probing) {
      result.probing = makeDefaultProbingData();
    }

    // Clean up imported sheet
    importedSheet.delete();
    await context.sync();
  });

  return result;
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
    },
    examiner: {
      firstName: str("examiner_firstName"),
      lastName: str("examiner_lastName"),
    },
    plaque: {} as ExaminationSession["plaque"],
    bleeding: {} as ExaminationSession["bleeding"],
    icdas: {} as ExaminationSession["icdas"],
    probing: makeDefaultProbingData(),
    notes: {
      diagnosticNotes: str("notes_diagnostic"),
      qualitativeNotes: str("notes_qualitative"),
    },
    ohip: [],
  };

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

  // OHIP
  for (let i = 1; i <= 49; i++) {
    session.ohip.push(num(`ohip_${i}`) as ExaminationSession["ohip"][number]);
  }

  return session;
}
