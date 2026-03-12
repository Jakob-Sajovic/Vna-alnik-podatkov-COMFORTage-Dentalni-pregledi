import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import { FdiToothNumber, PBSurface, PBToothData } from "../model/types";
import { UPPER_RIGHT, UPPER_LEFT, LOWER_LEFT, LOWER_RIGHT, ALL_TEETH, PB_SURFACE_TOOLTIPS } from "../model/constants";
import { createPBToothSvg, getSurfaceForPosition, VisualPosition } from "../dental/chart-renderer";

type ChartType = "plaque" | "bleeding";

const TOOTH_SVG_SIZE = 32;

export class PlaqueBleedingTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;

  private plaqueScoreEl: HTMLElement | null = null;
  private bleedingScoreEl: HTMLElement | null = null;
  private plaqueContainer: HTMLElement | null = null;
  private bleedingContainer: HTMLElement | null = null;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <div class="tab-toolbar">
          <button class="btn btn-danger-outline btn-sm" id="pb-reset-btn">Ponastavi VPI/GBI</button>
        </div>
        <div class="chart-section" id="plaque-section">
          <div class="chart-header">
            <span class="chart-title">Plak (VPI)</span>
            <span class="chart-score" id="plaque-score">0.0% (0 od 0)</span>
          </div>
          <div id="plaque-chart"></div>
        </div>
        <div class="chart-section" id="bleeding-section">
          <div class="chart-header">
            <span class="chart-title">Krvavitev (GBI)</span>
            <span class="chart-score" id="bleeding-score">0.0% (0 od 0)</span>
          </div>
          <div id="bleeding-chart"></div>
        </div>
        <p class="tab-help-footer">
          Kliknite na površino zoba za označitev plaka ali krvavitve. Dvoklik na zob označi zob kot manjkajoč; ponovni dvoklik ga ponovno aktivira.
        </p>
      </div>
    `;

    // Reset button with two-click confirmation
    const resetBtn = panel.querySelector("#pb-reset-btn") as HTMLButtonElement;
    if (resetBtn) {
      let armed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      resetBtn.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          resetBtn.textContent = "Ste prepričani?";
          resetBtn.classList.add("btn-danger-armed");
          timer = setTimeout(() => { armed = false; resetBtn.textContent = "Ponastavi VPI/GBI"; resetBtn.classList.remove("btn-danger-armed"); }, 3000);
        } else {
          if (timer) clearTimeout(timer);
          armed = false;
          resetBtn.textContent = "Ponastavi VPI/GBI";
          resetBtn.classList.remove("btn-danger-armed");
          this.handleReset();
        }
      });
    }

    this.plaqueScoreEl = panel.querySelector("#plaque-score") as HTMLElement;
    this.bleedingScoreEl = panel.querySelector("#bleeding-score") as HTMLElement;
    this.plaqueContainer = panel.querySelector("#plaque-chart") as HTMLElement;
    this.bleedingContainer = panel.querySelector("#bleeding-chart") as HTMLElement;

    this.buildChart(this.plaqueContainer, "plaque");
    this.buildChart(this.bleedingContainer, "bleeding");

    // Event delegation for surface clicks
    this.plaqueContainer.addEventListener("click", (e) => this.handleSurfaceClick(e, "plaque"));
    this.bleedingContainer.addEventListener("click", (e) => this.handleSurfaceClick(e, "bleeding"));

    // Double-click for missing tooth toggle
    this.plaqueContainer.addEventListener("dblclick", (e) => this.handleMissingToggle(e, "plaque"));
    this.bleedingContainer.addEventListener("dblclick", (e) => this.handleMissingToggle(e, "bleeding"));
  }

  onActivate(): void {
    if (!this.session.hasSession()) return;
    this.refreshAllSurfaces();
    this.updateScores();
  }

  onDeactivate(): void {
    // Data is written immediately on click
  }

  private buildChart(container: HTMLElement, chartType: ChartType): void {
    // Upper jaw: Q1 (right) then Q2 (left) — 8+8 = 16 teeth
    this.buildJaw(container, UPPER_RIGHT, UPPER_LEFT, "upper", chartType);

    // Lower jaw: Q3 (left) then Q4 (right) — 8+8 = 16 teeth
    this.buildJaw(container, LOWER_LEFT, LOWER_RIGHT, "lower", chartType);
  }

  private buildJaw(
    container: HTMLElement,
    leftQuadrant: FdiToothNumber[],
    rightQuadrant: FdiToothNumber[],
    jaw: "upper" | "lower",
    chartType: ChartType
  ): void {
    const jawDiv = document.createElement("div");
    jawDiv.className = "chart-jaw";

    const allTeeth = [...leftQuadrant, ...rightQuadrant];

    // For upper jaw: teeth row first, numbers below
    // For lower jaw: numbers first, teeth row below
    if (jaw === "upper") {
      jawDiv.appendChild(this.createToothRow(allTeeth, chartType));
      jawDiv.appendChild(this.createNumberRow(allTeeth));
    } else {
      jawDiv.appendChild(this.createNumberRow(allTeeth));
      jawDiv.appendChild(this.createToothRow(allTeeth, chartType));
    }

    container.appendChild(jawDiv);
  }

  private createToothRow(teeth: FdiToothNumber[], chartType: ChartType): HTMLElement {
    const row = document.createElement("div");
    row.className = "chart-row";

    for (const tooth of teeth) {
      const cell = document.createElement("div");
      cell.className = "tooth-cell";
      cell.dataset.tooth = String(tooth);
      cell.dataset.chartType = chartType;

      const svg = createPBToothSvg(tooth, TOOTH_SVG_SIZE);

      // Add tooltip to each surface polygon
      const polygons = svg.querySelectorAll(".tooth-surface");
      polygons.forEach((poly) => {
        const position = (poly as SVGElement).dataset.position as VisualPosition;
        const surface = getSurfaceForPosition(tooth, position);
        (poly as SVGElement).dataset.surface = surface;
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${tooth} ${PB_SURFACE_TOOLTIPS[surface]}`;
        poly.appendChild(title);
      });

      cell.appendChild(svg);
      row.appendChild(cell);
    }

    return row;
  }

  private createNumberRow(teeth: FdiToothNumber[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "chart-number-row";

    for (const tooth of teeth) {
      const num = document.createElement("div");
      num.className = "tooth-number";
      num.textContent = String(tooth);
      row.appendChild(num);
    }

    return row;
  }

  private handleSurfaceClick(e: Event, chartType: ChartType): void {
    if (!this.session.hasSession()) return;

    const target = e.target as SVGElement;
    if (!target.classList.contains("tooth-surface")) return;

    const toothStr = target.dataset.tooth;
    const position = target.dataset.position as VisualPosition;
    if (!toothStr || !position) return;

    const tooth = parseInt(toothStr, 10) as FdiToothNumber;
    const surface = getSurfaceForPosition(tooth, position);

    const data = chartType === "plaque"
      ? this.session.getPlaque()
      : this.session.getBleeding();

    const toothData = data[tooth];
    if (!toothData.present) return; // Missing tooth — ignore

    // Toggle the surface
    toothData[surface] = !toothData[surface];
    this.session.touch();

    // Update visual
    const activeClass = chartType === "plaque" ? "active-plaque" : "active-bleeding";
    target.classList.toggle(activeClass, toothData[surface]);

    this.updateScores();
  }

  private handleMissingToggle(e: Event, chartType: ChartType): void {
    if (!this.session.hasSession()) return;

    const target = e.target as HTMLElement;
    // Find the tooth-cell ancestor
    const cell = target.closest(".tooth-cell") as HTMLElement | null;
    if (!cell) return;

    const toothStr = cell.dataset.tooth;
    if (!toothStr) return;

    const tooth = parseInt(toothStr, 10) as FdiToothNumber;

    const newPresent = !this.session.getPlaque()[tooth].present;
    this.session.setToothPresence(tooth, newPresent);

    // Update visuals for both charts
    this.refreshAllSurfaces();
    this.updateScores();
  }

  private clearToothSurfaces(toothData: PBToothData): void {
    toothData.mesial = false;
    toothData.distal = false;
    toothData.buccal = false;
    toothData.lingual = false;
  }

  private refreshAllSurfaces(): void {
    if (!this.session.hasSession()) return;

    this.refreshChart(this.plaqueContainer, "plaque");
    this.refreshChart(this.bleedingContainer, "bleeding");
  }

  private refreshChart(container: HTMLElement | null, chartType: ChartType): void {
    if (!container) return;

    const data = chartType === "plaque"
      ? this.session.getPlaque()
      : this.session.getBleeding();

    const activeClass = chartType === "plaque" ? "active-plaque" : "active-bleeding";

    // Update tooth cells (missing state)
    const cells = container.querySelectorAll(".tooth-cell") as NodeListOf<HTMLElement>;
    cells.forEach((cell) => {
      const tooth = parseInt(cell.dataset.tooth || "0", 10) as FdiToothNumber;
      const toothData = data[tooth];
      cell.classList.toggle("missing", !toothData.present);
    });

    // Update surface polygons
    const polygons = container.querySelectorAll(".tooth-surface") as NodeListOf<SVGElement>;
    polygons.forEach((poly) => {
      const tooth = parseInt(poly.dataset.tooth || "0", 10) as FdiToothNumber;
      const surface = poly.dataset.surface as PBSurface;
      const toothData = data[tooth];
      poly.classList.toggle(activeClass, toothData[surface]);
    });
  }

  private updateScores(): void {
    if (!this.session.hasSession()) return;

    this.updateScore(this.session.getPlaque(), this.plaqueScoreEl);
    this.updateScore(this.session.getBleeding(), this.bleedingScoreEl);
  }

  private handleReset(): void {
    if (!this.session.hasSession()) return;

    const plaque = this.session.getPlaque();
    const bleeding = this.session.getBleeding();
    for (const t of ALL_TEETH) {
      plaque[t] = { present: true, mesial: false, distal: false, buccal: false, lingual: false };
      bleeding[t] = { present: true, mesial: false, distal: false, buccal: false, lingual: false };
    }
    this.session.touch();
    this.refreshAllSurfaces();
    this.updateScores();
  }

  private updateScore(
    data: Record<FdiToothNumber, PBToothData>,
    scoreEl: HTMLElement | null
  ): void {
    if (!scoreEl) return;

    let totalSurfaces = 0;
    let activeSurfaces = 0;

    const surfaces: PBSurface[] = ["mesial", "distal", "buccal", "lingual"];

    for (const tooth of Object.keys(data)) {
      const t = parseInt(tooth, 10) as FdiToothNumber;
      const toothData = data[t];
      if (!toothData.present) continue;

      for (const s of surfaces) {
        totalSurfaces++;
        if (toothData[s]) activeSurfaces++;
      }
    }

    const pct = totalSurfaces > 0
      ? ((activeSurfaces / totalSurfaces) * 100).toFixed(1)
      : "0.0";

    scoreEl.textContent = `${pct}% (${activeSurfaces} od ${totalSurfaces} površin)`;
  }
}
