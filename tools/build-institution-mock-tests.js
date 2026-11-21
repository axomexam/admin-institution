#!/usr/bin/env node
"use strict";

/*
 * tools/build-institution-mock-tests.js
 *
 * Writes the mock-test side of the institution portal:
 *
 *   institution/mock-test/index.html          exam + set picker
 *   institution/mock-test/<exam>/set-N.html   one playable full paper
 *
 * The questions come from data/exam-mock-sets/<exam>/set-N.json, the same
 * files the public exam-wise mock tests use, so the papers stay identical to
 * what the site already publishes.
 *
 * These pages are for one institution, not for search. Every page carries
 * noindex, and nothing here is linked from the public site, so Google never
 * learns about them. Each set page inlines its own questions: no fetch, no
 * SPA, no dependency on /js/app.js.
 *
 * Usage:
 *   node tools/build-institution-mock-tests.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SETS_DIR = path.join(ROOT, "data", "exam-mock-sets");
const OUT_DIR = path.join(ROOT, "institution", "mock-test");
const MANIFEST = path.join(ROOT, "data", "institution", "manifest.json");

const SETS_PER_EXAM = 5;

const EXAMS = [
  {
    id: "adre-grade-3",
    title: "ADRE 3.0 Grade III",
    titleAs: "এডিআৰই ৩.০ তৃতীয় শ্ৰেণী",
    subtitle: "Full paper · 150 questions · 180 minutes",
    subtitleAs: "সম্পূৰ্ণ প্ৰশ্নকাকত · ১৫০ টা প্ৰশ্ন · ১৮০ মিনিট",
  },
  {
    id: "adre-grade-4",
    title: "ADRE 3.0 Grade IV",
    titleAs: "এডিআৰই ৩.০ চতুৰ্থ শ্ৰেণী",
    subtitle: "Full paper · 135 questions · 150 minutes",
    subtitleAs: "সম্পূৰ্ণ প্ৰশ্নকাকত · ১৩৫ টা প্ৰশ্ন · ১৫০ মিনিট",
  },
];

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const readJSON = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return null;
  }
};

/* Figures arrive as inline SVG authored for the site. Keep them, but drop the
 * things a question bank should never carry into a page. */
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

/* Strip the fixed width/height the site SVGs carry, so the player's CSS can
 * size them for a phone. The viewBox is what keeps the aspect ratio. */
const responsiveFig = (html) =>
  sanitizeMedia(html)
    .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/gi, "$1")
    .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/gi, "$1");

/* Question ids look like "boats-and-streams-080": the topic slug, a dash, and a
 * serial. The manifest maps every topic slug to its exam section, which is what
 * lets the scorecard report per-section marks. */
function sectionMap(examId) {
  const man = readJSON(MANIFEST);
  const exam = man && (man.exams || []).find((e) => e.id === examId);
  const map = new Map();
  const loose = new Map();
  if (!exam) return { get: (k) => undefined, loose };

  /* Question ids sometimes singularise a topic slug ("venn-diagram") where the
   * manifest pluralises it ("venn-diagrams"). Index both spellings so the
   * scorecard never drops a question. */
  const norm = (slug) =>
    String(slug)
      .split("-")
      .map((t) => t.replace(/s$/, ""))
      .join("-");

  for (const s of exam.sections || []) {
    const slug = String(s.path || "").split("/").pop();
    if (!slug) continue;
    const rec = { id: s.section, label: s.sectionTitle || null };
    map.set(slug, rec);
    loose.set(norm(slug), rec);
  }

  /* "pos" shares no stem with "parts-of-speech", so name it directly. */
  if (map.has("parts-of-speech")) map.set("pos", map.get("parts-of-speech"));

  return {
    get: (slug) => map.get(slug) || loose.get(norm(slug)),
  };
}

