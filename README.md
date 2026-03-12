# Vnašalnik podatkov COMFORTage — Dentalni pregledi

Excel add-in for dental examination data input, saving, loading and PDF report generation. Built for the COMFORTage research project.

Works on desktop Excel (Windows/Mac), Excel on the web, and tablets (iPad/Android via Excel Online in Chrome).

**Live preview:** [https://jakob-sajovic.github.io/Vna-alnik-podatkov-COMFORTage-Dentalni-pregledi/](https://jakob-sajovic.github.io/Vna-alnik-podatkov-COMFORTage-Dentalni-pregledi/)

## Features

- **Patient data** — date, name, surname, anonymized code
- **Plaque index (VPI)** — interactive dental chart with 4-surface toggle per tooth, explicit missing-tooth buttons (✕), auto-calculated percentage
- **Bleeding index (GBI)** — same chart layout, separate data, auto-calculated percentage; missing tooth state synced from VPI
- **ICDAS assessment** — 5-surface cross-pattern chart, two dropdowns per surface (restoration + caries codes), special case codes for missing/unerupted teeth; code 60 (Popolna prevleka) preserves plaque/bleeding/probing data; bulk-set applies independently per code type
- **Probing depths** — 6-site measurements per tooth with color-coded area charts, furcation grading
- **Root caries** — per-tooth root caries assessment
- **FDI questionnaire** — FDI Periodontal Disease Profile (8 questions); Q5–Q8 auto-calculated from existing clinical data (tooth loss, VPI%, GBI%, probing depths)
- **OHIP-49 questionnaire** — 49-item oral health quality of life survey, 7 domains, Likert 0–4, auto-scored
- **Notes** — free-text diagnostic and qualitative observations
- **Cross-tab sync** — marking a tooth missing in VPI automatically updates bleeding, probing, and ICDAS (defaults to special code 97)
- **Reset with confirmation** — all reset buttons use two-click confirmation (no browser dialogs)
- **Excel persistence** — structured save/load to worksheet rows with JSON backup column
- **PDF reports** — print-friendly HTML report with dental charts, tables, FDI summary, and signature fields

UI language is **Slovenian**.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later)
- npm (included with Node.js)

## Setup

```bash
cd DentalExam
npm install
```

## Development

Start the local dev server with HTTPS on port 3000:

```bash
npm run dev-server
```

Then sideload the add-in in Excel:

- **Windows:** `npm start`
- **Mac:** Follow [Microsoft's sideloading guide](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac)
- **Web:** Upload `manifest.xml` via Insert > Office Add-ins > Upload My Add-in

## Build

```bash
npm run build
```

Output goes to `dist/`. The production build replaces `localhost:3000` URLs in the manifest with the GitHub Pages production URL configured in `webpack.config.js`.

## Deployment (GitHub Pages)

The add-in is hosted on GitHub Pages at `https://jakob-sajovic.github.io/Vna-alnik-podatkov-COMFORTage-Dentalni-pregledi/`.

1. **Build for production:**

   ```bash
   npm run build
   ```

2. **Deploy to `gh-pages` branch** (from PowerShell on Windows):

   ```powershell
   node node_modules/gh-pages/bin/gh-pages.js -d dist
   ```

   > Note: `npx gh-pages -d dist` may not work on Windows; use the full path above.

3. **Enable GitHub Pages** in repo settings (Settings > Pages > Source: `gh-pages` branch) if not already enabled.

4. **Distribute the manifest** — users can download `manifest.xml` from the GitHub Pages URL and sideload it:
   - **Desktop Excel:** Insert > Get Add-ins > Upload My Add-in > Browse to `manifest.xml`
   - **Excel Online:** Insert > Office Add-ins > Upload My Add-in
   - **Android tablet:** Open the spreadsheet in Excel Online via Chrome (**"Desktop site" must be unchecked** in Chrome settings or the add-in won't load)
   - **Admin deployment:** Upload the manifest in the [Microsoft 365 admin center](https://admin.microsoft.com/) under Integrated Apps for org-wide rollout

See also `Navodila za namestitev dodatka.docx` for detailed installation instructions in Slovenian.

## Project Structure

```
DentalExam/
  src/
    taskpane/
      taskpane.html      — main HTML (tab container + all tab panels)
      taskpane.ts         — entry point, tab registration, bootstrap
      taskpane.css        — all styling
    index.html             — root redirect to taskpane.html (for GitHub Pages)
    tabs/
      tab-landing.ts       — session management (new/load/close)
      tab-patient.ts       — patient demographics
      tab-plaque-bleeding.ts — VPI & GBI charts with missing-tooth buttons
      tab-icdas.ts         — ICDAS assessment with special codes & code 60
      tab-probing.ts       — probing depths & furcation
      tab-notes.ts         — free-text notes
      tab-ohip.ts          — OHIP-49 questionnaire
      tab-fdi.ts           — FDI Periodontal Disease Profile (auto-calc)
      tab-save-report.ts   — save to Excel & summary view
      tab-manager.ts       — tab switching & lifecycle
    model/
      types.ts             — TypeScript interfaces (session, tooth data, FDI, etc.)
      constants.ts         — ICDAS codes, OHIP domains, tooth arrays, tab defs
      session.ts           — singleton session state, cross-tab tooth sync
    dental/
      tooth-map.ts         — FDI tooth numbering helpers
      tooth-outlines.ts    — SVG tooth outline paths
      chart-renderer.ts    — interactive tooth chart rendering
    excel/
      excel-io.ts          — serialize/deserialize session ↔ Excel rows
    report/
      report-generator.ts  — print-friendly HTML report generation
    commands/
      commands.html        — ribbon command page
      commands.ts          — ribbon command handlers
  assets/                  — icons and reference images
  manifest.xml             — Office Add-in XML manifest
  webpack.config.js        — build configuration
  package.json             — dependencies and scripts
```

## Technology

- TypeScript, vanilla HTML/CSS (no framework)
- Office JavaScript API (`Excel.run`, worksheets, ranges)
- Webpack + Babel
- PDF via browser print dialog

## License

MIT
