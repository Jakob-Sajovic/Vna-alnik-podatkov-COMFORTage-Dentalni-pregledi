import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";

export class PatientTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;

  // Form field references
  private dateInput: HTMLInputElement | null = null;
  private firstNameInput: HTMLInputElement | null = null;
  private lastNameInput: HTMLInputElement | null = null;
  private codeInput: HTMLInputElement | null = null;
  private examinerFirstNameInput: HTMLInputElement | null = null;
  private examinerLastNameInput: HTMLInputElement | null = null;
  private validationBanner: HTMLElement | null = null;

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>Podatki o preiskovancu</h2>
        <div id="patient-validation" class="validation-banner">
          Vnesite ime in priimek ali kodo preiskovanca.
        </div>
        <div class="form-group">
          <label class="form-label" for="patient-date">Datum pregleda</label>
          <input type="date" id="patient-date" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label" for="patient-firstname">Ime</label>
          <input type="text" id="patient-firstname" class="form-input" placeholder="Ime preiskovanca" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label" for="patient-lastname">Priimek</label>
          <input type="text" id="patient-lastname" class="form-input" placeholder="Priimek preiskovanca" autocomplete="off" />
        </div>
        <p class="form-hint" style="text-align:center; margin: -8px 0 16px;">— ali —</p>
        <div class="form-group">
          <label class="form-label" for="patient-code">Koda preiskovanca</label>
          <input type="text" id="patient-code" class="form-input" placeholder="Šifra / koda" autocomplete="off" />
        </div>
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #e0e0e0;" />
        <h3 style="font-size: 13px; color: #323130; margin-bottom: 8px;">Izvajalec pregleda</h3>
        <div class="form-group">
          <label class="form-label" for="examiner-firstname">Ime izvajalca</label>
          <input type="text" id="examiner-firstname" class="form-input" placeholder="Ime" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label" for="examiner-lastname">Priimek izvajalca</label>
          <input type="text" id="examiner-lastname" class="form-input" placeholder="Priimek" autocomplete="off" />
        </div>
        <p class="tab-help-footer">
          Vnesite datum pregleda in podatke o preiskovancu. Obvezno je ime in priimek ali koda preiskovanca.
        </p>
      </div>
    `;

    this.dateInput = panel.querySelector("#patient-date") as HTMLInputElement;
    this.firstNameInput = panel.querySelector("#patient-firstname") as HTMLInputElement;
    this.lastNameInput = panel.querySelector("#patient-lastname") as HTMLInputElement;
    this.codeInput = panel.querySelector("#patient-code") as HTMLInputElement;
    this.examinerFirstNameInput = panel.querySelector("#examiner-firstname") as HTMLInputElement;
    this.examinerLastNameInput = panel.querySelector("#examiner-lastname") as HTMLInputElement;
    this.validationBanner = panel.querySelector("#patient-validation") as HTMLElement;

    // Live validation on input
    const validate = () => this.validateAndShow();
    this.firstNameInput.addEventListener("input", validate);
    this.lastNameInput.addEventListener("input", validate);
    this.codeInput.addEventListener("input", validate);
  }

  onActivate(): void {
    if (!this.session.hasSession()) return;
    const patient = this.session.getPatient();
    const examiner = this.session.getExaminer();

    if (this.dateInput) this.dateInput.value = patient.date;
    if (this.firstNameInput) this.firstNameInput.value = patient.firstName;
    if (this.lastNameInput) this.lastNameInput.value = patient.lastName;
    if (this.codeInput) this.codeInput.value = patient.code;
    if (this.examinerFirstNameInput) this.examinerFirstNameInput.value = examiner.firstName;
    if (this.examinerLastNameInput) this.examinerLastNameInput.value = examiner.lastName;

    this.validateAndShow();
  }

  onDeactivate(): void {
    if (!this.session.hasSession()) return;
    this.writeToSession();
  }

  private writeToSession(): void {
    const patient = this.session.getPatient();
    patient.date = this.dateInput?.value || patient.date;
    patient.firstName = this.firstNameInput?.value.trim() || "";
    patient.lastName = this.lastNameInput?.value.trim() || "";
    patient.code = this.codeInput?.value.trim() || "";

    const examiner = this.session.getExaminer();
    examiner.firstName = this.examinerFirstNameInput?.value.trim() || "";
    examiner.lastName = this.examinerLastNameInput?.value.trim() || "";
    this.session.touch();
  }

  private validateAndShow(): void {
    const firstName = this.firstNameInput?.value.trim() || "";
    const lastName = this.lastNameInput?.value.trim() || "";
    const code = this.codeInput?.value.trim() || "";

    const isValid = (firstName !== "" && lastName !== "") || code !== "";

    if (this.validationBanner) {
      this.validationBanner.classList.toggle("visible", !isValid);
    }
  }
}