const CSS = `
:root {
  --brand: #4f46e5;
  --brand-soft: #eef2ff;
  --brand-line: #c7d2fe;
  --ink: #0f172a;
  --ink-soft: #475569;
  --muted: #64748b;
  --line: #e2e8f0;
  --line-soft: #f1f5f9;
  --bg: #ffffff;
  --bg-soft: #f8fafc;
  --ok: #059669;
  --ok-soft: #ecfdf5;
  --bad: #dc2626;
  --bad-soft: #fef2f2;
  --warn: #d97706;
  --shadow: 0 1px 2px rgba(15,23,42,.05), 0 8px 24px -12px rgba(15,23,42,.18);
}
[data-theme="dark"] {
  --brand: #818cf8;
  --brand-soft: #1e1b4b;
  --brand-line: #3730a3;
  --ink: #f1f5f9;
  --ink-soft: #cbd5e1;
  --muted: #94a3b8;
  --line: #1e293b;
  --line-soft: #172033;
  --bg: #0b1220;
  --bg-soft: #0f172a;
  --ok: #34d399;
  --ok-soft: #052e26;
  --bad: #f87171;
  --bad-soft: #3f1d1d;
  --warn: #fbbf24;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px -16px rgba(0,0,0,.8);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg-soft); color: var(--ink);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.55; font-size: 15px;
}
.as, [lang="as"] { font-family: "Noto Sans Bengali", "Noto Serif Bengali", sans-serif; }
a { color: inherit; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

/* ---------- header ---------- */
.hdr { background: var(--bg); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; }
.hdr-in { display: flex; align-items: center; gap: 14px; height: 60px; }
.brand { display: flex; align-items: center; gap: 9px; text-decoration: none; font-weight: 800; letter-spacing: -.3px; }
.brand-mark {
  width: 30px; height: 30px; border-radius: 9px; background: var(--brand); color: #fff;
  display: grid; place-items: center; font-size: 16px; font-weight: 800; flex: 0 0 auto;
}
.brand-txt { font-size: 16px; color: var(--ink); }
.hdr-tag {
  font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase;
  color: var(--brand); background: var(--brand-soft); border: 1px solid var(--brand-line);
  padding: 3px 8px; border-radius: 999px;
}
.hdr-sp { flex: 1; }
.hdr a.back { font-size: 13.5px; font-weight: 600; color: var(--ink-soft); text-decoration: none; padding: 7px 12px; border-radius: 9px; border: 1px solid var(--line); }
.hdr a.back:hover { border-color: var(--brand-line); color: var(--brand); }
.tgl {
  width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg);
  color: var(--ink-soft); cursor: pointer; display: grid; place-items: center; flex: 0 0 auto;
}
.tgl:hover { color: var(--brand); border-color: var(--brand-line); }
.tgl svg { width: 17px; height: 17px; }
[data-theme="dark"] .i-sun { display: none; }
:root:not([data-theme="dark"]) .i-moon { display: none; }

/* ---------- hero ---------- */
.hero { padding: 30px 0 18px; }
.hero h1 { margin: 0 0 8px; font-size: clamp(23px, 4vw, 31px); letter-spacing: -.8px; line-height: 1.2; }
.hero p { margin: 0; color: var(--ink-soft); max-width: 66ch; font-size: 15px; }
.hero-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.stat {
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  padding: 9px 14px; font-size: 13px; color: var(--muted); box-shadow: var(--shadow);
}
.stat b { display: block; font-size: 18px; color: var(--ink); letter-spacing: -.4px; line-height: 1.25; }

/* ---------- set picker ---------- */
.exam-block { margin-bottom: 30px; }
.exam-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0 0 4px; }
.exam-head h2 { margin: 0; font-size: 19px; letter-spacing: -.3px; }
.exam-head .as { font-size: 14px; color: var(--muted); }
.exam-sub { margin: 0 0 14px; font-size: 13.5px; color: var(--muted); }
.sets { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.set {
  display: flex; gap: 12px; align-items: flex-start; text-decoration: none;
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 14px;
  box-shadow: var(--shadow); transition: border-color .15s, transform .15s;
}
.set:hover { border-color: var(--brand); transform: translateY(-1px); }
.set .ic { flex: 0 0 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--brand-soft); color: var(--brand); }
.set .ic svg { width: 19px; height: 19px; }
.set .nm { font-weight: 700; font-size: 14.5px; line-height: 1.35; }
.set .sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.set .go { font-size: 11.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--brand); margin-top: 7px; }

/* ---------- setup screen ---------- */
.setup { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); margin-bottom: 26px; }
.setup h1 { margin: 0 0 6px; font-size: clamp(20px, 3.4vw, 26px); letter-spacing: -.5px; }
.setup .lead { margin: 0 0 18px; color: var(--ink-soft); font-size: 14px; }
.setup-row { margin-bottom: 18px; }
.setup-lbl { font-size: 12px; font-weight: 800; letter-spacing: .7px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.seg { display: inline-flex; gap: 6px; background: var(--bg-soft); border: 1px solid var(--line); border-radius: 11px; padding: 4px; }
.seg button {
  border: 0; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600;
  color: var(--muted); padding: 8px 16px; border-radius: 8px; cursor: pointer; white-space: nowrap;
}
.seg button[aria-pressed="true"] { background: var(--brand); color: #fff; }
.rules { margin: 0; padding-left: 20px; color: var(--ink-soft); font-size: 13.5px; }
.rules li { margin-bottom: 6px; }
.start-btn {
  display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer;
  background: var(--brand); color: #fff; font: inherit; font-weight: 700; font-size: 15px;
  padding: 13px 26px; border-radius: 12px; box-shadow: var(--shadow);
}
.start-btn:hover { filter: brightness(1.06); }
.start-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.start-btn:disabled, .start-btn:disabled:hover {
  opacity: .45; cursor: not-allowed; filter: grayscale(.35); box-shadow: none;
}
.cand { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cand .fld { display: flex; flex-direction: column; gap: 6px; }
.cand .fld.full { grid-column: 1 / -1; }
.cand label { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
.cand input {
  font: inherit; font-size: 14px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.cand input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.cand input[aria-invalid="true"] { border-color: var(--bad); }
.cand .hint { font-size: 11.5px; color: var(--muted); }
.cand .err { font-size: 11.5px; color: var(--bad); font-weight: 700; display: none; }
.cand .err.on { display: block; }
@media (max-width: 560px) { .cand { grid-template-columns: 1fr; } }

.agree {
  display: flex; gap: 11px; align-items: flex-start; margin: 0 0 8px;
  background: var(--bg-soft); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 14px; font-size: 13.5px; color: var(--ink-soft); line-height: 1.5;
  transition: border-color .15s ease, background .15s ease;
}
.agree:has(input:checked), .agree.on { border-color: var(--brand); background: var(--brand-soft); }
.agree-txt { cursor: pointer; }
.agree:focus-within { border-color: var(--brand-line); }
.agree input {
  flex: 0 0 auto; width: 18px; height: 18px; margin: 1px 0 0;
  accent-color: var(--brand); cursor: pointer;
}
.lnk {
  border: 0; background: none; padding: 0; font: inherit; font-size: 13px;
  color: var(--brand); font-weight: 700; text-decoration: underline; cursor: pointer;
}
.lnk:hover { filter: brightness(1.1); }
.terms { margin: 0 0 6px; padding-left: 18px; font-size: 13.5px; color: var(--ink-soft); line-height: 1.55; }
.terms li { margin-bottom: 7px; }

/* ---------- runner ---------- */
.runner { display: none; }
.runner.on { display: block; }
.paper-top {
  position: sticky; top: 60px; z-index: 15; background: var(--bg);
  border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px;
  box-shadow: var(--shadow); margin-bottom: 14px;
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
}
.timer {
  font-variant-numeric: tabular-nums; font-weight: 800; font-size: 19px; letter-spacing: -.5px;
  display: inline-flex; align-items: center; padding: 6px 12px 6px 33px;
  background-color: var(--bg-soft); border: 1px solid var(--line); border-radius: 10px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M12 7.5v5l3 2'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: 10px center; background-size: 16px;
}
.timer.low { color: var(--bad); border-color: var(--bad); background-color: var(--bad-soft); }
.paper-meta { font-size: 12.5px; color: var(--muted); }
.paper-sp { flex: 1; }
.pbtn {
  border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft);
  font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 9px; cursor: pointer;
}
.pbtn:hover { border-color: var(--brand-line); color: var(--brand); }
.pbtn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.pbtn.primary:hover { filter: brightness(1.06); color: #fff; }
.pbtn:disabled { opacity: .5; cursor: not-allowed; }
.pbtn.quit { color: var(--bad); border-color: var(--line); }
.pbtn.quit:hover { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
.bar-track { height: 5px; background: var(--line-soft); border-radius: 999px; overflow: hidden; flex: 1 1 100%; }
.bar-fill { height: 100%; background: var(--brand); width: 0; transition: width .2s; }

/* The question panel keeps a constant height so the palette, the timer and
 * the Next button never move while a student walks the paper. Long stems and
 * figure questions scroll inside .qbody instead of pushing the page around. */
.qwrap {
  background: var(--bg); border: 1px solid var(--line); border-radius: 16px;
  padding: 20px; box-shadow: var(--shadow);
  display: flex; flex-direction: column;
  height: clamp(400px, calc(100vh - 320px), 520px);
}
.qbody {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
  padding-right: 4px;
}
.qbody::-webkit-scrollbar { width: 8px; }
.qbody::-webkit-scrollbar-track { background: transparent; }
.qbody::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
.qbody::-webkit-scrollbar-thumb:hover { background: var(--muted); }
.qwrap.more::after {
  content: ""; position: absolute; left: 1px; right: 1px; bottom: 62px; height: 26px;
  pointer-events: none; border-radius: 0 0 15px 15px;
  background: linear-gradient(to bottom, transparent, var(--bg));
}
.qwrap { position: relative; }
.qhead { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.qno { font-size: 12px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--brand); }
.qflag { margin-left: auto; border: 1px solid var(--line); background: var(--bg); color: var(--muted); font: inherit; font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 8px; cursor: pointer; }
.qflag[aria-pressed="true"] { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
[data-theme="dark"] .qflag[aria-pressed="true"] { background: #422006; border-color: #a16207; color: #fcd34d; }
.qtext { margin: 0 0 14px; font-size: 16px; font-weight: 600; line-height: 1.5; }
.qfig { margin: 0 0 14px; text-align: center; }
.qfig svg, .qfig img { width: 100%; max-width: 340px; height: auto; max-height: 260px; }
.opts { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.opts.fig { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 640px) {
  .opts.fig { grid-template-columns: repeat(2, 1fr); }
  .qwrap { height: clamp(420px, calc(100vh - 250px), 700px); padding: 16px; }
  /* keep the runner bar at two rows so the sticky header stays short */
  .paper-top { gap: 8px; padding: 10px 12px; top: 52px; }
  .timer { font-size: 17px; padding: 5px 10px 5px 29px; background-position: 8px center; }
  .paper-meta { font-size: 11.5px; }
  .paper-sp { display: none; }
  .pbtn { font-size: 12.5px; padding: 7px 11px; }
  #prevbtn, #nextbtn { flex: 1 1 auto; }
  #submitbtn { flex: 1 1 46%; }
  #quitbtn { flex: 1 1 46%; }
}
.opt {
  position: relative;
  display: flex; gap: 13px; align-items: center; width: 100%; text-align: left;
  background: var(--bg); border: 1.5px solid var(--line); border-radius: 14px; padding: 14px 16px;
  font: inherit; color: inherit; cursor: pointer;
  transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
}
.opt:hover {
  border-color: var(--brand-line); background: var(--brand-soft);
  transform: translateY(-1px); box-shadow: 0 6px 16px -10px rgba(79,70,229,.5);
}
.opt:active { transform: translateY(0); }
.opt:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.opt[aria-pressed="true"] {
  border-color: var(--brand); background: var(--brand-soft);
  box-shadow: inset 0 0 0 1px var(--brand), 0 8px 20px -12px rgba(79,70,229,.65);
}
.opt .k {
  flex: 0 0 30px; height: 30px; border-radius: 10px; background: var(--line-soft); color: var(--muted);
  display: grid; place-items: center; font-size: 13px; font-weight: 800;
  transition: background .16s ease, color .16s ease, transform .16s ease;
}
.opt[aria-pressed="true"] .k { background: var(--brand); color: #fff; transform: scale(1.05); }
/* On the dark theme --brand is a light indigo, so white on it is too weak. */
[data-theme="dark"] .opt[aria-pressed="true"] .k { color: #1e1b4b; }
.opt .t { flex: 1; min-width: 0; font-size: 14.5px; line-height: 1.5; }
.opt::after {
  content: ""; flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%;
  border: 1.5px solid var(--line); background: transparent;
  transition: background .16s ease, border-color .16s ease, transform .16s ease;
}
[data-theme="dark"] .opt[aria-pressed="true"]::after {
  border-color: var(--brand);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231e1b4b' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.2 4.2L19 7'/%3E%3C/svg%3E");
}
.opt[aria-pressed="true"]::after {
  border-color: var(--brand); transform: scale(1.02);
  background: var(--brand) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.2 4.2L19 7'/%3E%3C/svg%3E") center/13px no-repeat;
}
.opts.fig .opt { flex-direction: column; align-items: stretch; gap: 10px; padding: 14px; }
.opts.fig .opt .k { align-self: flex-start; }
.opts.fig .opt .t { text-align: center; }
.opts.fig .opt::after { display: none; }
.opts.fig .opt[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--brand), 0 10px 24px -14px rgba(79,70,229,.7); }
.opt .f { width: 100%; }
.opt .f svg, .opt .f img { width: 100%; height: auto; max-height: 110px; display: block; }
.opt.review-right { border-color: var(--ok); background: var(--ok-soft); box-shadow: none; }
.opt.review-right .k { background: var(--ok); color: #fff; }
.opt.review-right::after {
  border-color: var(--ok); background: var(--ok) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12.5 4.2 4.2L19 7'/%3E%3C/svg%3E") center/13px no-repeat;
}
.opt.review-wrong { border-color: var(--bad); background: var(--bad-soft); box-shadow: none; }
.opt.review-wrong .k { background: var(--bad); color: #fff; }
.opt.review-wrong::after {
  border-color: var(--bad); background: var(--bad) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 6l12 12M18 6 6 18'/%3E%3C/svg%3E") center/11px no-repeat;
}
.opts.fig .opt.review-right::after, .opts.fig .opt.review-wrong::after { display: none; }
.opts.fig .opt.review-right { box-shadow: inset 0 0 0 2px var(--ok); }
.opts.fig .opt.review-wrong { box-shadow: inset 0 0 0 2px var(--bad); }
.explain { margin-top: 14px; padding: 12px 14px; border-left: 3px solid var(--brand); background: var(--bg-soft); border-radius: 0 10px 10px 0; font-size: 13.5px; color: var(--ink-soft); }
.explain b { color: var(--ink); }
.qnav { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }

/* ---------- palette ---------- */
.palette { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 16px; margin-top: 14px; box-shadow: var(--shadow); }
.palette h3 { margin: 0 0 4px; font-size: 14px; }
.palette .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--muted); margin-bottom: 12px; }
.palette .legend i { display: inline-block; width: 11px; height: 11px; border-radius: 4px; margin-right: 5px; vertical-align: -1px; }
.pgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 7px; }
.pcell {
  aspect-ratio: 1; border-radius: 9px; border: 1.5px solid var(--line); background: var(--bg);
  color: var(--ink-soft); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
  display: grid; place-items: center;
}
.pcell.done { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
.pcell.marked { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
[data-theme="dark"] .pcell.marked { background: #422006; border-color: #a16207; color: #fcd34d; }
.pcell.cur { outline: 2px solid var(--brand); outline-offset: 1px; }

/* ---------- result ---------- */
.result { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: var(--shadow); }
.result h2 { margin: 0 0 4px; font-size: 21px; letter-spacing: -.4px; }
.result .rsub { margin: 0 0 18px; color: var(--muted); font-size: 13.5px; }
.score-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px; }
.score {
  background: var(--bg-soft); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px;
}
.score b { display: block; font-size: 22px; letter-spacing: -.6px; line-height: 1.2; }
.score span { font-size: 12px; color: var(--muted); }
.score.ok b { color: var(--ok); }
.score.bad b { color: var(--bad); }
.score.warn b { color: var(--warn); }
.score.hero { background: var(--brand-soft); border-color: var(--brand-line); }
.score.hero b { color: var(--brand); font-size: 26px; }
.score.neg b { color: var(--bad); }
.marks-note {
  display: flex; flex-wrap: wrap; gap: 6px 16px; margin: -6px 0 18px;
  font-size: 12.5px; color: var(--muted);
}
.marks-note b { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.sc-head { display: flex; align-items: baseline; gap: 10px; margin: 22px 0 10px; flex-wrap: wrap; }
.sc-head h3 { margin: 0; font-size: 15px; letter-spacing: -.2px; }
.sc-head span { font-size: 12px; color: var(--muted); }
.sc-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--line); border-radius: 12px; }
table.sc { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 520px; }
table.sc th, table.sc td { padding: 9px 12px; text-align: right; white-space: nowrap; }
table.sc th:first-child, table.sc td:first-child { text-align: left; white-space: normal; }
table.sc thead th {
  background: var(--bg-soft); color: var(--muted); font-size: 11.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--line);
}
table.sc tbody tr + tr td { border-top: 1px solid var(--line-soft); }
table.sc td.num { font-variant-numeric: tabular-nums; }
table.sc td.pos { color: var(--ok); font-weight: 700; }
table.sc td.ng { color: var(--bad); font-weight: 700; }
table.sc tfoot td {
  border-top: 2px solid var(--line); font-weight: 800; background: var(--bg-soft);
  font-variant-numeric: tabular-nums;
}
.verdict {
  display: flex; align-items: center; gap: 12px; margin: 20px 0 4px; padding: 14px 16px;
  border-radius: 12px; border: 1px solid var(--line); background: var(--bg-soft);
}
.verdict .vmark {
  flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center;
  font-weight: 800; font-size: 17px; color: #fff; background: var(--muted);
}
.verdict .vmark { font-size: 13px; font-variant-numeric: tabular-nums; background: var(--brand); }
.verdict-tx b { display: block; font-size: 14px; margin-bottom: 2px; }
.verdict-tx span { font-size: 12.5px; color: var(--muted); }
.result-acts { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
.cand-line {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px; margin: 0 0 18px; padding: 14px 16px;
  background: var(--bg-soft); border: 1px solid var(--line); border-radius: 12px;
}
.cand-line div { font-size: 12.5px; color: var(--muted); }
.cand-line b {
  display: block; font-size: 14px; color: var(--ink); margin-top: 2px;
  font-variant-numeric: tabular-nums; word-break: break-word;
}
.print-head { display: none; }
@media (max-width: 640px) {
  .score b { font-size: 19px; }
  .score.hero b { font-size: 22px; }
  table.sc { font-size: 12px; min-width: 460px; }
  table.sc th, table.sc td { padding: 8px 9px; }
}

/* ---------- setup: exam banner ---------- */
.exam-banner {
  position: relative; overflow: hidden;
  background: linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #6366f1 100%);
  border-radius: 18px; padding: 22px 24px 20px; color: #fff;
  box-shadow: 0 18px 40px -22px rgba(49,46,129,.75);
}
.exam-banner::after {
  content: ""; position: absolute; width: 320px; height: 320px; border-radius: 50%;
  right: -110px; top: -150px; background: radial-gradient(circle, rgba(255,255,255,.22), transparent 70%);
  pointer-events: none;
}
.eb-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.eb-tag {
  font-size: 10.5px; font-weight: 800; letter-spacing: .9px; text-transform: uppercase;
  background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.3);
  padding: 4px 10px; border-radius: 999px; backdrop-filter: blur(4px);
}
.eb-set {
  font-size: 11.5px; font-weight: 700; letter-spacing: .4px;
  color: rgba(255,255,255,.82); margin-left: auto;
}
.exam-banner h1 {
  margin: 0 0 3px; font-size: clamp(20px, 3.2vw, 27px); letter-spacing: -.7px; line-height: 1.18;
}
.eb-sub { margin: 0; font-size: 13.5px; color: rgba(255,255,255,.78); }
.metagrid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 18px;
}
.meta {
  background: rgba(255,255,255,.13); border: 1px solid rgba(255,255,255,.2);
  border-radius: 11px; padding: 9px 11px; backdrop-filter: blur(4px);
}
.meta b {
  display: block; font-size: 19px; font-weight: 800; letter-spacing: -.5px;
  font-variant-numeric: tabular-nums; line-height: 1.2;
}
.meta span { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: rgba(255,255,255,.75); }
@media (max-width: 560px) {
  .metagrid { grid-template-columns: repeat(2, 1fr); }
  .exam-banner { padding: 18px 18px 16px; }
}

/* ---------- setup: panels ---------- */
.setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0 18px; }
@media (max-width: 800px) { .setup-grid { grid-template-columns: 1fr; } }
.panel {
  background: var(--bg); border: 1px solid var(--line); border-radius: 16px;
  padding: 18px; box-shadow: var(--shadow);
}
.panel-h {
  margin: 0 0 12px; font-size: 11.5px; font-weight: 800; letter-spacing: .8px;
  text-transform: uppercase; color: var(--muted);
}
.cand-card { display: flex; align-items: center; gap: 13px; }
.cand-avatar {
  width: 46px; height: 46px; border-radius: 14px; flex: 0 0 auto;
  display: grid; place-items: center; font-weight: 800; font-size: 16px;
  background: var(--bg-soft); color: var(--muted); border: 1px dashed var(--line);
  letter-spacing: -.3px;
}
.cand-avatar.on {
  background: linear-gradient(135deg, var(--brand), #818cf8); color: #fff;
  border: 0; box-shadow: 0 8px 18px -10px rgba(79,70,229,.8);
}
.cand-body { min-width: 0; flex: 1 1 auto; }
.cand-body b { display: block; font-size: 15px; letter-spacing: -.2px; word-break: break-word; }
.cand-body span { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.cand-card.ready .cand-body b { color: var(--ink); }
.lnk-btn {
  flex: 0 0 auto; border: 1px solid var(--line); background: var(--bg); color: var(--brand);
  font: inherit; font-size: 12.5px; font-weight: 700; padding: 7px 13px;
  border-radius: 9px; cursor: pointer;
}
.lnk-btn:hover { border-color: var(--brand-line); background: var(--brand-soft); }
.panel-note { margin: 12px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.5; }
.steps { margin: 0; padding: 0; list-style: none; counter-reset: st; }
.steps li {
  position: relative; padding-left: 30px; margin-bottom: 9px;
  font-size: 13px; color: var(--ink-soft); line-height: 1.5;
}
.steps li:last-child { margin-bottom: 0; }
.steps li::before {
  counter-increment: st; content: counter(st);
  position: absolute; left: 0; top: 0;
  width: 20px; height: 20px; border-radius: 7px; display: grid; place-items: center;
  background: var(--brand-soft); color: var(--brand); border: 1px solid var(--brand-line);
  font-size: 10.5px; font-weight: 800; font-variant-numeric: tabular-nums;
}

/* ---------- setup: sticky start bar ---------- */
.start-bar {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  border-top: 1px solid var(--line); margin-top: 4px; padding-top: 18px;
}
.start-bar .agree { flex: 1 1 320px; margin: 0; }
.start-bar .start-btn { flex: 0 0 auto; margin-left: auto; }
@media (max-width: 620px) {
  .start-bar { flex-direction: column; align-items: stretch; }
  .start-bar .agree { flex: 1 1 auto; }
  .start-bar .start-btn { margin-left: 0; justify-content: center; width: 100%; }
}
.start-btn.ready { animation: btnpulse 2.4s ease-in-out infinite; }
@keyframes btnpulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79,70,229,.4); }
  50% { box-shadow: 0 0 0 7px rgba(79,70,229,0); }
}
@media (prefers-reduced-motion: reduce) { .start-btn.ready { animation: none; } }

/* ---------- candidate details popup ---------- */
.cmodal {
  position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; padding: 18px;
  background: rgba(15,23,42,.66); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  opacity: 0; pointer-events: none; transition: opacity .18s ease;
}
.cmodal[hidden] { display: none; }
.cmodal.on { opacity: 1; pointer-events: auto; }
.cmodal-card {
  width: 100%; max-width: 470px; background: var(--bg); color: var(--ink);
  border: 1px solid var(--line); border-radius: 22px; overflow: hidden;
  box-shadow: 0 40px 90px -24px rgba(15,23,42,.62), 0 0 0 1px rgba(255,255,255,.05);
  max-height: calc(100vh - 36px); display: flex; flex-direction: column;
  transform: translateY(16px) scale(.97); opacity: 0;
  transition: transform .24s cubic-bezier(.2,.9,.3,1.1), opacity .2s ease;
}
.cmodal.on .cmodal-card { transform: translateY(0) scale(1); opacity: 1; }
.cm-head {
  display: flex; gap: 13px; align-items: flex-start; padding: 22px 24px 0;
}
.cm-mark {
  width: 42px; height: 42px; border-radius: 13px; flex: 0 0 auto;
  display: grid; place-items: center; font-size: 18px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, #4f46e5, #818cf8);
  box-shadow: 0 10px 22px -12px rgba(79,70,229,.9);
}
.cm-htx { min-width: 0; }
.cm-htx h2 { margin: 0 0 3px; font-size: 18px; letter-spacing: -.4px; line-height: 1.25; }
.cm-htx p { margin: 0; font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.cm-body { padding: 18px 24px 4px; overflow-y: auto; }
.cm-fld { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.cm-fld > label { font-size: 12px; font-weight: 800; letter-spacing: .3px; color: var(--ink-soft); }
.cm-fld > label span { font-weight: 500; color: var(--muted); letter-spacing: 0; }
.cm-in { position: relative; display: flex; align-items: center; }
.cm-in .cm-ic {
  position: absolute; left: 12px; width: 17px; height: 17px; color: var(--muted);
  pointer-events: none; display: grid; place-items: center;
}
.cm-in .cm-ic svg { width: 17px; height: 17px; }
.cm-in input {
  width: 100%; font: inherit; font-size: 14.5px; color: var(--ink); background: var(--bg-soft);
  border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.cm-in.has-ic input { padding-left: 39px; }
.cm-in input:focus {
  outline: none; border-color: var(--brand); background: var(--bg);
  box-shadow: 0 0 0 4px var(--brand-soft);
}
.cm-in input[aria-invalid="true"] { border-color: var(--bad); }
.cm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 480px) { .cm-row { grid-template-columns: 1fr; } }
.cm-note {
  display: flex; gap: 8px; align-items: flex-start; margin: 2px 0 0;
  font-size: 11.5px; color: var(--muted); line-height: 1.5;
  background: var(--bg-soft); border: 1px solid var(--line); border-radius: 11px; padding: 10px 12px;
}
.cm-note svg { width: 14px; height: 14px; flex: 0 0 auto; margin-top: 1px; color: var(--ok); }
.cm-acts {
  display: flex; gap: 10px; padding: 16px 24px 20px; border-top: 1px solid var(--line-soft);
  background: var(--bg); margin-top: 14px;
}
.cm-acts button {
  flex: 1; font: inherit; font-size: 14px; font-weight: 700; padding: 12px 18px;
  border-radius: 12px; cursor: pointer; transition: filter .15s ease, background .15s ease;
}
.cm-cancel { border: 1px solid var(--line); background: var(--bg); color: var(--ink-soft); }
.cm-cancel:hover { background: var(--bg-soft); }
.cm-ok { border: 1px solid var(--brand); background: var(--brand); color: #fff; }
[data-theme="dark"] .cm-ok { color: #1e1b4b; }
[data-theme="dark"] .start-btn { color: #1e1b4b; }
.cm-ok:hover:not(:disabled) { filter: brightness(1.08); }
.cm-ok:disabled { opacity: .42; cursor: not-allowed; }
@media (max-width: 480px) {
  .cm-head { padding: 18px 18px 0; }
  .cm-body { padding: 16px 18px 4px; }
  .cm-acts { padding: 14px 18px 18px; flex-direction: column-reverse; }
  .cmodal-card { border-radius: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .cmodal, .cmodal-card { transition: none; }
  .cmodal-card { transform: none; }
}

/* ---------- print / save as PDF ---------- */
@media print {
  @page { size: A4 portrait; margin: 12mm 10mm; }
  :root, [data-theme="dark"] {
    --ink: #0f172a; --ink-soft: #334155; --muted: #475569; --line: #cbd5e1;
    --line-soft: #e2e8f0; --bg: #fff; --bg-soft: #f8fafc;
    --brand: #4f46e5; --brand-soft: #eef2ff; --brand-line: #c7d2fe;
    --ok: #047857; --bad: #b91c1c; --warn: #b45309;
  }
  html, body { background: #fff !important; }
  .hdr, .ftr, #setup, #runner, .cd, .modal, .result-acts, #review,
  .sc-head span, .tgl { display: none !important; }
  .wrap { max-width: none; padding: 0; }
  /* Only a finished attempt prints; Ctrl+P mid-test would otherwise emit a
   * blank sheet, since the runner itself is hidden below. */
  #result:not([hidden]) {
    display: block !important; border: 0; box-shadow: none; padding: 0;
    border-radius: 0; background: #fff;
  }
  .print-head {
    display: flex; align-items: center; gap: 12px; margin: 0 0 4px;
    padding-bottom: 10px; border-bottom: 2px solid var(--brand);
  }
  .print-head .ph-mark {
    width: 34px; height: 34px; border-radius: 9px; background: var(--brand);
    color: #fff; font-weight: 800; font-size: 18px; display: grid; place-items: center;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .print-head .ph-tx b { display: block; font-size: 15px; letter-spacing: -.2px; }
  .print-head .ph-tx span { font-size: 11.5px; color: var(--muted); }
  .print-head .ph-sp { flex: 1; }
  .print-head .ph-wm {
    font-size: 10.5px; font-weight: 700; color: var(--brand);
    border: 1px solid var(--brand-line); border-radius: 999px; padding: 4px 10px;
  }
  .score, .cand-line, .verdict, .sc-wrap {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    break-inside: avoid;
  }
  .sc-wrap { overflow: visible; }
  table.sc { min-width: 0; font-size: 10.5px; }
  table.sc th, table.sc td { padding: 5px 7px; }
  .score b { font-size: 17px; }
  .score.hero b { font-size: 20px; }
  .score-row { gap: 7px; margin-bottom: 12px; }
  .marks-note { font-size: 10.5px; margin-bottom: 12px; }
  .verdict { padding: 10px 12px; margin: 12px 0 0; }
  .result h2 { font-size: 17px; }
  .result .rsub { font-size: 11px; margin-bottom: 12px; }
  .print-foot {
    display: block !important; margin-top: 16px; padding-top: 8px;
    border-top: 1px solid var(--line); font-size: 9.5px; color: var(--muted);
  }
}
.print-foot { display: none; }

/* ---------- 3-2-1 countdown ---------- */
.cd {
  position: fixed; inset: 0; z-index: 95; display: grid; place-items: center; text-align: center;
  background: rgba(15,23,42,.74); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
  opacity: 0; transition: opacity .18s ease;
}
.cd[hidden] { display: none; }
.cd.on { opacity: 1; }
.cd-num {
  font-size: clamp(76px, 22vw, 150px); font-weight: 800; color: #fff; line-height: 1;
  letter-spacing: -4px; font-variant-numeric: tabular-nums;
  text-shadow: 0 18px 60px rgba(79,70,229,.7);
}
.cd-num.pop { animation: cdpop .78s cubic-bezier(.2,.9,.3,1.18); }
@keyframes cdpop {
  0% { transform: scale(.5); opacity: 0; }
  42% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: .94; }
}
.cd-num.go { font-size: clamp(56px, 15vw, 100px); letter-spacing: 2px; color: #a5f3c9; text-shadow: 0 18px 60px rgba(16,185,129,.7); }
.cd-hint { margin-top: 16px; color: #cbd5e1; font-size: 13.5px; letter-spacing: .2px; }
@media (prefers-reduced-motion: reduce) { .cd-num.pop { animation: none; } }

/* ---------- modal (submit / retake confirmations) ---------- */
.modal {
  position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 20px;
  background: rgba(15,23,42,.62); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
  opacity: 0; pointer-events: none; transition: opacity .18s ease;
}
.modal[hidden] { display: none; }
.modal.on { opacity: 1; pointer-events: auto; }
.modal-card {
  width: 100%; max-width: 460px; background: var(--bg); color: var(--ink);
  border: 1px solid var(--line); border-radius: 22px; padding: 26px;
  box-shadow: 0 32px 80px -20px rgba(15,23,42,.5), 0 0 0 1px rgba(255,255,255,.04);
  max-height: calc(100vh - 40px); overflow-y: auto;
  transform: translateY(14px) scale(.97); opacity: 0;
  transition: transform .22s cubic-bezier(.2,.9,.3,1.1), opacity .2s ease;
  position: relative; overflow: hidden;
}
.modal.on .modal-card { transform: translateY(0) scale(1); opacity: 1; }
.modal-card::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 4px;
  background: linear-gradient(90deg, var(--brand), #818cf8, #a5b4fc);
}
.modal-ic {
  width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center;
  background: var(--brand-soft); color: var(--brand); margin-bottom: 16px;
}
.modal-ic svg { width: 25px; height: 25px; }
.modal-ic.warn { background: #fef3c7; color: #b45309; }
[data-theme="dark"] .modal-ic.warn { background: #422006; color: #fbbf24; }
.modal-card h2 { margin: 0 0 6px; font-size: 19px; letter-spacing: -.35px; line-height: 1.3; }
.modal-card p { margin: 0 0 6px; font-size: 14px; color: var(--ink-soft); line-height: 1.55; }
.modal-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0 20px;
}
.modal-stat {
  background: var(--bg-soft); border: 1px solid var(--line); border-radius: 12px;
  padding: 10px 12px; text-align: center;
}
.modal-stat b { display: block; font-size: 19px; letter-spacing: -.5px; line-height: 1.25; }
.modal-stat span { font-size: 11.5px; color: var(--muted); }
.modal-stat.warn b { color: var(--warn); }
.modal-acts { display: flex; gap: 10px; flex-wrap: wrap; }
.modal-acts .pbtn { flex: 1; justify-content: center; text-align: center; padding: 12px 18px; font-size: 14px; }
.modal-acts .pbtn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.modal-acts .pbtn.primary:hover { filter: brightness(1.08); color: #fff; }
@media (max-width: 480px) {
  .modal-card { padding: 20px; border-radius: 18px; }
  .modal-acts { flex-direction: column-reverse; }
}
@media (prefers-reduced-motion: reduce) {
  .modal, .modal-card { transition: none; }
  .modal-card { transform: none; }
}

.ftr { border-top: 1px solid var(--line); background: var(--bg); padding: 22px 0; margin-top: 34px; }
.ftr-in { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; font-size: 13px; color: var(--muted); }
.ftr a { color: var(--brand); text-decoration: none; font-weight: 600; }
.ftr-build { font-size: 11px; opacity: .7; font-variant-numeric: tabular-nums; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 620px) {
  .hdr-tag, .hdr a.back { display: none; }
  .paper-top { top: 60px; }
  .qwrap, .setup, .result { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const ICON_SUN = `<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const ICON_MOON = `<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`;
