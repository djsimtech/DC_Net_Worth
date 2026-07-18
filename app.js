const GROUP_COLORS = {
  "Cash & Other":  "#a78bfa",
  "Investments":   "#38bdf8",
  "Real Estate":   "#4ade80",
  "Vehicles":      "#fbbf24",
  "Historical":    "#64748b",
  "Mortgages":     "#f87171",
  "Loans":         "#fb923c",
  "Credit Cards":  "#f472b6",
  "Other Debts":   "#94a3b8",
};

function guessGroup(label, isDebt) {
  const l = label.toLowerCase();
  if (isDebt) {
    if (/mortgage/.test(l)) return "Mortgages";
    if (/loan/.test(l)) return "Loans";
    if (/credit.?card/.test(l)) return "Credit Cards";
    return "Other Debts";
  }
  if (/historical/.test(l)) return "Historical";
  if (/\(property\)|real.?estate|\bproperty\b/.test(l)) return "Real Estate";
  if (/\(vehicle\)|\bvehicle\b|f-?250|f-?150|f-?350|mustang|\btruck\b|\bsuv\b/.test(l)) return "Vehicles";
  if (/\b401k\b|\bira\b|\broth\b|\bstock\b|invest|brokerage|\bfund\b|\betf\b|equity|pension/.test(l)) return "Investments";
  return "Cash & Other";
}

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

  // Data freshness banner
  const daysSince = Math.floor((Date.now() - latest.date.getTime()) / (1000 * 60 * 60 * 24));
  const bannerEl = document.getElementById("freshness-banner");
  if (daysSince > 35) {
    bannerEl.textContent = `⚠ Last data entry was ${daysSince} days ago (${latest.dateLabel}). Consider updating your sheet.`;
    bannerEl.style.display = "block";
    bannerEl.className = "freshness-banner warning";
  } else {
    bannerEl.textContent = `Data is current as of ${latest.dateLabel} (${daysSince} day${daysSince !== 1 ? "s" : ""} ago).`;
    bannerEl.style.display = "block";
    bannerEl.className = "freshness-banner fresh";
  }
}

function filterEntriesByRange(entries, range) {
  if (range === "all") return entries;
  const latest = entries[entries.length - 1];
  const cutoff = new Date(latest.date);
  if (range === "6m") cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else if (range === "2y") cutoff.setFullYear(cutoff.getFullYear() - 2);
  return entries.filter((e) => e.date >= cutoff);
}

