import { TabController, TabManager } from "./tab-manager";
import { SessionState } from "../model/session";
import { loadSessionFromExcel, loadSessionFromFile } from "../excel/excel-io";

export class LandingTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;
  private tabManager: TabManager | null = null;

  constructor(session: SessionState) {
    this.session = session;
  }

  setTabManager(tabManager: TabManager): void {
    this.tabManager = tabManager;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="landing-container">
        <h1 class="landing-title">Zobozdravstveni pregled</h1>
        <p class="landing-subtitle">Vnos podatkov za pregled</p>
        <div class="landing-actions">
          <button id="btn-new-session" class="btn btn-primary btn-large">
            <span class="btn-icon">➕</span>
            Nov pregled
          </button>
          <button id="btn-load-session" class="btn btn-secondary btn-large">
            <span class="btn-icon">📂</span>
            Naloži iz zvezka
          </button>
          <button id="btn-import-file" class="btn btn-secondary btn-large">
            <span class="btn-icon">📁</span>
            Uvozi iz datoteke
          </button>
          <input type="file" id="file-import-input" accept=".xlsx,.xls" style="display:none;" />
        </div>
        <div id="session-status" class="session-status"></div>
        <p class="tab-help-footer">
          Začnite nov pregled ali naložite obstoječega iz Excela. Po začetku se premaknite na naslednje zavihke za vnos podatkov.
        </p>
      </div>
    `;

    const btnNew = panel.querySelector("#btn-new-session") as HTMLButtonElement;
    const btnLoad = panel.querySelector("#btn-load-session") as HTMLButtonElement;
    const btnImport = panel.querySelector("#btn-import-file") as HTMLButtonElement;
    const fileInput = panel.querySelector("#file-import-input") as HTMLInputElement;

    btnNew.addEventListener("click", () => this.handleNewSession());
    btnLoad.addEventListener("click", () => this.handleLoadSession());
    btnImport.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => this.handleFileImport(fileInput));
  }

  onActivate(): void {
    this.updateStatus();
  }

  onDeactivate(): void {
    // Nothing to save
  }

  private handleNewSession(): void {
    this.session.newSession();
    this.updateStatus();
    if (this.tabManager) {
      this.tabManager.switchTo("patient");
    }
  }

  private async handleLoadSession(): Promise<void> {
    const status = this.panel?.querySelector("#session-status");

    if (status) {
      status.textContent = "Nalaganje ...";
      status.className = "session-status";
    }

    try {
      const data = await loadSessionFromExcel();
      if (data) {
        this.session.loadSession(data);
        this.updateStatus();
        if (this.tabManager) {
          this.tabManager.switchTo("patient");
        }
      } else {
        if (status) {
          status.textContent = "V delovnem zvezku ni shranjenih podatkov pregleda.";
        }
      }
    } catch (err) {
      if (status) {
        status.textContent = `Napaka pri nalaganju: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  private async handleFileImport(fileInput: HTMLInputElement): Promise<void> {
    const status = this.panel?.querySelector("#session-status");
    const file = fileInput.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    fileInput.value = "";

    if (status) {
      status.textContent = "Uvažanje datoteke ...";
      status.className = "session-status";
    }

    try {
      const base64 = await this.readFileAsBase64(file);
      const data = await loadSessionFromFile(base64);
      if (data) {
        this.session.loadSession(data);
        this.updateStatus();
        if (this.tabManager) {
          this.tabManager.switchTo("patient");
        }
      } else {
        if (status) {
          status.textContent = "V izbrani datoteki ni shranjenih podatkov pregleda.";
        }
      }
    } catch (err) {
      if (status) {
        status.textContent = `Napaka pri uvozu: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g. "data:application/...;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Napaka pri branju datoteke."));
      reader.readAsDataURL(file);
    });
  }

  private updateStatus(): void {
    const status = this.panel?.querySelector("#session-status");
    if (!status) return;

    if (this.session.hasSession()) {
      const s = this.session.getSession();
      status.textContent = `Aktiven pregled: ${s.sessionId} (ustvarjen ${new Date(s.createdAt).toLocaleString("sl-SI")})`;
      status.className = "session-status active";
    } else {
      status.textContent = "Ni aktivnega pregleda.";
      status.className = "session-status";
    }
  }
}