const ICON_PAPER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`;

function head(title, extraStyle = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
  <meta name="googlebot" content="noindex, nofollow" />
  <title>${esc(title)}</title>
  <meta name="theme-color" content="#4f46e5" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+Bengali:wght@400;600;700&display=swap" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Noto+Sans+Bengali:wght@400;600;700&display=swap" /></noscript>
  <script>
    (function () {
      try {
        if (localStorage.getItem("axomexam-theme") === "dark") {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      } catch (e) {}
    })();
  </script>
  <style>${CSS}${extraStyle}</style>
</head>
<body>
  <header class="hdr">
    <div class="wrap hdr-in">
      <a class="brand" href="/" aria-label="axomexam home">
        <span class="brand-mark">A</span>
        <span class="brand-txt">axomexam.in</span>
      </a>
      <span class="hdr-tag">Mock Test</span>
      <span class="hdr-sp"></span>
      <a class="back" href="/institution/">Library</a>
      <button class="tgl" id="axo-theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
        ${ICON_SUN}${ICON_MOON}
      </button>
    </div>
  </header>`;
}

const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

const BUILD = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
})();

function foot() {
  return `
  <footer class="ftr">
    <div class="wrap ftr-in">
      <span>© axomexam.in — practice papers for institution use.</span>
      <span><a href="/institution/">Topic-wise PDFs</a> · <a href="/institution/mock-test/">All mock tests</a></span>
      <span class="ftr-build">build ${BUILD}</span>
    </div>
  </footer>
  <script>
    (function () {
      var root = document.documentElement;
      var btn = document.getElementById("axo-theme");
      if (btn) btn.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("axomexam-theme", next); } catch (e) {}
      });
    })();
  </script>
</body>
</html>`;
}

