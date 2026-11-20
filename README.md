# axomexam · Institution portal

Static portal for partner institutions. Two sections:

- **Topic-wise question banks** — 166 topics across ADRE 3.0 Grade III and Grade IV,
  one PDF per topic per language (English `topic.pdf`, Assamese `topic-as.pdf`).
- **Full-paper mock tests** — 5 timed sets per exam, with terms, countdown, quit and review.

## Structure

```
institution/                  generated pages (portal + mock-test runner)
data/download/<exam>/<section>/<topic>[-as].pdf
data/institution/manifest.json   topic index the portal renders from
data/exams/<exam>/<section>/<topic>/question-N.json   question-bank source
data/exam-mock-sets/<exam>/set-N.json                 mock-test source
tools/build-*.js              generators
```

## Build

```bash
npm install
npm run build          # PDFs, then portal, then mock tests
npm run build:portal   # only the portal (reads the manifest)
npm run build:mock-tests
```

`build:pdfs` needs a Chromium binary. Set `CHROME_PATH`, or install
`/usr/bin/chromium`. Pass `--check` to report drift without writing.

## Notes

- Pages are `noindex` — this is a partner portal, not public content.
- All links are root-absolute (`/institution/`, `/data/download/`), so the repo
  must be served from the domain root.
