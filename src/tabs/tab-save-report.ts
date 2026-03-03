import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import { FdiToothNumber, PBSurface, PBToothData, ICDASData } from "../model/types";
import { ALL_TEETH } from "../model/constants";
import { saveSessionToExcel } from "../excel/excel-io";
import { generateReport } from "../report/report-generator";

export class SaveReportTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;
  private summaryContainer: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private reportBtn: HTMLButtonElement | null = null;
  private statusMsg: HTMLElement | null = null;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>Shrani in poročilo</h2>
        <div id="save-summary"></div>
        <div id="save-status" class="form-hint" style="text-align:center; margin:8px 0; min-height:18px;"></div>
        <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
          <button id="btn-save-excel" class="btn btn-primary btn-large">
            <span class="btn-icon">💾</span>
            Shrani v Excel
          </button>
          <button id="btn-generate-pdf" class="btn btn-secondary btn-large">
            <span class="btn-icon">📄</span>
            Ustvari PDF
          </button>
        </div>
        <p class="tab-help-footer">
          Preglejte povzetek pregleda. Shranite podatke v Excel ali ustvarite PDF poročilo.
        </p>
      </div>
    `;

    this.summaryContainer = panel.querySelector("#save-summary") as HTMLElement;
    this.saveBtn = panel.querySelector("#btn-save-excel") as HTMLButtonElement;
    this.reportBtn = panel.querySelector("#btn-generate-pdf") as HTMLButtonElement;
    this.statusMsg = panel.querySelector("#save-status") as HTMLElement;

    this.saveBtn.addEventListener("click", () => this.handleSave());
    this.reportBtn.addEventListener("click", () => this.handleReport());
  }

  onActivate(): void {
    if (!this.session.hasSession()) {
      if (this.summaryContainer) {
        this.summaryContainer.innerHTML = `<p class="placeholder-text">Ni aktivnega pregleda.</p>`;
      }
      this.setButtonsEnabled(false);
      return;
    }

    this.setButtonsEnabled(true);
    this.renderSummary();
    if (this.statusMsg) this.statusMsg.textContent = "";
  }

  onDeactivate(): void {
    // Nothing to save
  }

  private setButtonsEnabled(enabled: boolean): void {
    if (this.saveBtn) this.saveBtn.disabled = !enabled;
    if (this.reportBtn) this.reportBtn.disabled = !enabled;
  }

  private async handleSave(): Promise<void> {
    if (!this.session.hasSession()) return;

    this.setButtonsEnabled(false);
    if (this.statusMsg) {
      this.statusMsg.textContent = "Shranjevanje ...";
      this.statusMsg.style.color = "#605e5c";
    }

    try {
      await saveSessionToExcel(this.session.getSession());
      if (this.statusMsg) {
        this.statusMsg.textContent = "Podatki uspešno shranjeni v Excel.";
        this.statusMsg.style.color = "#0b6a0b";
      }
    } catch (err) {
      if (this.statusMsg) {
        this.statusMsg.textContent = `Napaka: ${err instanceof Error ? err.message : String(err)}`;
        this.statusMsg.style.color = "#a4262c";
      }
    } finally {
      this.setButtonsEnabled(true);
    }
  }

  private handleReport(): void {
    if (!this.session.hasSession()) return;

    try {
      generateReport(this.session.getSession());
      if (this.statusMsg) {
        this.statusMsg.textContent = "Poročilo ustvarjeno v novem oknu. Uporabite Ctrl+P za tisk ali shranjevanje v PDF.";
        this.statusMsg.style.color = "#0b6a0b";
      }
    } catch (err) {
      if (this.statusMsg) {
        this.statusMsg.textContent = `Napaka: ${err instanceof Error ? err.message : String(err)}`;
        this.statusMsg.style.color = "#a4262c";
      }
    }
  }

  private renderSummary(): void {
    if (!this.summaryContainer) return;

    const s = this.session.getSession();
    const patient = s.patient;

    const patientName = (patient.firstName && patient.lastName)
      ? `${patient.firstName} ${patient.lastName}`
      : (patient.code || "—");

    const examiner = s.examiner || { firstName: "", lastName: "" };
    const examinerName = (examiner.firstName && examiner.lastName)
      ? `${examiner.firstName} ${examiner.lastName}`
      : "—";

    const vpiScore = this.calcPBScore(s.plaque);
    const gbiScore = this.calcPBScore(s.bleeding);
    const icdasSummary = this.calcICDASSummary(s.icdas);

    let ohipTotal = 0;
    let ohipAnswered = 0;
    for (const val of s.ohip) {
      if (val !== null) {
        ohipTotal += val;
        ohipAnswered++;
      }
    }

    const diagPreview = s.notes.diagnosticNotes
      ? s.notes.diagnosticNotes.substring(0, 100) + (s.notes.diagnosticNotes.length > 100 ? "..." : "")
      : "—";
    const qualPreview = s.notes.qualitativeNotes
      ? s.notes.qualitativeNotes.substring(0, 100) + (s.notes.qualitativeNotes.length > 100 ? "..." : "")
      : "—";

    this.summaryContainer.innerHTML = `
      <div class="summary-card">
        <div class="summary-card-title">Preiskovanec</div>
        <div class="summary-card-content">
          <span class="label">Datum:</span> ${patient.date || "—"}<br>
          <span class="label">Preiskovanec:</span> ${this.escapeHtml(patientName)}<br>
          ${patient.code ? `<span class="label">Koda:</span> ${this.escapeHtml(patient.code)}<br>` : ""}
          <span class="label">Izvajalec:</span> ${this.escapeHtml(examinerName)}
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-card-title">VPI (Plak)</div>
        <div class="summary-card-content">
          ${vpiScore.pct}% (${vpiScore.active} od ${vpiScore.total} površin)
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-card-title">GBI (Krvavitev)</div>
        <div class="summary-card-content">
          ${gbiScore.pct}% (${gbiScore.active} od ${gbiScore.total} površin)
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-card-title">ICDAS</div>
        <div class="summary-card-content">
          <span class="label">Ocenjenih zob:</span> ${icdasSummary.assessed} / 32<br>
          <span class="label">Posebni primeri:</span> ${icdasSummary.special}<br>
          <span class="label">Površin s kariesom:</span> ${icdasSummary.cariesSurfaces}<br>
          <span class="label">Površin z restavracijo:</span> ${icdasSummary.restoredSurfaces}
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-card-title">Opombe</div>
        <div class="summary-card-content">
          <span class="label">Diagnostične:</span> ${this.escapeHtml(diagPreview)}<br>
          <span class="label">Kvalitativne:</span> ${this.escapeHtml(qualPreview)}
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-card-title">OHIP-49</div>
        <div class="summary-card-content">
          Skupaj: ${ohipTotal} / 196 (${ohipAnswered}/49 odgovorov)
        </div>
      </div>
    `;
  }

  private calcPBScore(data: Record<FdiToothNumber, PBToothData>): {
    pct: string;
    active: number;
    total: number;
  } {
    let total = 0;
    let active = 0;
    const surfaces: PBSurface[] = ["mesial", "distal", "buccal", "lingual"];

    for (const tooth of Object.keys(data)) {
      const t = parseInt(tooth, 10) as FdiToothNumber;
      const td = data[t];
      if (!td.present) continue;
      for (const s of surfaces) {
        total++;
        if (td[s]) active++;
      }
    }

    const pct = total > 0 ? ((active / total) * 100).toFixed(1) : "0.0";
    return { pct, active, total };
  }

  private calcICDASSummary(data: ICDASData): {
    assessed: number;
    special: number;
    cariesSurfaces: number;
    restoredSurfaces: number;
  } {
    let assessed = 0;
    let special = 0;
    let cariesSurfaces = 0;
    let restoredSurfaces = 0;

    for (const tooth of ALL_TEETH) {
      const td = data[tooth];
      if (td.status === "special") {
        if (td.specialCode !== null) assessed++;
        special++;
      } else {
        let hasData = false;
        for (const surf of Object.values(td.surfaces)) {
          if (surf.restoration !== null || surf.caries !== null) hasData = true;
          if (surf.caries !== null && surf.caries > 0) cariesSurfaces++;
          if (surf.restoration !== null && surf.restoration > 0) restoredSurfaces++;
        }
        if (hasData) assessed++;
      }
    }

    return { assessed, special, cariesSurfaces, restoredSurfaces };
  }

  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
