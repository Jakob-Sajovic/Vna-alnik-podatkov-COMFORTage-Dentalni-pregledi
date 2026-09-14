/* global FileReader */

import { ExaminationSession } from "../model/types";
import { SessionStore, ActionLabel } from "./session-store";
import { saveSessionToExcel, loadSessionFromExcel, loadSessionFromFile } from "../excel/excel-io";

/** Storage backed by the host Excel workbook, via the Office JavaScript API. */
export class ExcelStore implements SessionStore {
  readonly saveAction: ActionLabel = { label: "Shrani v Excel", icon: "💾" };
  readonly saveHelp = "Preglejte povzetek pregleda. Shranite podatke v Excel ali ustvarite PDF poročilo.";
  readonly hostLoadAction: ActionLabel | null = { label: "Naloži iz zvezka", icon: "📂" };

  async save(session: ExaminationSession): Promise<string> {
    await saveSessionToExcel(session);
    return "Podatki uspešno shranjeni v Excel.";
  }

  loadFromHost(): Promise<ExaminationSession | null> {
    return loadSessionFromExcel();
  }

  async loadFromFile(file: File): Promise<ExaminationSession | null> {
    const base64 = await readFileAsBase64(file);
    return loadSessionFromFile(base64);
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Napaka pri branju datoteke."));
    reader.readAsDataURL(file);
  });
}
