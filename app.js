const CATEGORY_COLORS = [
  "#38bdf8", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6",
  "#fb923c", "#34d399", "#60a5fa", "#f87171", "#c084fc"
];

const fmtCurrency = (n) =>
  "$" + Math.round(n).toLocaleString("en-US");

const fmtCurrencySigned = (n) => {
  const sign = n > 0 ? "+" : "";
  return sign + fmtCurrency(n);
};

function parseNumber(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Minimal CSV parser supporting quoted fields with embedded commas.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") { row.push(field); field = ""; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((v) => v.trim() !== "")) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

function loadData(csvUrl) {
  return fetch(csvUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch sheet data (HTTP ${res.status})`);
      return res.text();
    })
    .then((text) => {
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("Sheet appears to be empty.");

      const headers = rows[0].map((h) => h.trim());
      const dateIdx = headers.findIndex((h) => h.toLowerCase() === "date");
      if (dateIdx === -1) throw new Error('No "Date" column found in sheet.');

      const assetCols = [];
      const debtCols = [];
      headers.forEach((h, idx) => {
        if (idx === dateIdx) return;
        const lower = h.toLowerCase();
        if (lower.startsWith("asset")) assetCols.push({ idx, label: h.replace(/^asset:?\s*/i, "") });
        else if (lower.startsWith("debt") || lower.startsWith("liabilit")) debtCols.push({ idx, label: h.replace(/^(debt|liabilit\w*):?\s*/i, "") });
      });

      if (!assetCols.length && !debtCols.length) {
        throw new Error('No columns found starting with "Asset:" or "Debt:".');
      }

      const entries = rows.slice(1).map((row) => {
        const date = new Date(row[dateIdx]);
        const assets = {};
        const debts = {};
        let totalAssets = 0;
        let totalDebts = 0;

        assetCols.forEach(({ idx, label }) => {
          const v = parseNumber(row[idx]);
          assets[label] = v;
          totalAssets += v;
        });
        debtCols.forEach(({ idx, label }) => {
          const v = parseNumber(row[idx]);
          debts[label] = v;
          totalDebts += v;
        });

        return {
          date,
          dateLabel: row[dateIdx],
          assets,
          debts,
          totalAssets,
          totalDebts,
          netWorth: totalAssets - totalDebts,
        };
      }).filter((e) => !isNaN(e.date.getTime()));

      entries.sort((a, b) => a.date - b.date);

      return { entries, assetCols, debtCols };
    });
}

function renderSummary(entries) {
  const latest = entries[entries.length - 1];
  const prev = entries.length > 1 ? entries[entries.length - 2] : null;

  document.getElementById("current-net-worth").textContent = fmtCurrency(latest.netWorth);
  document.getElementById("as-of-date").textContent = "as of " + latest.dateLabel;
  document.getElementById("current-assets").textContent = fmtCurrency(latest.totalAssets);
  document.getElementById("current-debts").textContent = fmtCurrency(latest.totalDebts);

  const changeEl = document.getElementById("last-change");
  if (prev) {
    const change = latest.netWorth - prev.netWorth;
    changeEl.textContent = fmtCurrencySigned(change);
    changeEl.classList.add(change >= 0 ? "positive" : "negative");
  } else {
    changeEl.textContent = "--";
  }
}

function renderNetWorthChart(entries) {
  const ctx = document.getElementById("netWorthChart");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: entries.map((e) => e.dateLabel),
      datasets: [
        {
          label: "Net Worth",
          data: entries.map((e) => e.netWorth),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          fill: true,
          tension: 0.25,
        },
        {
          label: "Total Assets",
          data: entries.map((e) => e.totalAssets),
          borderColor: "#4ade80",
          fill: false,
          tension: 0.25,
        },
        {
          label: "Total Debts",
          data: entries.map((e) => e.totalDebts),
          borderColor: "#f87171",
          fill: false,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
        y: {
          ticks: { color: "#94a3b8", callback: (v) => fmtCurrency(v) },
          grid: { color: "#334155" },
        },
      },
    },
  });
}

function pctChange(from, to) {
  if (!from) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

function monthsBetween(d1, d2) {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

// Returns the most recent entry that is at least `days` before `latest`, or null.
function findEntryAtLeastDaysBefore(entries, latest, days) {
  const threshold = new Date(latest.date);
  threshold.setDate(threshold.getDate() - days);
  let result = null;
  for (const e of entries) {
    if (e.date <= threshold) result = e;
  }
  return result;
}

// Returns the last entry dated before Jan 1 of `latest`'s year, or null.
function findYearStartEntry(entries, latest) {
  const jan1 = new Date(latest.date.getFullYear(), 0, 1);
  let result = null;
  for (const e of entries) {
    if (e.date < jan1) result = e;
  }
  return result;
}

function buildChangeCard(label, fromEntry, toEntry) {
  if (!fromEntry || fromEntry === toEntry) return null;
  const change = toEntry.netWorth - fromEntry.netWorth;
  const pct = pctChange(fromEntry.netWorth, toEntry.netWorth);
  return {
    label,
    value: fmtCurrencySigned(change),
    sub: (pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% ` : "") + `since ${fromEntry.dateLabel}`,
    positive: change >= 0,
  };
}

