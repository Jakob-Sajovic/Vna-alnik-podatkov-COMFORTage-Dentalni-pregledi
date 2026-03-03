# DentalExam — Excel Office Add-in

An Excel task pane add-in for comprehensive dental examination data entry and PDF report generation. Built for the COMFORTage research project.

Works on desktop Excel (Windows/Mac), Excel on the web, and tablets (iPad/Android).

## Features

- **Patient data** — date, name, surname, anonymized code
- **Plaque index (VPI)** — interactive dental chart with 4-surface toggle per tooth, auto-calculated percentage
- **Bleeding index (GBI)** — same chart layout, separate data, auto-calculated percentage
- **ICDAS assessment** — 5-surface cross-pattern chart, two dropdowns per surface (restoration + caries codes), special case codes for missing/unerupted teeth
- **Probing depths** — 6-site measurements per tooth with color-coded area charts, furcation grading
- **OHIP-49 questionnaire** — 49-item oral health quality of life survey, 7 domains, Likert 0–4, auto-scored
- **Notes** — free-text diagnostic and qualitative observations
- **Excel persistence** — structured save/load to worksheet rows with JSON backup column
- **PDF reports** — print-friendly HTML report with charts, tables, and signature fields

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

Output goes to `dist/`. The production build replaces `localhost:3000` URLs in the manifest with the production URL configured in `webpack.config.js`.

## Deployment (GitHub Pages)

1. **Set your production URL** in `webpack.config.js`:

   ```js
   const urlProd = "https://<your-username>.github.io/<repo-name>/";
   ```

2. **Build for production:**

   ```bash
   npm run build
   ```

3. **Push the `dist/` folder** to the `gh-pages` branch (or configure GitHub Pages to serve from a branch/folder). You can use the [gh-pages](https://www.npmjs.com/package/gh-pages) npm package:

   ```bash
   npx gh-pages -d dist
   ```

4. **Enable GitHub Pages** in your repo settings (Settings > Pages > Source: `gh-pages` branch).

5. **Distribute the manifest** to colleagues. The production manifest is in `dist/manifest.xml` with the correct URLs. Each user loads it via:
   - **Desktop Excel:** Insert > Get Add-ins > Upload My Add-in > Browse to `manifest.xml`
   - **Excel Online:** Insert > Office Add-ins > Upload My Add-in
   - **Admin deployment:** Upload the manifest in the [Microsoft 365 admin center](https://admin.microsoft.com/) under Integrated Apps for org-wide rollout

## Project Structure

```
DentalExam/
  src/
    taskpane/          — HTML entry point, CSS, main TS bootstrapper
    tabs/              — Tab controllers (landing, patient, plaque-bleeding,
                         icdas, probing, notes, ohip, save-report)
    model/             — Types, constants (ICDAS codes, OHIP domains), session state
    dental/            — Tooth chart rendering, tooth outline SVGs
    excel/             — Save/load to Excel worksheets
    report/            — PDF report HTML generation
    commands/          — Ribbon command handlers
  assets/              — Icons, reference images
  manifest.xml         — Office Add-in manifest
  webpack.config.js    — Build configuration
```

## Technology

- TypeScript, vanilla HTML/CSS (no framework)
- Office JavaScript API (`Excel.run`, worksheets, ranges)
- Webpack + Babel
- PDF via browser print dialog

## License

MIT
