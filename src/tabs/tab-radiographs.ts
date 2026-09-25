/* global document, HTMLElement, HTMLInputElement, HTMLTextAreaElement, HTMLButtonElement, HTMLSelectElement */

import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import { FdiToothNumber, RadiographData, RadiographFigure, RadiographImage, RadiographJaw, RadiographMode } from "../model/types";
import {
  RADIOGRAPH_JAW_TEETH,
  RADIOGRAPH_JAW_LABELS,
  RADIOGRAPH_MAX_DIMENSION,
  RADIOGRAPH_COMPOSITE_MAX_DIMENSION,
} from "../model/constants";
import {
  RADIOGRAPH_JAWS,
  makeFigure,
  makeSkipFigure,
  hasRadiographContent,
  radiographIssues,
  radiographIssueText,
  figureLabels,
} from "../model/radiographs";
import {
  processImageFile,
  rotateDataUrl,
  isAcceptedImage,
  dataUrlBytes,
  formatBytes,
  displayNameFor,
  shortFileName,
} from "../images/image-utils";

function esc(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Where the next picked file(s) go. */
type PickTarget =
  | { kind: "composite" }
  | { kind: "append"; jaw: RadiographJaw }
  | { kind: "replace"; jaw: RadiographJaw; index: number };

interface Selection {
  jaw: RadiographJaw;
  index: number;
}

const NO_SESSION = "Ni aktivne seje. Začnite nov pregled na zavihku Začetek.";
const TWO_CLICK_MS = 3000;

export class RadiographsTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;

  private selected: Selection | null = null;
  private pickTarget: PickTarget | null = null;
  private galleryInput: HTMLInputElement | null = null;
  private browseInput: HTMLInputElement | null = null;
  private opinionGroup: HTMLElement | null = null;
  private opinionTextarea: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private toolbarEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private helpEl: HTMLElement | null = null;
  private busy = false;
  private mountScroll = 0;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>Rentgenske slike</h2>
        <div class="tab-toolbar" id="rtg-toolbar"></div>

        <!-- Two inputs on purpose. An "accept" of image types sends Android
             straight to the system photo picker, which shows thumbnails only.
             Omitting it lets the file browser open instead, where names,
             folders and search are available. -->
        <input type="file" id="rtg-gallery-input" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden />
        <input type="file" id="rtg-browse-input" hidden />

        <div class="rtg-status" id="rtg-status"></div>
        <div id="rtg-body"></div>

        <div class="form-group rtg-opinion-group" id="rtg-opinion-group">
          <label class="form-label" for="rtg-opinion">Rentgenska diagnoza / mnenje</label>
          <textarea id="rtg-opinion" class="form-textarea" rows="8"
            placeholder="Razlaga, diagnoza in mnenje na podlagi rentgenskih posnetkov ..."></textarea>
        </div>

        <p class="tab-help-footer" id="rtg-help"></p>
      </div>
    `;

    this.galleryInput = panel.querySelector("#rtg-gallery-input") as HTMLInputElement;
    this.browseInput = panel.querySelector("#rtg-browse-input") as HTMLInputElement;
    this.opinionGroup = panel.querySelector("#rtg-opinion-group") as HTMLElement;
    this.opinionTextarea = panel.querySelector("#rtg-opinion") as HTMLTextAreaElement;
    this.statusEl = panel.querySelector("#rtg-status") as HTMLElement;
    this.toolbarEl = panel.querySelector("#rtg-toolbar") as HTMLElement;
    this.bodyEl = panel.querySelector("#rtg-body") as HTMLElement;
    this.helpEl = panel.querySelector("#rtg-help") as HTMLElement;

    for (const input of [this.galleryInput, this.browseInput]) {
      input.addEventListener("change", () => {
        const files = input.files;
        const target = this.pickTarget;
        this.pickTarget = null;
        if (files && files.length && target) void this.handleFiles(target, Array.from(files));
      });
    }

    this.opinionTextarea.addEventListener("input", () => {
      if (!this.session.hasSession()) return;
      this.session.getRadiographs().opinion = this.opinionTextarea?.value || "";
      this.renderIssues();
    });

    this.render();
  }

  onActivate(): void {
    this.render();
  }

  onDeactivate(): void {
    if (!this.session.hasSession()) return;
    const rg = this.session.getRadiographs();
    rg.opinion = this.opinionTextarea?.value || "";
    this.session.touch();
  }

  private rg(): RadiographData {
    return this.session.getRadiographs();
  }

  // ── Rendering ───────────────────────────────────────────────────

  private render(): void {
    if (!this.session.hasSession()) {
      this.selected = null;
      if (this.toolbarEl) this.toolbarEl.innerHTML = "";
      if (this.bodyEl) this.bodyEl.innerHTML = "";
      if (this.opinionGroup) this.opinionGroup.style.display = "none";
      if (this.helpEl) this.helpEl.innerHTML = "";
      this.setStatus(NO_SESSION, "warn");
      return;
    }
    const rg = this.rg();
    if (this.selected && !rg[this.selected.jaw][this.selected.index]) this.selected = null;
    if (this.opinionTextarea) this.opinionTextarea.value = rg.opinion;
    if (this.opinionGroup) this.opinionGroup.style.display = rg.mode ? "" : "none";

    this.renderToolbar();
    this.renderBody();
    this.renderHelp();
    this.renderStatus();
    this.renderIssues();
  }

  private renderToolbar(): void {
    if (!this.toolbarEl) return;
    const rg = this.rg();
    this.toolbarEl.innerHTML = `
      ${rg.mode
        ? rg.unlocked
          ? `<button class="btn btn-secondary btn-sm" id="rtg-lock-btn">🔒 Zakleni obvezna polja</button>`
          : `<button class="btn btn-danger-outline btn-sm" id="rtg-unlock-btn">🔓 Odkleni obvezna polja</button>`
        : ""}
      <button class="btn btn-danger-outline btn-sm" id="rtg-reset-btn">Ponastavi slike</button>
    `;

    const lockBtn = this.toolbarEl.querySelector("#rtg-lock-btn") as HTMLButtonElement | null;
    lockBtn?.addEventListener("click", () => {
      this.rg().unlocked = false;
      this.session.touch();
      this.render();
    });

    // Unlocking lowers data quality, so it takes the same two clicks as a reset
    const unlockBtn = this.toolbarEl.querySelector("#rtg-unlock-btn") as HTMLButtonElement | null;
    if (unlockBtn) {
      this.armTwoClick(unlockBtn, () => {
        this.rg().unlocked = true;
        this.session.touch();
        this.render();
      });
    }

    this.armTwoClick(this.toolbarEl.querySelector("#rtg-reset-btn") as HTMLButtonElement, () => {
      const rg = this.rg();
      rg.mode = null;
      rg.composite = null;
      rg.upper = [];
      rg.lower = [];
      rg.opinion = "";
      rg.unlocked = false;
      this.selected = null;
      this.session.touch();
      this.render();
    });
  }

  private renderBody(): void {
    if (!this.bodyEl) return;
    const rg = this.rg();
    // Keep the horizontal scroll position of the rows across re-renders
    const wrap = this.bodyEl.querySelector(".rtg-mount-wrap") as HTMLElement | null;
    if (wrap) this.mountScroll = wrap.scrollLeft;

    if (!rg.mode) {
      this.bodyEl.innerHTML = `
        <div class="rtg-mode-choice">
          <div class="rtg-mode-prompt">Izberite način vnosa rentgenskih slik:</div>
          <button type="button" class="rtg-mode-option" data-mode="composite">
            <span class="rtg-mode-title">🩻 Ena sestavljena slika</span>
            <span class="rtg-mode-desc">Ena slika celotnega zobovja (npr. ortopan). Vnese se le
              rentgenska diagnoza / mnenje.</span>
          </button>
          <button type="button" class="rtg-mode-option" data-mode="partial">
            <span class="rtg-mode-title">🧩 Delne slike</span>
            <span class="rtg-mode-desc">Poljubno število posnetkov v dveh vrstah — zgornja čeljust
              in spodnja čeljust. Vsak posnetek ima lokacijo (zobe) in opis.</span>
          </button>
        </div>`;
      this.bodyEl.querySelectorAll<HTMLButtonElement>(".rtg-mode-option").forEach((btn) => {
        btn.addEventListener("click", () => this.setMode(btn.dataset.mode as RadiographMode));
      });
      return;
    }

    const modeName = rg.mode === "composite" ? "Ena sestavljena slika" : "Delne slike";
    this.bodyEl.innerHTML = `
      <div class="rtg-mode-bar">
        <span class="rtg-mode-current">Način: <strong>${modeName}</strong></span>
        <button type="button" class="btn btn-secondary btn-sm" id="rtg-mode-switch">Zamenjaj način</button>
      </div>
      <div class="validation-banner" id="rtg-issues"></div>
      <div id="rtg-mode-body"></div>
    `;

    const switchBtn = this.bodyEl.querySelector("#rtg-mode-switch") as HTMLButtonElement;
    const other: RadiographMode = rg.mode === "composite" ? "partial" : "composite";
    if (hasRadiographContent(rg)) {
      // Switching discards the images, so it is confirmed like a reset
      switchBtn.title = "Naložene slike bodo izbrisane.";
      this.armTwoClick(switchBtn, () => this.setMode(other));
    } else {
      switchBtn.addEventListener("click", () => this.setMode(other));
    }

    const modeBody = this.bodyEl.querySelector("#rtg-mode-body") as HTMLElement;
    if (rg.mode === "composite") this.renderComposite(modeBody);
    else this.renderPartial(modeBody);
  }

  private setMode(mode: RadiographMode): void {
    if (!this.requireSession()) return;
    const rg = this.rg();
    rg.mode = mode;
    rg.composite = null;
    rg.upper = [];
    rg.lower = [];
    this.selected = null;
    this.session.touch();
    this.render();
  }

  // ── Composite mode ──────────────────────────────────────────────

  private renderComposite(host: HTMLElement): void {
    const img = this.rg().composite;
    host.innerHTML = `
      <div class="rtg-composite">
        <div class="rtg-jaw-label">Zgornja čeljust</div>
        <div class="rtg-composite-frame">
          ${img
            ? `<img src="${img.dataUrl}" alt="Sestavljena rentgenska slika" />`
            : `<div class="rtg-preview-empty">Ni izbrane slike</div>`}
        </div>
        <div class="rtg-jaw-label">Spodnja čeljust</div>
        <div class="rtg-side-hints"><span>preiskovančeva DESNA</span><span>preiskovančeva LEVA</span></div>
      </div>
      ${img ? `<div class="rtg-file-meta">${esc(img.fileName)} · ${img.width}×${img.height} px · ${formatBytes(dataUrlBytes(img.dataUrl))}</div>` : ""}
      <div class="rtg-detail-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-act="gallery">🖼️ ${img ? "Zamenjaj iz galerije" : "Izberi iz galerije"}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="browse">📁 Prebrskaj datoteke</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="rotate" ${img ? "" : "disabled"}>↻ Zavrti</button>
        <button type="button" class="btn btn-danger-outline btn-sm" data-act="remove" ${img ? "" : "disabled"}>Odstrani</button>
      </div>
    `;

    host.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "gallery" || act === "browse") this.pick({ kind: "composite" }, act);
        else if (act === "rotate") void this.rotateComposite();
        else if (act === "remove") {
          this.rg().composite = null;
          this.session.touch();
          this.render();
        }
      });
    });
  }

  // ── Partial mode ────────────────────────────────────────────────

  private renderPartial(host: HTMLElement): void {
    const rg = this.rg();
    const issues = radiographIssues(rg);

    const renderRow = (jaw: RadiographJaw) => {
      const labels = figureLabels(jaw, rg[jaw]);
      const cards = rg[jaw].map((f, i) =>
        this.figureCard(jaw, i, f, labels[i], issues.missingLocation[jaw].indexOf(i) >= 0)
      ).join("");
      const add = `
        <div class="rtg-fig rtg-fig-add">
          <button type="button" class="btn btn-secondary btn-sm" data-act="gallery" data-jaw="${jaw}">🖼️ Galerija</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="browse" data-jaw="${jaw}">📁 Datoteke</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="skip" data-jaw="${jaw}">⇥ Preskoči mesto</button>
        </div>`;
      return `<div class="rtg-row" data-jaw="${jaw}">${cards}${add}</div>`;
    };

    host.innerHTML = `
      <div class="rtg-mount-wrap">
        <div class="rtg-rows">
          <div class="rtg-row-label">Zgornja čeljust</div>
          ${renderRow("upper")}
          ${renderRow("lower")}
          <div class="rtg-row-label">Spodnja čeljust</div>
        </div>
      </div>
      <div class="rtg-side-hints"><span>← preiskovančeva DESNA</span><span>preiskovančeva LEVA →</span></div>
      <div id="rtg-detail"></div>
    `;

    const wrap = host.querySelector(".rtg-mount-wrap") as HTMLElement;
    wrap.scrollLeft = this.mountScroll;

    wrap.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const jaw = btn.dataset.jaw as RadiographJaw;
        const act = btn.dataset.act;
        if (act === "gallery" || act === "browse") {
          this.pick({ kind: "append", jaw }, act);
        } else if (act === "skip") {
          this.rg()[jaw].push(makeSkipFigure());
          this.session.touch();
          this.render();
        } else if (act === "select") {
          const index = Number(btn.dataset.idx);
          const same = this.selected && this.selected.jaw === jaw && this.selected.index === index;
          this.selected = same ? null : { jaw, index };
          this.render();
        }
      });
    });

    wrap.querySelectorAll<HTMLSelectElement>("select[data-field]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const f = this.figureAt(sel.dataset.jaw as RadiographJaw, Number(sel.dataset.idx));
        if (!f) return;
        const value = sel.value ? (Number(sel.value) as FdiToothNumber) : null;
        if (sel.dataset.field === "from") f.toothFrom = value;
        else f.toothTo = value;
        this.session.touch();
        this.renderIssues();
      });
    });

    // Typing must not re-render: that would drop the focus and the keyboard
    wrap.querySelectorAll<HTMLTextAreaElement>("textarea[data-field]").forEach((ta) => {
      ta.addEventListener("input", () => {
        const f = this.figureAt(ta.dataset.jaw as RadiographJaw, Number(ta.dataset.idx));
        if (f) f.annotation = ta.value;
      });
      ta.addEventListener("change", () => this.session.touch());
    });

    this.renderDetail(host.querySelector("#rtg-detail") as HTMLElement);
  }

  private figureCard(jaw: RadiographJaw, i: number, f: RadiographFigure, label: string, invalid: boolean): string {
    const sel = this.selected && this.selected.jaw === jaw && this.selected.index === i ? " selected" : "";
    if (f.skip) {
      return `
        <div class="rtg-fig rtg-fig-skip${sel}">
          <button type="button" class="rtg-fig-thumb" data-act="select" data-jaw="${jaw}" data-idx="${i}"
                  title="Preskočeno mesto — tapnite za premik ali odstranitev">
            <span class="rtg-fig-skip-text">preskočeno mesto</span>
          </button>
        </div>`;
    }

    const teeth = RADIOGRAPH_JAW_TEETH[jaw];
    const options = (current: FdiToothNumber | null, placeholder: string) =>
      `<option value="">${placeholder}</option>` +
      teeth.map((t) => `<option value="${t}"${t === current ? " selected" : ""}>${t}</option>`).join("");
    // The file name confirms at a glance which film landed where
    const body = f.image
      ? `<img class="rtg-thumb" src="${f.image.dataUrl}" alt="${esc(label)}" />`
      : `<span class="rtg-slot-placeholder">＋</span>`;
    const fileTag = f.image
      ? `<span class="rtg-slot-file" title="${esc(f.image.fileName)}">${esc(shortFileName(f.image.fileName))}</span>`
      : `<span class="rtg-slot-file rtg-slot-file-missing">ni slike</span>`;

    return `
      <div class="rtg-fig${sel}${invalid ? " invalid" : ""}">
        <button type="button" class="rtg-fig-thumb" data-act="select" data-jaw="${jaw}" data-idx="${i}"
                title="Tapnite za premik, vrtenje, zamenjavo ali odstranitev">
          <span class="rtg-slot-num">${esc(label)}</span>
          <span class="rtg-slot-img">${body}</span>
        </button>
        ${fileTag}
        <div class="rtg-fig-loc">
          <select class="form-input" data-field="from" data-jaw="${jaw}" data-idx="${i}" aria-label="${esc(label)} – od zoba">
            ${options(f.toothFrom, "od")}
          </select>
          <span class="rtg-fig-dash">–</span>
          <select class="form-input" data-field="to" data-jaw="${jaw}" data-idx="${i}" aria-label="${esc(label)} – do zoba">
            ${options(f.toothTo, "do")}
          </select>
        </div>
        <textarea class="form-input rtg-fig-note" rows="2" maxlength="500" data-field="annotation"
                  data-jaw="${jaw}" data-idx="${i}" placeholder="Opis posnetka …">${esc(f.annotation)}</textarea>
      </div>`;
  }

  private renderDetail(host: HTMLElement): void {
    if (!this.selected) {
      host.innerHTML = "";
      return;
    }
    const { jaw, index } = this.selected;
    const rg = this.rg();
    const f = rg[jaw][index];
    if (!f) {
      host.innerHTML = "";
      return;
    }
    const label = figureLabels(jaw, rg[jaw])[index];
    const img = f.image;
    const last = rg[jaw].length - 1;

    host.innerHTML = `
      <div class="rtg-detail-panel">
        <div class="rtg-detail-header">
          <span class="rtg-detail-title">${f.skip ? "Preskočeno mesto" : esc(label)} · ${RADIOGRAPH_JAW_LABELS[jaw]}</span>
          <button type="button" class="rtg-detail-close" data-act="close" aria-label="Zapri">✕</button>
        </div>
        ${f.skip ? "" : `
        <div class="rtg-preview">
          ${img ? `<img src="${img.dataUrl}" alt="${esc(label)}" />` : `<div class="rtg-preview-empty">Ni izbrane slike</div>`}
        </div>
        ${img ? `<div class="rtg-file-meta">${esc(img.fileName)} · ${img.width}×${img.height} px · ${formatBytes(dataUrlBytes(img.dataUrl))}</div>` : ""}`}
        <div class="rtg-detail-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-act="left" ${index > 0 ? "" : "disabled"}>◀ Levo</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="right" ${index < last ? "" : "disabled"}>Desno ▶</button>
          ${f.skip ? "" : `
          <button type="button" class="btn btn-secondary btn-sm" data-act="replace">${img ? "Zamenjaj" : "Izberi sliko"}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="rotate" ${img ? "" : "disabled"}>↻ Zavrti</button>`}
          <button type="button" class="btn btn-danger-outline btn-sm" data-act="remove">Odstrani</button>
        </div>
      </div>
    `;

    host.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        const figures = this.rg()[jaw];
        if (act === "close") {
          this.selected = null;
        } else if (act === "left" || act === "right") {
          const to = act === "left" ? index - 1 : index + 1;
          if (to < 0 || to >= figures.length) return;
          [figures[index], figures[to]] = [figures[to], figures[index]];
          this.selected = { jaw, index: to };
          this.session.touch();
        } else if (act === "replace") {
          this.pick({ kind: "replace", jaw, index }, "gallery");
          return;
        } else if (act === "rotate") {
          void this.rotateFigure(jaw, index);
          return;
        } else if (act === "remove") {
          figures.splice(index, 1);
          this.selected = null;
          this.session.touch();
        }
        this.render();
      });
    });
  }

  private renderIssues(): void {
    if (!this.session.hasSession()) return;
    const rg = this.rg();
    const text = radiographIssueText(rg);
    const banner = this.panel?.querySelector("#rtg-issues") as HTMLElement | null;
    if (banner) {
      banner.textContent = text;
      banner.classList.toggle("visible", !!text);
    }
    const issues = radiographIssues(rg);
    this.opinionTextarea?.classList.toggle("error", issues.missingOpinion);
    this.panel?.querySelectorAll<HTMLElement>(".rtg-row").forEach((row) => {
      const jaw = row.dataset.jaw as RadiographJaw;
      row.querySelectorAll<HTMLElement>(":scope > .rtg-fig:not(.rtg-fig-add)").forEach((card, i) => {
        card.classList.toggle("invalid", issues.missingLocation[jaw].indexOf(i) >= 0);
      });
    });
  }

  private renderHelp(): void {
    if (!this.helpEl) return;
    const mode = this.rg().mode;
    this.helpEl.innerHTML = !mode
      ? `Izberite, ali boste naložili eno sliko celotnega zobovja ali več delnih posnetkov.
         Način lahko kasneje zamenjate, vendar se pri tem naložene slike izbrišejo.`
      : mode === "composite"
        ? `Naložite eno pravilno orientirano sliko: zgornja čeljust zgoraj, preiskovančeva
           <strong>desna</strong> stran na levi strani slike. Rentgenska diagnoza / mnenje je obvezna,
           dokler obveznih polj ne odklenete. Slika se ob shranjevanju stisne in zapiše na ločen list
           <code>DentalExam_Slike</code>.`
        : `Zgornja vrsta je zgornja čeljust, spodnja vrsta spodnja; leva stran prikaza je preiskovančeva
           <strong>desna</strong> stran. Posnetki se dodajo na konec vrste v vrstnem redu, kot jih vrne
           izbirnik — tapnite posnetek, da ga premaknete levo ali desno, zavrtite ali zamenjate.
           <em>Preskoči mesto</em> vstavi prazno mesto, da se posnetki poravnajo z nasprotno čeljustjo.
           Lokacija (zobje) je obvezna za vsak posnetek, dokler obveznih polj ne odklenete; opis ni obvezen.
           Galerija na tablici pogosto prikaže le sličice; <em>Datoteke</em> odpre brskalnik z imeni in mapami.`;
  }

  private renderStatus(): void {
    const rg = this.rg();
    if (!rg.mode) {
      this.setStatus("Način vnosa še ni izbran.", "info");
      return;
    }
    if (rg.mode === "composite") {
      const img = rg.composite;
      if (img) this.setStatus(`Sestavljena slika naložena · ${formatBytes(dataUrlBytes(img.dataUrl))}`, "ok");
      else this.setStatus("Sestavljena slika še ni naložena.", "info");
    } else {
      const count = (jaw: RadiographJaw) => rg[jaw].filter((f) => f.image).length;
      const bytes = [...rg.upper, ...rg.lower].reduce((sum, f) => sum + (f.image ? dataUrlBytes(f.image.dataUrl) : 0), 0);
      const up = count("upper");
      const low = count("lower");
      this.setStatus(
        `Posnetkov: zgoraj ${up}, spodaj ${low}${bytes ? ` · ${formatBytes(bytes)}` : ""}`,
        up + low > 0 ? "ok" : "info"
      );
    }
    if (rg.unlocked && this.statusEl) this.statusEl.textContent += " · obvezna polja odklenjena";
  }

  private setStatus(text: string, kind: "info" | "ok" | "warn" | "error"): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `rtg-status rtg-status-${kind}`;
  }

  private appendStatusNote(note: string): void {
    if (!this.statusEl) return;
    this.statusEl.textContent += ` — ${note}`;
    this.statusEl.className = "rtg-status rtg-status-warn";
  }

  // ── File handling ───────────────────────────────────────────────

  private pick(target: PickTarget, via: "gallery" | "browse"): void {
    if (!this.requireSession() || this.busy) return;
    const input = via === "gallery" ? this.galleryInput : this.browseInput;
    if (!input) return;
    this.pickTarget = target;
    input.multiple = target.kind === "append";
    input.value = "";
    input.click();
  }

  private figureAt(jaw: RadiographJaw, index: number): RadiographFigure | undefined {
    return this.session.hasSession() ? this.rg()[jaw][index] : undefined;
  }

  private async handleFiles(target: PickTarget, files: File[]): Promise<void> {
    if (this.busy || !this.requireSession()) return;
    const accepted = files.filter(isAcceptedImage);
    const rejected = files.length - accepted.length;
    if (accepted.length === 0) {
      this.setStatus("Nobena izbrana datoteka ni JPEG ali PNG.", "error");
      return;
    }

    this.busy = true;
    const maxDim = target.kind === "composite" ? RADIOGRAPH_COMPOSITE_MAX_DIMENSION : RADIOGRAPH_MAX_DIMENSION;
    const usable = target.kind === "append" ? accepted : accepted.slice(0, 1);
    let failed = 0;
    let lastError = "";

    for (let i = 0; i < usable.length; i++) {
      const file = usable[i];
      if (usable.length > 1) this.setStatus(`Obdelujem sliko ${i + 1} / ${usable.length} …`, "info");
      else this.setStatus("Obdelujem sliko …", "info");
      try {
        const processed = await processImageFile(file, maxDim);
        const image: RadiographImage = {
          dataUrl: processed.dataUrl,
          fileName: displayNameFor(file),
          width: processed.width,
          height: processed.height,
        };
        const rg = this.rg();
        if (target.kind === "composite") {
          rg.composite = image;
        } else if (target.kind === "replace") {
          const f = rg[target.jaw][target.index];
          if (f) f.image = image;
        } else {
          rg[target.jaw].push(makeFigure(image));
        }
      } catch (e) {
        failed++;
        lastError = e instanceof Error ? e.message : "";
      }
      // Paint each film as it lands: a batch takes a few seconds on a tablet,
      // and a row that stays empty until the end reads as a hang.
      this.renderBody();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.session.touch();
    this.busy = false;
    this.render();

    const notes: string[] = [];
    if (rejected > 0) notes.push(`${rejected} datotek ni v formatu JPEG/PNG`);
    if (failed > 0) notes.push(failed === 1 && lastError ? lastError : `${failed} slik ni bilo mogoče odpreti`);
    if (notes.length) this.appendStatusNote(notes.join("; ") + ".");
  }

  private async rotateImage(image: RadiographImage): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const rotated = await rotateDataUrl(image.dataUrl, 90);
      image.dataUrl = rotated.dataUrl;
      image.width = rotated.width;
      image.height = rotated.height;
      this.session.touch();
      this.render();
    } catch (e) {
      this.setStatus(e instanceof Error ? e.message : "Slike ni bilo mogoče zavrteti.", "error");
    } finally {
      this.busy = false;
    }
  }

  private async rotateComposite(): Promise<void> {
    const img = this.rg().composite;
    if (img) await this.rotateImage(img);
  }

  private async rotateFigure(jaw: RadiographJaw, index: number): Promise<void> {
    const img = this.figureAt(jaw, index)?.image;
    if (img) await this.rotateImage(img);
  }

  private requireSession(): boolean {
    if (!this.session.hasSession()) {
      this.setStatus(NO_SESSION, "warn");
      return false;
    }
    return true;
  }

  /** Two-click confirmation — the Office iframe blocks window.confirm(). */
  private armTwoClick(btn: HTMLButtonElement, onConfirm: () => void): void {
    const idle = btn.innerHTML;
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disarm = () => {
      armed = false;
      btn.innerHTML = idle;
      btn.classList.remove("btn-danger-armed");
    };
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = "Ste prepričani?";
        btn.classList.add("btn-danger-armed");
        timer = setTimeout(disarm, TWO_CLICK_MS);
        return;
      }
      if (timer) clearTimeout(timer);
      disarm();
      if (!this.session.hasSession()) return;
      onConfirm();
    });
  }
}
