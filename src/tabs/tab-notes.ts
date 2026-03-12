import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";

export class NotesTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;

  private diagnosticTextarea: HTMLTextAreaElement | null = null;
  private qualitativeTextarea: HTMLTextAreaElement | null = null;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>Opombe</h2>
        <div class="tab-toolbar">
          <button class="btn btn-danger-outline btn-sm" id="notes-reset-btn">Ponastavi opombe</button>
        </div>
        <div class="form-group">
          <label class="form-label" for="notes-diagnostic">Diagnostične opombe</label>
          <textarea id="notes-diagnostic" class="form-textarea" rows="6"
            placeholder="Diagnostične ugotovitve, klinični opis ..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="notes-qualitative">Kvalitativne opombe</label>
          <textarea id="notes-qualitative" class="form-textarea" rows="6"
            placeholder="Kvalitativne opombe, vedenje preiskovanca ..."></textarea>
        </div>
        <p class="tab-help-footer">
          Vnesite diagnostične in kvalitativne opombe o pregledu. Besedilo se samodejno shrani ob prehodu na drug zavihek.
        </p>
      </div>
    `;

    this.diagnosticTextarea = panel.querySelector("#notes-diagnostic") as HTMLTextAreaElement;
    this.qualitativeTextarea = panel.querySelector("#notes-qualitative") as HTMLTextAreaElement;

    const resetBtn = panel.querySelector("#notes-reset-btn") as HTMLButtonElement;
    if (resetBtn) {
      let armed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      resetBtn.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          resetBtn.textContent = "Ste prepričani?";
          resetBtn.classList.add("btn-danger-armed");
          timer = setTimeout(() => { armed = false; resetBtn.textContent = "Ponastavi opombe"; resetBtn.classList.remove("btn-danger-armed"); }, 3000);
        } else {
          if (timer) clearTimeout(timer);
          armed = false;
          resetBtn.textContent = "Ponastavi opombe";
          resetBtn.classList.remove("btn-danger-armed");
          if (!this.session.hasSession()) return;
          const notes = this.session.getNotes();
          notes.diagnosticNotes = "";
          notes.qualitativeNotes = "";
          if (this.diagnosticTextarea) this.diagnosticTextarea.value = "";
          if (this.qualitativeTextarea) this.qualitativeTextarea.value = "";
          this.session.touch();
        }
      });
    }
  }

  onActivate(): void {
    if (!this.session.hasSession()) return;
    const notes = this.session.getNotes();

    if (this.diagnosticTextarea) this.diagnosticTextarea.value = notes.diagnosticNotes;
    if (this.qualitativeTextarea) this.qualitativeTextarea.value = notes.qualitativeNotes;
  }

  onDeactivate(): void {
    if (!this.session.hasSession()) return;
    const notes = this.session.getNotes();
    notes.diagnosticNotes = this.diagnosticTextarea?.value || "";
    notes.qualitativeNotes = this.qualitativeTextarea?.value || "";
    this.session.touch();
  }
}
