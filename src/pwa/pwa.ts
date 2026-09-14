/* global document, window, navigator */

import "../taskpane/taskpane.css";
import "./pwa.css";
import { SessionState } from "../model/session";
import { TabManager } from "../tabs/tab-manager";
import { PwaLandingTabController } from "./tab-pwa-landing";
import { PatientTabController } from "../tabs/tab-patient";
import { PlaqueBleedingTabController } from "../tabs/tab-plaque-bleeding";
import { ICDASTabController } from "../tabs/tab-icdas";
import { ProbingTabController } from "../tabs/tab-probing";
import { RadiographsTabController } from "../tabs/tab-radiographs";
import { NotesTabController } from "../tabs/tab-notes";
import { OhipTabController } from "../tabs/tab-ohip";
import { FdiTabController } from "../tabs/tab-fdi";
import { SaveReportTabController } from "../tabs/tab-save-report";
import { PwaStore } from "./pwa-store";

const AUTOSAVE_DEBOUNCE_MS = 1500;

function initApp(): void {
  const tabBar = document.getElementById("tab-bar") as HTMLElement;
  const panelContainer = document.getElementById("panel-container") as HTMLElement;

  const session = SessionState.getInstance();
  const store = new PwaStore();
  const tabManager = new TabManager(tabBar, panelContainer);

  const landingCtrl = new PwaLandingTabController(session, store);
  landingCtrl.setTabManager(tabManager);

  tabManager.registerController("landing", landingCtrl);
  tabManager.registerController("patient", new PatientTabController(session));
  tabManager.registerController("plaque-bleeding", new PlaqueBleedingTabController(session));
  tabManager.registerController("icdas", new ICDASTabController(session));
  tabManager.registerController("probing", new ProbingTabController(session));
  tabManager.registerController("radiographs", new RadiographsTabController(session));
  tabManager.registerController("notes", new NotesTabController(session));
  tabManager.registerController("ohip", new OhipTabController(session));
  tabManager.registerController("fdi", new FdiTabController(session));
  tabManager.registerController("save-report", new SaveReportTabController(session, store));

  wireAutosave(session, store);
  tabManager.switchTo("landing");
}

/**
 * The add-in relies on the examiner pressing Save. Here the app owns the only
 * copy of the data until it is exported, so every change is written back to
 * IndexedDB — debounced, and again on the way out of the page.
 */
function wireAutosave(session: SessionState, store: PwaStore): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const indicator = document.getElementById("autosave-indicator");

  const flush = () => {
    if (!session.hasSession()) return;
    store.local
      .autosave(session.getSession())
      .then(() => {
        if (indicator) {
          indicator.textContent = `shranjeno ${new Date().toLocaleTimeString("sl-SI")}`;
          indicator.className = "autosave-indicator ok";
        }
      })
      .catch((err: unknown) => {
        if (indicator) {
          indicator.textContent = `NI SHRANJENO: ${err instanceof Error ? err.message : String(err)}`;
          indicator.className = "autosave-indicator error";
        }
      });
  };

  session.onChange(() => {
    if (indicator && session.hasSession()) {
      indicator.textContent = "shranjujem ...";
      indicator.className = "autosave-indicator pending";
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  });

  // Leaving the page, backgrounding the app, or switching apps on a tablet
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// Offline support. Registered after load so it never delays first paint.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  });
}
