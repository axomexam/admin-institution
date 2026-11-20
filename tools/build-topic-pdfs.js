#!/usr/bin/env node
"use strict";

/*
 * tools/build-topic-pdfs.js
 *
 * Builds one downloadable PDF per exam topic, per language, from the committed
 * question banks in data/exams/<exam>/<section>/<group>/<topic>/question-*.json.
 * A PDF holds a single language: the reader picks English or Assamese before
 * the download starts.
 *
 * Every page carries the axomexam.in watermark, the axomexam.in wordmark and
 * the axomexam logo in the top corner, and a page number in the footer.
 *
 * Output:
 *   data/download/<exam>/<section>/<group>/<topic>.pdf      English topic PDF
 *   data/download/<exam>/<section>/<group>/<topic>-as.pdf   Assamese topic PDF
 *   data/institution/manifest.json                          portal manifest
 *
 * Usage:
 *   node tools/build-topic-pdfs.js                     # both ADRE books
 *   node tools/build-topic-pdfs.js --exam adre-grade-3
 *   node tools/build-topic-pdfs.js --only general-english/vocabulary/synonyms
 *   node tools/build-topic-pdfs.js --check             # report, write nothing
 *
 * Only the exams in DOWNLOADABLE_EXAMS are built. Everything else in
 * data/exams/ stays unpublished until it is switched on here.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..");
const EXAMS_DIR = path.join(ROOT, "data", "exams");
const OUT_DIR = path.join(ROOT, "data", "download");
const MANIFEST = path.join(ROOT, "data", "institution", "manifest.json");

const DOWNLOADABLE_EXAMS = ["adre-grade-3", "adre-grade-4"];

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const CHECK = argv.includes("--check");
const MANIFEST_ONLY = argv.includes("--manifest-only");
const ONLY = arg("--only");
const EXAM_ARG = arg("--exam");
const CONCURRENCY = Number(arg("--concurrency") || Math.min(6, Math.max(2, os.cpus().length)));

const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

const BRAND = "axomexam.in";
const SITE = "https://axomexam.in";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ---------------- question bank ---------------- */

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function collectTopics(examId) {
  const examDir = path.join(EXAMS_DIR, examId);
  const topics = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/^question-\d+\.json$/.test(entry.name)) continue;
      const rel = path.relative(examDir, dir).split(path.sep).join("/");
      let questions = [];
      for (const f of fs
        .readdirSync(dir)
        .filter((n) => /^question-\d+\.json$/.test(n))
        .sort()) {
        const arr = readJSON(path.join(dir, f));
        if (Array.isArray(arr)) questions = questions.concat(arr);
      }
      topics.push({ path: rel, dir, questions });
      break; // one topic folder = one PDF, gathered from all its question files
    }
  };
  walk(examDir);
  return topics.sort((a, b) => a.path.localeCompare(b.path));
}

/* Section/sub-category titles come from data/exams/index.json, which is the
 * single source of truth for the exam tree. */
function loadExamTree() {
  const idx = readJSON(path.join(EXAMS_DIR, "index.json"));
  const tree = {};
  for (const exam of idx.exams || []) tree[exam.id] = exam;
  return tree;
}

function titleIndex(exam) {
  const map = {};
  const walk = (secs, prefix) => {
    for (const s of secs || []) {
      const p = prefix ? `${prefix}/${s.id}` : s.id;
      map[p] = s.title || { en: s.id, as: s.id };
      if (s.subcategories) walk(s.subcategories, p);
    }
  };
  walk(exam.sections || [], "");
  return map;
}

/* ---------------- HTML ---------------- */

const LOGO_SVG = `<svg class="wm-logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#4f46e5"/><text x="50" y="70" font-size="54" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="700">A</text></svg>`;

/* A PDF carries one language only, chosen by the reader before download. */
const LANGS = ["en", "as"];
const LANG_LABEL = { en: "English", as: "অসমীয়া" };
const LANG_NAME = { en: "English", as: "Assamese" };

function watermarkMarkup() {
  const row = `<span>${BRAND}</span><span>${BRAND}</span><span>${BRAND}</span>`;
  return `<div class="wm" aria-hidden="true">${Array.from({ length: 12 }, () => `<div class="wm-row">${row}</div>`).join("")}</div>`;
}

