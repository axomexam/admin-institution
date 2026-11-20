#!/usr/bin/env node
"use strict";

/*
 * tools/build-institution-portal.js
 *
 * Writes /institution/index.html: a standalone library view of the site where
 * every exam topic is a folder and every topic PDF is a file you can download.
 *
 * It reads data/institution/manifest.json, which tools/build-topic-pdfs.js
 * produces, so run the PDF build first:
 *
 *   node tools/build-topic-pdfs.js
 *   node tools/build-institution-portal.js
 *
 * The page deliberately does not load /js/app.js. The SPA router would
 * otherwise claim /institution/ and render its own 404 over the top of this
 * page. Keeping it standalone also means the folder browser keeps working if
 * the rest of the site's JavaScript fails.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "data", "institution", "manifest.json");
const OUT_DIR = path.join(ROOT, "institution");
const OUT = path.join(OUT_DIR, "index.html");

const SITE = "https://axomexam.in";
const BRAND = "axomexam.in";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const kb = (bytes) => {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const num = (n) => Number(n || 0).toLocaleString("en-IN");

/* Fold the flat section list into the section -> group -> topic tree the
 * folder browser walks. Sections without sub-categories get a single level. */
function buildTree(exams) {
  return exams.map((exam) => {
    const sections = [];
    const byId = new Map();
    for (const t of exam.sections) {
      let sec = byId.get(t.section);
      if (!sec) {
        sec = { id: t.section, title: t.sectionTitle, groups: [], files: [], count: 0, pages: 0 };
        byId.set(t.section, sec);
        sections.push(sec);
      }
      sec.count += t.count;
      sec.pages += (t.pdfs && t.pdfs.en && t.pdfs.en.pages) || 0;
      const file = {
        kind: "file",
        path: t.path,
        name: t.title,
        count: t.count,
        pdfs: t.pdfs,
      };
      if (t.group) {
        let g = sec.groups.find((x) => x.id === t.group);
        if (!g) {
          g = { id: t.group, title: t.groupTitle || { en: t.group.split("/").pop(), as: "" }, files: [], count: 0 };
          sec.groups.push(g);
        }
        g.files.push(file);
        g.count += t.count;
      } else {
        sec.files.push(file);
      }
    }
    return {
      id: exam.id,
      title: exam.title,
      sections,
      count: exam.sections.reduce((n, s) => n + s.count, 0),
      pages: exam.sections.reduce((n, s) => n + ((s.pdfs && s.pdfs.en && s.pdfs.en.pages) || 0), 0),
      files: exam.sections.length,
    };
  });
}

function jsonLd(tree) {
  const items = [];
  let pos = 1;
  for (const exam of tree) {
    items.push({
      "@type": "ListItem",
      position: pos++,
      name: exam.title.en,
      url: `${SITE}/institution/#${exam.id}`,
    });
  }
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE}/institution/#webpage`,
        url: `${SITE}/institution/`,
        name: "Institution Library — Topic-wise PDFs | axomexam",
        inLanguage: ["en", "as"],
        isPartOf: { "@id": `${SITE}/#website` },
        publisher: { "@id": `${SITE}/#organization` },
        description:
          "Download every axomexam question bank as a separate topic-wise PDF. ADRE Grade III and Grade IV, English or Assamese, free for institution use.",
        isAccessibleForFree: true,
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${SITE}/institution/#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Institution Library" },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${SITE}/institution/#itemlist`,
        name: "Institution Library",
        numberOfItems: items.length,
        itemListElement: items,
      },
    ],
  });
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
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px -16px rgba(0,0,0,.8);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg-soft); color: var(--ink);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  line-height: 1.55; font-size: 15px;
}
.as { font-family: "Noto Sans Bengali", "Noto Serif Bengali", sans-serif; }
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
[data-theme="light"] .i-moon, :root:not([data-theme="dark"]) .i-moon { display: none; }
[data-theme="dark"] .i-sun { display: none; }

/* ---------- hero ---------- */
.hero { padding: 34px 0 22px; }
.hero h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 33px); letter-spacing: -.8px; line-height: 1.2; }
.hero p { margin: 0; color: var(--ink-soft); max-width: 64ch; font-size: 15px; }
.hero-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.stat {
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  padding: 9px 14px; font-size: 13px; color: var(--muted); box-shadow: var(--shadow);
}
.stat b { display: block; font-size: 18px; color: var(--ink); letter-spacing: -.4px; line-height: 1.25; }

