# Net Worth Tracker

A simple static site that charts your net worth over time, breaks it down by
category, and projects it into the future — backed by a shared Google Sheet.

## How it works

- You and your spouse update a shared Google Sheet each month (or however
  often you like) with your account balances and debts.
- The sheet is published to the web as a CSV.
- This site fetches that CSV and renders charts with [Chart.js](https://www.chartjs.org/).
- Hosted for free via GitHub Pages.

No backend, no database, no accounts.

## 1. Set up your Google Sheet

This site needs a **time-series** layout: one row per date, with one column
per account. That's different from a typical categorized balance sheet
(where each account is its own row and there's a single snapshot of values).

If you already keep a detailed categorized sheet (assets/liabilities/equity
broken out by account), keep that as-is for your own bookkeeping, and add a
**separate tab** — e.g. "History" — laid out like this:

| Date | Asset: Wells Fargo Pers Checking | Asset: Ally (All Accts) | ... | Asset: Danny 401k | ... | Debt: Danny Credit Card | Debt: Panorama Mortgage | ... |
|------|-----------------------------------|---------------------------|-----|----------------------|-----|---------------------------|---------------------------|-----|
| 6/1/2026 | 605 | 12362 | ... | 363049.23 | ... | 180 | 89500 | ... |

See [sample-data.csv](sample-data.csv) for a full example using a typical
set of accounts (checking/savings, retirement accounts, properties,
vehicles, credit cards, mortgage, auto loans).

Rules:
- The **Date** column is required and must be named exactly `Date`.
- Any column starting with `Asset` (e.g. `Asset: Checking`) is treated as an asset.
- Any column starting with `Debt` or `Liabilit...` (e.g. `Debt: Mortgage`) is
  treated as a debt.
- If the same account name applies to both a value and a loan/debt (e.g. a
  car worth $40k with a $6.6k loan against it), give each column a distinct
  label, like `Asset: RDX (Vehicle)` and `Debt: RDX Loan`.
- You can add, rename, or remove asset/debt columns freely — the site adapts
  automatically.
- Add one row per time you update your numbers (e.g. monthly). To backfill
  history, pull old totals from past statements/snapshots if you have them —
  otherwise just start with today and build history going forward.

## 2. Publish the sheet as CSV

1. In Google Sheets: **File > Share > Publish to web**
2. Under "Link", choose the specific sheet/tab with your data
3. Choose **Comma-separated values (.csv)** as the format
4. Click **Publish** and copy the generated URL

This URL is unlisted (not searchable), but anyone with the link can view the
raw data — don't share it publicly.

## 3. Configure the site

Copy `config.example.js` to `config.js` and paste in your published CSV URL:

```js
window.NET_WORTH_CONFIG = {
  csvUrl: "https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_ID/pub?output=csv"
};
```

`config.js` is gitignored so your sheet URL doesn't end up in the public repo.

## 4. Run locally

Just open `index.html` in a browser, or serve the folder with any static
server (e.g. `npx serve .`).

## 5. Deploy to GitHub Pages

1. Push this repo to GitHub (public repo is fine — your numbers live in the
   Google Sheet, not in the repo).
2. In repo Settings > Pages, set the source to your default branch (root).
3. **Important:** since `config.js` is gitignored, it won't be deployed. You
   have two options:
   - Add `config.js` to the repo anyway (it only contains the unlisted Sheet
     URL, not your actual numbers) — remove it from `.gitignore` if you're
     comfortable with that, or
   - Use a GitHub Actions workflow to inject `config.js` from a repository
     secret at build/deploy time.

   For most people, option 1 is simplest: the published CSV URL is obscure
   but not secret-sensitive on its own (it's just a pointer), so committing
   `config.js` is a reasonable tradeoff for simplicity.

## Customizing projections

The Projections panel lets you adjust, live in the browser:
- **Annual growth rate** — assumed average annual return
- **Monthly contribution** — how much you add to savings/investments per month
- **Projection window** — how many years to project forward
- **Goal net worth** — optional target; the site estimates when you'll hit it

These are calculated client-side and aren't saved — they're just for
exploring "what if" scenarios.
