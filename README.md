# Signal — Customer Feedback Intelligence

An independent customer review-analysis app. This folder contains its own code, dependencies, data, tests, and server configuration; it does not depend on the portfolio folder.

## Run

Use Node.js 22.18+ or Node.js 24 for the included TypeScript tests.

```sh
npm install
npm run dev
```

Open http://localhost:3001. The home route opens `/feedback`. Both development and production servers use port 3001 by default. Keep the portfolio on port 3000.

On Windows, open a terminal in `H:\Codes\signal-feedback` and run `npm install` followed by `npm run dev`. For production, run `npm run build` and `npm start`.

The app starts with 120 real Amazon Reviews 2023 reviews from the All Beauty category across six products. A dataset selector also offers the original 36 fictional reviews. Nothing is saved to a database or browser storage; refreshing restores the real Amazon sample. CSV import and the local baseline run in the browser.

## AI connection

The app reads `GEMINI_API_KEY` from its own server environment. The existing local AI configuration was copied into this project’s ignored `.env.local`; no portfolio files are read at runtime. Add it to `.env.local` if it is not already configured, then restart the server. Never use a `NEXT_PUBLIC_` variable for the key.

```dotenv
GEMINI_API_KEY=your_key_here
# Optional; defaults to gemini-2.5-flash:
FEEDBACK_GEMINI_MODEL=gemini-2.5-flash
```

Click **Analyze with AI** to send the current dataset's review text and product names to Google Gemini. IDs accompany the request so results can be mapped back to source reviews. Ratings and reference labels are excluded from model input. The action always analyzes the whole loaded dataset; product and period filters affect displayed results afterward.

The endpoint uses [Gemini structured JSON output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en), validates the response, and preserves the original review text. Errors keep the previous results intact. A configured key is detected automatically; its validity and available quota are determined when an analysis runs.

## Features

- CSV upload with quoted fields, escaped quotes, multiline reviews, validation, and duplicate reporting.
- Transparent local keyword sentiment and topic baseline; optional Gemini sentiment and topic classification.
- Positive, neutral, and negative sentiment; Delivery, Quality, Price, Support, Usability, and Other topics.
- Product and month filters; topic counts, monthly sentiment proportions, product comparisons, and rating averages.
- Evidence drill-down, full-text review search, sentiment/topic filters, pagination, and per-review reasoning.
- CSV export of filtered results and Markdown reports containing source review IDs and text.
- Accuracy, macro F1, confusion matrix, and disagreements when reference sentiment labels are present.
- Responsive layout, keyboard-accessible controls, and an Escape-dismissible upload dialog.

## CSV format

Download the real default CSV using the source panel or `/feedback/amazon-default.csv`. The fictional labeled template remains available in the upload dialog and at `/feedback/sample-reviews.csv`.

| Column | Requirement |
| --- | --- |
| `review` | Required text, 1–2,000 characters. `text` and `review_text` are accepted aliases. |
| `product` | Optional, up to 100 characters; defaults to Unspecified. |
| `date` | Optional real calendar date in YYYY-MM-DD format. Undated reviews are excluded from time charts. |
| `rating` | Optional number from 1 through 5. Used for the rating average, not sentiment prediction. |
| `expected_sentiment` | Optional `positive`, `neutral`, or `negative` reference label for evaluation. |

Maximum 120 review rows and 400 KB per file. Blank reviews and exact duplicates are skipped with a message. Invalid fields produce row-specific errors. Imported IDs are generated from row positions. Exported formula-like cells are prefixed with an apostrophe to prevent spreadsheet execution.

## Evaluation and interpretation

The real Amazon default has no reference sentiment labels. Star ratings are never converted into evaluation labels. The optional fictional sample labels are author-assigned and illustrative, not independently annotated or a representative benchmark. Accuracy is correct predictions divided by labeled reviews. Macro F1 averages class F1 across reference classes present in the filtered selection. Unlabeled rows are excluded. The matrix uses reference classes for rows and predicted classes for columns.

