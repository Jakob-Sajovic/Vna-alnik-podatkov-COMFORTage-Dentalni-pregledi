import {
  ExaminationSession,
  ExaminerData,
  FdiToothNumber,
  PlaqueData,
  BleedingData,
  ICDASData,
  ICDASToothData,
  PBToothData,
  ProbingData,
  ProbingToothData,
  PatientData,
  OhipData,
  NotesData,
} from "./types";
import { ALL_TEETH, SCHEMA_VERSION } from "./constants";

type ChangeListener = () => void;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function createDefaultPBTooth(): PBToothData {
  return { present: true, mesial: false, distal: false, buccal: false, lingual: false };
}

function createDefaultICDASTooth(): ICDASToothData {
  return {
    status: "normal",
    specialCode: null,
    surfaces: {
      mesial: { restoration: null, caries: null },
      distal: { restoration: null, caries: null },
      buccal: { restoration: null, caries: null },
      lingual: { restoration: null, caries: null },
      occlusal: { restoration: null, caries: null },
    },
  };
}

function createDefaultPBData(): PlaqueData {
  const data: Partial<PlaqueData> = {};
  for (const tooth of ALL_TEETH) {
    data[tooth] = createDefaultPBTooth();
  }
  return data as PlaqueData;
}

function createDefaultProbingTooth(): ProbingToothData {
  return {
    present: true,
    distoBuccal: null, buccal: null, mesioBuccal: null,
    distoLingual: null, lingual: null, mesioLingual: null,
    furcation: null,
  };
}

function createDefaultProbingData(): ProbingData {
  const data: Partial<ProbingData> = {};
  for (const tooth of ALL_TEETH) {
    data[tooth] = createDefaultProbingTooth();
  }
  return data as ProbingData;
}

export function makeDefaultProbingData(): ProbingData {
  return createDefaultProbingData();
}

function createDefaultICDASData(): ICDASData {
  const data: Partial<ICDASData> = {};
  for (const tooth of ALL_TEETH) {
    data[tooth] = createDefaultICDASTooth();
  }
  return data as ICDASData;
}

function createBlankSession(): ExaminationSession {
  const now = new Date().toISOString();
  return {
    sessionId: generateId(),
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    modifiedAt: now,
    patient: { date: new Date().toISOString().split("T")[0], firstName: "", lastName: "", code: "" },
    examiner: { firstName: "", lastName: "" },
    plaque: createDefaultPBData(),
    bleeding: createDefaultPBData(),
    icdas: createDefaultICDASData(),
    probing: createDefaultProbingData(),
    notes: { diagnosticNotes: "", qualitativeNotes: "" },
    ohip: new Array(49).fill(null) as OhipData,
  };
}

export class SessionState {
  private static instance: SessionState | null = null;

  private session: ExaminationSession | null = null;
  private listeners: ChangeListener[] = [];

  private constructor() {}

  static getInstance(): SessionState {
    if (!SessionState.instance) {
      SessionState.instance = new SessionState();
    }
    return SessionState.instance;
  }

  // Create a new blank session
  newSession(): ExaminationSession {
    this.session = createBlankSession();
    this.notifyListeners();
    return this.session;
  }

  // Load an existing session (e.g. from Excel)
  loadSession(data: ExaminationSession): void {
    this.session = data;
    this.notifyListeners();
  }

  // Reset to no active session
  resetSession(): void {
    this.session = null;
    this.notifyListeners();
  }

  // Check if a session is active
  hasSession(): boolean {
    return this.session !== null;
  }

  // Get the full session (throws if none)
  getSession(): ExaminationSession {
    if (!this.session) {
      throw new Error("No active session");
    }
    return this.session;
  }

  // Convenience accessors
  getPatient(): PatientData {
    return this.getSession().patient;
  }

  getExaminer(): ExaminerData {
    return this.getSession().examiner;
  }

  getPlaque(): PlaqueData {
    return this.getSession().plaque;
  }

  getBleeding(): BleedingData {
    return this.getSession().bleeding;
  }

  getIcdas(): ICDASData {
    return this.getSession().icdas;
  }

  getProbing(): ProbingData {
    return this.getSession().probing;
  }

  getNotes(): NotesData {
    return this.getSession().notes;
  }

  getOhip(): OhipData {
    return this.getSession().ohip;
  }

  // Mark session as modified
  touch(): void {
    if (this.session) {
      this.session.modifiedAt = new Date().toISOString();
      this.notifyListeners();
    }
  }

  // Register a change listener
  onChange(listener: ChangeListener): void {
    this.listeners.push(listener);
  }

  // Remove a change listener
  offChange(listener: ChangeListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
