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

### Backfilling history when you only have totals

If you have a list of past net worth / total assets / total liabilities by
month, but not the full per-account breakdown for those months, add two
catch-all columns:

```
Asset: Other (Historical)
Debt: Other (Historical)
```

For each historical row, put that month's **total assets** in
`Asset: Other (Historical)` and **total liabilities** in
`Debt: Other (Historical)`, leaving all the detailed account columns at `0`.
For your current and future rows (where you do have the detailed breakdown),
leave both "Historical" columns at `0` and fill in the detailed columns as
usual.

This keeps the net worth/assets/debts totals accurate for every row. The
category breakdown chart will just show a single "Other (Historical)" block
for past months, and full account-level detail from the point you started
tracking individual accounts onward. See [sample-data.csv](sample-data.csv)
for an example mixing historical totals (2024–2026) with a fully detailed
current row.

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

`config.js` is committed to the repo. It only contains the unlisted published
CSV URL (a pointer, not your actual numbers), which keeps deployment simple.
If you'd rather keep that URL out of the repo entirely, add `config.js` to
`.gitignore` and inject it at deploy time via a GitHub Actions workflow
instead.

## 4. Run locally

Just open `index.html` in a browser, or serve the folder with any static
server (e.g. `npx serve .`).

## 5. Deploy to GitHub Pages

1. Push this repo to GitHub (public repo is fine — your numbers live in the
   Google Sheet, not in the repo).
2. In repo Settings > Pages, set the source to your default branch (root).

## Dashboard features

### Summary cards
Four top-level cards show current net worth, total assets, total debts, and the change since the last entry.

### Data freshness banner
A green/yellow banner under the title shows how many days ago the data was last updated, so you always know if the numbers are current.

### Net Worth Over Time
Line chart showing net worth, total assets, and total debts across all recorded months. Below the chart, performance cards show:
- Last 1 month, 3 months, year-to-date, last 12 months, all-time change
- Average monthly change
- Best and worst single-month periods

### Month-over-Month Change
Bar chart showing the dollar change in net worth each month — green for gains, red for losses.

### Assets vs Debts Breakdown
Side-by-side bar chart and pie chart breaking down your current assets by category (based on your column names).

### Debt Payoff Tracker
Cards for each debt showing current balance and an estimated payoff date based on your average monthly reduction rate.

### Projections
Interactive panel — adjust live in the browser (not saved):
- **Annual growth rate** — assumed average annual return
- **Monthly contribution** — how much you add per month
- **Projection window** — how many years to project forward
- **Goal net worth** — optional target; estimates when you'll reach it
- **Inflation rate** — toggle to view projections in today's dollars
- **Show scenarios** — toggle ±3% scenario bands around the base projection

### Retirement & Withdrawal Planning
Interactive retirement calculator:
- **Years until retirement** and **annual withdrawal** target
- **Social Security income** and delay years before SS kicks in
- **Retirement growth rate** — assumed return during retirement
- Summary cards show: retirement accounts today, projected balance at retirement, safe withdrawal rate, 4% rule check, Social Security income, and estimated fund longevity
- Includes a tax note reminding you that traditional 401k/IRA withdrawals are taxable

## Exporting

### Export PDF
Prints the full dashboard (all sections) to PDF via the browser's print dialog.

### Quarterly Snapshot
Generates a compact one-page PDF summary suitable for saving quarterly records. Includes:
- Current net worth, assets, debts, and last change
- Net worth trend chart with key performance metrics
- Retirement planning summary cards

The snapshot label shows the quarter and date (e.g. "Q2 2026 (6/1/2026)").