/* ---------- set picker ---------- */

function pickerPage() {
  const blocks = EXAMS.map((exam) => {
    const cards = [];
    for (let n = 1; n <= SETS_PER_EXAM; n++) {
      const set = readJSON(path.join(SETS_DIR, exam.id, `set-${n}.json`));
      if (!set) continue;
      const b = set.blueprint || {};
      const count = (set.questions || []).length;
      cards.push(`<a class="set" href="/institution/mock-test/${exam.id}/set-${n}.html">
        <span class="ic">${ICON_PAPER}</span>
        <span>
          <span class="nm">Full Paper Set ${n}</span>
          <span class="sub"><b>${count}</b> questions · ${b.durationMinutes || "—"} min · ${b.totalMarks || count} marks</span>
          <span class="go">Start test →</span>
        </span>
      </a>`);
    }
    return `<section class="exam-block">
      <div class="exam-head">
        <h2>${esc(exam.title)}</h2>
        <span class="as" lang="as">${esc(exam.titleAs)}</span>
      </div>
      <p class="exam-sub">${esc(exam.subtitle)}</p>
      <div class="sets">${cards.join("")}</div>
    </section>`;
  }).join("");

  return `${head("Mock Tests — ADRE Grade III & IV | axomexam")}
  <main class="wrap">
    <section class="hero">
      <h1>Mock Tests</h1>
      <p>
        Full-length practice papers for ADRE Grade III and Grade IV. Each set mixes every
        subject of the exam and runs on a live timer, so it works like the real paper.
        Choose Assamese or English, submit, and get an instant score with the correct
        answer and a short explanation for every question.
      </p>
      <div class="hero-stats">
        <div class="stat"><b>${SETS_PER_EXAM * EXAMS.length}</b> mock tests</div>
        <div class="stat"><b>${EXAMS.length}</b> exams</div>
        <div class="stat"><b>2</b> languages</div>
      </div>
    </section>
    ${blocks}
  </main>${foot()}`;
}

