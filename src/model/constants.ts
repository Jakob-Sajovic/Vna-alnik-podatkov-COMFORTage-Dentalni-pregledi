import { FdiToothNumber, SpecialCaseCode, ProbingSite } from "./types";

// Schema version for data persistence
export const SCHEMA_VERSION = 1;

// FDI tooth numbers by quadrant (used for chart layout)
export const UPPER_RIGHT: FdiToothNumber[] = [18, 17, 16, 15, 14, 13, 12, 11];
export const UPPER_LEFT: FdiToothNumber[] = [21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_LEFT: FdiToothNumber[] = [38, 37, 36, 35, 34, 33, 32, 31];
export const LOWER_RIGHT: FdiToothNumber[] = [41, 42, 43, 44, 45, 46, 47, 48];

// All 32 teeth in chart display order (upper row L→R, lower row L→R)
export const ALL_TEETH: FdiToothNumber[] = [
  ...UPPER_RIGHT, ...UPPER_LEFT,
  ...LOWER_LEFT, ...LOWER_RIGHT,
];

// ICDAS restoration/surface status codes (Slovenian labels)
export const RESTORATION_LABELS: Record<number, string> = {
  0: "površina zoba, ki ni restavrirana ali zalita",
  1: "površina zoba z delnim zalitjem fisur",
  2: "površina zoba z zalitjem fisur",
  3: "površina zoba s plombo v barvi zoba",
  4: "površina zoba z amalgamsko plombo",
  5: "polnokovinska prevleka",
  6: "luska, porcelanska / kovinsko-porcelanska / zlata prevleka",
  7: "površina zoba z izpadlo ali poškodovano plombo",
  8: "površina zoba z začasno plombo",
};

// ICDAS caries assessment codes (Slovenian labels)
export const CARIES_LABELS: Record<number, string> = {
  0: "zdrava površina zoba",
  1: "površina s prvimi vidnimi spremembami v sklenini",
  2: "kariozna sprememba vidna na neosušeni sklenini",
  3: "kariozna kavitacija v sklenini, dentin ni viden",
  4: "temno zabarvan dentin pod sklenino",
  5: "očitna kaviteta z razgaljenim dentinom",
  6: "obsežna kaviteta z vidnim dentinom",
};

// ICDAS special case codes (Slovenian labels)
export const SPECIAL_CASE_LABELS: Record<SpecialCaseCode, string> = {
  "90": "zobni vsadek po izgubi zoba, ki ni povezana s kariesom",
  "91": "zobni vsadek po izgubi zoba zaradi kariesa",
  "92": "protetični člen po izgubi zoba, ki ni povezana s kariesom",
  "93": "protetični člen po izgubi zoba zaradi kariesa",
  "96": "površina zoba, ki je ni mogoče pregledati",
  "97": "zaradi kariesa manjkajoči zob",
  "98": "manjkajoči zob zaradi vzroka, ki ni povezan s kariesom",
  "99": "zob ni izrasel",
  "06": "zaostala korenina",
};

// OHIP-49 domains (Slovenian)
export interface OhipDomain {
  name: string;
  startItem: number; // 1-based
  endItem: number;   // 1-based, inclusive
}

export const OHIP_DOMAINS: OhipDomain[] = [
  { name: "Splošna okrnjenost", startItem: 1, endItem: 9 },
  { name: "Bolečina", startItem: 10, endItem: 18 },
  { name: "Psihološko nelagodje", startItem: 19, endItem: 23 },
  { name: "Fizična oviranost", startItem: 24, endItem: 32 },
  { name: "Psihološka oviranost", startItem: 33, endItem: 38 },
  { name: "Družbena oviranost", startItem: 39, endItem: 43 },
  { name: "Invalidnost", startItem: 44, endItem: 49 },
];

// OHIP Likert scale labels (Slovenian)
export const OHIP_LIKERT_LABELS: Record<number, string> = {
  0: "Nikoli",
  1: "Skoraj nikoli",
  2: "Občasno",
  3: "Pogosto",
  4: "Zelo pogosto",
};

// Tab definitions for UI
export interface TabDefinition {
  id: string;
  label: string;
  icon: string; // emoji or symbol
}

export const TABS: TabDefinition[] = [
  { id: "landing", label: "Začetek", icon: "🏠" },
  { id: "patient", label: "Preiskovanec", icon: "👤" },
  { id: "plaque-bleeding", label: "VPI/GBI", icon: "🦷" },
  { id: "icdas", label: "ICDAS", icon: "🔍" },
  { id: "probing", label: "Globine", icon: "📏" },
  { id: "notes", label: "Opombe", icon: "📝" },
  { id: "ohip", label: "OHIP", icon: "📋" },
  { id: "save-report", label: "Shrani", icon: "💾" },
];

// Plaque/bleeding surface labels (Slovenian)
export const PB_SURFACE_LABELS: Record<string, string> = {
  mesial: "M",
  distal: "D",
  buccal: "V",
  lingual: "O",
};

// Plaque/bleeding surface full names for tooltips (Slovenian)
export const PB_SURFACE_TOOLTIPS: Record<string, string> = {
  mesial: "Mezialno",
  distal: "Distalno",
  buccal: "Vestibularno",
  lingual: "Oralno",
};

// ICDAS surface labels — short (Slovenian)
export const ICDAS_SURFACE_LABELS: Record<string, string> = {
  mesial: "M",
  distal: "D",
  buccal: "V",
  lingual: "O",
  occlusal: "Ok",
};

// ICDAS surface full names (Slovenian)
export const ICDAS_SURFACE_FULL_NAMES: Record<string, string> = {
  mesial: "Mezialno",
  distal: "Distalno",
  buccal: "Vestibularno",
  lingual: "Oralno",
  occlusal: "Okluzalno",
};

// Probing depth constants
export const PROBING_BUCCAL_SITES: ProbingSite[] = ["distoBuccal", "buccal", "mesioBuccal"];
export const PROBING_LINGUAL_SITES: ProbingSite[] = ["distoLingual", "lingual", "mesioLingual"];
export const PROBING_ALL_SITES: ProbingSite[] = [
  "distoBuccal", "buccal", "mesioBuccal",
  "distoLingual", "lingual", "mesioLingual",
];
export const PROBING_SITE_LABELS: Record<ProbingSite, string> = {
  distoBuccal: "Disto-bukalno", buccal: "Bukalno", mesioBuccal: "Mezio-bukalno",
  distoLingual: "Disto-lingvalno", lingual: "Lingvalno", mesioLingual: "Mezio-lingvalno",
};

export const FURCATION_GRADES: { value: number; label: string }[] = [
  { value: 0, label: "0 — Brez prizadetosti" },
  { value: 1, label: "1 — Začetna izguba" },
  { value: 2, label: "2 — Delna prizadetost" },
  { value: 3, label: "3 — Popolna prizadetost" },
];
export const PROBING_DEPTH_COLORS = [
  { max: 3, color: "#4caf50" },   // green — healthy
  { max: 4, color: "#ffc107" },   // yellow — mild
  { max: 5, color: "#ff9800" },   // orange — moderate
  { max: Infinity, color: "#f44336" }, // red — severe >= 6mm
];
