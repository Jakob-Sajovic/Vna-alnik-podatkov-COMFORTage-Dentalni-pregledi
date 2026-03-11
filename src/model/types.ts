// All FDI tooth numbers (permanent dentition)
export type FdiToothNumber =
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28
  | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38
  | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48;

// Surface identifiers for plaque/bleeding (4 surfaces)
export type PBSurface = "mesial" | "distal" | "buccal" | "lingual";

// Surface identifiers for ICDAS (5 surfaces)
export type ICDASSurface = "mesial" | "distal" | "buccal" | "lingual" | "occlusal";

// Restoration codes 0–8
export type RestorationCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Caries codes 0–6
export type CariesCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Special case codes (whole-tooth)
export type SpecialCaseCode = "60" | "90" | "91" | "92" | "93" | "96" | "97" | "98" | "99" | "06";

// Plaque/Bleeding: per-tooth data (4 surfaces, boolean toggle each)
export interface PBToothData {
  present: boolean;
  mesial: boolean;
  distal: boolean;
  buccal: boolean;
  lingual: boolean;
}

// Full plaque/bleeding records
export type PlaqueData = Record<FdiToothNumber, PBToothData>;
export type BleedingData = Record<FdiToothNumber, PBToothData>;

// ICDAS: per-surface data (two codes per surface)
export interface ICDASSurfaceData {
  restoration: RestorationCode | null;
  caries: CariesCode | null;
}

// ICDAS: per-tooth data
export interface ICDASToothData {
  status: "normal" | "special";
  surfaces: Record<ICDASSurface, ICDASSurfaceData>;
  specialCode: SpecialCaseCode | null;
}

export type ICDASData = Record<FdiToothNumber, ICDASToothData>;

// Patient identification
export interface PatientData {
  date: string; // ISO date string YYYY-MM-DD
  firstName: string;
  lastName: string;
  code: string;
}

// OHIP-49: 49 item scores, 0–4 Likert or null (unanswered)
export type OhipScore = 0 | 1 | 2 | 3 | 4;
export type OhipData = (OhipScore | null)[];

// Probing depth measurement sites (6 per tooth)
export type ProbingSite = "distoBuccal" | "buccal" | "mesioBuccal"
  | "distoLingual" | "lingual" | "mesioLingual";

// Probing depth data per tooth
export interface ProbingToothData {
  present: boolean;
  distoBuccal: number | null;   // mm, 0–25
  buccal: number | null;
  mesioBuccal: number | null;
  distoLingual: number | null;
  lingual: number | null;
  mesioLingual: number | null;
  furcation: number | null;     // 0–3 furcation grade
}

export type ProbingData = Record<FdiToothNumber, ProbingToothData>;

// Root caries (0 = healthy, 1 = initial, 2 = cavitated)
export type RootCariesScore = 0 | 1 | 2;
// Only measured teeth have entries; upper molars get 3, lower molars get 2
export type RootCariesData = Partial<Record<FdiToothNumber, (RootCariesScore | null)[]>>;

// Free-text notes
export interface NotesData {
  diagnosticNotes: string;
  qualitativeNotes: string;
}

// Examiner identification
export interface ExaminerData {
  firstName: string;
  lastName: string;
}

// Complete examination session
export interface ExaminationSession {
  sessionId: string;
  schemaVersion: number;
  createdAt: string;
  modifiedAt: string;
  patient: PatientData;
  examiner: ExaminerData;
  plaque: PlaqueData;
  bleeding: BleedingData;
  icdas: ICDASData;
  probing: ProbingData;
  rootCaries: RootCariesData;
  notes: NotesData;
  ohip: OhipData;
}
