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

Create a sheet with a header row like this:

| Date | Asset: Checking | Asset: Savings | Asset: Investments | Asset: Retirement | Asset: Home Value | Debt: Mortgage | Debt: Student Loans | Debt: Credit Cards |
|------|------------------|-----------------|----------------------|----------------------|----------------------|------------------|------------------------|----------------------|
| 1/1/2026 | 7500 | 20000 | 98000 | 113000 | 376000 | 270000 | 4000 | 500 |

Rules:
- The **Date** column is required and must be named exactly `Date`.
- Any column starting with `Asset` (e.g. `Asset: Checking`) is treated as an asset.
- Any column starting with `Debt` or `Liabilit...` (e.g. `Debt: Mortgage`) is
  treated as a debt.
- You can add, rename, or remove asset/debt columns freely — the site adapts
  automatically.
- Add one row per time you update your numbers (e.g. monthly).

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
