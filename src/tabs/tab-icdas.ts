import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import {
  FdiToothNumber,
  ICDASSurface,
  RestorationCode,
  CariesCode,
  SpecialCaseCode,
} from "../model/types";
import {
  UPPER_RIGHT,
  UPPER_LEFT,
  LOWER_LEFT,
  LOWER_RIGHT,
  RESTORATION_LABELS,
  CARIES_LABELS,
  SPECIAL_CASE_LABELS,
  ICDAS_SURFACE_LABELS,
  ICDAS_SURFACE_FULL_NAMES,
} from "../model/constants";
import {
  createICDASToothSvg,
  getICDASSurfaceForPosition,
  ICDASVisualPosition,
} from "../dental/chart-renderer";

const TOOTH_SVG_SIZE = 32;
const ICDAS_SURFACES: ICDASSurface[] = ["mesial", "distal", "buccal", "lingual", "occlusal"];

export class ICDASTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;
  private chartContainer: HTMLElement | null = null;
  private detailPanel: HTMLElement | null = null;
  private selectedTooth: FdiToothNumber | null = null;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>ICDAS ocena</h2>
        <p class="icdas-help-text">
          Kliknite na zob za vnos kod restavracij in kariesa.
          Vsak zob ima 5 površin (M, D, V, O, Ok) z dvema kodama.
        </p>
        <div id="icdas-chart"></div>
        <div id="icdas-detail"></div>
        <p class="tab-help-footer">
          Kliknite na zob v karti za prikaz podrobnosti. Za vsako površino izberite kodo zobne površine in kariozne spremembe. Za posebne primere (manjkajoč, neizrasel ipd.) izberite "Poseben primer" v spustnem seznamu.
        </p>
      </div>
    `;

    this.chartContainer = panel.querySelector("#icdas-chart") as HTMLElement;
    this.detailPanel = panel.querySelector("#icdas-detail") as HTMLElement;

    this.buildChart();

    // Event delegation for tooth clicks
    this.chartContainer.addEventListener("click", (e) => this.handleChartClick(e));
  }

  onActivate(): void {
    if (!this.session.hasSession()) return;
    this.refreshAllTeeth();
    if (this.selectedTooth !== null) {
      this.showDetailForTooth(this.selectedTooth);
    }
  }

  onDeactivate(): void {
    // Write-through — no-op
  }

  // ── Chart building ──────────────────────────────────────────────

  private buildChart(): void {
    if (!this.chartContainer) return;
    // Upper jaw: Q1 (right) then Q2 (left)
    this.buildJaw(this.chartContainer, UPPER_RIGHT, UPPER_LEFT, "upper");
    // Lower jaw: Q3 (left) then Q4 (right)
    this.buildJaw(this.chartContainer, LOWER_LEFT, LOWER_RIGHT, "lower");
  }

  private buildJaw(
    container: HTMLElement,
    leftQuadrant: FdiToothNumber[],
    rightQuadrant: FdiToothNumber[],
    jaw: "upper" | "lower"
  ): void {
    const jawDiv = document.createElement("div");
    jawDiv.className = "chart-jaw";

    const allTeeth = [...leftQuadrant, ...rightQuadrant];

    if (jaw === "upper") {
      jawDiv.appendChild(this.createToothRow(allTeeth));
      jawDiv.appendChild(this.createNumberRow(allTeeth));
    } else {
      jawDiv.appendChild(this.createNumberRow(allTeeth));
      jawDiv.appendChild(this.createToothRow(allTeeth));
    }

    container.appendChild(jawDiv);
  }

  private createToothRow(teeth: FdiToothNumber[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "chart-row";

    for (const tooth of teeth) {
      const cell = document.createElement("div");
      cell.className = "icdas-tooth-cell";
      cell.dataset.tooth = String(tooth);

      const svg = createICDASToothSvg(tooth, TOOTH_SVG_SIZE);
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

  // ── Click handling ──────────────────────────────────────────────

  private handleChartClick(e: Event): void {
    const target = e.target as Element;
    const cell = target.closest(".icdas-tooth-cell") as HTMLElement | null;
    if (!cell) return;

    const toothStr = cell.dataset.tooth;
    if (!toothStr) return;

    const tooth = parseInt(toothStr, 10) as FdiToothNumber;

    if (this.selectedTooth === tooth) {
      // Click same tooth — close detail panel
      this.closeDetail();
    } else {
      this.selectTooth(tooth);
    }
  }

  private selectTooth(tooth: FdiToothNumber): void {
    // Deselect previous
    if (this.selectedTooth !== null) {
      const prevCell = this.chartContainer?.querySelector(
        `.icdas-tooth-cell[data-tooth="${this.selectedTooth}"]`
      ) as HTMLElement | null;
      if (prevCell) prevCell.classList.remove("selected");
    }

    // Select new
    this.selectedTooth = tooth;
    const cell = this.chartContainer?.querySelector(
      `.icdas-tooth-cell[data-tooth="${tooth}"]`
    ) as HTMLElement | null;
    if (cell) cell.classList.add("selected");

    this.showDetailForTooth(tooth);
  }

  private closeDetail(): void {
    if (this.selectedTooth !== null) {
      const prevCell = this.chartContainer?.querySelector(
        `.icdas-tooth-cell[data-tooth="${this.selectedTooth}"]`
      ) as HTMLElement | null;
      if (prevCell) prevCell.classList.remove("selected");
    }
    this.selectedTooth = null;
    if (this.detailPanel) {
      this.detailPanel.innerHTML = "";
    }
  }

  // ── Detail panel ────────────────────────────────────────────────

  private showDetailForTooth(tooth: FdiToothNumber): void {
    if (!this.detailPanel || !this.session.hasSession()) return;

    const icdasData = this.session.getIcdas();
    const toothData = icdasData[tooth];
    const isSpecial = toothData.status === "special";

    let surfacesHtml: string;

    if (isSpecial) {
      // Special mode: single dropdown for the whole-tooth code
      const options = Object.entries(SPECIAL_CASE_LABELS)
        .map(
          ([code, desc]) =>
            `<option value="${code}" ${toothData.specialCode === code ? "selected" : ""}>${code} — ${desc}</option>`
        )
        .join("");

      surfacesHtml = `
        <div class="icdas-special-container">
          <label class="form-label">Posebna koda</label>
          <select class="icdas-special-select" id="icdas-special-code">
            <option value="">— Izberi —</option>
            ${options}
          </select>
        </div>
      `;
    } else {
      // Normal mode: 5 surface items, each with full name + two dropdowns
      const rows = ICDAS_SURFACES.map((surface) => {
        const surfData = toothData.surfaces[surface];

        const restOptions = Object.entries(RESTORATION_LABELS)
          .map(
            ([code, desc]) =>
              `<option value="${code}" ${surfData.restoration === parseInt(code) ? "selected" : ""} title="${desc}">${code}</option>`
          )
          .join("");

        const cariesOptions = Object.entries(CARIES_LABELS)
          .map(
            ([code, desc]) =>
              `<option value="${code}" ${surfData.caries === parseInt(code) ? "selected" : ""} title="${desc}">${code}</option>`
          )
          .join("");

        return `
          <div class="icdas-surface-item">
            <div class="icdas-surface-name">${ICDAS_SURFACE_FULL_NAMES[surface]} (${ICDAS_SURFACE_LABELS[surface]})</div>
            <div class="icdas-surface-dropdowns">
              <div class="icdas-dropdown-wrapper">
                <span class="icdas-dropdown-label">Zobna površina</span>
                <select class="icdas-select" data-surface="${surface}" data-code-type="restoration">
                  <option value="" ${surfData.restoration === null ? "selected" : ""}>—</option>
                  ${restOptions}
                </select>
              </div>
              <div class="icdas-dropdown-wrapper">
                <span class="icdas-dropdown-label">Kariozne spremembe</span>
                <select class="icdas-select" data-surface="${surface}" data-code-type="caries">
                  <option value="" ${surfData.caries === null ? "selected" : ""}>—</option>
                  ${cariesOptions}
                </select>
              </div>
            </div>
          </div>
        `;
      }).join("");

      surfacesHtml = `
        <div class="icdas-surfaces-grid">
          ${rows}
        </div>
      `;
    }

    this.detailPanel.innerHTML = `
      <div class="icdas-detail-panel">
        <div class="icdas-detail-header">
          <span class="icdas-detail-tooth-label">Zob ${tooth}</span>
          <select class="icdas-mode-select" id="icdas-mode-toggle">
            <option value="normal" ${!isSpecial ? "selected" : ""}>Normalen</option>
            <option value="special" ${isSpecial ? "selected" : ""}>Poseben primer</option>
          </select>
        </div>
        ${surfacesHtml}
      </div>
    `;

    // Attach event listeners
    const modeSelect = this.detailPanel.querySelector("#icdas-mode-toggle") as HTMLSelectElement;
    modeSelect?.addEventListener("change", () =>
      this.handleModeToggle(tooth, modeSelect.value as "normal" | "special")
    );

    if (isSpecial) {
      const specialSelect = this.detailPanel.querySelector("#icdas-special-code") as HTMLSelectElement;
      specialSelect?.addEventListener("change", () =>
        this.handleSpecialCodeChange(tooth, specialSelect.value)
      );
    } else {
      const selects = this.detailPanel.querySelectorAll(".icdas-select") as NodeListOf<HTMLSelectElement>;
      selects.forEach((sel) => {
        sel.addEventListener("change", () => {
          const surface = sel.dataset.surface as ICDASSurface;
          const codeType = sel.dataset.codeType as "restoration" | "caries";
          this.handleSurfaceCodeChange(tooth, surface, codeType, sel.value);
        });
      });
    }

    // Scroll detail panel into view
    this.detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── Data handlers ───────────────────────────────────────────────

  private handleModeToggle(tooth: FdiToothNumber, mode: "normal" | "special"): void {
    if (!this.session.hasSession()) return;

    const icdasData = this.session.getIcdas();
    const toothData = icdasData[tooth];

    toothData.status = mode;

    // Clear special code when switching back to normal
    if (mode === "normal") {
      toothData.specialCode = null;
    }

    this.session.touch();
    this.refreshToothVisual(tooth);
    this.showDetailForTooth(tooth);
  }

  private handleSurfaceCodeChange(
    tooth: FdiToothNumber,
    surface: ICDASSurface,
    codeType: "restoration" | "caries",
    value: string
  ): void {
    if (!this.session.hasSession()) return;

    const surfData = this.session.getIcdas()[tooth].surfaces[surface];

    if (codeType === "restoration") {
      surfData.restoration = value === "" ? null : (parseInt(value, 10) as RestorationCode);
    } else {
      surfData.caries = value === "" ? null : (parseInt(value, 10) as CariesCode);
    }

    this.session.touch();
    this.refreshToothVisual(tooth);
  }

  private handleSpecialCodeChange(tooth: FdiToothNumber, value: string): void {
    if (!this.session.hasSession()) return;

    this.session.getIcdas()[tooth].specialCode = value === "" ? null : (value as SpecialCaseCode);
    this.session.touch();
    this.refreshToothVisual(tooth);
  }

  // ── Visual refresh ──────────────────────────────────────────────

  private refreshToothVisual(tooth: FdiToothNumber): void {
    if (!this.chartContainer || !this.session.hasSession()) return;

    const cell = this.chartContainer.querySelector(
      `.icdas-tooth-cell[data-tooth="${tooth}"]`
    ) as HTMLElement | null;
    if (!cell) return;

    const toothData = this.session.getIcdas()[tooth];

    // Toggle special state on cell
    cell.classList.toggle("icdas-special", toothData.status === "special");

    // Update each surface polygon
    const polygons = cell.querySelectorAll(".icdas-surface") as NodeListOf<SVGElement>;
    polygons.forEach((poly) => {
      const position = poly.dataset.position as ICDASVisualPosition;
      const surface = getICDASSurfaceForPosition(
        tooth,
        position
      );

      // Clear all state classes
      for (let i = 0; i <= 6; i++) {
        poly.classList.remove(`icdas-caries-${i}`);
      }
      poly.classList.remove("icdas-restored", "icdas-special-surface");

      if (toothData.status === "special") {
        poly.classList.add("icdas-special-surface");
      } else {
        const surfData = toothData.surfaces[surface];

        // Caries color
        if (surfData.caries !== null) {
          poly.classList.add(`icdas-caries-${surfData.caries}`);
        }

        // Restoration indicator (blue stroke for codes > 0)
        if (surfData.restoration !== null && surfData.restoration > 0) {
          poly.classList.add("icdas-restored");
        }
      }
    });
  }

  private refreshAllTeeth(): void {
    if (!this.chartContainer || !this.session.hasSession()) return;

    const cells = this.chartContainer.querySelectorAll(".icdas-tooth-cell") as NodeListOf<HTMLElement>;
    cells.forEach((cell) => {
      const toothStr = cell.dataset.tooth;
      if (toothStr) {
        this.refreshToothVisual(parseInt(toothStr, 10) as FdiToothNumber);
      }
    });
  }
}
