# Evgeni Glushenkov — Resume & Portfolio

Personal multilingual resume and portfolio website, published with GitHub Pages.

**Live site:** https://evgeniglushenkov.github.io/resume/

## Pages

| Path | Purpose |
|---|---|
| `index.html` | Main profile page (Russian) |
| `en.html` | Main profile page (English) |
| `zh.html` | Main profile page (Chinese) |
| `resume.html` | Interactive resume (Russian) |
| `resume-en.html` | Interactive resume (English) |
| `resume-zh.html` | Interactive resume (Chinese) |
| `mindbox.html` | Tailored Enterprise CSM application page |

## Content model

- `landing-data.json`, `landing-data.en.json`, `landing-data.zh.json` — localized main-page copy.
- `resume-data.json`, `resume-data.en.json`, `resume-data.zh.json` — localized resume data. Each file contains `kam`, `pm` and `ai` variants.
- `site-config.json` — language and page configuration.

HTML and JavaScript render these data files. Keep dates, metrics, titles and factual claims consistent across translations. Update all language versions when a factual source value changes.

## Editing content

1. Open the [admin page](https://evgeniglushenkov.github.io/resume/admin/).
2. Sign in through Telegram, select the relevant data file and edit the fields.
3. Review the preview and save. The configured Cloudflare Worker commits the JSON change to this repository.
4. Alternatively, edit the appropriate JSON file directly in GitHub and commit it.

The admin interface requires a configured Cloudflare Worker and Telegram approval. See [worker/SETUP.md](worker/SETUP.md). Never commit bot tokens, GitHub tokens, session secrets or other credentials.

## Run locally

Requires Node.js 22 or later for validation and Worker tests. The static website itself has no frontend package dependencies.

```bash
git clone https://github.com/EvgeniGlushenkov/resume.git
cd resume
npm run check
python3 -m http.server 8000
```

Open http://localhost:8000. Static pages work locally; admin operations, analytics and Telegram notifications require their external services.

## Validation and tests

```bash
npm run check:json
npm run check:syntax
npm test
npm run check
```

- `check:json` parses localized JSON and validates required structures.
- `check:syntax` runs Node.js syntax checks on repository JavaScript files.
- `test` runs Worker tests with mocked Telegram and GitHub requests; it does not call live services.
- `check` runs all three.

GitHub Actions runs `npm run check` on pushes to `main` and pull requests targeting `main`.

## Repository structure

- `admin/` — browser-based content editor.
- `worker/` — Cloudflare Worker, setup guide and tests.
- `scripts/` — local validation scripts.
- `.github/workflows/` — GitHub Actions CI.
- `fonts/` — fonts used by PDF generation.
- `landing-data*.json` — localized landing-page content.
- `resume-data*.json` — localized resume content and variants.
- `resume-pdf.js` — client-side PDF generation.

## Services and deployment

- Public website: GitHub Pages.
- Admin API and Telegram authorization: Cloudflare Worker.
- Short-lived authorization state and visit statistics: Cloudflare KV.

CI validates the repository; it does not deploy the Worker or change GitHub Pages settings.