function coverPage({ examTitle, topicTitle, count, lang }) {
  const facts =
    lang === "as"
      ? [
          `<b>${count}</b> টা প্ৰশ্ন উত্তৰসহ`,
          "অসমীয়া মাধ্যম",
          "বিষয়ভিত্তিক অনুশীলন সংকলন",
          "শ্ৰেণীকোঠা আৰু স্ব-অধ্যয়নৰ বাবে বিনামূলীয়া",
        ]
      : [
          `<b>${count}</b> questions with answers`,
          "English medium",
          "Topic-wise practice set",
          "Free for classroom and self-study use",
        ];
  return `<section class="cover">
    <div class="cover-brand">${LOGO_SVG}<span>${BRAND}</span></div>
    <div class="cover-kicker">${esc(examTitle)}</div>
    <h1 class="cover-title${lang === "as" ? " as-title" : ""}">${esc(topicTitle)}</h1>
    <div class="cover-rule"></div>
    <ul class="cover-facts${lang === "as" ? " as-body" : ""}">${facts
      .map((f) => `<li>${f}</li>`)
      .join("")}</ul>
    <div class="cover-foot">
      <span>${SITE}</span>
      <span>${LANG_NAME[lang]} · ${new Date().toISOString().slice(0, 10)}</span>
    </div>
  </section>`;
}

const optLabel = (i) => String.fromCharCode(65 + i);

/* Some options have no Assamese string; fall back to English rather than
 * printing an empty choice. */
const pick = (obj, lang) => {
  if (!obj) return "";
  const v = obj[lang];
  return (v && String(v).trim()) || obj.en || "";
};

/* Inline SVG figures come from the same question bank the site renders, so they
 * get the same scrub: no scripts, no event handlers, no javascript: URLs. */
const sanitizeMedia = (html) => {
  if (html == null) return "";
  return String(html)
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*script[\s\S]*$/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "");
};

function renderQuestion(q, n, lang) {
  const qText = pick(q.q, lang);
  const opts = Array.isArray(q.options) ? q.options : [];
  const correct = Number.isInteger(q.correct) ? q.correct : -1;
  const exText = pick(q.explanation, lang);
  const answerText = pick(opts[correct], lang);

  const qFig = q.fig ? sanitizeMedia(q.fig) : "";
  const hasFigOpts = opts.some((o) => o && typeof o === "object" && o.fig);
  const hasFig = Boolean(qFig) || hasFigOpts;

  const optionRows = opts
    .map((o, i) => {
      const text = pick(o, lang);
      const fig = o && typeof o === "object" && o.fig ? sanitizeMedia(o.fig) : "";
      return `<li class="opt${fig ? " opt-fig" : ""}">
        <span class="opt-key">${optLabel(i)}</span>
        <span class="opt-body">${fig ? `<span class="opt-fig-media">${fig}</span>` : ""}${
        text ? `<span>${esc(text)}</span>` : ""
      }</span>
      </li>`;
    })
    .join("");

  const answerWord = lang === "as" ? "উত্তৰ" : "Answer";

  return `<article class="q">
    <div class="q-num">${n}</div>
    <div class="q-body">
      <p class="q-text">${esc(qText)}</p>
      ${qFig ? `<div class="q-fig">${qFig}</div>` : ""}
      <ul class="opts${hasFig ? " opts-fig" : ""}">${optionRows}</ul>
      <p class="ans"><span class="ans-tag">${answerWord}</span> <b>${optLabel(correct)}</b>${
        answerText ? ` — ${esc(answerText)}` : ""
      }</p>
      ${exText ? `<div class="exp"><p>${esc(exText)}</p></div>` : ""}
    </div>
  </article>`;
}

