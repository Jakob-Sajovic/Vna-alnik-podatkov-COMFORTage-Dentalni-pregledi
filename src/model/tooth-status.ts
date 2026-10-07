import { ExaminationSession, FdiToothNumber, ICDASToothData, SpecialCaseCode } from "./types";

/**
 * ICDAS special codes that mean "implant": the natural tooth is lost — the tooth
 * counts as missing — but the implant itself is examined. Plaque (VPI), bleeding
 * (GBI) and ICDAS surface codes are still recorded on it; probing depths, furcation
 * involvement and root caries are not (they have no meaning for an implant).
 *
 * 90 = implant after a non-caries tooth loss, 91 = implant after a caries tooth loss.
 */
export const IMPLANT_CODES: SpecialCaseCode[] = ["90", "91"];

export function isImplantCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && IMPLANT_CODES.indexOf(code as SpecialCaseCode) >= 0;
}

export function isImplantTooth(td: ICDASToothData | undefined): boolean {
  return !!td && td.status === "special" && isImplantCode(td.specialCode);
}

/** The ICDAS entry alone says the natural tooth is absent (any special code except 96). */
export function icdasMarksMissing(td: ICDASToothData | undefined): boolean {
  return !!td && td.status === "special" && td.specialCode !== null && td.specialCode !== "96";
}

/** Whether the tooth is counted as missing (tooth count, FDI Q5). An implant is. */
export function isToothMissing(s: ExaminationSession, t: FdiToothNumber): boolean {
  return (
    icdasMarksMissing(s.icdas[t]) ||
    !s.plaque[t].present ||
    !s.bleeding[t].present ||
    !s.probing[t].present
  );
}