/* ---------- toolbar ---------- */
.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 6px 0 16px; }
.search { position: relative; flex: 1 1 260px; min-width: 200px; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--muted); }
.search input {
  width: 100%; padding: 11px 12px 11px 36px; border-radius: 11px; border: 1px solid var(--line);
  background: var(--bg); color: var(--ink); font: inherit; font-size: 14px;
}
.search input:focus { outline: 2px solid var(--brand-line); outline-offset: 1px; border-color: var(--brand); }
.tabs { display: flex; gap: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: 11px; padding: 4px; }
.tabs button {
  border: 0; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600;
  color: var(--muted); padding: 7px 14px; border-radius: 8px; cursor: pointer; white-space: nowrap;
}
.tabs button[aria-pressed="true"] { background: var(--brand); color: #fff; }

/* ---------- crumbs ---------- */
.crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13.5px; color: var(--muted); margin: 0 0 14px; }
.crumbs button {
  border: 0; background: transparent; font: inherit; color: var(--brand); font-weight: 600;
  cursor: pointer; padding: 2px 4px; border-radius: 6px;
}
.crumbs button:hover { background: var(--brand-soft); }
.crumbs .sep { color: var(--line); }
.crumbs .cur { color: var(--ink); font-weight: 700; }

/* ---------- grid ---------- */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(255px, 1fr)); gap: 12px; margin-bottom: 30px; }
.card {
  display: flex; gap: 12px; align-items: flex-start; text-align: left; width: 100%;
  background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 14px;
  font: inherit; color: inherit; cursor: pointer; box-shadow: var(--shadow);
  transition: border-color .15s, transform .15s;
}
.card:hover { border-color: var(--brand); transform: translateY(-1px); }
.card:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.card .ic { flex: 0 0 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--brand-soft); color: var(--brand); }
.card .ic svg { width: 19px; height: 19px; }
.card .nm { font-weight: 700; font-size: 14.5px; line-height: 1.35; letter-spacing: -.1px; }
.card .sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.card .sub b { color: var(--ink-soft); font-weight: 700; }
.card.file .ic { background: #fee2e2; color: #dc2626; }
[data-theme="dark"] .card.file .ic { background: #3f1d1d; color: #f87171; }
.card .dl { font-size: 11.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--brand); margin-top: 7px; display: inline-flex; align-items: center; gap: 4px; }
.card .dl svg { width: 13px; height: 13px; }

/* ---------- language chooser ---------- */
.dlg {
  position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 20px;
  background: rgba(15, 23, 42, .55); backdrop-filter: blur(2px);
}
.dlg[hidden] { display: none; }
.dlg-card {
  width: 100%; max-width: 430px; background: var(--bg); color: var(--ink);
  border: 1px solid var(--line); border-radius: 18px; padding: 22px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, .28);
}
.dlg-card h2 { margin: 0; font-size: 17px; letter-spacing: -.2px; line-height: 1.35; }
.dlg-card .dlg-sub { margin: 5px 0 18px; font-size: 13px; color: var(--muted); }
.dlg-opts { display: grid; gap: 10px; }
.dlg-opt {
  display: flex; align-items: center; gap: 13px; width: 100%; text-align: left;
  font: inherit; color: inherit; cursor: pointer;
  background: var(--bg); border: 1.5px solid var(--line); border-radius: 13px; padding: 13px 15px;
  transition: border-color .15s, background .15s;
}
.dlg-opt:hover, .dlg-opt:focus-visible { border-color: var(--brand); background: var(--brand-soft); outline: none; }
.dlg-opt .flag {
  flex: 0 0 40px; height: 40px; border-radius: 11px; display: grid; place-items: center;
  background: var(--brand-soft); color: var(--brand); font-weight: 800; font-size: 13px;
}
.dlg-opt.as .flag { font-family: "Noto Sans Bengali", sans-serif; font-size: 15px; }
.dlg-opt .nm { display: block; font-weight: 800; font-size: 14.5px; }
.dlg-opt .meta { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.dlg-close {
  margin-top: 14px; width: 100%; background: none; border: 0; font: inherit; font-size: 13px;
  color: var(--muted); cursor: pointer; padding: 8px; border-radius: 9px;
}
.dlg-close:hover { color: var(--ink); background: var(--brand-soft); }
@media (prefers-reduced-motion: reduce) { .dlg { backdrop-filter: none; } }

/* ---------- mock test banner ---------- */
.mt-banner {
  display: flex; align-items: center; gap: 14px; text-decoration: none;
  background: linear-gradient(135deg, #4f46e5, #6366f1 55%, #818cf8);
  color: #fff; border-radius: 16px; padding: 16px 18px; margin-bottom: 18px;
  box-shadow: 0 12px 32px -14px rgba(79, 70, 229, .7);
  transition: transform .15s, box-shadow .15s;
}
.mt-banner:hover { transform: translateY(-1px); box-shadow: 0 16px 38px -14px rgba(79, 70, 229, .8); }
.mt-banner-ic {
  flex: 0 0 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
  background: rgba(255,255,255,.18); color: #fff;
}
.mt-banner-ic svg { width: 21px; height: 21px; }
.mt-banner-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mt-banner-nm { font-weight: 800; font-size: 15.5px; letter-spacing: -.2px; }
.mt-banner-sub { font-size: 12.5px; color: rgba(255,255,255,.88); margin-top: 2px; }
.mt-banner-sub b { color: #fff; }
.mt-banner-go {
  font-size: 12.5px; font-weight: 800; letter-spacing: .3px; white-space: nowrap;
  background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35);
  padding: 9px 15px; border-radius: 10px;
}
@media (max-width: 620px) {
  .mt-banner { flex-wrap: wrap; }
  .mt-banner-go { width: 100%; text-align: center; }
}

/* ---------- prose / footer ---------- */
.prose { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 22px; margin-bottom: 34px; }
.prose h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -.3px; }
.prose h3 { margin: 20px 0 8px; font-size: 15px; letter-spacing: -.1px; }
.prose p { margin: 0 0 10px; color: var(--ink-soft); font-size: 14px; }
.prose ul { margin: 0 0 10px; padding-left: 20px; color: var(--ink-soft); font-size: 14px; }
.prose li { margin-bottom: 5px; }
.prose code { background: var(--bg-soft); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; font-size: 12.5px; }

.ftr { border-top: 1px solid var(--line); background: var(--bg); padding: 22px 0; }
.ftr-in { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; font-size: 13px; color: var(--muted); }
.ftr a { color: var(--brand); text-decoration: none; font-weight: 600; }

.empty { text-align: center; padding: 50px 20px; color: var(--muted); }
.empty b { display: block; color: var(--ink); margin-bottom: 4px; font-size: 15px; }

.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 620px) {
  .hero { padding: 24px 0 16px; }
  .hdr-tag, .hdr a.back { display: none; }
  .grid { grid-template-columns: 1fr; }
}
`;

const ICON_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`;
const ICON_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
const ICON_DL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`;
const ICON_SEARCH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;
const ICON_PAPER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`;
const ICON_SUN = `<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const ICON_MOON = `<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`;

const CLIENT_JS = `
(function () {
  "use strict";
  var ICO = {
    folder: ${JSON.stringify(ICON_FOLDER)},
    file: ${JSON.stringify(ICON_FILE)},
    dl: ${JSON.stringify(ICON_DL)}
  };
  var DATA = JSON.parse(document.getElementById("axo-lib-data").textContent);
  var EXAMS = DATA.exams;

  var state = { exam: EXAMS[0] ? EXAMS[0].id : null, sec: null, grp: null, q: "" };

  var elGrid = document.getElementById("axo-grid");
  var elCrumbs = document.getElementById("axo-crumbs");
  var elSearch = document.getElementById("axo-search");
  var elTabs = document.getElementById("axo-tabs");
  var elCount = document.getElementById("axo-count");

  function exam() { for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].id === state.exam) return EXAMS[i]; return null; }
  function section() {
    var e = exam(); if (!e) return null;
    for (var i = 0; i < e.sections.length; i++) if (e.sections[i].id === state.sec) return e.sections[i];
    return null;
  }
  function group() {
    var s = section(); if (!s) return null;
    for (var i = 0; i < s.groups.length; i++) if (s.groups[i].id === state.grp) return s.groups[i];
    return null;
  }

  function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
  function size(b) {
    if (!b) return "";
    var mb = b / 1048576;
    return mb >= 1 ? mb.toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function label(t) { return t && (t.en || t.as) ? esc(t.en || t.as) : ""; }

  function fileCard(f) {
    var en = f.pdfs && f.pdfs.en;
    var bits = [];
    if (f.count) bits.push("<b>" + fmt(f.count) + "</b> questions");
    if (en && en.pages) bits.push("<b>" + fmt(en.pages) + "</b> pages");
    if (en && en.bytes) bits.push(size(en.bytes));
    return '<a class="card file" href="' + esc(en ? en.pdf : "#") + '" download data-dl="' + esc(f.path) + '">' +
      '<span class="ic">' + ICO.file + "</span>" +
      "<span>" +
        '<span class="nm">' + label(f.name) + "</span>" +
        '<span class="sub">' + bits.join(" &middot; ") + "</span>" +
        '<span class="dl">' + ICO.dl + "Download PDF</span>" +
      "</span></a>";
  }

  function folderCard(name, sub, onClickKey) {
    return '<button class="card" type="button" data-open="' + esc(onClickKey) + '">' +
      '<span class="ic">' + ICO.folder + "</span>" +
      "<span>" +
        '<span class="nm">' + esc(name) + "</span>" +
        '<span class="sub">' + sub + "</span>" +
      "</span></button>";
  }

  function render() {
    var e = exam();
    if (!e) { elGrid.innerHTML = '<div class="empty"><b>No library data</b>Run the PDF build first.</div>'; return; }
    var s = section(), g = group();
    var q = state.q.trim().toLowerCase();
    var crumbs = [];
    var cards = [];

    crumbs.push('<button type="button" data-open="exam">All books</button>');
    if (s) crumbs.push('<span class="sep">/</span><button type="button" data-open="sec">' + label(s.title) + "</button>");
    if (g) crumbs.push('<span class="sep">/</span><span class="cur">' + label(g.title) + "</span>");

    if (q) {
      /* Search spans the whole selected book so a reader can jump straight to
       * a topic instead of opening folders by hand. */
      var hits = [];
      e.sections.forEach(function (sec) {
        sec.files.forEach(function (f) { hits.push({ f: f, where: label(sec.title) }); });
        sec.groups.forEach(function (grp) {
          grp.files.forEach(function (f) { hits.push({ f: f, where: label(sec.title) + " / " + label(grp.title) }); });
        });
      });
      hits = hits.filter(function (h) {
        return (h.f.name.en || "").toLowerCase().indexOf(q) >= 0 ||
               (h.f.name.as || "").toLowerCase().indexOf(q) >= 0 ||
               (h.f.path || "").toLowerCase().indexOf(q) >= 0 ||
               h.where.toLowerCase().indexOf(q) >= 0;
      });
      crumbs = ['<span class="cur">Search: ' + esc(state.q) + "</span>"];
      cards = hits.map(function (h) {
        var c = fileCard(h.f);
        return c.replace('<span class="sub">', '<span class="sub">' + h.where + " &middot; ");
      });
      elCount.textContent = hits.length + (hits.length === 1 ? " topic" : " topics");
    } else if (!s) {
      cards = e.sections.map(function (sec) {
        var n = sec.files.length + sec.groups.reduce(function (a, grp) { return a + grp.files.length; }, 0);
        return folderCard(label(sec.title), "<b>" + n + "</b> topics &middot; <b>" + fmt(sec.count) + "</b> questions", "sec:" + sec.id);
      });
      elCount.textContent = e.sections.length + " subject folders";
    } else if (!g && s.groups.length) {
      cards = s.groups.map(function (grp) {
        return folderCard(label(grp.title), "<b>" + grp.files.length + "</b> topics &middot; <b>" + fmt(grp.count) + "</b> questions", "grp:" + grp.id);
      });
      s.files.forEach(function (f) { cards.push(fileCard(f)); });
      elCount.textContent = s.groups.length + " folders, " + s.files.length + " files";
    } else {
      var files = g ? g.files : s.files;
      cards = files.map(fileCard);
      elCount.textContent = files.length + (files.length === 1 ? " topic" : " topics");
    }

    elCrumbs.innerHTML = crumbs.join("");
    elGrid.innerHTML = cards.length
      ? cards.join("")
      : '<div class="empty"><b>Nothing here</b>Try another folder or clear the search.</div>';

    Array.prototype.forEach.call(elTabs.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.exam === state.exam));
    });
  }

  /* Every download asks for the language first: the PDFs are single-language,
   * so the choice decides which file the reader gets. */
  var elDlg = document.getElementById("axo-lang");
  var elDlgTitle = document.getElementById("axo-lang-title");
  var elDlgSub = document.getElementById("axo-lang-sub");
  var elDlgEn = document.getElementById("axo-lang-en");
  var elDlgAs = document.getElementById("axo-lang-as");
  var pending = null;
  var lastFocus = null;

  function findFile(path) {
    for (var i = 0; i < EXAMS.length; i++) {
      var e = EXAMS[i];
      for (var j = 0; j < e.sections.length; j++) {
        var s = e.sections[j];
        var all = s.files.concat(s.groups.reduce(function (a, g) { return a.concat(g.files); }, []));
        for (var k = 0; k < all.length; k++) if (all[k].path === path) return all[k];
      }
    }
    return null;
  }

  function openLangDialog(path) {
    var f = findFile(path);
    if (!f) return;
    pending = f;
    elDlgTitle.textContent = label(f.name);
    var en = f.pdfs.en;
    var as = f.pdfs.as;
    elDlgSub.textContent = fmt(f.count) + " questions · " +
      fmt(en.pages) + " pages · " + size(en.bytes);
    elDlgEn.setAttribute("data-suffix", "");
    elDlgAs.setAttribute("data-suffix", "-as");
    elDlgEn.querySelector(".meta").textContent = fmt(en.pages) + " pages · " + size(en.bytes);
    elDlgAs.querySelector(".meta").textContent = fmt(as.pages) + " pages · " + size(as.bytes);
    lastFocus = document.activeElement;
    elDlg.hidden = false;
    elDlgEn.focus();
  }

  function closeLangDialog() {
    elDlg.hidden = true;
    pending = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function startDownload(lang) {
    if (!pending) return;
    var url = (pending.pdfs[lang] || pending.pdfs.en).pdf;
    closeLangDialog();
    var a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  elDlgEn.addEventListener("click", function () { startDownload("en"); });
  elDlgAs.addEventListener("click", function () { startDownload("as"); });
  elDlg.addEventListener("click", function (ev) {
    if (ev.target.closest("[data-close]")) closeLangDialog();
  });
  document.addEventListener("keydown", function (ev) {
    if (elDlg.hidden) return;
    if (ev.key === "Escape") { ev.preventDefault(); closeLangDialog(); }
  });

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("[data-dl]");
    if (!a) return;
    ev.preventDefault();
    openLangDialog(a.getAttribute("data-dl"));
  });

  elGrid.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-open]");
    if (!t) return;
    var key = t.getAttribute("data-open");
    if (key === "exam") { state.sec = null; state.grp = null; }
    else if (key === "sec") { state.grp = null; }
    else if (key.indexOf("sec:") === 0) { state.sec = key.slice(4); state.grp = null; }
    else if (key.indexOf("grp:") === 0) { state.grp = key.slice(4); }
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  elCrumbs.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-open]");
    if (!t) return;
    var key = t.getAttribute("data-open");
    if (key === "exam") { state.sec = null; state.grp = null; }
    if (key === "sec") { state.grp = null; }
    state.q = "";
    elSearch.value = "";
    render();
  });

  elSearch.addEventListener("input", function () {
    state.q = elSearch.value;
    render();
  });

  elTabs.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-exam]");
    if (!b) return;
    state.exam = b.dataset.exam;
    state.sec = null; state.grp = null; state.q = "";
    elSearch.value = "";
    render();
    if (history.replaceState) history.replaceState(null, "", "#" + state.exam);
  });

  /* Deep link: /institution/#adre-grade-4 opens that book directly. */
  function fromHash() {
    var id = (location.hash || "").replace(/^#/, "");
    for (var i = 0; i < EXAMS.length; i++) if (EXAMS[i].id === id) { state.exam = id; return; }
  }
  window.addEventListener("hashchange", function () {
    fromHash();
    state.sec = null; state.grp = null; state.q = "";
    elSearch.value = "";
    render();
  });

  /* Theme, matching the rest of the site's localStorage key. */
  var root = document.documentElement;
  document.getElementById("axo-theme").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") === "dark";
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("axomexam-theme", next); } catch (err) {}
  });

  fromHash();
  render();
})();
`;

function page(tree, manifest) {
  const totalQ = tree.reduce((n, e) => n + e.count, 0);
  const totalFiles = tree.reduce((n, e) => n + e.files, 0);
  const totalPages = tree.reduce((n, e) => n + e.pages, 0);

  const tabs = tree
    .map(
      (e) =>
        `<button type="button" data-exam="${esc(e.id)}" aria-pressed="${tree[0] && e.id === tree[0].id}">${esc(
          e.title.en
        )}</button>`
    )
    .join("");

  const staticList = tree
    .map(
      (e) => `<h3>${esc(e.title.en)} — ${num(e.count)} questions</h3><ul>${e.sections
        .map((s) => {
          const files = s.files.concat(...s.groups.map((g) => g.files));
          return files
            .map(
              (f) =>
                `<li>${esc(f.name.en)} — ${num(f.count)} questions:
                 <a href="${esc(f.pdfs.en.pdf)}">English</a> /
                 <a href="${esc(f.pdfs.as.pdf)}">অসমীয়া</a></li>`
            )
            .join("");
        })
        .join("")}</ul>`
    )
    .join("");

  const title = "Institution Library — Topic-wise PDFs | axomexam";
  const desc =
    "Download every axomexam question bank as a separate topic-wise PDF. ADRE Grade III and Grade IV, English or Assamese, free for institution use.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <!-- A shared library link for one institution, not a search landing page.
       Keeping it out of the index avoids a second copy of the topic prose
       competing with /downloads/ and the exam pages. -->
  <meta name="robots" content="noindex, follow" />
  <meta name="theme-color" content="#4f46e5" />
  <link rel="canonical" href="${SITE}/institution/" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="axomexam" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${SITE}/institution/" />
  <meta property="og:image" content="${SITE}/og-image.png" />
  <meta property="og:locale" content="en_IN" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${SITE}/og-image.png" />

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="${SITE}/manifest.webmanifest" />

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

  <script type="application/ld+json">${jsonLd(tree)}</script>
  <style>${CSS}</style>
</head>
<body>
  <header class="hdr">
    <div class="wrap hdr-in">
      <a class="brand" href="/" aria-label="axomexam home">
        <span class="brand-mark">A</span>
        <span class="brand-txt">axomexam.in</span>
      </a>
      <span class="hdr-tag">Institution Library</span>
      <span class="hdr-sp"></span>
      <a class="back" href="${SITE}/downloads/">All downloads</a>
      <button class="tgl" id="axo-theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
        ${ICON_SUN}${ICON_MOON}
      </button>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <h1>Institution Library</h1>
      <p>
        Every axomexam question bank, one PDF per topic, arranged like folders on a computer.
        Open a subject, pick a topic, choose English or Assamese, and download it. Each file is
        in a single language with answers and explanations, and carries the axomexam.in
        watermark on every page.
      </p>
      <div class="hero-stats">
        <div class="stat"><b>${num(totalFiles)}</b> topic PDFs</div>
        <div class="stat"><b>${num(totalQ)}</b> questions</div>
        <div class="stat"><b>${num(totalPages)}</b> pages</div>
        <div class="stat"><b>${tree.length}</b> exam books</div>
        <div class="stat"><b>10</b> mock tests</div>
      </div>
    </section>

    <a class="mt-banner" href="/institution/mock-test/">
      <span class="mt-banner-ic">${ICON_PAPER}</span>
      <span class="mt-banner-tx">
        <span class="mt-banner-nm">Mock Tests — ADRE Grade III &amp; IV</span>
        <span class="mt-banner-sub"><b>10</b> full-length papers · 5 sets per exam · live timer, instant score, bilingual</span>
      </span>
      <span class="mt-banner-go">Start a test →</span>
    </a>

    <div class="bar">
      <div class="search">
        ${ICON_SEARCH}
        <input id="axo-search" type="search" autocomplete="off" spellcheck="false"
               placeholder="Search a topic, e.g. synonyms, mensuration, Assam history" aria-label="Search topics" />
      </div>
      <div class="tabs" id="axo-tabs" role="group" aria-label="Choose an exam book">${tabs}</div>
    </div>

    <nav class="crumbs" id="axo-crumbs" aria-label="Folder path"></nav>
    <p class="sr" id="axo-count" role="status" aria-live="polite"></p>
    <div class="grid" id="axo-grid"></div>

    <section class="prose">
      <h2>How this library is organised</h2>
      <p>
        The library mirrors the folder structure of the question bank: exam book, then subject,
        then topic. Opening <em>ADRE Grade III</em> shows its six subject folders — General
        Mathematics, General English, General Knowledge and Assam GK, History, Logical Reasoning
        and Social Studies. Inside a folder, each topic is a single PDF you can download on its
        own, so a teacher can hand out exactly one topic without printing the whole book.
      </p>

      <h3>What each PDF contains</h3>
      <ul>
        <li>Every question in that topic, in exam order, with four options.</li>
        <li>The correct answer marked, plus the explanation — in whichever language you picked.</li>
        <li>The axomexam.in watermark across the page, and the logo and site name in the top corner of every page.</li>
        <li>A page number in the footer, so a printed set stays in order.</li>
      </ul>

      <h3>Downloading for an institution</h3>
      <p>
        There is no login, no paywall and no per-seat limit. Open a folder, click a file, pick
        English or অসমীয়া in the dialog, and that language's PDF downloads. Each topic is a
        separate file, so you take only what you need. Files are print-ready on A4 and stay
        readable in black and white.
      </p>

      <h3>Which books are available now</h3>
      <p>
        Two books are published in this library today: <strong>ADRE 3.0 Grade III</strong> and
        <strong>ADRE 3.0 Grade IV</strong>. Other exams on the site are still being converted and
        will appear here as separate books when their PDFs are ready. The question data itself is
        always available on the practice pages, so nothing is hidden while a book is being built.
      </p>

      <h3>Keeping a copy up to date</h3>
      <p>
        A PDF is a snapshot. When the question bank gains new questions, the matching topic PDF is
        rebuilt and the download link serves the new file. If you archive these files for a class,
        re-download the topics you use at the start of each term so your copy matches the site.
      </p>

      <h3>Mock tests</h3>
      <p>
        Alongside the PDFs there are <strong>10 full-length mock tests</strong> — 5 sets each for
        ADRE Grade III and Grade IV. Every set mixes all the subjects of that paper and runs on a
        live timer, so a batch can sit a paper exactly as it appears in the exam hall. Pick
        Assamese or English before starting, use the question palette to move around, and submit
        to get an instant score with the correct answer and an explanation for every question.
        Negative marking of 0.25 applies, as in the real paper.
      </p>
      <p>
        These tests run entirely in the browser, so a whole classroom can take the same paper at
        the same time without any login. They are meant for your students only and are excluded
        from search engines.
      </p>
    </section>

    <noscript>
      <section class="prose">
        <h2>All topics</h2>
        <p>The folder browser needs JavaScript. Every PDF is listed here as a direct link.</p>
        ${staticList}
      </section>
    </noscript>
  </main>

  <footer class="ftr">
    <div class="wrap ftr-in">
      <span>&copy; 2026 <strong>axomexam.in</strong> — free exam preparation, English &amp; Assamese</span>
      <span><a href="${SITE}/downloads/">Downloads</a> &middot; <a href="${SITE}/contact/">Contact</a> &middot; <a href="${SITE}/privacy/">Privacy</a></span>
    </div>
  </footer>

  <div class="dlg" id="axo-lang" role="dialog" aria-modal="true" aria-labelledby="axo-lang-title" hidden>
    <div class="dlg-card">
      <h2 id="axo-lang-title">Download PDF</h2>
      <p class="dlg-sub" id="axo-lang-sub"></p>
      <div class="dlg-opts">
        <button type="button" class="dlg-opt" id="axo-lang-en">
          <span class="flag">EN</span>
          <span><span class="nm">English</span><span class="meta"></span></span>
        </button>
        <button type="button" class="dlg-opt as" id="axo-lang-as">
          <span class="flag">অ</span>
          <span><span class="nm">অসমীয়া</span><span class="meta"></span></span>
        </button>
      </div>
      <button type="button" class="dlg-close" data-close>Cancel</button>
    </div>
  </div>

  <script type="application/json" id="axo-lib-data">${JSON.stringify({ generatedAt: manifest.generatedAt, exams: tree })}</script>
  <script>${CLIENT_JS}</script>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`Missing ${path.relative(ROOT, MANIFEST)}. Run tools/build-topic-pdfs.js first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const tree = buildTree(manifest.exams || []);
  if (!tree.length) {
    console.error("Manifest has no exams; nothing to publish.");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, page(tree, manifest), "utf8");

  const files = tree.reduce((n, e) => n + e.files, 0);
  const qs = tree.reduce((n, e) => n + e.count, 0);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
  console.log(`  ${tree.length} exam books, ${files} topic PDFs, ${qs} questions`);
  console.log(`  ${Math.round(fs.statSync(OUT).size / 1024)} KB`);
}

main();