function findBestWorstPeriod(entries) {
  if (entries.length < 2) return { best: null, worst: null };
  let best = null;
  let worst = null;
  for (let i = 1; i < entries.length; i++) {
    const delta = entries[i].netWorth - entries[i - 1].netWorth;
    const period = { delta, from: entries[i - 1], to: entries[i] };
    if (!best || delta > best.delta) best = period;
    if (!worst || delta < worst.delta) worst = period;
  }
  return { best, worst };
}

function renderPerformanceCards(entries) {
  const container = document.getElementById("performance-cards");
  const latest = entries[entries.length - 1];
  const first = entries[0];
  const cards = [];

  cards.push(buildChangeCard("Last 1 Month", findEntryAtLeastDaysBefore(entries, latest, 20), latest));
  cards.push(buildChangeCard("Last 3 Months", findEntryAtLeastDaysBefore(entries, latest, 75), latest));
  cards.push(buildChangeCard("Year to Date", findYearStartEntry(entries, latest) || (first.date.getFullYear() === latest.date.getFullYear() ? first : null), latest));
  cards.push(buildChangeCard("Last 12 Months", findEntryAtLeastDaysBefore(entries, latest, 330), latest));
  cards.push(buildChangeCard("All Time", first, latest));

  const totalMonths = monthsBetween(first.date, latest.date);
  if (totalMonths >= 1) {
    const avgMonthly = (latest.netWorth - first.netWorth) / totalMonths;
    cards.push({
      label: "Avg. Monthly Change",
      value: fmtCurrencySigned(avgMonthly),
      sub: `over ${totalMonths} month${totalMonths !== 1 ? "s" : ""}`,
      positive: avgMonthly >= 0,
    });
  }

  const { best, worst } = findBestWorstPeriod(entries);
  if (best) {
    cards.push({
      label: "Best Period",
      value: fmtCurrencySigned(best.delta),
      sub: `${best.from.dateLabel} → ${best.to.dateLabel}`,
      positive: best.delta >= 0,
    });
  }
  if (worst) {
    cards.push({
      label: "Worst Period",
      value: fmtCurrencySigned(worst.delta),
      sub: `${worst.from.dateLabel} → ${worst.to.dateLabel}`,
      positive: worst.delta >= 0,
    });
  }

  container.innerHTML = cards.filter(Boolean).map((c) => `
    <div class="perf-card">
      <div class="perf-label">${c.label}</div>
      <div class="perf-value ${c.positive ? "positive" : "negative"}">${c.value}</div>
      <div class="perf-sub">${c.sub}</div>
    </div>
  `).join("");
}

function renderBreakdownChart(entries, assetCols, debtCols) {
  const ctx = document.getElementById("breakdownChart");
  const datasets = [];
  let colorIdx = 0;

  assetCols.forEach(({ label }) => {
    datasets.push({
      label,
      data: entries.map((e) => e.assets[label]),
      backgroundColor: CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length],
      stack: "stack0",
    });
    colorIdx++;
  });
  debtCols.forEach(({ label }) => {
    datasets.push({
      label: label + " (debt)",
      data: entries.map((e) => -e.debts[label]),
      backgroundColor: CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length],
      stack: "stack0",
    });
    colorIdx++;
  });

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: entries.map((e) => e.dateLabel),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
        y: {
          stacked: true,
          ticks: { color: "#94a3b8", callback: (v) => fmtCurrency(v) },
          grid: { color: "#334155" },
        },
      },
    },
  });
}

function renderLatestPieChart(entries, assetCols) {
  const ctx = document.getElementById("latestPieChart");
  const latest = entries[entries.length - 1];
  const labels = assetCols.map((c) => c.label);
  const data = assetCols.map((c) => latest.assets[c.label]);

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#e2e8f0" } },
        title: { display: true, text: "Latest Asset Allocation", color: "#e2e8f0" },
      },
    },
  });
}

// Returns { labels, historical, projected, goalMonths }
function computeProjection(entries, annualRatePct, monthlyContribution, years, goalAmount) {
  const latest = entries[entries.length - 1];
  const monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  const months = years * 12;

  const labels = entries.map((e) => e.dateLabel);
  const historical = entries.map((e) => e.netWorth);

  let value = latest.netWorth;
  const projectedDates = [];
  const projectedValues = [];
  let goalMonths = null;

  for (let m = 1; m <= months; m++) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    const d = new Date(latest.date);
    d.setMonth(d.getMonth() + m);
    projectedDates.push(d.toLocaleDateString("en-US", { year: "numeric", month: "short" }));
    projectedValues.push(value);

    if (goalAmount && goalMonths === null && value >= goalAmount) {
      goalMonths = m;
    }
  }

  return {
    labels: labels.concat(projectedDates),
    historical,
    projected: projectedValues,
    historicalCount: entries.length,
    goalMonths,
  };
}