const CSS = `
@page { size: A4; margin: 18mm 14mm 15mm 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Inter", "DejaVu Sans", Arial, Helvetica, sans-serif;
  font-size: 9.1pt; line-height: 1.36; color: #0f172a;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
/* Assamese editions set the whole body in the Bengali face. */
body.lang-as { font-family: "Noto Sans Bengali", "Noto Serif Bengali", sans-serif; font-size: 9.4pt; line-height: 1.55; }
.as-title, .as-body { font-family: "Noto Sans Bengali", "Noto Serif Bengali", sans-serif; }

/* diagonal repeating watermark, printed on every page.
 * z-index -1 keeps it behind the page content: at 0 a positioned layer paints
 * above in-flow text and washes the questions out. */
.wm { position: fixed; inset: -30mm; z-index: -1; transform: rotate(-28deg); pointer-events: none; }
.wm-row { display: flex; gap: 26mm; justify-content: space-around; margin: 0 0 20mm; }
.wm-row span {
  font-size: 15pt; font-weight: 800; letter-spacing: 1px;
  /* A solid pale tint, not opacity: an opacity layer makes Chromium emit a
     transparency group per page, which doubles the PDF size. */
  color: #e6e9fb; white-space: nowrap;
}

.wm-logo { width: 26px; height: 26px; display: block; }

/* ---------- cover ---------- */
.cover { page-break-after: always; padding-top: 12mm; }
.cover-brand {
  display: flex; align-items: center; gap: 7px;
  font-size: 15pt; font-weight: 800; color: #4f46e5; letter-spacing: -.3px;
}
.cover-brand svg { width: 26px; height: 26px; }
.cover-kicker {
  margin-top: 26mm; font-size: 9pt; font-weight: 800; letter-spacing: 2px;
  text-transform: uppercase; color: #6366f1;
}
.cover-title { margin: 4mm 0 0; font-size: 27pt; line-height: 1.15; letter-spacing: -.6px; }
.cover-rule { width: 34mm; height: 3px; border-radius: 3px; background: #4f46e5; margin: 8mm 0; }
.cover-facts { list-style: none; margin: 0; padding: 0; }
.cover-facts li { position: relative; padding-left: 6mm; margin-bottom: 2.4mm; font-size: 10pt; color: #334155; }
.cover-facts li::before {
  content: ""; position: absolute; left: 0; top: 1.6mm;
  width: 2.6mm; height: 2.6mm; border-radius: 50%; background: #818cf8;
}
.cover-facts b { color: #0f172a; }
.cover-foot {
  margin-top: 34mm; padding-top: 4mm; border-top: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; font-size: 8.6pt; color: #94a3b8;
}

/* ---------- sections ---------- */
.sec { page-break-before: always; }
.sec:first-of-type { page-break-before: auto; }
.sec-head { border-bottom: 2px solid #e0e7ff; padding-bottom: 2.5mm; margin-bottom: 4mm; }
.sec-kicker { font-size: 7.6pt; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: #6366f1; }
.sec-title { margin: 1mm 0 0; font-size: 14pt; letter-spacing: -.2px; }

/* ---------- questions ---------- */
.q { display: flex; gap: 2.6mm; padding: 1.9mm 0 2mm; border-bottom: 1px solid #f1f5f9; page-break-inside: avoid; }
.q-num {
  flex: 0 0 8mm; height: 5.6mm; border-radius: 1.6mm; background: #eef2ff; color: #4f46e5;
  font-size: 8pt; font-weight: 800; display: flex; align-items: center; justify-content: center;
}
.q-body { flex: 1; min-width: 0; }
.q-text { margin: 0; font-weight: 600; }
.opts { list-style: none; margin: 1.2mm 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: .5mm 4mm; }
.opt { display: flex; gap: 1.3mm; font-size: 8.7pt; color: #334155; }
.opt-key {
  flex: 0 0 4.6mm; height: 4.6mm; border-radius: 1.2mm; background: #f1f5f9; color: #64748b;
  font-size: 7.4pt; font-weight: 800; display: flex; align-items: center; justify-content: center;
}
.opt-body { display: flex; flex-direction: column; min-width: 0; }

/* Figure questions. The bank stores inline SVG with its own width/height; the
 * PDF needs those to fit a print column, so every figure is capped and scaled
 * down while keeping its aspect ratio. */
.q-fig { margin: 1.6mm 0 1mm; }
.q-fig svg { display: block; max-width: 78mm; max-height: 52mm; width: auto; height: auto; }
.q-fig img { display: block; max-width: 78mm; max-height: 52mm; }

.opts-fig { grid-template-columns: repeat(4, 1fr); gap: 1.5mm 2.5mm; align-items: start; }
.opt-fig { flex-direction: column; align-items: flex-start; gap: .8mm; }
.opt-fig-media { display: block; }
.opt-fig-media svg { display: block; max-width: 30mm; max-height: 30mm; width: auto; height: auto; }
.opt-fig-media img { display: block; max-width: 30mm; max-height: 30mm; }
.ans {
  margin: 1.2mm 0 0; font-size: 8.4pt; color: #334155;
  background: #eef2ff; border-left: 2.5px solid #4f46e5;
  padding: .7mm 0 .7mm 2.2mm;
}
.ans-tag { font-size: 7.2pt; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: #4f46e5; }
.exp { margin: 1mm 0 0; padding-left: 2.4mm; border-left: 2px solid #e2e8f0; font-size: 8.4pt; color: #475569; }
.exp p { margin: 0; }

/* ---------- contents ---------- */
.toc { page-break-after: always; }
.toc h2 { font-size: 15pt; margin: 0 0 4mm; }
.toc ol { margin: 0; padding-left: 5mm; }
.toc li { font-size: 9.4pt; margin-bottom: 1.2mm; color: #334155; }
.toc .toc-count { color: #94a3b8; font-size: 8.4pt; }
`;

