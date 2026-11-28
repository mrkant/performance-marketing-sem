/**
 * Marketing Incrementality Intelligence — Investment Tracker
 * CRUD, filters, planned vs actual, multi-currency with explicit FX,
 * CSV import/export, JSON backup
 * Namespace: window.MII.Investments
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Investments = MII.Investments || {};

  /* ---------- Constants ---------- */
  const CATEGORIES = [
    { id: "paid_digital", label: "Paid digital" },
    { id: "owned_digital", label: "Owned digital" },
    { id: "organic_earned", label: "Organic and earned media" },
    { id: "traditional", label: "Traditional media" },
    { id: "experiential", label: "Experiential marketing" },
    { id: "trade_retail", label: "Trade and retail marketing" },
    { id: "customer_growth", label: "Customer growth and retention" },
    { id: "infrastructure", label: "Marketing infrastructure and overhead" }
  ];

  const CURRENCIES = ["JPY", "USD", "EUR", "GBP", "AUD", "SGD", "INR", "KRW", "CNY"];

  const MEASUREMENT_METHODS = [
    "",
    "Last-click attribution",
    "Multi-touch attribution",
    "Marketing mix model",
    "Geo holdout / incrementality test",
    "Matched-market test",
    "Brand lift study",
    "Platform-reported",
    "Manual estimate",
    "Not measured"
  ];

  const EMPTY_RECORD = {
    id: null,
    channel: "",
    campaignName: "",
    category: "paid_digital",
    startDate: "",
    endDate: "",
    market: "",
    currency: "JPY",
    grossSpend: 0,
    discountsRebates: 0,
    agencyFees: 0,
    productionCosts: 0,
    allocatedOverhead: 0,
    plannedSpend: 0,
    attributedRevenue: 0,
    dataSource: "",
    measurementMethod: "",
    notes: "",
    isOverhead: false
  };

  let state = {
    records: [],
    fxRates: {}, // { "USD_JPY": 150.0 } meaning 1 USD = 150 JPY
    baseCurrency: "JPY",
    filter: {
      q: "",
      category: "",
      currency: "",
      year: "",
      quarter: "",
      month: ""
    },
    editingId: null,
    view: "table" // table | monthly | quarterly | annual
  };

  /* ---------- Helpers ---------- */
  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function $all(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function categoryLabel(id) {
    const c = CATEGORIES.find(function (x) {
      return x.id === id;
    });
    return c ? c.label : id || "—";
  }
  function num(v) {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function money(n, cur) {
    const v = num(n);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur || "JPY",
        maximumFractionDigits: cur === "JPY" || cur === "KRW" ? 0 : 2
      }).format(v);
    } catch (e) {
      return (cur || "") + " " + v.toLocaleString();
    }
  }

  /** Net direct campaign spend (excludes allocated overhead to avoid double-count in totals when overhead is also listed separately) */
  function directSpend(r) {
    return Math.max(
      0,
      num(r.grossSpend) - num(r.discountsRebates) + num(r.agencyFees) + num(r.productionCosts)
    );
  }

  /** Full loaded cost including allocated overhead */
  function totalLoaded(r) {
    return directSpend(r) + num(r.allocatedOverhead);
  }

  function parseDate(s) {
    if (!s) return null;
    const d = new Date(s + (s.length === 7 ? "-01" : ""));
    return isNaN(d.getTime()) ? null : d;
  }

  function yearOf(r) {
    const d = parseDate(r.startDate);
    return d ? d.getFullYear() : null;
  }
  function monthOf(r) {
    const d = parseDate(r.startDate);
    return d ? d.getMonth() + 1 : null;
  }
  function quarterOf(r) {
    const m = monthOf(r);
    return m ? Math.ceil(m / 3) : null;
  }

  /* ---------- FX ---------- */
  function fxKey(from, to) {
    return from + "_" + to;
  }

  function convert(amount, from, to) {
    if (!from || !to || from === to) return { value: num(amount), ok: true };
    const rates = state.fxRates;
    const direct = rates[fxKey(from, to)];
    if (direct != null && direct > 0) return { value: num(amount) * direct, ok: true };
    const inverse = rates[fxKey(to, from)];
    if (inverse != null && inverse > 0) return { value: num(amount) / inverse, ok: true };
    // Try via base
    const base = state.baseCurrency;
    if (from !== base && to !== base) {
      const a = convert(amount, from, base);
      if (a.ok) {
        const b = convert(a.value, base, to);
        if (b.ok) return b;
      }
    }
    return { value: null, ok: false, missing: fxKey(from, to) };
  }

  function canAggregate(records) {
    const currencies = {};
    records.forEach(function (r) {
      currencies[r.currency || "JPY"] = true;
    });
    const list = Object.keys(currencies);
    if (list.length <= 1) return { ok: true, currencies: list };
    const missing = [];
    list.forEach(function (c) {
      if (c === state.baseCurrency) return;
      const t = convert(1, c, state.baseCurrency);
      if (!t.ok) missing.push(c + "→" + state.baseCurrency);
    });
    return { ok: missing.length === 0, currencies: list, missing: missing };
  }

  function sumInBase(records, fieldFn) {
    const agg = canAggregate(records);
    if (!agg.ok) return { ok: false, missing: agg.missing };
    let total = 0;
    records.forEach(function (r) {
      const raw = fieldFn(r);
      const c = convert(raw, r.currency || "JPY", state.baseCurrency);
      if (c.ok) total += c.value;
    });
    return { ok: true, value: total, currency: state.baseCurrency };
  }

  /* ---------- Validation ---------- */
  function validate(rec) {
    const errors = [];
    if (!rec.channel || !String(rec.channel).trim()) errors.push("Channel is required.");
    if (!rec.category) errors.push("Investment category is required.");
    if (!rec.startDate) errors.push("Start date is required.");
    if (rec.endDate && rec.startDate && rec.endDate < rec.startDate) {
      errors.push("End date cannot be before start date.");
    }
    if (!rec.currency) errors.push("Currency is required.");
    if (num(rec.grossSpend) < 0) errors.push("Gross spend cannot be negative.");
    if (num(rec.discountsRebates) < 0) errors.push("Discounts/rebates cannot be negative.");
    if (num(rec.agencyFees) < 0) errors.push("Agency fees cannot be negative.");
    if (num(rec.productionCosts) < 0) errors.push("Production costs cannot be negative.");
    if (num(rec.allocatedOverhead) < 0) errors.push("Allocated overhead cannot be negative.");
    if (num(rec.plannedSpend) < 0) errors.push("Planned spend cannot be negative.");
    if (num(rec.attributedRevenue) < 0) errors.push("Attributed revenue cannot be negative.");
    if (num(rec.discountsRebates) > num(rec.grossSpend) && num(rec.grossSpend) > 0) {
      errors.push("Discounts/rebates exceed gross spend.");
    }
    return errors;
  }

  function normalizeRecord(raw) {
    const r = Object.assign({}, EMPTY_RECORD, raw || {});
    r.channel = String(r.channel || "").trim();
    r.campaignName = String(r.campaignName || "").trim();
    r.category = r.category || "paid_digital";
    r.startDate = r.startDate || "";
    r.endDate = r.endDate || "";
    r.market = String(r.market || "").trim();
    r.currency = (r.currency || "JPY").toUpperCase();
    r.grossSpend = num(r.grossSpend);
    r.discountsRebates = num(r.discountsRebates);
    r.agencyFees = num(r.agencyFees);
    r.productionCosts = num(r.productionCosts);
    r.allocatedOverhead = num(r.allocatedOverhead);
    r.plannedSpend = num(r.plannedSpend);
    r.attributedRevenue = num(r.attributedRevenue);
    r.dataSource = String(r.dataSource || "").trim();
    r.measurementMethod = r.measurementMethod || "";
    r.notes = String(r.notes || "").trim();
    r.isOverhead = r.category === "infrastructure" || !!r.isOverhead;
    if (r.id == null || r.id === "") delete r.id;
    else r.id = typeof r.id === "number" ? r.id : parseInt(r.id, 10);
    return r;
  }

  /* ---------- Filter ---------- */
  function filteredRecords() {
    const f = state.filter;
    return state.records.filter(function (r) {
      if (f.category && r.category !== f.category) return false;
      if (f.currency && r.currency !== f.currency) return false;
      if (f.year) {
        const y = yearOf(r);
        if (String(y) !== String(f.year)) return false;
      }
      if (f.quarter) {
        const q = quarterOf(r);
        if (String(q) !== String(f.quarter)) return false;
      }
      if (f.month) {
        const m = monthOf(r);
        if (String(m) !== String(f.month)) return false;
      }
      if (f.q) {
        const q = f.q.toLowerCase();
        const blob = [
          r.channel,
          r.campaignName,
          r.market,
          r.dataSource,
          r.notes,
          categoryLabel(r.category)
        ]
          .join(" ")
          .toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* ---------- Persistence ---------- */
  async function loadAll() {
    const [recs, rates, base] = await Promise.all([
      MII.Data.getInvestments(),
      MII.Data.getFxRates(),
      MII.Data.getSetting("baseCurrency", "JPY")
    ]);
    state.records = (recs || []).map(function (raw) {
      // Legacy demo shape compatibility
      if (raw && !raw.startDate && raw.date) raw.startDate = raw.date;
      if (raw && (raw.grossSpend == null || raw.grossSpend === 0) && raw.spend != null) raw.grossSpend = raw.spend;
      if (raw && !raw.category && raw.type === "online") raw.category = "paid_digital";
      if (raw && !raw.category && raw.type === "offline") raw.category = "traditional";
      return normalizeRecord(raw);
    });
    state.fxRates = {};
    (rates || []).forEach(function (row) {
      if (row.pair && row.rate > 0) state.fxRates[row.pair] = row.rate;
    });
    state.baseCurrency = base || "JPY";
  }

  async function saveRecord(rec) {
    const n = normalizeRecord(rec);
    const errors = validate(n);
    if (errors.length) return { ok: false, errors: errors };
    // Migrate legacy demo shape if needed
    if (!n.startDate && n.date) n.startDate = n.date;
    const id = await MII.Data.putInvestment(n);
    n.id = id;
    await loadAll();
    return { ok: true, id: id };
  }

  async function deleteRecord(id) {
    await MII.Data.deleteInvestment(id);
    await loadAll();
  }

  /* ---------- CSV ---------- */
  const CSV_HEADERS = [
    "id",
    "channel",
    "campaignName",
    "category",
    "startDate",
    "endDate",
    "market",
    "currency",
    "grossSpend",
    "discountsRebates",
    "agencyFees",
    "productionCosts",
    "allocatedOverhead",
    "plannedSpend",
    "attributedRevenue",
    "dataSource",
    "measurementMethod",
    "notes"
  ];

  function toCsv(rows) {
    const lines = [CSV_HEADERS.join(",")];
    rows.forEach(function (r) {
      const line = CSV_HEADERS.map(function (h) {
        let v = r[h];
        if (v == null) v = "";
        v = String(v).replace(/"/g, '""');
        if (/[",\n]/.test(v)) v = '"' + v + '"';
        return v;
      });
      lines.push(line.join(","));
    });
    return lines.join("\n");
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) {
      return l.trim();
    });
    if (lines.length < 2) return { ok: false, error: "CSV has no data rows." };
    // Simple CSV parse (handles quoted fields)
    function splitLine(line) {
      const out = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') inQ = false;
          else cur += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === ",") {
            out.push(cur);
            cur = "";
          } else cur += ch;
        }
      }
      out.push(cur);
      return out;
    }
    const headers = splitLine(lines[0]).map(function (h) {
      return h.trim();
    });
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const obj = {};
      headers.forEach(function (h, idx) {
        obj[h] = cols[idx] != null ? cols[idx].trim() : "";
      });
      rows.push(obj);
    }
    return { ok: true, rows: rows };
  }

  async function importCsvText(text) {
    const parsed = parseCsv(text);
    if (!parsed.ok) return parsed;
    let imported = 0;
    const errors = [];
    for (let i = 0; i < parsed.rows.length; i++) {
      const raw = parsed.rows[i];
      // Map legacy "date" / "spend" columns
      if (!raw.startDate && raw.date) raw.startDate = raw.date;
      if (!raw.grossSpend && raw.spend != null) raw.grossSpend = raw.spend;
      if (raw.id === "" || raw.id === undefined) delete raw.id;
      else raw.id = parseInt(raw.id, 10);
      const n = normalizeRecord(raw);
      const v = validate(n);
      if (v.length) {
        errors.push("Row " + (i + 2) + ": " + v.join(" "));
        continue;
      }
      await MII.Data.putInvestment(n);
      imported++;
    }
    await loadAll();
    await MII.Data.setSetting("dataMode", "user");
    return { ok: true, imported: imported, errors: errors };
  }

  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- JSON backup ---------- */
  async function exportJsonBackup() {
    const rates = await MII.Data.getFxRates();
    const payload = {
      app: "Marketing Incrementality Intelligence",
      type: "investment-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      baseCurrency: state.baseCurrency,
      fxRates: rates,
      investments: state.records
    };
    downloadBlob(
      "mii-investments-backup-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }

  async function importJsonBackup(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "Invalid JSON." };
    }
    if (!data || !Array.isArray(data.investments)) {
      return { ok: false, error: "JSON is not a valid MII investment backup." };
    }
    let imported = 0;
    for (let i = 0; i < data.investments.length; i++) {
      const n = normalizeRecord(data.investments[i]);
      const v = validate(n);
      if (v.length) continue;
      await MII.Data.putInvestment(n);
      imported++;
    }
    if (Array.isArray(data.fxRates)) {
      for (let i = 0; i < data.fxRates.length; i++) {
        const row = data.fxRates[i];
        if (row.pair && row.rate > 0) await MII.Data.putFxRate(row);
      }
    }
    if (data.baseCurrency) {
      await MII.Data.setSetting("baseCurrency", data.baseCurrency);
    }
    await loadAll();
    await MII.Data.setSetting("dataMode", "user");
    return { ok: true, imported: imported };
  }

  /* ---------- Aggregations ---------- */
  function buildMonthly(rows) {
    const map = {};
    rows.forEach(function (r) {
      const y = yearOf(r);
      const m = monthOf(r);
      if (!y || !m) return;
      const key = y + "-" + String(m).padStart(2, "0");
      if (!map[key]) map[key] = { key: key, planned: [], actual: [] };
      map[key].planned.push(r);
      map[key].actual.push(r);
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        const g = map[k];
        const planned = sumInBase(g.planned, function (r) {
          return num(r.plannedSpend);
        });
        // Actual = direct only (overhead allocated is tracked but not double-added to campaign totals)
        const actualDirect = sumInBase(g.actual, directSpend);
        const overhead = sumInBase(g.actual, function (r) {
          return num(r.allocatedOverhead);
        });
        return {
          period: k,
          planned: planned,
          actualDirect: actualDirect,
          overhead: overhead
        };
      });
  }

  function buildQuarterly(rows) {
    const map = {};
    rows.forEach(function (r) {
      const y = yearOf(r);
      const q = quarterOf(r);
      if (!y || !q) return;
      const key = y + "-Q" + q;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        const g = map[k];
        return {
          period: k,
          planned: sumInBase(g, function (r) {
            return num(r.plannedSpend);
          }),
          actualDirect: sumInBase(g, directSpend),
          overhead: sumInBase(g, function (r) {
            return num(r.allocatedOverhead);
          })
        };
      });
  }

  function buildAnnual(rows) {
    const map = {};
    rows.forEach(function (r) {
      const y = yearOf(r);
      if (!y) return;
      if (!map[y]) map[y] = [];
      map[y].push(r);
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        const g = map[k];
        return {
          period: k,
          planned: sumInBase(g, function (r) {
            return num(r.plannedSpend);
          }),
          actualDirect: sumInBase(g, directSpend),
          overhead: sumInBase(g, function (r) {
            return num(r.allocatedOverhead);
          }),
          byCategory: CATEGORIES.map(function (cat) {
            const subset = g.filter(function (r) {
              return r.category === cat.id;
            });
            return {
              category: cat.label,
              actual: sumInBase(subset, directSpend)
            };
          })
        };
      });
  }

  /* ---------- UI Render ---------- */
  function render(container) {
    loadAll()
      .then(function () {
        paint(container);
      })
      .catch(function (err) {
        container.innerHTML =
          '<div class="mii-card"><p class="mii-text-muted">Could not load investments: ' +
          escapeHtml(err.message || err) +
          "</p></div>";
      });
  }

  function paint(container) {
    const rows = filteredRecords();
    const aggCheck = canAggregate(rows);

    let html = "";

    html +=
      '<div class="mii-demo-banner"><span aria-hidden="true">ℹ</span><div>' +
      "<strong>Investment Tracker.</strong> Direct campaign spend is separated from allocated overhead to avoid double-counting. " +
      "Multi-currency totals require explicit exchange rates (see FX panel)." +
      "</div></div>";

    // Toolbar
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mii-inv-add">+ Add investment</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mii-inv-export-csv">Download CSV</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mii-inv-export-json">JSON backup</button>' +
      '<label class="mii-btn mii-btn--ghost" style="cursor:pointer;">Upload CSV<input type="file" id="mii-inv-import-csv" accept=".csv,text/csv" hidden></label>' +
      '<label class="mii-btn mii-btn--ghost" style="cursor:pointer;">Restore JSON<input type="file" id="mii-inv-import-json" accept=".json,application/json" hidden></label>' +
      "</div>" +
      '<div style="font-size:0.85rem;color:var(--mii-text-muted);">' +
      rows.length +
      " record(s)" +
      (!aggCheck.ok
        ? ' · <span style="color:#fbbf24;">FX rates needed to total currencies</span>'
        : "") +
      "</div></div></div>";

    // Filters
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">' +
      '<div><label class="mii-kpi-label">Search</label>' +
      '<input class="mii-input-like" id="mii-f-q" value="' +
      escapeHtml(state.filter.q) +
      '" placeholder="Channel, campaign…" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>' +
      '<div><label class="mii-kpi-label">Category</label>' +
      '<select id="mii-f-cat" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="">All</option>' +
      CATEGORIES.map(function (c) {
        return (
          '<option value="' +
          c.id +
          '"' +
          (state.filter.category === c.id ? " selected" : "") +
          ">" +
          escapeHtml(c.label) +
          "</option>"
        );
      }).join("") +
      "</select></div>" +
      '<div><label class="mii-kpi-label">Currency</label>' +
      '<select id="mii-f-cur" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="">All</option>' +
      CURRENCIES.map(function (c) {
        return (
          '<option value="' +
          c +
          '"' +
          (state.filter.currency === c ? " selected" : "") +
          ">" +
          c +
          "</option>"
        );
      }).join("") +
      "</select></div>" +
      '<div><label class="mii-kpi-label">Year</label>' +
      '<input id="mii-f-year" type="number" placeholder="2026" value="' +
      escapeHtml(state.filter.year) +
      '" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>' +
      '<div><label class="mii-kpi-label">Quarter</label>' +
      '<select id="mii-f-qtr" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="">All</option><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>' +
      "</select></div>" +
      '<div><label class="mii-kpi-label">View</label>' +
      '<select id="mii-f-view" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="table"' +
      (state.view === "table" ? " selected" : "") +
      ">Table</option>" +
      '<option value="monthly"' +
      (state.view === "monthly" ? " selected" : "") +
      ">Monthly</option>" +
      '<option value="quarterly"' +
      (state.view === "quarterly" ? " selected" : "") +
      ">Quarterly</option>" +
      '<option value="annual"' +
      (state.view === "annual" ? " selected" : "") +
      ">Annual budget</option>" +
      "</select></div>" +
      "</div></div>";

    // Summary KPIs
    const plannedSum = sumInBase(rows, function (r) {
      return num(r.plannedSpend);
    });
    const actualSum = sumInBase(rows, directSpend);
    const ohSum = sumInBase(rows, function (r) {
      return num(r.allocatedOverhead);
    });

    html += '<div class="mii-grid mii-grid-4" style="margin-bottom:16px;">';
    html += kpiCard(
      "Actual direct spend",
      actualSum.ok ? money(actualSum.value, state.baseCurrency) : "Set FX rates",
      "Excludes allocated overhead"
    );
    html += kpiCard(
      "Allocated overhead",
      ohSum.ok ? money(ohSum.value, state.baseCurrency) : "—",
      "Tracked separately"
    );
    html += kpiCard(
      "Planned spend",
      plannedSum.ok ? money(plannedSum.value, state.baseCurrency) : "—",
      "Budget"
    );
    let variance = "—";
    if (plannedSum.ok && actualSum.ok && plannedSum.value > 0) {
      const v = ((actualSum.value - plannedSum.value) / plannedSum.value) * 100;
      variance = (v >= 0 ? "+" : "") + v.toFixed(1) + "% vs plan";
    }
    html += kpiCard("Variance", variance, "Actual direct vs planned");
    html += "</div>";

    // FX panel
    html += renderFxPanel(aggCheck);

    // Form (hidden until add/edit)
    html +=
      '<div class="mii-card" id="mii-inv-form-wrap" hidden style="margin-bottom:16px;"></div>';

    // Main view
    html += '<div id="mii-inv-main">';
    if (state.view === "table") html += renderTable(rows);
    else if (state.view === "monthly") html += renderPeriodTable(buildMonthly(rows), "Month");
    else if (state.view === "quarterly")
      html += renderPeriodTable(buildQuarterly(rows), "Quarter");
    else html += renderAnnual(buildAnnual(rows));
    html += "</div>";

    container.innerHTML = html;
    wire(container);
  }

  function kpiCard(label, value, sub) {
    return (
      '<div class="mii-card"><div class="mii-kpi-value" style="font-size:1.25rem;">' +
      escapeHtml(value) +
      '</div><div class="mii-kpi-label">' +
      escapeHtml(label) +
      '</div><div class="mii-kpi-delta neutral">' +
      escapeHtml(sub) +
      "</div></div>"
    );
  }

  function renderFxPanel(aggCheck) {
    let html =
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div class="mii-card-header"><div><h2 class="mii-card-title">Exchange rates</h2>' +
      '<p class="mii-card-subtitle">Required before combining different currencies. Rate = units of TO currency per 1 unit of FROM.</p></div>' +
      "<div><label class=\"mii-kpi-label\">Base currency </label>" +
      '<select id="mii-base-cur" style="padding:6px 8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">';
    CURRENCIES.forEach(function (c) {
      html +=
        '<option value="' +
        c +
        '"' +
        (state.baseCurrency === c ? " selected" : "") +
        ">" +
        c +
        "</option>";
    });
    html +=
      "</select></div></div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:12px;">' +
      '<div><label class="mii-kpi-label">From</label><select id="mii-fx-from" style="display:block;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      CURRENCIES.map(function (c) {
        return '<option value="' + c + '">' + c + "</option>";
      }).join("") +
      '</select></div>' +
      '<div><label class="mii-kpi-label">To</label><select id="mii-fx-to" style="display:block;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      CURRENCIES.map(function (c) {
        return (
          '<option value="' +
          c +
          '"' +
          (c === state.baseCurrency ? " selected" : "") +
          ">" +
          c +
          "</option>"
        );
      }).join("") +
      '</select></div>' +
      '<div><label class="mii-kpi-label">Rate</label><input id="mii-fx-rate" type="number" step="any" min="0" placeholder="e.g. 150" style="display:block;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);width:120px;"></div>' +
      '<button type="button" class="mii-btn mii-btn--primary mii-btn--sm" id="mii-fx-save">Save rate</button>' +
      "</div>";

    const pairs = Object.keys(state.fxRates);
    if (pairs.length) {
      html +=
        '<div class="mii-table-wrap"><table class="mii-table"><thead><tr><th>Pair</th><th>Rate</th><th></th></tr></thead><tbody>';
      pairs.forEach(function (p) {
        html +=
          "<tr><td>" +
          escapeHtml(p.replace("_", " → ")) +
          "</td><td>" +
          state.fxRates[p] +
          '</td><td><button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-fx-del" data-pair="' +
          escapeHtml(p) +
          '">Remove</button></td></tr>';
      });
      html += "</tbody></table></div>";
    } else {
      html +=
        '<p class="mii-text-muted" style="margin:0;font-size:0.85rem;">No rates saved yet. Add rates if you use more than one currency.</p>';
    }
    if (!aggCheck.ok && aggCheck.missing) {
      html +=
        '<p style="margin:12px 0 0;font-size:0.85rem;color:#fbbf24;">Missing rates: ' +
        escapeHtml(aggCheck.missing.join(", ")) +
        "</p>";
    }
    html += "</div>";
    return html;
  }

  function renderTable(rows) {
    if (!rows.length) {
      return (
        '<div class="mii-card"><div class="mii-placeholder" style="min-height:160px;">' +
        "<h3>No investments match</h3><p>Add a record or adjust filters. Demo data may still be present until you import your own.</p></div></div>"
      );
    }
    let html =
      '<div class="mii-card" style="padding:0;overflow:hidden;"><div class="mii-table-wrap" style="border:none;border-radius:0;">' +
      '<table class="mii-table"><thead><tr>' +
      "<th>Channel / Campaign</th><th>Category</th><th>Period</th><th>Market</th><th>Currency</th>" +
      "<th>Gross</th><th>Direct</th><th>Overhead</th><th>Planned</th><th></th>" +
      "</tr></thead><tbody>";
    rows
      .slice()
      .sort(function (a, b) {
        return String(b.startDate).localeCompare(String(a.startDate));
      })
      .forEach(function (r) {
        html +=
          "<tr>" +
          "<td><strong>" +
          escapeHtml(r.channel) +
          "</strong>" +
          (r.campaignName
            ? '<div class="mii-text-soft" style="font-size:0.8rem;">' +
              escapeHtml(r.campaignName) +
              "</div>"
            : "") +
          "</td>" +
          "<td>" +
          escapeHtml(categoryLabel(r.category)) +
          "</td>" +
          "<td>" +
          escapeHtml(r.startDate || "—") +
          (r.endDate ? " → " + escapeHtml(r.endDate) : "") +
          "</td>" +
          "<td>" +
          escapeHtml(r.market || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(r.currency) +
          "</td>" +
          "<td>" +
          money(r.grossSpend, r.currency) +
          "</td>" +
          "<td>" +
          money(directSpend(r), r.currency) +
          "</td>" +
          "<td>" +
          money(r.allocatedOverhead, r.currency) +
          "</td>" +
          "<td>" +
          money(r.plannedSpend, r.currency) +
          "</td>" +
          '<td style="white-space:nowrap;">' +
          '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-inv-edit" data-id="' +
          r.id +
          '">Edit</button> ' +
          '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-inv-del" data-id="' +
          r.id +
          '">Delete</button>' +
          "</td></tr>";
      });
    html += "</tbody></table></div></div>";
    return html;
  }

  function renderPeriodTable(periods, label) {
    let html =
      '<div class="mii-card" style="padding:0;overflow:hidden;"><div class="mii-table-wrap" style="border:none;">' +
      '<table class="mii-table"><thead><tr>' +
      "<th>" +
      escapeHtml(label) +
      "</th><th>Planned</th><th>Actual direct</th><th>Allocated overhead</th><th>Variance</th>" +
      "</tr></thead><tbody>";
    if (!periods.length) {
      html +=
        '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No data for this view.</td></tr>';
    }
    periods.forEach(function (p) {
      let varText = "—";
      if (p.planned.ok && p.actualDirect.ok && p.planned.value > 0) {
        const v = ((p.actualDirect.value - p.planned.value) / p.planned.value) * 100;
        varText = (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
      }
      html +=
        "<tr><td><strong>" +
        escapeHtml(p.period) +
        "</strong></td><td>" +
        (p.planned.ok ? money(p.planned.value, state.baseCurrency) : "Need FX") +
        "</td><td>" +
        (p.actualDirect.ok ? money(p.actualDirect.value, state.baseCurrency) : "Need FX") +
        "</td><td>" +
        (p.overhead.ok ? money(p.overhead.value, state.baseCurrency) : "—") +
        "</td><td>" +
        varText +
        "</td></tr>";
    });
    html += "</tbody></table></div></div>";
    return html;
  }

  function renderAnnual(years) {
    if (!years.length) {
      return '<div class="mii-card"><p class="mii-text-muted">No annual data.</p></div>';
    }
    let html = "";
    years.forEach(function (y) {
      html +=
        '<div class="mii-card" style="margin-bottom:16px;">' +
        '<h2 class="mii-card-title">Budget year ' +
        escapeHtml(y.period) +
        "</h2>" +
        '<div class="mii-grid mii-grid-3" style="margin:12px 0;">' +
        kpiCard(
          "Planned",
          y.planned.ok ? money(y.planned.value, state.baseCurrency) : "Need FX",
          ""
        ) +
        kpiCard(
          "Actual direct",
          y.actualDirect.ok ? money(y.actualDirect.value, state.baseCurrency) : "Need FX",
          ""
        ) +
        kpiCard(
          "Overhead allocated",
          y.overhead.ok ? money(y.overhead.value, state.baseCurrency) : "—",
          ""
        ) +
        "</div>" +
        '<div class="mii-table-wrap"><table class="mii-table"><thead><tr><th>Category</th><th>Actual direct</th></tr></thead><tbody>';
      y.byCategory.forEach(function (c) {
        html +=
          "<tr><td>" +
          escapeHtml(c.category) +
          "</td><td>" +
          (c.actual.ok ? money(c.actual.value, state.baseCurrency) : "Need FX") +
          "</td></tr>";
      });
      html += "</tbody></table></div></div>";
    });
    return html;
  }

  function renderForm(rec) {
    const r = normalizeRecord(rec || EMPTY_RECORD);
    const isEdit = r.id != null;
    let html =
      '<h2 class="mii-card-title" style="margin-bottom:14px;">' +
      (isEdit ? "Edit investment" : "Add investment") +
      "</h2>" +
      '<div id="mii-form-errors" class="mii-text-muted" style="color:#fca5a5;font-size:0.85rem;margin-bottom:10px;"></div>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">';

    function field(label, id, inputHtml) {
      return (
        "<div><label class=\"mii-kpi-label\" for=\"" +
        id +
        '">' +
        label +
        "</label>" +
        inputHtml +
        "</div>"
      );
    }
    function inp(id, val, type, extra) {
      return (
        '<input id="' +
        id +
        '" type="' +
        (type || "text") +
        '" value="' +
        escapeHtml(val) +
        '" ' +
        (extra || "") +
        ' style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">'
      );
    }

    html += field("Channel *", "f-channel", inp("f-channel", r.channel));
    html += field("Campaign name", "f-campaign", inp("f-campaign", r.campaignName));
    html +=
      field(
        "Category *",
        "f-category",
        '<select id="f-category" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
          CATEGORIES.map(function (c) {
            return (
              '<option value="' +
              c.id +
              '"' +
              (r.category === c.id ? " selected" : "") +
              ">" +
              escapeHtml(c.label) +
              "</option>"
            );
          }).join("") +
          "</select>"
      );
    html += field("Start date *", "f-start", inp("f-start", r.startDate, "date"));
    html += field("End date", "f-end", inp("f-end", r.endDate, "date"));
    html += field("Market", "f-market", inp("f-market", r.market));
    html +=
      field(
        "Currency *",
        "f-currency",
        '<select id="f-currency" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
          CURRENCIES.map(function (c) {
            return (
              '<option value="' +
              c +
              '"' +
              (r.currency === c ? " selected" : "") +
              ">" +
              c +
              "</option>"
            );
          }).join("") +
          "</select>"
      );
    html += field("Gross spend", "f-gross", inp("f-gross", r.grossSpend, "number", 'step="any" min="0"'));
    html += field(
      "Discounts & rebates",
      "f-disc",
      inp("f-disc", r.discountsRebates, "number", 'step="any" min="0"')
    );
    html += field("Agency fees", "f-agency", inp("f-agency", r.agencyFees, "number", 'step="any" min="0"'));
    html += field(
      "Production costs",
      "f-prod",
      inp("f-prod", r.productionCosts, "number", 'step="any" min="0"')
    );
    html += field(
      "Allocated overhead",
      "f-oh",
      inp("f-oh", r.allocatedOverhead, "number", 'step="any" min="0"')
    );
    html += field(
      "Planned spend",
      "f-planned",
      inp("f-planned", r.plannedSpend, "number", 'step="any" min="0"')
    );
    html += field(
      "Attributed revenue",
      "f-rev",
      inp("f-rev", r.attributedRevenue, "number", 'step="any" min="0"')
    );
    html += field("Data source", "f-source", inp("f-source", r.dataSource));
    html +=
      field(
        "Measurement method",
        "f-method",
        '<select id="f-method" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
          MEASUREMENT_METHODS.map(function (m) {
            return (
              '<option value="' +
              escapeHtml(m) +
              '"' +
              (r.measurementMethod === m ? " selected" : "") +
              ">" +
              (m || "—") +
              "</option>"
            );
          }).join("") +
          "</select>"
      );
    html +=
      '<div style="grid-column:1/-1;"><label class="mii-kpi-label" for="f-notes">Notes</label>' +
      '<textarea id="f-notes" rows="2" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      escapeHtml(r.notes) +
      "</textarea></div>";

    html +=
      '</div><div style="margin-top:16px;display:flex;gap:8px;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mii-form-save">' +
      (isEdit ? "Update" : "Save") +
      "</button>" +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mii-form-cancel">Cancel</button>' +
      "</div>" +
      '<p class="mii-text-soft" style="margin:12px 0 0;font-size:0.8rem;">Direct spend = Gross − Discounts + Agency fees + Production. Allocated overhead is stored separately and not added into direct totals.</p>';

    return html;
  }

  function readForm() {
    return normalizeRecord({
      id: state.editingId,
      channel: $("#f-channel") && $("#f-channel").value,
      campaignName: $("#f-campaign") && $("#f-campaign").value,
      category: $("#f-category") && $("#f-category").value,
      startDate: $("#f-start") && $("#f-start").value,
      endDate: $("#f-end") && $("#f-end").value,
      market: $("#f-market") && $("#f-market").value,
      currency: $("#f-currency") && $("#f-currency").value,
      grossSpend: $("#f-gross") && $("#f-gross").value,
      discountsRebates: $("#f-disc") && $("#f-disc").value,
      agencyFees: $("#f-agency") && $("#f-agency").value,
      productionCosts: $("#f-prod") && $("#f-prod").value,
      allocatedOverhead: $("#f-oh") && $("#f-oh").value,
      plannedSpend: $("#f-planned") && $("#f-planned").value,
      attributedRevenue: $("#f-rev") && $("#f-rev").value,
      dataSource: $("#f-source") && $("#f-source").value,
      measurementMethod: $("#f-method") && $("#f-method").value,
      notes: $("#f-notes") && $("#f-notes").value
    });
  }

  function wire(container) {
    function refresh() {
      paint(container);
    }

    const addBtn = $("#mii-inv-add");
    if (addBtn) {
      addBtn.addEventListener("click", function () {
        state.editingId = null;
        const wrap = $("#mii-inv-form-wrap");
        wrap.hidden = false;
        wrap.innerHTML = renderForm(EMPTY_RECORD);
        wireForm(container);
        wrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    $all(".mii-inv-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = parseInt(btn.getAttribute("data-id"), 10);
        const rec = state.records.find(function (r) {
          return r.id === id;
        });
        state.editingId = id;
        const wrap = $("#mii-inv-form-wrap");
        wrap.hidden = false;
        wrap.innerHTML = renderForm(rec || EMPTY_RECORD);
        wireForm(container);
        wrap.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    $all(".mii-inv-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = parseInt(btn.getAttribute("data-id"), 10);
        if (!confirm("Delete this investment record?")) return;
        deleteRecord(id).then(refresh);
      });
    });

    // Filters
    ["mii-f-q", "mii-f-cat", "mii-f-cur", "mii-f-year", "mii-f-qtr", "mii-f-view"].forEach(
      function (id) {
        const el = $("#" + id);
        if (!el) return;
        el.addEventListener("change", onFilter);
        if (id === "mii-f-q") el.addEventListener("input", onFilter);
      }
    );
    function onFilter() {
      state.filter.q = ($("#mii-f-q") && $("#mii-f-q").value) || "";
      state.filter.category = ($("#mii-f-cat") && $("#mii-f-cat").value) || "";
      state.filter.currency = ($("#mii-f-cur") && $("#mii-f-cur").value) || "";
      state.filter.year = ($("#mii-f-year") && $("#mii-f-year").value) || "";
      state.filter.quarter = ($("#mii-f-qtr") && $("#mii-f-qtr").value) || "";
      state.view = ($("#mii-f-view") && $("#mii-f-view").value) || "table";
      // Preserve quarter select value after repaint
      paint(container);
    }
    // Sync quarter select after paint
    const qtr = $("#mii-f-qtr");
    if (qtr && state.filter.quarter) qtr.value = state.filter.quarter;

    // Export
    const csvBtn = $("#mii-inv-export-csv");
    if (csvBtn) {
      csvBtn.addEventListener("click", function () {
        downloadBlob(
          "mii-investments-" + new Date().toISOString().slice(0, 10) + ".csv",
          toCsv(filteredRecords()),
          "text/csv;charset=utf-8;"
        );
      });
    }
    const jsonBtn = $("#mii-inv-export-json");
    if (jsonBtn) jsonBtn.addEventListener("click", exportJsonBackup);

    const csvIn = $("#mii-inv-import-csv");
    if (csvIn) {
      csvIn.addEventListener("change", function () {
        const file = csvIn.files && csvIn.files[0];
        if (!file) return;
        file.text().then(function (text) {
          importCsvText(text).then(function (res) {
            if (!res.ok) alert(res.error);
            else
              alert(
                "Imported " +
                  res.imported +
                  " row(s)." +
                  (res.errors && res.errors.length
                    ? "\n\nSkipped:\n" + res.errors.slice(0, 5).join("\n")
                    : "")
              );
            refresh();
          });
        });
        csvIn.value = "";
      });
    }

    const jsonIn = $("#mii-inv-import-json");
    if (jsonIn) {
      jsonIn.addEventListener("change", function () {
        const file = jsonIn.files && jsonIn.files[0];
        if (!file) return;
        file.text().then(function (text) {
          importJsonBackup(text).then(function (res) {
            if (!res.ok) alert(res.error);
            else alert("Restored " + res.imported + " investment(s).");
            refresh();
          });
        });
        jsonIn.value = "";
      });
    }

    // FX
    const baseSel = $("#mii-base-cur");
    if (baseSel) {
      baseSel.addEventListener("change", function () {
        state.baseCurrency = baseSel.value;
        MII.Data.setSetting("baseCurrency", state.baseCurrency).then(refresh);
      });
    }
    const fxSave = $("#mii-fx-save");
    if (fxSave) {
      fxSave.addEventListener("click", function () {
        const from = $("#mii-fx-from").value;
        const to = $("#mii-fx-to").value;
        const rate = parseFloat($("#mii-fx-rate").value);
        if (!from || !to || from === to) {
          alert("Choose two different currencies.");
          return;
        }
        if (!(rate > 0)) {
          alert("Enter a positive exchange rate.");
          return;
        }
        MII.Data.putFxRate({ pair: fxKey(from, to), rate: rate, updatedAt: new Date().toISOString() }).then(
          function () {
            return loadAll().then(refresh);
          }
        );
      });
    }
    $all(".mii-fx-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const pair = btn.getAttribute("data-pair");
        MII.Data.putFxRate({ pair: pair, rate: 0 }).then(function () {
          // Better: delete — use raw delete via put with clear
          return MII.Data.getFxRates().then(function (all) {
            // reopen and delete
            return MII.Data.open().then(function (db) {
              return new Promise(function (resolve, reject) {
                const tx = db.transaction("fx_rates", "readwrite");
                tx.objectStore("fx_rates").delete(pair);
                tx.oncomplete = resolve;
                tx.onerror = reject;
              });
            });
          });
        }).then(function () {
          return loadAll().then(refresh);
        });
      });
    });
  }

  function wireForm(container) {
    const save = $("#mii-form-save");
    const cancel = $("#mii-form-cancel");
    if (cancel) {
      cancel.addEventListener("click", function () {
        state.editingId = null;
        $("#mii-inv-form-wrap").hidden = true;
      });
    }
    if (save) {
      save.addEventListener("click", function () {
        const rec = readForm();
        saveRecord(rec).then(function (res) {
          const errEl = $("#mii-form-errors");
          if (!res.ok) {
            if (errEl) errEl.textContent = res.errors.join(" ");
            return;
          }
          state.editingId = null;
          MII.Data.setSetting("dataMode", "user");
          paint(container);
        });
      });
    }
  }

  /* ---------- Public ---------- */
  MII.Investments.render = render;
  MII.Investments.CATEGORIES = CATEGORIES;
  MII.Investments.directSpend = directSpend;
  MII.Investments.validate = validate;
  MII.Investments.normalizeRecord = normalizeRecord;

  // Self-check tests (console)
  MII.Investments.runSelfTests = function () {
    const tests = [];
    const d = directSpend({
      grossSpend: 1000,
      discountsRebates: 100,
      agencyFees: 50,
      productionCosts: 25
    });
    tests.push({ name: "directSpend formula", pass: d === 975 });
    const errs = validate(normalizeRecord({ channel: "", category: "paid_digital", startDate: "2026-01-01", currency: "JPY" }));
    tests.push({ name: "requires channel", pass: errs.some(function (e) { return /channel/i.test(e); }) });
    const ok = validate(
      normalizeRecord({
        channel: "Search",
        category: "paid_digital",
        startDate: "2026-01-01",
        currency: "JPY",
        grossSpend: 100
      })
    );
    tests.push({ name: "valid record", pass: ok.length === 0 });
    return tests;
  };
})();