let projectionChartInstance = null;

function renderProjectionChart(entries, goalAmount) {
  const annualRate = parseFloat(document.getElementById("growthRate").value) || 0;
  const monthlyContribution = parseFloat(document.getElementById("monthlyContribution").value) || 0;
  const years = parseInt(document.getElementById("projectionYears").value, 10) || 1;

  const { labels, historical, projected, historicalCount, goalMonths } =
    computeProjection(entries, annualRate, monthlyContribution, years, goalAmount);

  // Build a combined series: historical values, then connect to projected values
  const combinedProjected = new Array(historicalCount - 1).fill(null)
    .concat([historical[historicalCount - 1]])
    .concat(projected);

  const datasets = [
    {
      label: "Historical",
      data: historical.concat(new Array(projected.length).fill(null)),
      borderColor: "#38bdf8",
      backgroundColor: "rgba(56, 189, 248, 0.15)",
      fill: true,
      tension: 0.25,
    },
    {
      label: "Projected",
      data: combinedProjected,
      borderColor: "#fbbf24",
      borderDash: [6, 4],
      fill: false,
      tension: 0.25,
    },
  ];

  if (goalAmount) {
    datasets.push({
      label: "Goal",
      data: new Array(labels.length).fill(goalAmount),
      borderColor: "#a78bfa",
      borderDash: [2, 4],
      pointRadius: 0,
      fill: false,
    });
  }

  const ctx = document.getElementById("projectionChart");
  if (projectionChartInstance) projectionChartInstance.destroy();
  projectionChartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
      scales: {
        x: { ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 45 }, grid: { color: "#334155" } },
        y: {
          ticks: { color: "#94a3b8", callback: (v) => fmtCurrency(v) },
          grid: { color: "#334155" },
        },
      },
    },
  });

  const goalResultEl = document.getElementById("goal-result");
  if (goalAmount) {
    if (goalMonths !== null) {
      const years = Math.floor(goalMonths / 12);
      const months = goalMonths % 12;
      const parts = [];
      if (years) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
      if (months) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
      const targetDate = new Date(entries[entries.length - 1].date);
      targetDate.setMonth(targetDate.getMonth() + goalMonths);
      goalResultEl.textContent = `At this rate, you'll reach ${fmtCurrency(goalAmount)} in ${parts.join(", ")} ` +
        `(around ${targetDate.toLocaleDateString("en-US", { year: "numeric", month: "long" })}).`;
    } else {
      goalResultEl.textContent = `Goal of ${fmtCurrency(goalAmount)} is not reached within the ${years}-year projection window.`;
    }
  } else {
    goalResultEl.textContent = "";
  }
}

// Projects a starting balance forward through retirement withdrawals (with
// optional Social Security income kicking in after a delay) until it's
// depleted or a max horizon is reached. Returns yearly balance snapshots.
function computeRetirementDrawdown({ startingBalance, annualGrowthRate, annualWithdrawal, monthlySS, ssDelayYears, maxYears = 50 }) {
  const monthlyRate = Math.pow(1 + annualGrowthRate / 100, 1 / 12) - 1;
  const monthlyWithdrawal = annualWithdrawal / 12;
  const ssStartMonth = ssDelayYears * 12;

  let balance = startingBalance;
  const yearlyBalances = [balance];
  let depletedYear = null;

  for (let m = 1; m <= maxYears * 12; m++) {
    const ss = m > ssStartMonth ? monthlySS : 0;
    balance = balance * (1 + monthlyRate) - monthlyWithdrawal + ss;
    if (balance <= 0) {
      balance = 0;
      if (depletedYear === null) depletedYear = m / 12;
    }
    if (m % 12 === 0) yearlyBalances.push(balance);
    if (depletedYear !== null && m % 12 === 0) break;
  }

  return { yearlyBalances, depletedYear };
}

let retirementChartInstance = null;