function renderNetWorthChart(entries) {
  const ctx = document.getElementById("netWorthChart");
  if (netWorthChartInstance) { netWorthChartInstance.destroy(); netWorthChartInstance = null; }
  netWorthChartInstance = new Chart(ctx, {
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

// Month-over-month net worth change bar chart
function renderMoMChart(entries) {
  if (entries.length < 2) return;
  const ctx = document.getElementById("momChart");
  const labels = [];
  const data = [];
  const colors = [];

  for (let i = 1; i < entries.length; i++) {
    const delta = entries[i].netWorth - entries[i - 1].netWorth;
    labels.push(entries[i].dateLabel);
    data.push(delta);
    colors.push(delta >= 0 ? "rgba(74, 222, 128, 0.8)" : "rgba(248, 113, 113, 0.8)");
  }

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Monthly Change",
        data,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => fmtCurrencySigned(ctx.raw),
          },
        },
      },
      scales: {
        x: { ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 45 }, grid: { color: "#334155" } },
        y: {
          ticks: { color: "#94a3b8", callback: (v) => fmtCurrencySigned(v) },
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

function findEntryAtLeastDaysBefore(entries, latest, days) {
  const threshold = new Date(latest.date);
  threshold.setDate(threshold.getDate() - days);
  let result = null;
  for (const e of entries) {
    if (e.date <= threshold) result = e;
  }
  return result;
}

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

  if (latest.totalAssets > 0) {
    const ratio = latest.totalDebts / latest.totalAssets;
    const pct = (ratio * 100).toFixed(1) + "%";
    const prev = entries.length > 1 ? entries[entries.length - 2] : null;
    const prevRatio = prev && prev.totalAssets > 0 ? prev.totalDebts / prev.totalAssets : null;
    const trend = prevRatio !== null ? (ratio < prevRatio ? "↓ vs last entry" : ratio > prevRatio ? "↑ vs last entry" : "unchanged") : "";
    cards.push({ label: "Debt-to-Asset Ratio", value: pct, sub: trend, positive: ratio <= 0.2 });
  }

  if (totalMonths >= 1 && first.totalDebts > 0) {
    const avgPaydown = (first.totalDebts - latest.totalDebts) / totalMonths;
    cards.push({
      label: "Avg. Debt Paydown",
      value: fmtCurrencySigned(-avgPaydown),
      sub: `per month over ${totalMonths} month${totalMonths !== 1 ? "s" : ""}`,
      positive: avgPaydown >= 0,
    });
  }

  if (totalMonths >= 1 && first.totalAssets > 0 && latest.totalAssets > first.totalAssets) {
    const annualizedGrowth = (Math.pow(latest.totalAssets / first.totalAssets, 12 / totalMonths) - 1) * 100;
    cards.push({
      label: "Asset Growth Rate",
      value: "+" + annualizedGrowth.toFixed(1) + "%",
      sub: "annualized since first entry",
      positive: true,
    });
  }

  const avgMonthly = totalMonths >= 1 ? (latest.netWorth - first.netWorth) / totalMonths : 0;
  if (avgMonthly > 0) {
    const increment = latest.netWorth < 100e3 ? 10e3 : 100e3;
    const next = Math.ceil((latest.netWorth + 1) / increment) * increment;
    const monthsAway = Math.ceil((next - latest.netWorth) / avgMonthly);
    const label = next >= 1e6 ? `$${(next / 1e6).toFixed(next % 1e6 === 0 ? 0 : 1)}M` : `$${(next / 1e3).toFixed(0)}K`;
    cards.push({
      label: "Next Milestone",
      value: label,
      sub: `~${monthsAway} month${monthsAway !== 1 ? "s" : ""} away`,
      positive: true,
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

function buildGroupedDatasets(entries, assetCols, debtCols) {
  const assetGroupOrder = ["Cash & Other", "Investments", "Real Estate", "Vehicles", "Historical"];
  const debtGroupOrder  = ["Mortgages", "Loans", "Credit Cards", "Other Debts"];

  const usedAssetGroups = assetGroupOrder.filter((g) =>
    assetCols.some((c) => guessGroup(c.label, false) === g)
  );
  const usedDebtGroups = debtGroupOrder.filter((g) =>
    debtCols.some((c) => guessGroup(c.label, true) === g)
  );

  const datasets = [];

  usedAssetGroups.forEach((group) => {
    const cols = assetCols.filter((c) => guessGroup(c.label, false) === group);
    datasets.push({
      label: group,
      data: entries.map((e) => cols.reduce((sum, c) => sum + (e.assets[c.label] || 0), 0)),
      backgroundColor: GROUP_COLORS[group],
      stack: "stack0",
    });
  });

  usedDebtGroups.forEach((group) => {
    const cols = debtCols.filter((c) => guessGroup(c.label, true) === group);
    datasets.push({
      label: group + " (debt)",
      data: entries.map((e) => -cols.reduce((sum, c) => sum + (e.debts[c.label] || 0), 0)),
      backgroundColor: GROUP_COLORS[group],
      stack: "stack0",
    });
  });

  return datasets;
}

function renderBreakdownChart(entries, assetCols, debtCols) {
  const ctx = document.getElementById("breakdownChart");
  const datasets = buildGroupedDatasets(entries, assetCols, debtCols);

  new Chart(ctx, {
    type: "bar",
    data: { labels: entries.map((e) => e.dateLabel), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#e2e8f0", boxWidth: 12, padding: 10 } },
      },
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

  const groups = {};
  assetCols.forEach(({ label }) => {
    const group = guessGroup(label, false);
    if (group === "Historical") return;
    groups[group] = (groups[group] || 0) + (latest.assets[label] || 0);
  });

  const labels = Object.keys(groups).filter((g) => groups[g] > 0);
  const data   = labels.map((g) => groups[g]);

  pieChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: labels.map((g) => GROUP_COLORS[g] || "#64748b") }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#e2e8f0", boxWidth: 12, padding: 10, font: { size: 12 } },
        },
        title: { display: true, text: "Latest Asset Allocation", color: "#e2e8f0" },
      },
    },
  });
}

function renderCategoryTrendChart(entries, assetCols) {
  const ctx = document.getElementById("categoryTrendChart");
  if (!ctx) return;
  if (categoryTrendChartInstance) { categoryTrendChartInstance.destroy(); categoryTrendChartInstance = null; }

  const groups = ["Investments", "Real Estate", "Cash & Other", "Vehicles"];
  const usedGroups = groups.filter((g) => assetCols.some((c) => guessGroup(c.label, false) === g));

  const datasets = usedGroups.map((group) => {
    const cols = assetCols.filter((c) => guessGroup(c.label, false) === group);
    return {
      label: group,
      data: entries.map((e) => cols.reduce((sum, c) => sum + (e.assets[c.label] || 0), 0)),
      borderColor: GROUP_COLORS[group],
      fill: false,
      tension: 0.25,
      pointRadius: 2,
    };
  });

  categoryTrendChartInstance = new Chart(ctx, {
    type: "line",
    data: { labels: entries.map((e) => e.dateLabel), datasets },
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
}

function renderAnnualSummary(entries) {
  const container = document.getElementById("annual-summary-table");
  if (!container) return;

  const years = [...new Set(entries.map((e) => e.date.getFullYear()))].sort();
  const yearData = years.map((year) => {
    const yearEntries = entries.filter((e) => e.date.getFullYear() === year);
    return { year, entry: yearEntries[yearEntries.length - 1] };
  });

  const rows = yearData.map((d, i) => {
    const prev = i > 0 ? yearData[i - 1].entry : null;
    const change = prev ? d.entry.netWorth - prev.netWorth : null;
    const pct = prev && prev.netWorth !== 0 ? (change / Math.abs(prev.netWorth)) * 100 : null;
    return { year: d.year, netWorth: d.entry.netWorth, change, pct };
  }).reverse();

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Year</th>
          <th class="td-right">Year-End Net Worth</th>
          <th class="td-right">Annual Change</th>
          <th class="td-right">Change %</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${r.year}</td>
            <td class="td-right">${fmtCurrency(r.netWorth)}</td>
            <td class="td-right ${r.change === null ? "" : r.change >= 0 ? "positive" : "negative"}">
              ${r.change === null ? "—" : fmtCurrencySigned(r.change)}
            </td>
            <td class="td-right ${r.pct === null ? "" : r.pct >= 0 ? "positive" : "negative"}">
              ${r.pct === null ? "—" : (r.pct >= 0 ? "+" : "") + r.pct.toFixed(1) + "%"}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAccountsTable(entries, assetCols, debtCols) {
  const container = document.getElementById("accounts-table-container");
  if (!container) return;

  const latest = entries[entries.length - 1];
  const totalAssets = latest.totalAssets;

  const allRows = [
    ...assetCols
      .filter(({ label }) => guessGroup(label, false) !== "Historical")
      .map(({ label }) => ({
        name: label,
        category: guessGroup(label, false),
        balance: latest.assets[label] || 0,
        isDebt: false,
      })),
    ...debtCols
      .filter(({ label }) => !/historical/i.test(label))
      .map(({ label }) => ({
        name: label,
        category: guessGroup(label, true),
        balance: latest.debts[label] || 0,
        isDebt: true,
      })),
  ].filter((r) => r.balance > 0);

  function sortRows(rows) {
    return [...rows].sort((a, b) => {
      if (accountsSortCol === "name") return accountsSortDir * a.name.localeCompare(b.name);
      if (accountsSortCol === "category") return accountsSortDir * a.category.localeCompare(b.category);
      return accountsSortDir * (a.balance - b.balance);
    });
  }

  function render() {
    const sorted = sortRows(allRows);
    const thClass = (col) => col === accountsSortCol ? (accountsSortDir === -1 ? "sort-desc" : "sort-asc") : "";

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="${thClass("name")}" data-col="name">Account</th>
            <th class="${thClass("category")}" data-col="category">Category</th>
            <th class="td-right ${thClass("balance")}" data-col="balance">Balance</th>
            <th class="td-right ${thClass("pct")}" data-col="pct">% of Assets</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((r) => `
            <tr>
              <td>${r.name}</td>
              <td><span class="category-dot" style="background:${GROUP_COLORS[r.category] || "#64748b"}"></span>${r.category}${r.isDebt ? " (debt)" : ""}</td>
              <td class="td-right ${r.isDebt ? "negative" : "positive"}">${r.isDebt ? "−" : ""}${fmtCurrency(r.balance)}</td>
              <td class="td-right td-dim">${r.isDebt ? "—" : (r.balance / totalAssets * 100).toFixed(1) + "%"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    container.querySelectorAll("th[data-col]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (accountsSortCol === col) {
          accountsSortDir *= -1;
        } else {
          accountsSortCol = col;
          accountsSortDir = col === "name" || col === "category" ? 1 : -1;
        }
        render();
      });
    });
  }

  render();
}

// Debt payoff tracker: estimates months until each debt is paid off given a fixed monthly payment equal to current average monthly reduction rate.
function renderDebtPayoff(entries, debtCols) {
  if (entries.length < 2 || !debtCols.length) return;
  const container = document.getElementById("debt-payoff-cards");
  if (!container) return;

  const latest = entries[entries.length - 1];
  const totalMonths = monthsBetween(entries[0].date, latest.date) || 1;
  const cards = [];

  debtCols.forEach(({ label }) => {
    const group = guessGroup(label, true);
    if (group === "Other Debts" && /historical/i.test(label)) return;

    const currentBalance = latest.debts[label] || 0;
    if (currentBalance <= 0) return;

    // Use the first entry where this debt had a non-zero balance, so debts
    // added partway through don't appear to be "growing" from a phantom $0 start
    const firstWithDebt = entries.find((e) => (e.debts[label] || 0) > 0);
    if (!firstWithDebt) return;
    const firstBalance = firstWithDebt.debts[label];
    const monthsSinceFirst = monthsBetween(firstWithDebt.date, latest.date) || 1;
    const avgMonthlyReduction = (firstBalance - currentBalance) / monthsSinceFirst;

    let payoffStr;
    if (avgMonthlyReduction <= 0) {
      payoffStr = "Balance is growing";
    } else {
      const monthsLeft = Math.ceil(currentBalance / avgMonthlyReduction);
      const payoffDate = new Date(latest.date);
      payoffDate.setMonth(payoffDate.getMonth() + monthsLeft);
      const years = Math.floor(monthsLeft / 12);
      const months = monthsLeft % 12;
      const parts = [];
      if (years) parts.push(`${years}y`);
      if (months) parts.push(`${months}m`);
      payoffStr = parts.join(" ") + " · " + payoffDate.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    }

    cards.push(`
      <div class="perf-card">
        <div class="perf-label">${label}</div>
        <div class="perf-value negative">${fmtCurrency(currentBalance)}</div>
        <div class="perf-sub">Payoff est: ${payoffStr}</div>
      </div>
    `);
  });

  container.innerHTML = cards.length ? cards.join("") : "<p style='color:var(--text-dim)'>No outstanding debts tracked.</p>";
}

// Adjusts a future value to today's dollars given inflation rate and years.
function inflationAdjust(value, annualInflationPct, years) {
  return value / Math.pow(1 + annualInflationPct / 100, years);
}

// Returns { labels, historical, projected, goalMonths }
function computeProjection(entries, annualRatePct, monthlyContribution, years, goalAmount, startingBalance) {
  const latest = entries[entries.length - 1];
  const monthlyRate = Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;
  const months = years * 12;

  const labels = entries.map((e) => e.dateLabel);
  const historical = entries.map((e) => e.netWorth);

  let value = startingBalance !== undefined ? startingBalance : latest.netWorth;
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

let netWorthChartInstance = null;
let pieChartInstance = null;
let projectionChartInstance = null;
let categoryTrendChartInstance = null;
let accountsSortCol = "balance";
let accountsSortDir = -1;

function renderProjectionChart(entries, goalAmount) {
  const annualRate = parseFloat(document.getElementById("growthRate").value) || 0;
  const monthlyContribution = parseFloat(document.getElementById("monthlyContribution").value) || 0;
  const years = parseInt(document.getElementById("projectionYears").value, 10) || 1;
  const inflationRate = parseFloat(document.getElementById("inflationRate").value) || 0;
  const showScenarios = document.getElementById("showScenarios").checked;

  const { labels, historical, projected, historicalCount, goalMonths } =
    computeProjection(entries, annualRate, monthlyContribution, years, goalAmount);

  const inflationAdjustedProjected = inflationRate > 0
    ? projected.map((v, i) => inflationAdjust(v, inflationRate, (i + 1) / 12))
    : null;

  const combinedProjected = new Array(historicalCount - 1).fill(null)
    .concat([historical[historicalCount - 1]])
    .concat(projected);

  const combinedInflation = inflationAdjustedProjected
    ? new Array(historicalCount - 1).fill(null)
      .concat([historical[historicalCount - 1]])
      .concat(inflationAdjustedProjected)
    : null;

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
      label: inflationRate > 0 ? `Projected (nominal)` : "Projected",
      data: combinedProjected,
      borderColor: "#fbbf24",
      borderDash: [6, 4],
      fill: false,
      tension: 0.25,
    },
  ];

  if (combinedInflation) {
    datasets.push({
      label: `Projected (${inflationRate}% inflation adj.)`,
      data: combinedInflation,
      borderColor: "#fb923c",
      borderDash: [3, 3],
      fill: false,
      tension: 0.25,
    });
  }

  // Optimistic / conservative scenario bands
  if (showScenarios) {
    const { projected: optimistic } = computeProjection(entries, annualRate + 3, monthlyContribution, years, null);
    const { projected: conservative } = computeProjection(entries, Math.max(annualRate - 3, 0), monthlyContribution, years, null);
    const pad = new Array(historicalCount - 1).fill(null);
    const anchor = [historical[historicalCount - 1]];

    datasets.push({
      label: "Optimistic (+3%)",
      data: pad.concat(anchor).concat(optimistic),
      borderColor: "rgba(74, 222, 128, 0.5)",
      borderDash: [4, 4],
      fill: false,
      tension: 0.25,
      pointRadius: 0,
    });
    datasets.push({
      label: "Conservative (-3%)",
      data: pad.concat(anchor).concat(conservative),
      borderColor: "rgba(248, 113, 113, 0.5)",
      borderDash: [4, 4],
      fill: false,
      tension: 0.25,
      pointRadius: 0,
    });
  }

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
      const yrs = Math.floor(goalMonths / 12);
      const mos = goalMonths % 12;
      const parts = [];
      if (yrs) parts.push(`${yrs} year${yrs !== 1 ? "s" : ""}`);
      if (mos) parts.push(`${mos} month${mos !== 1 ? "s" : ""}`);
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

function getInvestableBalance(entries, assetCols) {
  const latest = entries[entries.length - 1];
  return assetCols
    .filter((c) => guessGroup(c.label, false) === "Investments")
    .reduce((sum, c) => sum + (latest.assets[c.label] || 0), 0);
}

function renderRetirementSection(entries, assetCols) {
  const annualGrowthRate = parseFloat(document.getElementById("growthRate").value) || 0;
  const monthlyContribution = parseFloat(document.getElementById("monthlyContribution").value) || 0;
  const yearsToRetirement = parseInt(document.getElementById("yearsToRetirement").value, 10) || 0;
  const annualWithdrawal = parseFloat(document.getElementById("annualWithdrawal").value) || 0;
  const monthlySS = parseFloat(document.getElementById("monthlySS").value) || 0;
  const ssDelayYears = parseInt(document.getElementById("ssDelayYears").value, 10) || 0;
  const retirementGrowthRate = parseFloat(document.getElementById("retirementGrowthRate").value) || 0;

  const investableNow = getInvestableBalance(entries, assetCols);

  const { projected } = computeProjection(entries, annualGrowthRate, monthlyContribution, Math.max(yearsToRetirement, 1), null, investableNow);
  const balanceAtRetirement = yearsToRetirement > 0 ? projected[yearsToRetirement * 12 - 1] : investableNow;

  const { yearlyBalances, depletedYear } = computeRetirementDrawdown({
    startingBalance: balanceAtRetirement,
    annualGrowthRate: retirementGrowthRate,
    annualWithdrawal,
    monthlySS,
    ssDelayYears,
  });

  const withdrawalRate = balanceAtRetirement > 0 ? (annualWithdrawal / balanceAtRetirement) * 100 : null;
  const annualSS = monthlySS * 12;
  const safeWithdrawal = balanceAtRetirement * 0.04;
  const fourPctStatus = annualWithdrawal <= safeWithdrawal;

  const cards = [
    {
      label: "Retirement Accounts Today",
      value: fmtCurrency(investableNow),
      sub: "401k, IRA, Roth, investments (excl. property & vehicles)",
      positive: true,
    },
    {
      label: "Projected at Retirement",
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
      label: "4% Rule Check",
      value: fourPctStatus ? "✓ Safe" : "⚠ Over 4%",
      sub: `Safe amount: ${fmtCurrency(safeWithdrawal)}/yr · Yours: ${fmtCurrency(annualWithdrawal)}/yr`,
      positive: fourPctStatus,
    },
    {
      label: "Social Security Income",
      value: fmtCurrency(annualSS) + "/yr",
      sub: ssDelayYears > 0 ? `starting ${ssDelayYears} year${ssDelayYears !== 1 ? "s" : ""} into retirement` : "starting at retirement",
      positive: true,
    },
  ];

  if (annualWithdrawal > 0) {
    const fireNumber = annualWithdrawal * 25;
    const fireProgress = Math.min((investableNow / fireNumber) * 100, 100);
    const { goalMonths: fireMonths } = computeProjection(entries, annualGrowthRate, monthlyContribution, 50, fireNumber, investableNow);
    let fireSub;
    if (investableNow >= fireNumber) {
      fireSub = "Already reached!";
    } else if (fireMonths !== null) {
      fireSub = `${fireProgress.toFixed(0)}% there · ~${Math.ceil(fireMonths / 12)}yr away`;
    } else {
      fireSub = `${fireProgress.toFixed(0)}% there · ${fmtCurrency(fireNumber - investableNow)} gap`;
    }
    cards.push({
      label: "FIRE Number (25×)",
      value: fmtCurrency(fireNumber),
      sub: fireSub,
      positive: investableNow >= fireNumber,
    });
  }

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

  // Tax note
  document.getElementById("retirement-tax-note").style.display = "block";

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

// Sets the snapshot date label. Charts and cards are reused from existing sections.
function renderSnapshotExtras(entries) {
  const latest = entries[entries.length - 1];
  const quarter = Math.ceil((latest.date.getMonth() + 1) / 3);
  document.getElementById("snapshot-date").textContent =
    `Q${quarter} ${latest.date.getFullYear()} (${latest.dateLabel})`;
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

  document.getElementById("print-btn").addEventListener("click", () => window.print());

  document.getElementById("snapshot-btn").addEventListener("click", () => {
    document.body.classList.add("snapshot");

    // matchMedia fires reliably on Chrome/Windows; afterprint does not
    const mql = window.matchMedia("print");
    const onPrintChange = (e) => {
      if (!e.matches) {
        mql.removeEventListener("change", onPrintChange);
        document.body.classList.remove("snapshot");
      }
    };
    mql.addEventListener("change", onPrintChange);

    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  });

  loadData(config.csvUrl)
    .then(({ entries, assetCols, debtCols }) => {
      if (!entries.length) throw new Error("No valid data rows found.");

      renderSummary(entries);
      renderNetWorthChart(entries);
      renderMoMChart(entries);
      renderAnnualSummary(entries);
      renderCategoryTrendChart(entries, assetCols);
      renderPerformanceCards(entries);
      renderBreakdownChart(entries, assetCols, debtCols);
      renderLatestPieChart(entries, assetCols);
      renderDebtPayoff(entries, debtCols);
      renderSnapshotExtras(entries);

      document.querySelectorAll(".range-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          renderNetWorthChart(filterEntriesByRange(entries, btn.dataset.range));
        });
      });

      const update = () => {
        const goal = parseFloat(document.getElementById("goalAmount").value) || null;
        renderProjectionChart(entries, goal);
        renderRetirementSection(entries, assetCols);
      };
      [
        "growthRate", "monthlyContribution", "projectionYears", "goalAmount",
        "inflationRate", "showScenarios",
        "yearsToRetirement", "annualWithdrawal", "monthlySS", "ssDelayYears", "retirementGrowthRate",
      ].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener(el.type === "checkbox" ? "change" : "input", update);
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