function shell(body, { topicTitle, lang }) {
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(
    topicTitle
  )} — ${BRAND}</title><style>${CSS}</style></head><body class="lang-${lang}">
  ${watermarkMarkup()}
  ${body}
  </body></html>`;
}

/* The top-corner brand and the page-number footer are Chromium header/footer
 * templates, not in-flow markup: only those repeat on every page and survive
 * the print margin box. */
const LOGO_DATA_URI =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#4f46e5"/><text x="50" y="70" font-size="54" text-anchor="middle" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-weight="700">A</text></svg>`
  ).toString("base64");

function headerTemplate(topicTitle) {
  return `<div style="width:100%;margin:0 14mm;font-family:Inter,Arial,Helvetica,sans-serif;font-size:8pt;color:#4f46e5;font-weight:800;display:flex;align-items:center;gap:4px;">
    <img src="${LOGO_DATA_URI}" style="width:11px;height:11px;display:block">
    <span>${BRAND}</span>
    <span style="color:#94a3b8;font-weight:500">|</span>
    <span style="color:#475569;font-weight:600;max-width:120mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(
      topicTitle
    )}</span>
  </div>`;
}

const FOOTER_TEMPLATE = (lang) => `<div style="width:100%;margin:0 14mm;font-family:Inter,Arial,Helvetica,sans-serif;font-size:7.5pt;color:#94a3b8;display:flex;justify-content:space-between;">
  <span><b style="color:#4f46e5">${BRAND}</b> — ${
    lang === "as" ? "বিনামূলীয়া পৰীক্ষা প্ৰস্তুতি" : "free exam preparation"
  }</span>
  <span>${lang === "as" ? "পৃষ্ঠা" : "Page"} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;

function topicHTML({ exam, topic, title, lang }) {
  const heading = lang === "as" ? title.as || title.en : title.en;
  const body = `${coverPage({
    examTitle: lang === "as" ? exam.title.as || exam.title.en : exam.title.en,
    topicTitle: heading,
    count: topic.questions.length,
    lang,
  })}<section class="sec"><div class="sec-head"><h2 class="sec-title">${esc(
    heading
  )}</h2></div>${topic.questions.map((q, i) => renderQuestion(q, i + 1, lang)).join("")}</section>`;
  return shell(body, { topicTitle: heading, lang });
}

/* ---------------- rendering ---------------- */

async function renderOne(browser, html, outFile, label, topicTitle, lang) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 0 });
    await page.emulateMediaType("print");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await page.pdf({
      path: outFile,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      /* Chromium tags a PDF for accessibility by default, which costs one
       * /StructElem object per text run — ~14k per topic here and roughly
       * twice the file size. These are print-and-read sheets, so skip it. */
      tagged: false,
      outline: false,
      /* A large topic can exceed the 30 s default and get cut mid-print. */
      timeout: 0,
      headerTemplate: headerTemplate(topicTitle),
      footerTemplate: FOOTER_TEMPLATE(lang),
    });
    const bytes = fs.statSync(outFile).size;
    return { bytes, label };
  } finally {
    await page.close();
  }
}

async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ---------------- main ---------------- */

async function main() {
  if (!CHROME) {
    console.error("No Chromium found. Set CHROME_PATH.");
    process.exit(1);
  }
  const tree = loadExamTree();
  const examIds = EXAM_ARG ? [EXAM_ARG] : DOWNLOADABLE_EXAMS;
  const manifest = { generatedAt: new Date().toISOString(), brand: BRAND, exams: [] };
  const jobs = [];

  for (const examId of examIds) {
    const exam = tree[examId];
    if (!exam) {
      console.error(`Unknown exam: ${examId}`);
      process.exit(1);
    }
    const titles = titleIndex(exam);
    let topics = collectTopics(examId).filter((t) => t.questions.length > 0);
    if (ONLY) topics = topics.filter((t) => t.path === ONLY || t.path.endsWith("/" + ONLY));
    if (!topics.length) continue;

    const sections = [];
    for (const t of topics) {
      const title = titles[t.path] || { en: t.path.split("/").pop(), as: "" };
      sections.push({ ...t, title });
      for (const lang of LANGS) {
        /* Each language gets its own file; the portal picks one before the
         * download starts. English keeps the plain name so existing links and
         * the older PDFs stay valid. */
        const suffix = lang === "en" ? "" : `-as`;
        const relPdf = `${examId}/${t.path}${suffix}.pdf`;
        jobs.push({
          exam,
          topic: t,
          title,
          lang,
          out: path.join(OUT_DIR, relPdf),
          html: topicHTML({ exam, topic: t, title, lang }),
          relPdf,
        });
      }
    }
    manifest.exams.push({ id: examId, exam, sections });
  }

  const totalQ = jobs.reduce((n, j) => (j.lang === "en" ? n + j.topic.questions.length : n), 0);
  console.log(
    `${CHECK ? "[check] " : ""}${jobs.length} PDFs (${totalQ} questions) from ${
      examIds.length
    } exam(s), concurrency ${CONCURRENCY}`
  );
  if (CHECK) {
    for (const j of jobs) console.log(`  ${j.relPdf}  ${j.topic.questions.length}q`);
    return;
  }

  if (MANIFEST_ONLY) {
    for (const j of jobs) j.bytes = fs.existsSync(j.out) ? fs.statSync(j.out).size : 0;
    writeManifest(manifest, jobs);
    console.log(`manifest: ${path.relative(ROOT, MANIFEST)} (no PDFs rendered)`);
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });

  const started = Date.now();
  let done = 0;
  let bytes = 0;
  try {
    await pool(jobs, CONCURRENCY, async (job) => {
      const res = await renderOne(browser, job.html, job.out, job.relPdf, job.title.en);
      done++;
      bytes += res.bytes;
      job.bytes = res.bytes;
      if (done % 10 === 0) {
        console.log(`  ${done}/${jobs.length}  ${(bytes / 1048576).toFixed(1)} MB  ${job.relPdf}`);
      }
    });
  } finally {
    await browser.close();
  }

  writeManifest(manifest, jobs);

  const secs = (Date.now() - started) / 1000;
  console.log(
    `done: ${jobs.length} PDFs, ${(bytes / 1048576).toFixed(1)} MB in ${secs.toFixed(
      1
    )}s (${(jobs.length / secs).toFixed(1)}/s)`
  );
  console.log(`manifest: ${path.relative(ROOT, MANIFEST)}`);
}

/* manifest: only what the portal needs */
function writeManifest(manifest, jobs) {
  const pdfPages = (file) => {
    const raw = fs.readFileSync(file, "latin1");
    const counts = [];
    for (const re of [/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g, /\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g]) {
      let m;
      while ((m = re.exec(raw))) counts.push(Number(m[1]));
    }
    return counts.length ? Math.max(...counts) : 0;
  };
  const pdfMeta = (rel) => {
    const file = path.join(OUT_DIR, rel);
    if (!fs.existsSync(file)) return { bytes: 0, pages: 0 };
    return { bytes: fs.statSync(file).size, pages: pdfPages(file) };
  };

  manifest.exams = manifest.exams.map((e) => {
    const titles = titleIndex(e.exam);
    const sections = e.sections.map((s) => {
      const segs = s.path.split("/");
      const sectionId = segs[0];
      const groupId = segs.length > 2 ? segs.slice(1, -1).join("/") : "";
      const meta = (lang) =>
        pdfMeta(`${e.id}/${s.path}${lang === "en" ? "" : "-as"}.pdf`);
      const en = meta("en");
      const as = meta("as");
      return {
        path: s.path,
        section: sectionId,
        sectionTitle: titles[sectionId] || { en: sectionId, as: "" },
        group: groupId,
        groupTitle: groupId
          ? titles[`${sectionId}/${groupId}`] || { en: groupId.split("/").pop(), as: "" }
          : null,
        title: s.title,
        count: s.questions.length,
        pdfs: {
          en: { pdf: `/data/download/${e.id}/${s.path}.pdf`, bytes: en.bytes, pages: en.pages },
          as: { pdf: `/data/download/${e.id}/${s.path}-as.pdf`, bytes: as.bytes, pages: as.pages },
        },
      };
    });
    return {
      id: e.id,
      title: e.exam.title,
      sections,
    };
  });
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