function renderRetirementSection(entries) {
  const annualGrowthRate = parseFloat(document.getElementById("growthRate").value) || 0;
  const monthlyContribution = parseFloat(document.getElementById("monthlyContribution").value) || 0;
  const yearsToRetirement = parseInt(document.getElementById("yearsToRetirement").value, 10) || 0;
  const annualWithdrawal = parseFloat(document.getElementById("annualWithdrawal").value) || 0;
  const monthlySS = parseFloat(document.getElementById("monthlySS").value) || 0;
  const ssDelayYears = parseInt(document.getElementById("ssDelayYears").value, 10) || 0;
  const retirementGrowthRate = parseFloat(document.getElementById("retirementGrowthRate").value) || 0;

  // Accumulation phase: project current net worth forward to retirement.
  const { projected, historical } = computeProjection(entries, annualGrowthRate, monthlyContribution, Math.max(yearsToRetirement, 1), null);
  const balanceAtRetirement = yearsToRetirement > 0 ? projected[yearsToRetirement * 12 - 1] : historical[historical.length - 1];

  const { yearlyBalances, depletedYear } = computeRetirementDrawdown({
    startingBalance: balanceAtRetirement,
    annualGrowthRate: retirementGrowthRate,
    annualWithdrawal,
    monthlySS,
    ssDelayYears,
  });

  // Summary cards
  const withdrawalRate = balanceAtRetirement > 0 ? (annualWithdrawal / balanceAtRetirement) * 100 : null;
  const annualSS = monthlySS * 12;

  const cards = [
    {
      label: "Balance at Retirement",
      value: fmtCurrency(balanceAtRetirement),
      sub: `in ${yearsToRetirement} year${yearsToRetirement !== 1 ? "s" : ""}`,
      positive: true,
    },
    {
      label: "Withdrawal Rate",
      value: withdrawalRate !== null ? `${withdrawalRate.toFixed(1)}%` : "--",
      sub: `${fmtCurrency(annualWithdrawal)}/yr from ${fmtCurrency(balanceAtRetirement)}`,
      positive: withdrawalRate === null || withdrawalRate <= 4,
    },
    {
      label: "Social Security Income",
      value: fmtCurrency(annualSS) + "/yr",
      sub: ssDelayYears > 0 ? `starting ${ssDelayYears} year${ssDelayYears !== 1 ? "s" : ""} into retirement` : "starting at retirement",
      positive: true,
    },
  ];

  if (depletedYear !== null) {
    cards.push({
      label: "Funds Last",
      value: `~${depletedYear.toFixed(0)} years`,
      sub: "into retirement before balance hits $0",
      positive: false,
    });
  } else {
    cards.push({
      label: "Funds Last",
      value: "50+ years",
      sub: "balance does not appear to run out",
      positive: true,
    });
  }

  document.getElementById("retirement-summary").innerHTML = cards.map((c) => `
    <div class="perf-card">
      <div class="perf-label">${c.label}</div>
      <div class="perf-value ${c.positive ? "positive" : "negative"}">${c.value}</div>
      <div class="perf-sub">${c.sub}</div>
    </div>
  `).join("");

  // Chart: balance through retirement, year by year
  const labels = yearlyBalances.map((_, i) => `Year ${i}`);
  const ctx = document.getElementById("retirementChart");
  if (retirementChartInstance) retirementChartInstance.destroy();
  retirementChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Retirement Balance",
        data: yearlyBalances,
        borderColor: "#4ade80",
        backgroundColor: "rgba(74, 222, 128, 0.15)",
        fill: true,
        tension: 0.25,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e2e8f0" } } },
      scales: {
        x: { title: { display: true, text: "Years into retirement", color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
        y: {
          ticks: { color: "#94a3b8", callback: (v) => fmtCurrency(v) },
          grid: { color: "#334155" },
        },
      },
    },
  });
}

function showError(message) {
  document.getElementById("error-card").style.display = "block";
  document.getElementById("error-message").textContent = message;
}

function init() {
  const config = window.NET_WORTH_CONFIG;
  if (!config || !config.csvUrl || config.csvUrl.includes("YOUR_PUBLISHED_ID")) {
    showError("Missing or unconfigured config.js. Copy config.example.js to config.js and add your Google Sheet's published CSV URL.");
    return;
  }

  loadData(config.csvUrl)
    .then(({ entries, assetCols, debtCols }) => {
      if (!entries.length) throw new Error("No valid data rows found.");

      renderSummary(entries);
      renderNetWorthChart(entries);
      renderPerformanceCards(entries);
      renderBreakdownChart(entries, assetCols, debtCols);
      renderLatestPieChart(entries, assetCols);

      const update = () => {
        const goal = parseFloat(document.getElementById("goalAmount").value) || null;
        renderProjectionChart(entries, goal);
        renderRetirementSection(entries);
      };
      [
        "growthRate", "monthlyContribution", "projectionYears", "goalAmount",
        "yearsToRetirement", "annualWithdrawal", "monthlySS", "ssDelayYears", "retirementGrowthRate",
      ].forEach((id) => {
        document.getElementById(id).addEventListener("input", update);
      });
      update();

      document.getElementById("load-time").textContent = new Date().toLocaleString();
    })
    .catch((err) => {
      console.error(err);
      showError(err.message);
    });
}

init();
