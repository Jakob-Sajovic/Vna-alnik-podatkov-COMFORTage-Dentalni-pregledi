import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import { FdiToothNumber, ProbingSite, ProbingData } from "../model/types";
import {
  UPPER_RIGHT,
  UPPER_LEFT,
  LOWER_LEFT,
  LOWER_RIGHT,
  PROBING_BUCCAL_SITES,
  PROBING_LINGUAL_SITES,
  PROBING_SITE_LABELS,
  PROBING_DEPTH_COLORS,
  FURCATION_GRADES,
} from "../model/constants";
import { buildToothOutlinesSvg, TOOTH_CENTER_PCT, SITE_SPREAD } from "../dental/tooth-outlines";

function getDepthColor(avg: number): string {
  for (const tier of PROBING_DEPTH_COLORS) {
    if (avg <= tier.max) return tier.color;
  }
  return PROBING_DEPTH_COLORS[PROBING_DEPTH_COLORS.length - 1].color;
}

export class ProbingTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;
  private selectedTooth: FdiToothNumber | null = null;
  private detailContainer: HTMLElement | null = null;
  private chartContainers: Map<string, HTMLElement> = new Map();

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>Globine sondiranja</h2>
        <p class="icdas-help-text">
          Kliknite na zob za vnos globin sondiranja (6 mest na zob).
          Barvne vrednosti: zelena &#8804;3, rumena 4, oranžna 5, rdeča &#8805;6 mm.
        </p>
        <div id="probing-chart"></div>
        <div id="probing-detail"></div>
        <p class="tab-help-footer">
          Za vsak zob vnesite globine sondiranja v milimetrih.
          Graf se posodobi sproti.
        </p>
      </div>
    `;

    const chartContainer = panel.querySelector("#probing-chart") as HTMLElement;
    this.detailContainer = panel.querySelector("#probing-detail") as HTMLElement;

    this.buildChart(chartContainer);
  }

  onActivate(): void {
    if (!this.session.hasSession()) return;
    this.refreshAllCharts();
    if (this.selectedTooth !== null) {
      this.showDetail(this.selectedTooth);
    }
  }

  onDeactivate(): void {
    // Write-through — no-op
  }

  // ── Chart building ────────────────────────────────────────────

  private buildChart(container: HTMLElement): void {
    const upperTeeth = [...UPPER_RIGHT, ...UPPER_LEFT];
    const lowerTeeth = [...LOWER_LEFT, ...LOWER_RIGHT];

    this.buildJaw(container, upperTeeth, "upper", "Zgornja čeljust");
    this.buildJaw(container, lowerTeeth, "lower", "Spodnja čeljust");
  }

  private buildJaw(
    container: HTMLElement,
    teeth: FdiToothNumber[],
    jaw: "upper" | "lower",
    label: string
  ): void {
    const jawDiv = document.createElement("div");
    jawDiv.className = "probing-jaw";

    const jawLabel = document.createElement("div");
    jawLabel.className = "probing-jaw-label";
    jawLabel.textContent = label;
    jawDiv.appendChild(jawLabel);

    // Upper: buccal top + palatal bottom; Lower: lingual top + buccal bottom
    const topSide = jaw === "upper" ? "buccal" : "lingual";
    const bottomSide = jaw === "upper" ? "lingual" : "buccal";
    const topLabel = jaw === "upper" ? "Bukalno" : "Lingvalno";
    const bottomLabel = jaw === "upper" ? "Palatinalno" : "Bukalno";

    const topSideLabel = document.createElement("div");
    topSideLabel.className = "probing-side-label";
    topSideLabel.textContent = topLabel;
    jawDiv.appendChild(topSideLabel);

    const topChartEl = document.createElement("div");
    topChartEl.className = "probing-chart-wrap";
    topChartEl.innerHTML = this.buildOutlineOnlySvg(teeth, jaw);
    jawDiv.appendChild(topChartEl);
    this.chartContainers.set(`${jaw}-${topSide}`, topChartEl);

    // Tooth numbers row — absolutely positioned at tooth center percentages
    const numRow = document.createElement("div");
    numRow.className = "probing-number-row";
    for (let i = 0; i < teeth.length; i++) {
      const tooth = teeth[i];
      const numEl = document.createElement("div");
      numEl.className = "probing-tooth-num";
      numEl.textContent = String(tooth);
      numEl.dataset.tooth = String(tooth);
      numEl.style.left = `${TOOTH_CENTER_PCT[i]}%`;
      numEl.addEventListener("click", () => this.handleToothClick(tooth));
      numRow.appendChild(numEl);
    }
    jawDiv.appendChild(numRow);

    // Bottom side
    const bottomChartEl = document.createElement("div");
    bottomChartEl.className = "probing-chart-wrap";
    bottomChartEl.innerHTML = this.buildOutlineOnlySvg(teeth, jaw);
    jawDiv.appendChild(bottomChartEl);
    this.chartContainers.set(`${jaw}-${bottomSide}`, bottomChartEl);

    const bottomSideLabel = document.createElement("div");
    bottomSideLabel.className = "probing-side-label";
    bottomSideLabel.textContent = bottomLabel;
    jawDiv.appendChild(bottomSideLabel);

    container.appendChild(jawDiv);
  }

  // ── SVG helpers ──────────────────────────────────────────────

  /** SVG with just tooth outlines, no data — shown before a session is loaded */
  private buildOutlineOnlySvg(teeth: FdiToothNumber[], jaw: "upper" | "lower"): string {
    const chartW = 1000;
    const chartH = 100;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartW} ${chartH}" class="probing-chart" preserveAspectRatio="none">`
      + buildToothOutlinesSvg(teeth, jaw, chartW, chartH)
      + `</svg>`;
  }

  private buildAreaChartSvg(
    teeth: FdiToothNumber[],
    sites: ProbingSite[],
    data: ProbingData,
    jaw: "upper" | "lower"
  ): string {
    const chartW = 1000; // high-res viewBox for precision
    const chartH = 100;
    const maxDepth = 12;
    const sitesPerTooth = sites.length; // 3
    const spreadW = chartW * (SITE_SPREAD / 100); // spread in viewBox units

    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chartW} ${chartH}" class="probing-chart" preserveAspectRatio="none">`);

    // Tooth outline background
    parts.push(buildToothOutlinesSvg(teeth, jaw, chartW, chartH));

    const polylinePoints: string[] = [];

    for (let ti = 0; ti < teeth.length; ti++) {
      const tooth = teeth[ti];
      const td = data[tooth];
      const centerX = chartW * (TOOTH_CENTER_PCT[ti] / 100);

      if (!td.present) continue;

      const vals: (number | null)[] = sites.map(s => td[s]);
      const hasData = vals.some(v => v !== null && v > 0);

      // X positions for the 3 sites: left-of-center, center, right-of-center
      const siteXs = [
        centerX - spreadW,
        centerX,
        centerX + spreadW,
      ];

      if (!hasData) {
        for (let si = 0; si < sitesPerTooth; si++) {
          polylinePoints.push(`${siteXs[si].toFixed(1)},0`);
        }
        continue;
      }

      const numericVals = vals.filter(v => v !== null) as number[];
      const avg = numericVals.length > 0 ? numericVals.reduce((a, b) => a + b, 0) / numericVals.length : 0;
      const color = getDepthColor(avg);

      const toothPolyPts: string[] = [];

      for (let si = 0; si < sitesPerTooth; si++) {
        const v = vals[si] ?? 0;
        const py = Math.min(chartH, chartH * (v / maxDepth));
        toothPolyPts.push(`${siteXs[si].toFixed(1)},${py.toFixed(1)}`);
        polylinePoints.push(`${siteXs[si].toFixed(1)},${py.toFixed(1)}`);
      }

      // Close polygon back to baseline
      toothPolyPts.push(`${siteXs[2].toFixed(1)},0`);
      toothPolyPts.push(`${siteXs[0].toFixed(1)},0`);

      parts.push(`<polygon points="${toothPolyPts.join(" ")}" fill="${color}" opacity="0.45"/>`);
    }

    if (polylinePoints.length > 0) {
      parts.push(`<polyline points="${polylinePoints.join(" ")}" fill="none" stroke="#333" stroke-width="1.5"/>`);
    }

    parts.push(`</svg>`);
    return parts.join("");
  }

  private refreshAllCharts(): void {
    if (!this.session.hasSession()) return;
    const data = this.session.getProbing();

    const upperTeeth = [...UPPER_RIGHT, ...UPPER_LEFT];
    const lowerTeeth = [...LOWER_LEFT, ...LOWER_RIGHT];

    this.refreshJawCharts("upper", upperTeeth, data);
    this.refreshJawCharts("lower", lowerTeeth, data);
    this.refreshToothNumStyles();
  }

  private refreshJawCharts(jaw: "upper" | "lower", teeth: FdiToothNumber[], data: ProbingData): void {
    const buccalEl = this.chartContainers.get(`${jaw}-buccal`);
    const lingualEl = this.chartContainers.get(`${jaw}-lingual`);

    if (buccalEl) {
      buccalEl.innerHTML = this.buildAreaChartSvg(teeth, PROBING_BUCCAL_SITES, data, jaw);
    }
    if (lingualEl) {
      lingualEl.innerHTML = this.buildAreaChartSvg(teeth, PROBING_LINGUAL_SITES, data, jaw);
    }
  }

  private refreshToothNumStyles(): void {
    if (!this.panel || !this.session.hasSession()) return;
    const data = this.session.getProbing();

    const nums = this.panel.querySelectorAll(".probing-tooth-num") as NodeListOf<HTMLElement>;
    nums.forEach(el => {
      const t = parseInt(el.dataset.tooth || "0", 10) as FdiToothNumber;
      const td = data[t];
      if (td) {
        el.classList.toggle("missing", !td.present);
        el.classList.toggle("selected", t === this.selectedTooth);
      }
    });
  }

  // ── Tooth click / detail panel ────────────────────────────────

  private handleToothClick(tooth: FdiToothNumber): void {
    if (!this.session.hasSession()) return;

    if (this.selectedTooth === tooth) {
      this.closeDetail();
    } else {
      this.selectTooth(tooth);
    }
  }

  private selectTooth(tooth: FdiToothNumber): void {
    this.selectedTooth = tooth;
    this.refreshToothNumStyles();
    this.showDetail(tooth);
  }

  private closeDetail(): void {
    this.selectedTooth = null;
    this.refreshToothNumStyles();
    if (this.detailContainer) {
      this.detailContainer.innerHTML = "";
    }
  }

  private showDetail(tooth: FdiToothNumber): void {
    if (!this.detailContainer || !this.session.hasSession()) return;

    const data = this.session.getProbing();
    const td = data[tooth];

    const buildInputs = (sites: ProbingSite[], label: string): string => {
      let html = `<div class="probing-side-group"><span class="probing-group-label">${label}:</span>`;
      html += `<div class="probing-inputs-grid">`;
      for (const site of sites) {
        const val = td[site];
        const displayVal = val !== null ? String(val) : "";
        html += `
          <div class="probing-input-wrap">
            <label class="probing-input-label">${PROBING_SITE_LABELS[site]}</label>
            <input type="number" class="probing-input" data-site="${site}"
                   min="0" max="25" step="0.1" value="${displayVal}"
                   placeholder="mm" inputmode="decimal">
          </div>`;
      }
      html += `</div></div>`;
      return html;
    };

    const furcationOptions = FURCATION_GRADES.map(g =>
      `<option value="${g.value}" ${td.furcation === g.value ? "selected" : ""}>${g.label}</option>`
    ).join("");

    this.detailContainer.innerHTML = `
      <div class="probing-detail-panel">
        <div class="probing-detail-header">
          <span class="probing-detail-tooth-label">Zob ${tooth}</span>
          <button class="btn btn-secondary probing-missing-btn" style="min-height:36px;padding:4px 12px;font-size:13px;">
            ${td.present ? "Označi kot manjkajoč" : "Označi kot prisoten"}
          </button>
        </div>
        ${buildInputs(PROBING_BUCCAL_SITES, "Bukalno")}
        ${buildInputs(PROBING_LINGUAL_SITES, "Lingvalno")}
        <div class="probing-side-group">
          <span class="probing-group-label">Furkacija:</span>
          <select class="probing-furcation-select" ${!td.present ? "disabled" : ""}>
            <option value="">—</option>
            ${furcationOptions}
          </select>
        </div>
      </div>
    `;

    // Attach event listeners
    const inputs = this.detailContainer.querySelectorAll(".probing-input") as NodeListOf<HTMLInputElement>;
    inputs.forEach(input => {
      input.addEventListener("input", () => {
        const site = input.dataset.site as ProbingSite;
        const raw = input.value.trim();
        if (raw === "") {
          td[site] = null;
        } else {
          let v = parseFloat(raw);
          if (isNaN(v)) { td[site] = null; return; }
          if (v < 0) { v = 0; input.value = "0"; }
          if (v > 25) { v = 25; input.value = "25"; }
          td[site] = v;
        }
        this.session.touch();
        this.refreshAllCharts();
      });

      input.addEventListener("blur", () => {
        const site = input.dataset.site as ProbingSite;
        const raw = input.value.trim();
        if (raw === "") return;
        let v = parseFloat(raw);
        if (isNaN(v)) { input.value = ""; td[site] = null; return; }
        v = Math.max(0, Math.min(25, v));
        v = Math.round(v * 10) / 10;
        td[site] = v;
        input.value = String(v);
      });

      if (!td.present) {
        input.disabled = true;
      }
    });

    // Furcation dropdown
    const furcationSelect = this.detailContainer.querySelector(".probing-furcation-select") as HTMLSelectElement;
    furcationSelect?.addEventListener("change", () => {
      const raw = furcationSelect.value;
      td.furcation = raw === "" ? null : parseInt(raw, 10);
      this.session.touch();
    });

    // Missing toggle button
    const missingBtn = this.detailContainer.querySelector(".probing-missing-btn") as HTMLButtonElement;
    missingBtn?.addEventListener("click", () => {
      td.present = !td.present;
      if (!td.present) {
        for (const site of [...PROBING_BUCCAL_SITES, ...PROBING_LINGUAL_SITES]) {
          td[site] = null;
        }
        td.furcation = null;
      }
      this.session.touch();
      this.refreshAllCharts();
      this.showDetail(tooth);
    });

    this.detailContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
