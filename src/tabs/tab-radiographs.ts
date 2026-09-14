/* global document, HTMLElement, HTMLInputElement, HTMLTextAreaElement, HTMLButtonElement */

import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import { RadiographSlotId, RadiographImage } from "../model/types";
import { RADIOGRAPH_SLOTS, RadiographSlotDef, radiographSlotsByRow } from "../model/constants";
import {
  processImageFile,
  rotateDataUrl,
  isAcceptedImage,
  dataUrlBytes,
  formatBytes,
  compareFileNames,
} from "../images/image-utils";

function esc(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export class RadiographsTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;

  private selectedSlot: RadiographSlotId | null = null;
  private bulkInput: HTMLInputElement | null = null;
  private slotInput: HTMLInputElement | null = null;
  private opinionTextarea: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private mountEl: HTMLElement | null = null;
  private detailEl: HTMLElement | null = null;
  private busy = false;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>Rentgenske slike</h2>
        <div class="tab-toolbar">
          <button class="btn btn-danger-outline btn-sm" id="rtg-reset-btn">Ponastavi slike</button>
        </div>

        <div class="rtg-actions">
          <button class="btn btn-primary btn-large" id="rtg-bulk-btn">
            <span class="btn-icon">📁</span> Izberi slike (do 10)
          </button>
          <input type="file" id="rtg-bulk-input" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple hidden />
          <input type="file" id="rtg-slot-input" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden />
        </div>

        <div class="rtg-status" id="rtg-status"></div>

        <div class="rtg-mount-wrap">
          <div class="rtg-mount" id="rtg-mount"></div>
        </div>

        <div id="rtg-detail"></div>

        <div class="form-group rtg-opinion-group">
          <label class="form-label" for="rtg-opinion">Rentgenska diagnoza / mnenje</label>
          <textarea id="rtg-opinion" class="form-textarea" rows="8"
            placeholder="Razlaga, diagnoza in mnenje na podlagi rentgenskih posnetkov ..."></textarea>
        </div>

        <p class="tab-help-footer">
          Posnetki so razporejeni kot pri celoustnem statusu: zgornja vrsta je zgornja čeljust,
          spodnja vrsta spodnja. Leva stran prikaza je preiskovančeva <strong>desna</strong> stran.
          Ob izbiri več datotek hkrati se te razporedijo po imenu v mesta 1–10.
          Tapnite posamezno mesto za zamenjavo, vrtenje ali opis.
          Slike se ob shranjevanju stisnejo in zapišejo na ločen list <code>DentalExam_Slike</code>.
        </p>
      </div>
    `;

    this.bulkInput = panel.querySelector("#rtg-bulk-input") as HTMLInputElement;
    this.slotInput = panel.querySelector("#rtg-slot-input") as HTMLInputElement;
    this.opinionTextarea = panel.querySelector("#rtg-opinion") as HTMLTextAreaElement;
    this.statusEl = panel.querySelector("#rtg-status") as HTMLElement;
    this.mountEl = panel.querySelector("#rtg-mount") as HTMLElement;
    this.detailEl = panel.querySelector("#rtg-detail") as HTMLElement;

    const bulkBtn = panel.querySelector("#rtg-bulk-btn") as HTMLButtonElement;
    bulkBtn.addEventListener("click", () => {
      if (!this.requireSession()) return;
      if (this.bulkInput) {
        this.bulkInput.value = "";
        this.bulkInput.click();
      }
    });

    this.bulkInput.addEventListener("change", () => {
      const files = this.bulkInput?.files;
      if (files && files.length) void this.handleBulkFiles(Array.from(files));
    });

    this.slotInput.addEventListener("change", () => {
      const files = this.slotInput?.files;
      if (files && files.length && this.selectedSlot) {
        void this.handleSlotFile(this.selectedSlot, files[0]);
      }
    });

    this.opinionTextarea.addEventListener("input", () => {
      if (!this.session.hasSession()) return;
      this.session.getRadiographs().opinion = this.opinionTextarea?.value || "";
    });

    this.wireResetButton(panel.querySelector("#rtg-reset-btn") as HTMLButtonElement);
    this.renderMount();
    this.renderDetail();
    this.renderStatus();
  }

  onActivate(): void {
    if (!this.session.hasSession()) {
      this.setStatus("Ni aktivne seje. Začnite nov pregled na zavihku Začetek.", "warn");
      return;
    }
    const rg = this.session.getRadiographs();
    if (this.opinionTextarea) this.opinionTextarea.value = rg.opinion;
    this.renderMount();
    this.renderDetail();
    this.renderStatus();
  }

  onDeactivate(): void {
    if (!this.session.hasSession()) return;
    const rg = this.session.getRadiographs();
    rg.opinion = this.opinionTextarea?.value || "";
    this.session.touch();
  }

  // ── Rendering ───────────────────────────────────────────────────

  private renderMount(): void {
    if (!this.mountEl) return;
    const images = this.session.hasSession() ? this.session.getRadiographs().images : {};

    const renderRow = (row: "top" | "bottom") => {
      const cells = radiographSlotsByRow(row).map((slot) => {
        const img = images[slot.id];
        const selected = this.selectedSlot === slot.id ? " selected" : "";
        const filled = img ? " filled" : " empty";
        const body = img
          ? `<img class="rtg-thumb" src="${img.dataUrl}" alt="${esc(slot.region)}" />`
          : `<span class="rtg-slot-placeholder">＋</span>`;
        return `
          <button type="button" class="rtg-slot${filled}${selected}" data-slot="${slot.id}"
                  title="${esc(slot.region)}">
            <span class="rtg-slot-num">${slot.order}</span>
            <span class="rtg-slot-img">${body}</span>
            <span class="rtg-slot-label">${esc(slot.label)}</span>
          </button>`;
      }).join("");
      return `<div class="rtg-mount-row">${cells}</div>`;
    };

    this.mountEl.innerHTML = `
      <div class="rtg-jaw-label">Zgornja čeljust</div>
      ${renderRow("top")}
      ${renderRow("bottom")}
      <div class="rtg-jaw-label">Spodnja čeljust</div>
      <div class="rtg-side-hints"><span>preiskovančeva DESNA</span><span>preiskovančeva LEVA</span></div>
    `;

    this.mountEl.querySelectorAll<HTMLElement>(".rtg-slot").forEach((el) => {
      el.addEventListener("click", () => {
        if (!this.requireSession()) return;
        const id = el.dataset.slot as RadiographSlotId;
        this.selectedSlot = this.selectedSlot === id ? null : id;
        this.renderMount();
        this.renderDetail();
      });
    });
  }

  private renderDetail(): void {
    if (!this.detailEl) return;

    if (!this.selectedSlot || !this.session.hasSession()) {
      this.detailEl.innerHTML = "";
      return;
    }

    const slot = RADIOGRAPH_SLOTS.find((s) => s.id === this.selectedSlot) as RadiographSlotDef;
    const img = this.session.getRadiographs().images[slot.id];

    this.detailEl.innerHTML = `
      <div class="rtg-detail-panel">
        <div class="rtg-detail-header">
          <span class="rtg-detail-title">${slot.order}. ${esc(slot.region)}</span>
          <button type="button" class="rtg-detail-close" id="rtg-detail-close" aria-label="Zapri">✕</button>
        </div>
        <div class="rtg-detail-meta">Kvadrant ${esc(slot.quadrant)} · slika ${esc(slot.slika)}</div>

        <div class="rtg-preview">
          ${img
            ? `<img src="${img.dataUrl}" alt="${esc(slot.region)}" />`
            : `<div class="rtg-preview-empty">Ni izbrane slike</div>`}
        </div>

        ${img ? `<div class="rtg-file-meta">${esc(img.fileName)} · ${img.width}×${img.height} px · ${formatBytes(dataUrlBytes(img.dataUrl))}</div>` : ""}

        <div class="rtg-detail-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="rtg-pick">${img ? "Zamenjaj" : "Izberi sliko"}</button>
          <button type="button" class="btn btn-secondary btn-sm" id="rtg-rotate" ${img ? "" : "disabled"}>↻ Zavrti</button>
          <button type="button" class="btn btn-danger-outline btn-sm" id="rtg-clear" ${img ? "" : "disabled"}>Odstrani</button>
        </div>

        <div class="form-group">
          <label class="form-label" for="rtg-caption">Kratek opis mesta ${slot.order}</label>
          <input type="text" id="rtg-caption" class="form-input" maxlength="200"
                 placeholder="npr. periapikalna lezija ob 16"
                 value="${img ? esc(img.caption) : ""}" ${img ? "" : "disabled"} />
        </div>
      </div>
    `;

    (this.detailEl.querySelector("#rtg-detail-close") as HTMLButtonElement).addEventListener("click", () => {
      this.selectedSlot = null;
      this.renderMount();
      this.renderDetail();
    });

    (this.detailEl.querySelector("#rtg-pick") as HTMLButtonElement).addEventListener("click", () => {
      if (this.slotInput) {
        this.slotInput.value = "";
        this.slotInput.click();
      }
    });

    const rotateBtn = this.detailEl.querySelector("#rtg-rotate") as HTMLButtonElement;
    rotateBtn.addEventListener("click", () => { void this.rotateSelected(); });

    const clearBtn = this.detailEl.querySelector("#rtg-clear") as HTMLButtonElement;
    clearBtn.addEventListener("click", () => {
      const rg = this.session.getRadiographs();
      delete rg.images[slot.id];
      this.session.touch();
      this.renderMount();
      this.renderDetail();
      this.renderStatus();
    });

    const captionInput = this.detailEl.querySelector("#rtg-caption") as HTMLInputElement;
    captionInput.addEventListener("input", () => {
      const current = this.session.getRadiographs().images[slot.id];
      if (current) current.caption = captionInput.value;
    });
  }

  private renderStatus(): void {
    if (!this.session.hasSession()) {
      this.setStatus("Ni aktivne seje. Začnite nov pregled na zavihku Začetek.", "warn");
      return;
    }
    const images = this.session.getRadiographs().images;
    const ids = Object.keys(images) as RadiographSlotId[];
    const count = ids.length;
    if (count === 0) {
      this.setStatus("Naloženih 0 / 10 slik.", "info");
      return;
    }
    const bytes = ids.reduce((sum, id) => sum + dataUrlBytes(images[id]?.dataUrl || ""), 0);
    this.setStatus(`Naloženih ${count} / 10 slik · ${formatBytes(bytes)}`, count === 10 ? "ok" : "info");
  }

  private setStatus(text: string, kind: "info" | "ok" | "warn" | "error"): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = `rtg-status rtg-status-${kind}`;
  }

  // ── File handling ───────────────────────────────────────────────

  private async handleBulkFiles(files: File[]): Promise<void> {
    if (this.busy || !this.requireSession()) return;
    this.busy = true;

    const accepted = files.filter(isAcceptedImage).sort((a, b) => compareFileNames(a.name, b.name));
    const rejected = files.length - accepted.length;

    if (accepted.length === 0) {
      this.setStatus("Nobena izbrana datoteka ni JPEG ali PNG.", "error");
      this.busy = false;
      return;
    }

    const usable = accepted.slice(0, RADIOGRAPH_SLOTS.length);
    const rg = this.session.getRadiographs();
    let failed = 0;

    for (let i = 0; i < usable.length; i++) {
      const file = usable[i];
      const slot = RADIOGRAPH_SLOTS[i];
      this.setStatus(`Obdelujem sliko ${i + 1} / ${usable.length} …`, "info");
      try {
        const processed = await processImageFile(file);
        rg.images[slot.id] = {
          dataUrl: processed.dataUrl,
          fileName: file.name,
          width: processed.width,
          height: processed.height,
          caption: rg.images[slot.id]?.caption || "",
        };
      } catch {
        failed++;
      }
      // Paint each film as it lands: a full mount takes a few seconds on a
      // tablet, and a mount that stays empty until the end reads as a hang.
      this.renderMount();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    this.session.touch();
    this.renderMount();
    this.renderDetail();
    this.busy = false;

    const notes: string[] = [];
    if (rejected > 0) notes.push(`${rejected} datotek ni v formatu JPEG/PNG`);
    if (accepted.length > RADIOGRAPH_SLOTS.length) {
      notes.push(`upoštevanih prvih ${RADIOGRAPH_SLOTS.length} od ${accepted.length}`);
    }
    if (failed > 0) notes.push(`${failed} slik ni bilo mogoče odpreti`);

    this.renderStatus();
    if (notes.length && this.statusEl) {
      this.statusEl.textContent += ` — ${notes.join("; ")}.`;
      this.statusEl.className = "rtg-status rtg-status-warn";
    }
  }

  private async handleSlotFile(slotId: RadiographSlotId, file: File): Promise<void> {
    if (this.busy || !this.requireSession()) return;
    if (!isAcceptedImage(file)) {
      this.setStatus(`"${file.name}" ni v formatu JPEG ali PNG.`, "error");
      return;
    }
    this.busy = true;
    this.setStatus("Obdelujem sliko …", "info");
    try {
      const processed = await processImageFile(file);
      const rg = this.session.getRadiographs();
      rg.images[slotId] = {
        dataUrl: processed.dataUrl,
        fileName: file.name,
        width: processed.width,
        height: processed.height,
        caption: rg.images[slotId]?.caption || "",
      };
      this.session.touch();
      this.renderMount();
      this.renderDetail();
      this.renderStatus();
    } catch (e) {
      this.setStatus(e instanceof Error ? e.message : "Slike ni bilo mogoče obdelati.", "error");
    } finally {
      this.busy = false;
    }
  }

  private async rotateSelected(): Promise<void> {
    if (this.busy || !this.selectedSlot || !this.session.hasSession()) return;
    const rg = this.session.getRadiographs();
    const current: RadiographImage | undefined = rg.images[this.selectedSlot];
    if (!current) return;

    this.busy = true;
    try {
      const rotated = await rotateDataUrl(current.dataUrl, 90);
      current.dataUrl = rotated.dataUrl;
      current.width = rotated.width;
      current.height = rotated.height;
      this.session.touch();
      this.renderMount();
      this.renderDetail();
      this.renderStatus();
    } catch (e) {
      this.setStatus(e instanceof Error ? e.message : "Slike ni bilo mogoče zavrteti.", "error");
    } finally {
      this.busy = false;
    }
  }

  private requireSession(): boolean {
    if (!this.session.hasSession()) {
      this.setStatus("Ni aktivne seje. Začnite nov pregled na zavihku Začetek.", "warn");
      return false;
    }
    return true;
  }

  // Two-click confirmation — the Office iframe blocks window.confirm().
  private wireResetButton(btn: HTMLButtonElement | null): void {
    if (!btn) return;
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = "Ste prepričani?";
        btn.classList.add("btn-danger-armed");
        timer = setTimeout(() => {
          armed = false;
          btn.textContent = "Ponastavi slike";
          btn.classList.remove("btn-danger-armed");
        }, 3000);
        return;
      }
      if (timer) clearTimeout(timer);
      armed = false;
      btn.textContent = "Ponastavi slike";
      btn.classList.remove("btn-danger-armed");
      if (!this.session.hasSession()) return;

      const rg = this.session.getRadiographs();
      rg.images = {};
      rg.opinion = "";
      if (this.opinionTextarea) this.opinionTextarea.value = "";
      this.selectedSlot = null;
      this.session.touch();
      this.renderMount();
      this.renderDetail();
      this.renderStatus();
    });
  }
}