/* ---------- one playable set ---------- */

function setPage(exam, n, set) {
  const b = set.blueprint || {};
  const secBySlug = sectionMap(exam.id);
  const usedSections = new Map();
  const questions = (set.questions || []).map((q) => {
    const opts = (q.options || []).map((o) => {
      if (o && typeof o === "object") {
        return { en: o.en || "", as: o.as || "", fig: o.fig ? responsiveFig(o.fig) : "" };
      }
      return { en: String(o || ""), as: "", fig: "" };
    });
    const slug = String(q.id || "").replace(/-\d+$/, "");
    const sec = secBySlug.get(slug);
    if (sec) usedSections.set(sec.id, sec.label);
    return {
      en: (q.q && q.q.en) || "",
      as: (q.q && q.q.as) || "",
      fig: q.fig ? responsiveFig(q.fig) : "",
      opts,
      correct: Number.isInteger(q.correct) ? q.correct : -1,
      expEn: (q.explanation && q.explanation.en) || "",
      expAs: (q.explanation && q.explanation.as) || "",
      sec: sec ? sec.id : "",
    };
  });

  const order = new Map((b.sections || []).map((sec, i) => [sec.id, i]));
  const sections = [...usedSections]
    .map(([id, label]) => ({ id, label }))
    .sort((x, y) => (order.get(x.id) ?? 99) - (order.get(y.id) ?? 99));

  const payload = JSON.stringify({
    exam: exam.id,
    title: exam.title,
    set: n,
    minutes: b.durationMinutes || 120,
    totalMarks: Number(b.totalMarks || questions.length),
    marksPer: Number(b.marksPerQuestion || 1),
    negative: Number(b.negativeMarking || 0),
    sections,
    questions,
  }).replace(/</g, "\\u003c");

  return `${head(`${exam.title} — Full Paper Set ${n} | axomexam`)}
  <main class="wrap">
    <div id="setup" class="setup" style="margin-top:22px">
      <div class="exam-banner">
        <div class="eb-top">
          <span class="eb-tag">Institution mock test</span>
          <span class="eb-set">Set ${n} of ${SETS_PER_EXAM}</span>
        </div>
        <h1>${esc(exam.title)}</h1>
        <p class="eb-sub">${esc(exam.subtitle || "")}</p>
        <div class="metagrid">
          <div class="meta"><b>${questions.length}</b><span>Questions</span></div>
          <div class="meta"><b>${b.durationMinutes || 120}</b><span>Minutes</span></div>
          <div class="meta"><b>${b.totalMarks || questions.length}</b><span>Max marks</span></div>
          <div class="meta"><b>${b.negativeMarking ? "−" + b.negativeMarking : "0"}</b><span>Per wrong</span></div>
        </div>
      </div>

      <div class="setup-grid">
        <section class="panel">
          <h2 class="panel-h">Candidate</h2>
          <div class="cand-card" id="candcard">
            <div class="cand-avatar" id="candavatar">?</div>
            <div class="cand-body">
              <b id="candview">Details not added</b>
              <span id="candviewsub">Needed for your scorecard</span>
            </div>
            <button class="lnk-btn" type="button" id="candbtn">Add details</button>
          </div>
          <p class="panel-note">
            Your name, date of birth and roll number appear on the scorecard and on the
            PDF you save. Nothing is uploaded — they stay in this browser.
          </p>
        </section>

        <section class="panel">
          <h2 class="panel-h">Question language</h2>
          <div class="seg" id="langseg" role="group" aria-label="Question language">
            <button type="button" data-lang="en" aria-pressed="true">English</button>
            <button type="button" data-lang="as" aria-pressed="false">অসমীয়া</button>
          </div>
          <h2 class="panel-h" style="margin-top:18px">How it runs</h2>
          <ol class="steps">
            <li>The timer starts after a 3-second countdown and never pauses.</li>
            <li>Each question is worth 1 mark${
              b.negativeMarking ? `; ${b.negativeMarking} is deducted for a wrong answer` : ""
            }.</li>
            <li>Use the question palette to jump around. Answers can be changed any time.</li>
            <li>Submit whenever you are ready to see your scorecard.</li>
          </ol>
        </section>
      </div>

      <div class="start-bar">
        <div class="agree" id="agreewrap">
          <input type="checkbox" id="agree" />
          <label class="agree-txt" for="agree">I have read and accept the terms &amp; conditions for this test.</label>
        </div>
        <button class="start-btn" id="startbtn" type="button" disabled>Start test →</button>
      </div>
      <p class="panel-note" style="margin-top:10px">
        <button class="lnk" type="button" id="termslink">Read the terms &amp; conditions</button>
      </p>
    </div>

    <div id="runner" class="runner">
      <div class="paper-top">
        <span class="timer" id="timer">--:--</span>
        <span class="paper-meta" id="progress"></span>
        <span class="paper-sp"></span>
        <button class="pbtn" id="prevbtn" type="button">← Previous</button>
        <button class="pbtn" id="nextbtn" type="button">Next →</button>
        <button class="pbtn primary" id="submitbtn" type="button">Submit</button>
        <button class="pbtn quit" id="quitbtn" type="button">Quit</button>
        <div class="bar-track"><div class="bar-fill" id="barfill"></div></div>
      </div>

      <div class="qwrap">
        <div class="qhead">
          <span class="qno" id="qno"></span>
          <button class="qflag" id="flagbtn" type="button" aria-pressed="false">Mark for review</button>
        </div>
        <div class="qbody" id="qbody">
          <p class="qtext" id="qtext"></p>
          <div class="qfig" id="qfig"></div>
          <ul class="opts" id="opts"></ul>
          <div class="explain" id="explain" hidden></div>
        </div>
        <div class="qnav">
          <button class="pbtn" id="prevbtn2" type="button">← Previous</button>
          <button class="pbtn" id="nextbtn2" type="button">Next →</button>
        </div>
      </div>

      <div class="palette">
        <h3>Question palette</h3>
        <div class="legend">
          <span><i style="background:var(--ok)"></i>Answered</span>
          <span><i style="background:#fcd34d"></i>Marked</span>
          <span><i style="background:var(--line)"></i>Not answered</span>
        </div>
        <div class="pgrid" id="pgrid"></div>
      </div>
    </div>

    <div id="result" class="result" hidden></div>
  </main>

  <div class="cd" id="axo-cd" role="status" aria-live="assertive" hidden>
    <div>
      <div class="cd-num" id="axo-cd-num">3</div>
      <div class="cd-hint" id="axo-cd-hint">Get ready — the timer starts after 1</div>
    </div>
  </div>

  <div class="modal" id="axo-modal" role="dialog" aria-modal="true" aria-labelledby="axo-modal-title" hidden>
    <div class="modal-card" role="document">
      <div class="modal-ic" id="axo-modal-ic"></div>
      <h2 id="axo-modal-title"></h2>
      <p id="axo-modal-body"></p>
      <div class="modal-stats" id="axo-modal-stats"></div>
      <div class="modal-acts">
        <button class="pbtn" type="button" id="axo-modal-cancel">Cancel</button>
        <button class="pbtn primary" type="button" id="axo-modal-ok">Submit</button>
      </div>
    </div>
  </div>

  <div class="cmodal" id="cmodal" role="dialog" aria-modal="true" aria-labelledby="cmodal-title" hidden>
    <div class="cmodal-card" role="document">
      <div class="cm-head">
        <div class="cm-mark">A</div>
        <div class="cm-htx">
          <h2 id="cmodal-title">Candidate details</h2>
          <p>These print on your scorecard. Fill them before the paper starts.</p>
        </div>
      </div>
      <form class="cm-body" id="cform" novalidate>
        <div class="cm-fld">
          <label for="cand-name">Full name</label>
          <div class="cm-in has-ic">
            <span class="cm-ic">${ICON_USER}</span>
            <input id="cand-name" type="text" autocomplete="name" maxlength="60"
                   placeholder="e.g. Ananya Das" aria-describedby="cand-name-err" />
          </div>
          <span class="err" id="cand-name-err">Enter your name — at least 2 characters.</span>
        </div>
        <div class="cm-row">
          <div class="cm-fld">
            <label for="cand-dob">Date of birth</label>
            <div class="cm-in">
              <input id="cand-dob" type="date" autocomplete="bday" aria-describedby="cand-dob-err" />
            </div>
            <span class="err" id="cand-dob-err">Enter a real past date.</span>
          </div>
          <div class="cm-fld">
            <label for="cand-roll">Roll number <span>(optional)</span></label>
            <div class="cm-in">
              <input id="cand-roll" type="text" maxlength="24" placeholder="ADRE-2026-0142" />
            </div>
          </div>
        </div>
        <p class="cm-note">
          ${ICON_LOCK}
          <span>Kept in this browser only. Nothing is sent to a server.</span>
        </p>
      </form>
      <div class="cm-acts">
        <button class="cm-cancel" type="button" id="cmodal-cancel">Cancel</button>
        <button class="cm-ok" type="button" id="cmodal-ok" disabled>Save details</button>
      </div>
    </div>
  </div>

  <script id="paper" type="application/json">${payload}</script>
  <script>
  (function () {
    "use strict";
    var P = JSON.parse(document.getElementById("paper").textContent);
    var Q = P.questions;
    var L = "en";
    var ans = new Array(Q.length).fill(-1);
    var marked = new Array(Q.length).fill(false);
    var cur = 0;
    var started = false;
    var submitted = false;
    var totalSec = P.minutes * 60;
    var left = totalSec;
    var deadline = 0;   /* wall-clock ms; the timer is derived from this, never from tick counting */
    var tick = null;

    var $ = function (id) { return document.getElementById(id); };
    var setup = $("setup"), runner = $("runner"), result = $("result");

    function txt(o) {
      if (!o) return "";
      var v = o[L];
      return (v && String(v).trim()) || o.en || "";
    }
    function esc(s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function fmtTime(s) {
      var m = Math.floor(s / 60), r = s % 60;
      return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
    }

    /* language */
    Array.prototype.forEach.call(document.querySelectorAll("#langseg button"), function (b) {
      b.addEventListener("click", function () {
        L = b.dataset.lang;
        Array.prototype.forEach.call(document.querySelectorAll("#langseg button"), function (x) {
          x.setAttribute("aria-pressed", String(x === b));
        });
        if (started && !submitted) paint();
        if (submitted) showResult();
      });
    });

    var lastPainted = -1;

    /* The panel height is fixed, so a long stem or a figure question scrolls
     * inside .qbody. The fade tells the student there is more to read. */
    function syncMore() {
      var body = $("qbody"), wrap = document.querySelector(".qwrap");
      if (!body || !wrap) return;
      var more = body.scrollHeight - body.clientHeight - body.scrollTop > 4;
      wrap.classList.toggle("more", more);
    }

    function paint() {
      var q = Q[cur];
      var body = $("qbody");
      if (lastPainted !== cur) { body.scrollTop = 0; lastPainted = cur; }
      $("qno").textContent = "Question " + (cur + 1) + " of " + Q.length;
      $("qtext").textContent = txt({ en: q.en, as: q.as });
      $("qtext").setAttribute("lang", L === "as" ? "as" : "en");

      $("qfig").innerHTML = q.fig || "";

      var hasFig = q.opts.some(function (o) { return o.fig; });
      var list = $("opts");
      list.className = "opts" + (hasFig ? " fig" : "");
      list.innerHTML = q.opts.map(function (o, i) {
        var body = "";
        if (o.fig) body += '<span class="f">' + o.fig + "</span>";
        var t = txt(o);
        if (t) body += '<span class="t" lang="' + (L === "as" ? "as" : "en") + '">' + esc(t) + "</span>";
        return '<li><button class="opt" type="button" data-i="' + i + '" aria-pressed="' +
          (ans[cur] === i) + '"><span class="k">' + String.fromCharCode(65 + i) + "</span>" + body + "</button></li>";
      }).join("");

      Array.prototype.forEach.call(list.querySelectorAll(".opt"), function (b) {
        b.addEventListener("click", function () {
          var i = Number(b.dataset.i);
          ans[cur] = ans[cur] === i ? -1 : i;
          paint();
        });
      });

      $("flagbtn").setAttribute("aria-pressed", String(marked[cur]));
      $("progress").textContent = "Answered " + ans.filter(function (a) { return a >= 0; }).length + " / " + Q.length;
      $("barfill").style.width = Math.round((ans.filter(function (a) { return a >= 0; }).length / Q.length) * 100) + "%";
      syncMore();
      $("prevbtn").disabled = $("prevbtn2").disabled = cur === 0;
      $("nextbtn").disabled = $("nextbtn2").disabled = cur === Q.length - 1;
      updatePalette();
    }

    /* The palette is built once; answering a question only repaints classes,
     * so a fast run through 150 questions never rebuilds the grid. */
    var cells = null;
    function buildPalette() {
      var g = $("pgrid");
      g.innerHTML = Q.map(function (_, i) {
        return '<button class="pcell" type="button" data-i="' + i + '">' + (i + 1) + "</button>";
      }).join("");
      cells = g.querySelectorAll(".pcell");
      Array.prototype.forEach.call(cells, function (b) {
        b.addEventListener("click", function () {
          cur = Number(b.dataset.i);
          paint();
        });
      });
    }
    function updatePalette() {
      if (!cells) return;
      for (var i = 0; i < cells.length; i++) {
        cells[i].className = "pcell" + (ans[i] >= 0 ? " done" : "") +
          (marked[i] ? " marked" : "") + (i === cur ? " cur" : "");
      }
    }

    $("flagbtn").addEventListener("click", function () {
      marked[cur] = !marked[cur];
      paint();
    });

    function go(d) {
      var n = cur + d;
      if (n >= 0 && n < Q.length) { cur = n; paint(); }
    }
    $("qbody").addEventListener("scroll", syncMore, { passive: true });
    window.addEventListener("resize", syncMore);
    $("prevbtn").addEventListener("click", function () { go(-1); });
    $("nextbtn").addEventListener("click", function () { go(1); });
    $("prevbtn2").addEventListener("click", function () { go(-1); });
    $("nextbtn2").addEventListener("click", function () { go(1); });

    function start() {
      started = true;
      setup.style.display = "none";
      runner.classList.add("on");
      buildPalette();
      paint();
      paintTimer();
      countdown(3, function () {
        deadline = Date.now() + totalSec * 1000;
        tickTimer();
        tick = setInterval(tickTimer, 250);
      });
    }

    /* Derive the clock from a wall-clock deadline so the count stays correct
     * even when the tab is throttled, backgrounded or the device sleeps. */
    function tickTimer() {
      var msLeft = deadline - Date.now();
      left = Math.max(0, Math.ceil(msLeft / 1000));
      paintTimer();
      if (msLeft <= 0) {
        if (tick) { clearInterval(tick); tick = null; }
        submit(true);
      }
    }

    function paintTimer() {
      var t = $("timer");
      t.textContent = fmtTime(left);
      t.classList.toggle("low", left <= 300);
      t.setAttribute("aria-label", fmtTime(left) + " remaining");
    }

    /* 3-2-1 overlay shown before the paper becomes answerable. */
    var cdEl = $("axo-cd"), cdNum = $("axo-cd-num");
    function countdown(from, done) {
      var n = from;
      cdEl.hidden = false;
      requestAnimationFrame(function () { cdEl.classList.add("on"); });
      (function step() {
        cdNum.textContent = n === 0 ? "GO" : n;
        cdNum.classList.toggle("go", n === 0);
        cdNum.classList.remove("pop");
        void cdNum.offsetWidth;
        cdNum.classList.add("pop");
        if (n === 0) {
          setTimeout(function () {
            cdEl.classList.remove("on");
            cdEl.hidden = true;
            done();
          }, 520);
          return;
        }
        n--;
        setTimeout(step, 800);
      })();
    }

    /* Candidate details are collected in a popup and live in memory only;
     * nothing leaves the browser. Start stays locked until they are valid and
     * the terms are accepted. */
    var agreeBox = $("agree"), agreeWrap = $("agreewrap"), startBtn = $("startbtn");
    var candName = $("cand-name"), candDob = $("cand-dob"), candRoll = $("cand-roll");
    var cmodal = $("cmodal"), cmodalOk = $("cmodal-ok"), candBtn = $("candbtn");
    var cand = { name: "", dob: "", roll: "" };

    function dobOk(v) {
      if (!v) return false;
      var d = new Date(v + "T00:00:00");
      if (isNaN(d.getTime())) return false;
      var now = new Date();
      if (d > now) return false;
      return now.getFullYear() - d.getFullYear() >= 5;
    }
    function nameOk(v) { return v.trim().length >= 2; }

    function dobText(v) {
      var p = String(v || "").split("-");
      return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : "";
    }

    /* Mirror the saved details into the setup card so the student can see
     * what will be printed before committing to the paper. */
    function paintCand() {
      var ready = nameOk(cand.name) && dobOk(cand.dob);
      var av = $("candavatar"), card = $("candcard");
      av.textContent = ready ? cand.name.trim().charAt(0).toUpperCase() : "?";
      av.classList.toggle("on", ready);
      card.classList.toggle("ready", ready);
      $("candview").textContent = ready ? cand.name : "Details not added";
      var bits = [];
      if (ready) {
        bits.push("DOB " + dobText(cand.dob));
        if (cand.roll) bits.push("Roll " + cand.roll);
      } else {
        bits.push("Needed for your scorecard");
      }
      $("candviewsub").textContent = bits.join(" · ");
      candBtn.textContent = ready ? "Edit" : "Add details";
    }

    function syncStart() {
      var okName = nameOk(candName.value);
      var okDob = dobOk(candDob.value);
      startBtn.disabled = !(okName && okDob && agreeBox.checked);
      startBtn.classList.toggle("ready", okName && okDob && agreeBox.checked);
      agreeWrap.classList.toggle("on", agreeBox.checked);
      $("cand-name-err").classList.toggle("on", candName.value !== "" && !okName);
      $("cand-dob-err").classList.toggle("on", candDob.value !== "" && !okDob);
      candName.setAttribute("aria-invalid", String(candName.value !== "" && !okName));
      candDob.setAttribute("aria-invalid", String(candDob.value !== "" && !okDob));
      cmodalOk.disabled = !(okName && okDob);
    }

    var candReturn = null;
    function openCand() {
      candReturn = document.activeElement;
      cmodal.hidden = false;
      requestAnimationFrame(function () { cmodal.classList.add("on"); });
      document.body.style.overflow = "hidden";
      syncStart();
      setTimeout(function () { candName.focus(); }, 120);
    }
    function closeCand(save) {
      if (save) {
        if (!nameOk(candName.value)) { candName.focus(); return; }
        if (!dobOk(candDob.value)) { candDob.focus(); return; }
        cand = { name: candName.value.trim(), dob: candDob.value, roll: candRoll.value.trim() };
        paintCand();
      }
      cmodal.classList.remove("on");
      document.body.style.overflow = "";
      setTimeout(function () { cmodal.hidden = true; }, 180);
      if (candReturn && candReturn.focus) candReturn.focus();
    }

    [candName, candDob, candRoll].forEach(function (el) {
      el.addEventListener("input", syncStart);
      el.addEventListener("change", syncStart);
    });
    candName.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); if (!cmodalOk.disabled) closeCand(true); }
    });
    candDob.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); if (!cmodalOk.disabled) closeCand(true); }
    });
    agreeBox.addEventListener("change", syncStart);

    candBtn.addEventListener("click", openCand);
    cmodalOk.addEventListener("click", function () { closeCand(true); });
    $("cmodal-cancel").addEventListener("click", function () { closeCand(false); });
    cmodal.addEventListener("click", function (e) { if (e.target === cmodal) closeCand(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !cmodal.hidden) closeCand(false);
    });

    paintCand();
    syncStart();

    startBtn.addEventListener("click", function () {
      if (!nameOk(cand.name)) { openCand(); return; }
      if (!agreeBox.checked) { agreeBox.focus(); return; }
      start();
    });

    /* A student who has not added details yet is shown the popup straight
     * away, so the first thing they do is fill it in. */
    setTimeout(function () { if (!cmodal.hidden) return; if (!nameOk(cand.name)) openCand(); }, 350);

    /* Centred confirmation dialog. Returns a Promise<boolean>. */
    var ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>';
    var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/></svg>';

    var modalEl = $("axo-modal"), modalOk = $("axo-modal-ok"),
        modalCancel = $("axo-modal-cancel"), lastFocus = null;

    function closeModal(val) {
      modalEl.classList.remove("on");
      modalEl.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      return val;
    }

    function openModal(o) {
      return new Promise(function (resolve) {
        lastFocus = document.activeElement;
        $("axo-modal-ic").className = "modal-ic" + (o.warn ? " warn" : "");
        $("axo-modal-ic").innerHTML = o.warn ? ICON_WARN : ICON_CHECK;
        $("axo-modal-title").textContent = o.title;
        if (o.html) {
          $("axo-modal-body").innerHTML = o.html;
          $("axo-modal-body").hidden = false;
        } else {
          $("axo-modal-body").textContent = o.body;
          $("axo-modal-body").hidden = !o.body;
        }
        $("axo-modal-stats").innerHTML = (o.stats || []).map(function (st) {
          return '<div class="modal-stat' + (st.warn ? " warn" : "") + '"><b>' + st.value +
            "</b><span>" + st.label + "</span></div>";
        }).join("");
        $("axo-modal-stats").style.display = (o.stats || []).length ? "grid" : "none";
        modalOk.textContent = o.ok;
        modalCancel.textContent = o.cancel || "Cancel";
        modalCancel.style.display = o.cancel === null ? "none" : "";
        modalEl.hidden = false;
        requestAnimationFrame(function () { modalEl.classList.add("on"); });
        modalOk.focus();
        modalOk.onclick = function () { resolve(closeModal(true)); };
        modalCancel.onclick = function () { resolve(closeModal(false)); };
        modalEl.onclick = function (e) { if (e.target === modalEl) resolve(closeModal(false)); };
      });
    }

    document.addEventListener("keydown", function (e) {
      if (modalEl.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); modalCancel.click(); }
      if (e.key === "Tab") {
        var f = [modalCancel, modalOk].filter(function (b) { return b.style.display !== "none"; });
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });

    $("submitbtn").addEventListener("click", function () {
      var answered = ans.filter(function (a) { return a >= 0; }).length;
      var left0 = Q.length - answered;
      if (left0 === 0) {
        openModal({
          title: "Submit your paper?",
          body: "All " + Q.length + " questions are answered. You cannot change answers after submitting.",
          stats: [{ value: answered, label: "Answered" }],
          ok: "Submit paper", cancel: "Keep going"
        }).then(function (yes) { if (yes) submit(false); });
        return;
      }
      openModal({
        title: left0 + " question" + (left0 === 1 ? "" : "s") + " unanswered",
        body: "Unanswered questions score zero. Submitting now ends the test and shows your result.",
        warn: true,
        stats: [
          { value: answered, label: "Answered" },
          { value: left0, label: "Unanswered", warn: true },
          { value: Q.length, label: "Total" }
        ],
        ok: "Submit anyway", cancel: "Keep going"
      }).then(function (yes) { if (yes) submit(false); });
    });

    var TERMS = [
      "This is a practice paper built from the axomexam.in question bank. It is for self-assessment only and is not an official ADRE examination.",
      "Once you press Start, the " + P.minutes + "-minute timer runs continuously. It cannot be paused, and closing the tab ends the attempt.",
      "Each question carries 1 mark. " + (P.negative ? P.negative + " mark is deducted for each wrong answer" : "There is no negative marking") + ". Unanswered questions score zero.",
      "You may change or clear any answer, and mark questions for review, until you press Submit.",
      "The score, the correct answers and the explanations are shown only after you submit. Nothing is sent to a server — everything runs in your browser.",
      "Do not refresh the page or leave the test in the middle: the attempt is not saved and answers will be lost.",
      "If the timer runs out, the paper is submitted automatically with whatever answers are recorded at that moment."
    ];

    $("termslink").addEventListener("click", function (e) {
      e.preventDefault();
      openModal({
        title: "Terms & conditions",
        body: "",
        html: '<ul class="terms">' + TERMS.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>",
        ok: "I understand", cancel: null
      });
    });

    $("quitbtn").addEventListener("click", function () {
      var answered = ans.filter(function (a) { return a >= 0; }).length;
      openModal({
        title: "Quit this test?",
        body: "Your attempt will end and the answers you have given so far will be scored. This cannot be undone.",
        warn: true,
        stats: [
          { value: answered, label: "Answered" },
          { value: Q.length - answered, label: "Left", warn: true }
        ],
        ok: "Quit & score", cancel: "Stay in test"
      }).then(function (yes) { if (yes) submit(false, true); });
    });

    function submit(auto, quit) {
      if (submitted) return;
      submitted = true;
      if (tick) { clearInterval(tick); tick = null; }
      runner.classList.remove("on");
      showResult(auto, quit);
    }

    function showResult(auto, quit) {
      var marksPer = P.marksPer || 1;
      var negMark = P.negative || 0;
      var maxMarks = P.totalMarks || Q.length * marksPer;
      var right = 0, wrong = 0, skip = 0;
      var bySec = {};
      Q.forEach(function (q, i) {
        var k = q.sec || "";
        if (!bySec[k]) bySec[k] = { right: 0, wrong: 0, skip: 0 };
        if (ans[i] < 0) { skip++; bySec[k].skip++; }
        else if (ans[i] === q.correct) { right++; bySec[k].right++; }
        else { wrong++; bySec[k].wrong++; }
      });
      var earned = right * marksPer;
      var deducted = wrong * negMark;
      var net = earned - deducted;
      var pct = maxMarks ? Math.round((net / maxMarks) * 100) : 0;
      var pctCls = pct < 0 ? "neg" : "";
      var total = Q.length;

      var labelFor = function (id) {
        var s = (P.sections || []).filter(function (x) { return x.id === id; })[0];
        if (!s) return "";
        return (L === "as" && s.label && s.label.as) ? s.label.as : (s.label && s.label.en) || s.label || id;
      };

      var secRows = (P.sections || []).map(function (s) {
        var d = bySec[s.id] || { right: 0, wrong: 0, skip: 0 };
        var sn = d.right + d.wrong + d.skip;
        var sNet = d.right * marksPer - d.wrong * negMark;
        var sMax = sn * marksPer;
        return "<tr>" +
          "<td>" + esc(labelFor(s.id)) + "</td>" +
          '<td class="num">' + sn + "</td>" +
          '<td class="num pos">' + d.right + "</td>" +
          '<td class="num ng">' + d.wrong + "</td>" +
          '<td class="num">' + d.skip + "</td>" +
          '<td class="num">' + sMax + "</td>" +
          '<td class="num ' + (sNet < 0 ? "ng" : "pos") + '">' + sNet.toFixed(2) + "</td>" +
          "</tr>";
      }).join("");

      var attempted = right + wrong;
      var accuracy = attempted ? Math.round((right / attempted) * 100) : 0;

      var dobTx = "";
      if (cand.dob) {
        var dp = cand.dob.split("-");
        dobTx = dp.length === 3 ? dp[2] + "-" + dp[1] + "-" + dp[0] : cand.dob;
      }
      var now = new Date();
      var stamp = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
        ", " + now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

      result.hidden = false;
      result.innerHTML =
        '<div class="print-head">' +
          '<div class="ph-mark">A</div>' +
          '<div class="ph-tx"><b>axomexam.in</b><span>Institution mock test scorecard</span></div>' +
          '<div class="ph-sp"></div>' +
          '<div class="ph-wm">axomexam.in</div>' +
        "</div>" +
        "<h2>" + (quit ? "Test ended — scorecard" : auto ? "Time up — scorecard" : "Scorecard") + "</h2>" +
        '<p class="rsub">' + esc(P.title) + " · Full Paper Set " + P.set +
        " · " + (L === "as" ? "অসমীয়া" : "English") + "</p>" +

        '<div class="cand-line">' +
          "<div>Candidate<b>" + esc(cand.name || "—") + "</b></div>" +
          "<div>Date of birth<b>" + esc(dobTx || "—") + "</b></div>" +
          (cand.roll ? "<div>Roll number<b>" + esc(cand.roll) + "</b></div>" : "") +
          "<div>Submitted<b>" + esc(stamp) + "</b></div>" +
        "</div>" +

        '<div class="score-row">' +
          '<div class="score hero"><b>' + net.toFixed(2) + "</b><span>Final score</span></div>" +
          '<div class="score"><b>' + maxMarks + "</b><span>Maximum marks</span></div>" +
          '<div class="score ' + pctCls + '"><b>' + pct + "%</b><span>Percentage</span></div>" +
        "</div>" +

        '<div class="marks-note">' +
          "<span>Marks per question <b>" + marksPer + "</b></span>" +
          "<span>Negative marking <b>−" + negMark + "</b> per wrong answer</span>" +
          "<span>Unanswered <b>0</b></span>" +
        "</div>" +

        '<div class="score-row">' +
          '<div class="score ok"><b>' + right + "</b><span>Correct</span></div>" +
          '<div class="score bad"><b>' + wrong + "</b><span>Wrong</span></div>" +
          '<div class="score warn"><b>' + skip + "</b><span>Unanswered</span></div>" +
          '<div class="score"><b>' + total + "</b><span>Total questions</span></div>" +
        "</div>" +

        '<div class="marks-note">' +
          "<span>Awarded <b>+" + earned.toFixed(2) + "</b> (" + right + " × " + marksPer + ")</span>" +
          "<span>Deducted <b>−" + deducted.toFixed(2) + "</b> (" + wrong + " × " + negMark + ")</span>" +
          "<span>Net <b>" + net.toFixed(2) + "</b> of " + maxMarks + "</span>" +
        "</div>" +

        '<div class="verdict">' +
          '<div class="vmark">' + accuracy + "</div>" +
          '<div class="verdict-tx"><b>Accuracy on attempted questions: ' + accuracy + "%</b>" +
          "<span>" + right + " correct out of " + attempted + " attempted · " +
          net.toFixed(2) + " of " + maxMarks + " marks (" + pct + "%)</span></div>" +
        "</div>" +

        (secRows
          ? '<div class="sc-head"><h3>Section-wise score</h3><span>Negative marking applied per section</span></div>' +
            '<div class="sc-wrap"><table class="sc"><thead><tr>' +
            "<th>Section</th><th>Qs</th><th>Correct</th><th>Wrong</th><th>Skipped</th><th>Max</th><th>Score</th>" +
            "</tr></thead><tbody>" + secRows + "</tbody><tfoot><tr>" +
            "<td>Total</td><td>" + total + '</td><td class="pos">' + right + '</td><td class="ng">' + wrong +
            "</td><td>" + skip + "</td><td>" + maxMarks + "</td><td>" + net.toFixed(2) + "</td>" +
            "</tr></tfoot></table></div>"
          : "") +

        '<div class="result-acts">' +
          '<button class="pbtn primary" type="button" id="savebtn">Save scorecard as PDF</button>' +
          '<button class="pbtn" type="button" id="reviewbtn">Review all answers</button>' +
          '<button class="pbtn" type="button" id="retrybtn">Retake this set</button>' +
          '<a class="pbtn" href="/institution/mock-test/">All mock tests</a>' +
        "</div>" +
        '<div class="print-foot">' +
          "axomexam.in · practice paper for institution use · " +
          "generated " + esc(stamp) + " · this is not an official ADRE result." +
        "</div>" +
        '<div id="review"></div>';

      $("savebtn").addEventListener("click", function () { window.print(); });
      $("retrybtn").addEventListener("click", function () { location.reload(); });
      $("reviewbtn").addEventListener("click", function () {
        var box = $("review");
        if (box.dataset.on === "1") { box.innerHTML = ""; box.dataset.on = "0"; return; }
        box.dataset.on = "1";
        box.innerHTML = Q.map(function (q, i) {
          var opts = q.opts.map(function (o, oi) {
            var cls = "opt";
            if (oi === q.correct) cls += " review-right";
            else if (ans[i] === oi) cls += " review-wrong";
            var body = "";
            if (o.fig) body += '<span class="f">' + o.fig + "</span>";
            var t = txt(o);
            if (t) body += '<span class="t" lang="' + (L === "as" ? "as" : "en") + '">' + esc(t) + "</span>";
            return '<li><div class="' + cls + '"><span class="k">' + String.fromCharCode(65 + oi) + "</span>" + body + "</div></li>";
          }).join("");
          var exp = txt({ en: q.expEn, as: q.expAs });
          return '<div style="margin:18px 0;padding-top:16px;border-top:1px solid var(--line)">' +
            '<div class="qno">Question ' + (i + 1) + "</div>" +
            '<p class="qtext" lang="' + (L === "as" ? "as" : "en") + '">' + esc(txt({ en: q.en, as: q.as })) + "</p>" +
            (q.fig ? '<div class="qfig">' + q.fig + "</div>" : "") +
            '<ul class="opts' + (q.opts.some(function (o) { return o.fig; }) ? " fig" : "") + '">' + opts + "</ul>" +
            (exp ? '<div class="explain"><b>Explanation:</b> ' + esc(exp) + "</div>" : "") +
            "</div>";
        }).join("");
        box.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  })();
  </script>${foot()}`;
}

/* ---------- main ---------- */

function main() {
  let setsWritten = 0;
  for (const exam of EXAMS) {
    for (let n = 1; n <= SETS_PER_EXAM; n++) {
      const set = readJSON(path.join(SETS_DIR, exam.id, `set-${n}.json`));
      if (!set) {
        console.warn(`[skip] missing ${exam.id}/set-${n}.json`);
        continue;
      }
      const dir = path.join(OUT_DIR, exam.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `set-${n}.html`), setPage(exam, n, set));
      setsWritten++;
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "index.html"), pickerPage());

  console.log(`wrote institution/mock-test/index.html + ${setsWritten} set page(s)`);
}

main();
