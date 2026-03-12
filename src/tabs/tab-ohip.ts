import { TabController } from "./tab-manager";
import { SessionState } from "../model/session";
import { OHIP_DOMAINS, OHIP_LIKERT_LABELS } from "../model/constants";
import { OhipScore } from "../model/types";

export class OhipTabController implements TabController {
  private panel: HTMLElement | null = null;
  private session: SessionState;
  private scoreBar: HTMLElement | null = null;
  private domainScoreEls: HTMLElement[] = [];

  constructor(session: SessionState) {
    this.session = session;
  }

  init(panel: HTMLElement): void {
    this.panel = panel;
    panel.innerHTML = `
      <div class="tab-content-inner">
        <h2>OHIP-49</h2>
        <div class="tab-toolbar">
          <button class="btn btn-danger-outline btn-sm" id="ohip-reset-btn">Ponastavi OHIP</button>
        </div>
        <div class="ohip-score-bar" id="ohip-score-bar">Skupaj: 0 / 196</div>
        <div id="ohip-domains"></div>
        <p class="tab-help-footer">
          Za vsako vprašanje izberite oceno od 0 (nikoli) do 4 (zelo pogosto). Rezultati se izračunajo samodejno po podkategorijah in skupaj.
        </p>
      </div>
    `;

    this.scoreBar = panel.querySelector("#ohip-score-bar") as HTMLElement;
    const container = panel.querySelector("#ohip-domains") as HTMLElement;
    this.domainScoreEls = [];

    for (const domain of OHIP_DOMAINS) {
      const domainEl = document.createElement("div");
      domainEl.className = "ohip-domain";

      // Domain header with name and subtotal
      const header = document.createElement("div");
      header.className = "ohip-domain-header";

      const nameEl = document.createElement("span");
      nameEl.className = "ohip-domain-name";
      nameEl.textContent = domain.name;

      const scoreEl = document.createElement("span");
      scoreEl.className = "ohip-domain-score";
      scoreEl.dataset.domainStart = String(domain.startItem);
      scoreEl.dataset.domainEnd = String(domain.endItem);
      this.domainScoreEls.push(scoreEl);

      header.appendChild(nameEl);
      header.appendChild(scoreEl);
      domainEl.appendChild(header);

      // Items in this domain
      for (let itemNum = domain.startItem; itemNum <= domain.endItem; itemNum++) {
        const itemEl = document.createElement("div");
        itemEl.className = "ohip-item";

        const numEl = document.createElement("span");
        numEl.className = "ohip-item-number";
        numEl.textContent = String(itemNum);

        const radioGroup = document.createElement("div");
        radioGroup.className = "ohip-radio-group";

        for (let score = 0; score <= 4; score++) {
          const btn = document.createElement("button");
          btn.className = "ohip-radio-btn";
          btn.type = "button";
          btn.textContent = String(score);
          btn.title = OHIP_LIKERT_LABELS[score];
          btn.dataset.itemIndex = String(itemNum - 1); // 0-based index
          btn.dataset.score = String(score);
          radioGroup.appendChild(btn);
        }

        itemEl.appendChild(numEl);
        itemEl.appendChild(radioGroup);
        domainEl.appendChild(itemEl);
      }

      container.appendChild(domainEl);
    }

    // Reset button with two-click confirmation
    const resetBtn = panel.querySelector("#ohip-reset-btn") as HTMLButtonElement;
    if (resetBtn) {
      let armed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      resetBtn.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          resetBtn.textContent = "Ste prepričani?";
          resetBtn.classList.add("btn-danger-armed");
          timer = setTimeout(() => { armed = false; resetBtn.textContent = "Ponastavi OHIP"; resetBtn.classList.remove("btn-danger-armed"); }, 3000);
        } else {
          if (timer) clearTimeout(timer);
          armed = false;
          resetBtn.textContent = "Ponastavi OHIP";
          resetBtn.classList.remove("btn-danger-armed");
          if (!this.session.hasSession()) return;
          const ohip = this.session.getOhip();
          for (let i = 0; i < 49; i++) ohip[i] = null;
          this.session.touch();
          const buttons = this.panel?.querySelectorAll(".ohip-radio-btn") as NodeListOf<HTMLElement>;
          buttons.forEach((btn) => btn.classList.remove("selected"));
          this.updateScores();
        }
      });
    }

    // Event delegation: single listener for all radio buttons
    container.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("ohip-radio-btn")) return;

      const itemIndex = parseInt(target.dataset.itemIndex || "0", 10);
      const score = parseInt(target.dataset.score || "0", 10) as OhipScore;

      if (!this.session.hasSession()) return;

      const ohip = this.session.getOhip();
      ohip[itemIndex] = score;
      this.session.touch();

      // Update selected state in this radio group
      const group = target.parentElement;
      if (group) {
        group.querySelectorAll(".ohip-radio-btn").forEach((btn) =>
          btn.classList.remove("selected")
        );
      }
      target.classList.add("selected");

      this.updateScores();
    });
  }

  onActivate(): void {
    if (!this.session.hasSession()) return;
    const ohip = this.session.getOhip();

    // Restore button states from session data
    const buttons = this.panel?.querySelectorAll(".ohip-radio-btn") as NodeListOf<HTMLElement>;
    buttons.forEach((btn) => {
      const itemIndex = parseInt(btn.dataset.itemIndex || "0", 10);
      const score = parseInt(btn.dataset.score || "0", 10);
      btn.classList.toggle("selected", ohip[itemIndex] === score);
    });

    this.updateScores();
  }

  onDeactivate(): void {
    // Data is written immediately on click, nothing to do
  }

  private updateScores(): void {
    if (!this.session.hasSession()) return;
    const ohip = this.session.getOhip();

    // Total score
    let total = 0;
    let answered = 0;
    for (const val of ohip) {
      if (val !== null) {
        total += val;
        answered++;
      }
    }

    if (this.scoreBar) {
      this.scoreBar.textContent = `Skupaj: ${total} / 196` +
        (answered < 49 ? ` (${answered}/49 odgovorov)` : "");
    }

    // Domain subtotals
    for (const el of this.domainScoreEls) {
      const start = parseInt(el.dataset.domainStart || "1", 10) - 1;
      const end = parseInt(el.dataset.domainEnd || "1", 10);
      let domainTotal = 0;
      let domainMax = 0;
      for (let i = start; i < end; i++) {
        domainMax += 4;
        if (ohip[i] !== null) {
          domainTotal += ohip[i]!;
        }
      }
      el.textContent = `${domainTotal} / ${domainMax}`;
    }
  }
}