The baseline is a simple English word lexicon with a three-word negation window. It can miss sarcasm, context, mixed sentiment, and unfamiliar words; it is intentionally labeled as a baseline, not machine learning. AI classifications may also be wrong. Topic assignments can overlap, and a negative review mentioning a topic does not establish negative sentiment toward that specific aspect. Suggested investigation steps are fixed topic-based suggestions, not verified root causes or AI-generated recommendations.

For a credible portfolio study, gather a suitably licensed real dataset, label a separate sample before viewing predictions, ask another annotator to review ambiguous cases, and report per-class metrics alongside sample size. This version uses predefined topics, not embedding clustering.

## Validation

```sh
npm run test:feedback
npx tsc --noEmit
npm run build
```

Automated tests cover CSV quoting and validation, duplicate handling, baseline negation, exclusion of ratings and labels from sentiment prediction, export escaping, evaluation metrics, and rejection of malformed AI output.

Browser checks performed for the initial implementation: review drill-down, search, CSV export, evaluation, invalid and valid uploads, a successful three-review Gemini request, mobile overflow, and keyboard dismissal of the upload dialog.

## Files

- `app/feedback/`: interface, scoped styles, and page metadata.
- `app/api/feedback/route.ts`: bounded request parsing, AI connection, response validation, and error handling.
- `lib/feedback/analysis.ts`: import/export, baseline, metrics, and shared validators.
- `lib/feedback/demo.ts`: fictional reviews and reference labels.
- `tests/feedback.test.mjs`: data and analysis regression tests.

The AI endpoint has a small in-process concurrency and request limit (two concurrent analyses, six per minute per server process). These are demo safeguards, not distributed quotas or user authentication. Add deployment-level access controls and shared rate limits before offering an unrestricted public AI service. This change does not publish the portfolio.

## Real dataset and larger download

Source: [Amazon Reviews 2023 — McAuley Lab](https://amazon-reviews-2023.github.io/), All Beauty category. Product names are joined from the published metadata by parent_asin. The release covers historical reviews; this is not a live feed.

- Default: `data/feedback/amazon-default.json` and `public/feedback/amazon-default.csv` — 120 reviews across six products, dated 2014-01-17 through 2023-02-23.
- Larger dataset: `data/feedback/all-beauty-50000.csv` — 50,000 real reviews in Signal's review/product/date/rating column format. The product column in this larger file contains parent product IDs. It is for Python/SQL analysis; the current app still accepts at most 120 rows per upload.
- Provenance: `data/feedback/amazon-provenance.json` — original download URLs, retrieval time, exact selection method, and selected product IDs/names.
- Refresh command: `node scripts/import-amazon-feedback.mjs`. This streams the publisher's compressed files and recreates the local datasets; no API key is needed.

Selection takes the first 50,000 eligible unique reviews from source order, then chooses the six most-reviewed products in that pool and 20 reviews per product by a reproducible hash ordering. Empty/overlong texts and duplicates are excluded. HTML line breaks, common entities, and numeric character references are normalized; simple formatting tags are removed. This is a convenience sample, not a random sample of all Amazon customers, and its proportions must not be generalized to the full category. No language detection is performed. Reviewer identifiers, images, and profile fields are omitted.

To use the larger file: load it with pandas, explore rating/product/date distributions, and select up to 120 reviews for a particular comparison before exporting a CSV for Signal. For larger in-app analysis, use a separate batch-processing and storage workflow rather than increasing the upload cap alone.

To evaluate real reviews: download the default CSV, add an `expected_sentiment` column with independently assigned positive/neutral/negative labels, then upload it. Do not derive these labels automatically from star ratings.

## Separate portfolio integration

The portfolio retains a screenshot and a small `/feedback` handoff page. Configure `SIGNAL_APP_URL` in the portfolio when hosting Signal, and configure `NEXT_PUBLIC_PORTFOLIO_URL` here for the Back to portfolio link. No hosting URL has been created by this move.
