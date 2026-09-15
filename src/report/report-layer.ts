import { ExaminationSession } from "../model/types";
import { buildReportBody, REPORT_CSS, reportFileTitle } from "./report-generator";

let closeActive: (() => void) | null = null;

/** iPhone, iPod, and iPadOS (which reports itself as a Mac with a touch screen). */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * The PWA's report: a full-screen layer inside the app instead of the add-in's
 * print window.
 *
 * On an app installed to the iOS home screen, window.open hands the page to
 * Safari with no way back, and window.print() does nothing. So the report is
 * shown in place, the PDF is generated here (report-pdf.ts), and on iOS the
 * file goes to the share sheet (Save to Files, Print, Mail). Elsewhere it
 * downloads, and printing the layer itself stays available.
 */
export function openReportLayer(session: ExaminationSession): void {
  closeActive?.();

  const ios = isIOS();
  const fileTitle = reportFileTitle(session);

  const overlay = document.createElement("div");
  overlay.className = "report-overlay";
  overlay.innerHTML = `
    <div class="report-toolbar">
      <button type="button" class="btn btn-secondary" data-act="close">← Nazaj</button>
      <span class="report-toolbar-title">Poročilo</span>
      ${ios ? "" : `<button type="button" class="btn btn-secondary" data-act="print">🖨 Natisni</button>`}
      <button type="button" class="btn btn-primary" data-act="pdf" disabled>Pripravljam PDF …</button>
    </div>
    <div class="report-status" hidden></div>
    <div class="report-scroll"><div class="report-sheet"></div></div>`;

  // Shadow root keeps the report's styles and the app's styles apart.
  const sheet = overlay.querySelector(".report-sheet") as HTMLElement;
  const root = sheet.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${REPORT_CSS}</style>${buildReportBody(session)}`;

  const previousTitle = document.title;
  // The print dialog proposes the document title as the PDF file name.
  document.title = fileTitle;
  document.body.classList.add("report-open");
  document.body.appendChild(overlay);

  const pdfBtn = overlay.querySelector('[data-act="pdf"]') as HTMLButtonElement;
  const status = overlay.querySelector(".report-status") as HTMLElement;
  const showStatus = (text: string) => {
    status.textContent = text;
    status.hidden = !text;
  };

  const remove = () => {
    window.removeEventListener("popstate", onPop);
    overlay.remove();
    document.body.classList.remove("report-open");
    document.title = previousTitle;
    closeActive = null;
  };
  const onPop = () => remove();

  // A history entry lets the Android back button / back gesture close the report.
  let pushed = false;
  try {
    history.pushState({ report: true }, "");
    pushed = true;
    window.addEventListener("popstate", onPop);
  } catch {
    /* no history API — the Nazaj button still works */
  }
  closeActive = () => (pushed ? history.back() : remove());

  overlay.querySelector('[data-act="close"]')?.addEventListener("click", () => closeActive?.());
  overlay.querySelector('[data-act="print"]')?.addEventListener("click", () => window.print());

  // Build the PDF up front. iOS only opens the share sheet from inside the tap
  // itself, so the file has to be ready before the button is pressed. The
  // writer measures the laid-out report, so wait a frame for layout first.
  let file: File | null = null;
  const reportEl = root.querySelector(".report") as HTMLElement;
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    .then(() => import(/* webpackChunkName: "report-pdf" */ "./report-pdf"))
    .then(({ renderReportPdf }) => renderReportPdf(reportEl, fileTitle))
    .then((blob) => {
      file = new File([blob], `${fileTitle}.pdf`, { type: "application/pdf" });
      if (!overlay.isConnected) return;
      pdfBtn.disabled = false;
      pdfBtn.textContent = ios ? "📤 Shrani / deli PDF" : "📄 Shrani PDF";
    })
    .catch((err: unknown) => {
      pdfBtn.textContent = "PDF ni na voljo";
      showStatus(
        `PDF ni bilo mogoče pripraviti: ${err instanceof Error ? err.message : String(err)}. ` +
          "Če ste brez povezave, aplikacijo enkrat odprite s povezavo."
      );
    });

  pdfBtn.addEventListener("click", () => {
    if (!file) return;
    const shareData = { files: [file], title: fileTitle };
    if (ios && navigator.canShare?.(shareData)) {
      navigator.share(shareData).catch((err: unknown) => {
        // Closing the share sheet is not an error worth reporting.
        if (err instanceof DOMException && err.name === "AbortError") return;
        downloadFile(file as File);
      });
      return;
    }
    downloadFile(file);
    showStatus(`PDF je shranjen v Prenose kot ${file.name}.`);
  });
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
