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
