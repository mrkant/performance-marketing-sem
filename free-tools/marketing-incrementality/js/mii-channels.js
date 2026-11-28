/**
 * Marketing Incrementality Intelligence — Channel Effectiveness
 * Compare channels across investment families; attributed vs incremental framing
 * Namespace: window.MII.Channels
 *
 * Does not invent causal lift. Uses Investment Tracker data when present,
 * otherwise illustrative structure clearly labelled as demo.
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Channels = MII.Channels || {};

  /* ---------- Taxonomy ---------- */
  const FAMILIES = [
    {
      id: "paid",
      label: "Paid",
      channels: [
        "Google Ads",
        "Microsoft Ads",
        "Meta",
        "TikTok",
        "LinkedIn",
        "YouTube",
        "Display / Programmatic",
        "Affiliates"
      ]
    },
    {
      id: "owned",
      label: "Owned",
      channels: ["Email", "SMS", "CRM", "Website", "App", "Loyalty", "Marketing automation"]
    },
    {
      id: "earned",
      label: "Earned",
      channels: [
        "SEO",
        "GEO / AI surfaces",
        "Organic social",
        "Influencers",
        "PR",
        "Guest blogging",
        "Reputation / reviews"
      ]
    },
    {
      id: "offline",
      label: "Offline",
      channels: [
        "TV / CTV",
        "Radio",
        "Print",
        "Outdoor / OOH",
        "Cinema",
        "Events",
        "Sponsorship",
        "Direct mail"
      ]
    },
    {
      id: "commercial",
      label: "Commercial",
      channels: [
        "Promotions",
        "Trade marketing",
        "Retail media",
        "Distributors",
        "Referrals",
        "Retention offers"
      ]
    },
    {
      id: "infrastructure",
      label: "Infrastructure",
      channels: [
        "Agency fees",
        "Creative production",
        "Marketing personnel",
        "Research",
        "Martech / technology"
      ]
    }
  ];

  const EVIDENCE_LEVELS = [
    { id: "none", label: "No incrementality evidence", score: 0 },
    { id: "platform", label: "Platform-reported only", score: 1 },
    { id: "mto", label: "Multi-touch / modelled attribution", score: 2 },
    { id: "obs", label: "Observational / correlational", score: 3 },
    { id: "test", label: "Dedicated incrementality test", score: 4 },
    { id: "rct", label: "Randomized holdout (strong)", score: 5 }
  ];

  /* ---------- Helpers ---------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n, cur) {
    const v = Number(n) || 0;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur || "JPY",
        maximumFractionDigits: 0
      }).format(v);
    } catch (e) {
      return String(Math.round(v));
    }
  }

  function familyOfChannel(name) {
    for (let i = 0; i < FAMILIES.length; i++) {
      if (FAMILIES[i].channels.indexOf(name) !== -1) return FAMILIES[i];
    }
    return null;
  }

  function mapInvestmentCategory(cat) {
    const m = {
      paid_digital: "paid",
      owned_digital: "owned",
      organic_earned: "earned",
      traditional: "offline",
      experiential: "offline",
      trade_retail: "commercial",
      customer_growth: "commercial",
      infrastructure: "infrastructure"
    };
    return m[cat] || "paid";
  }

  /* ---------- Build channel rows from investments + optional user metrics ---------- */
  /**
   * User-entered incremental metrics are stored in settings key channel_metrics
   * Shape: { "Google Ads": { attributedRevenue, incrementalRevenue, incrementalCustomers,
   *   incrementalProfit, evidence, coverageNotes } }
   */
  async function loadChannelMetrics() {
    const raw = await MII.Data.getSetting("channel_metrics", {});
    return raw && typeof raw === "object" ? raw : {};
  }

  async function saveChannelMetrics(obj) {
    return MII.Data.setSetting("channel_metrics", obj);
  }

  async function buildRows() {
    const investments = await MII.Data.getInvestments();
    const metrics = await loadChannelMetrics();
    const mode = await MII.Data.getSetting("dataMode", "demo");

    // Aggregate spend by channel name from tracker
    const spendByChannel = {};
    (investments || []).forEach(function (r) {
      const ch = (r.channel || "Unknown").trim();
      if (!spendByChannel[ch]) {
        spendByChannel[ch] = {
          channel: ch,
          spend: 0,
          currency: r.currency || "JPY",
          currencies: {},
          familyHint: mapInvestmentCategory(r.category)
        };
      }
      const direct =
        Math.max(
          0,
          (Number(r.grossSpend) || 0) -
            (Number(r.discountsRebates) || 0) +
            (Number(r.agencyFees) || 0) +
            (Number(r.productionCosts) || 0)
        );
      spendByChannel[ch].spend += direct;
      spendByChannel[ch].currencies[r.currency || "JPY"] = true;
    });

    // Seed taxonomy channels so empty ones still appear for structure
    const rows = [];
    FAMILIES.forEach(function (fam) {
      fam.channels.forEach(function (ch) {
        const fromInv = spendByChannel[ch];
        const m = metrics[ch] || {};
        rows.push({
          channel: ch,
          family: fam.id,
          familyLabel: fam.label,
          spend: fromInv ? fromInv.spend : 0,
          currency: fromInv ? fromInv.currency : "JPY",
          multiCurrency: fromInv ? Object.keys(fromInv.currencies).length > 1 : false,
          attributedRevenue: m.attributedRevenue != null ? Number(m.attributedRevenue) : null,
          incrementalRevenue: m.incrementalRevenue != null ? Number(m.incrementalRevenue) : null,
          incrementalCustomers: m.incrementalCustomers != null ? Number(m.incrementalCustomers) : null,
          incrementalProfit: m.incrementalProfit != null ? Number(m.incrementalProfit) : null,
          evidence: m.evidence || "none",
          coverageNotes: m.coverageNotes || "",
          hasTrackerSpend: !!fromInv
        });
        if (fromInv) delete spendByChannel[ch];
      });
    });

    // Any custom channel names from tracker not in taxonomy
    Object.keys(spendByChannel).forEach(function (ch) {
      const fromInv = spendByChannel[ch];
      const m = metrics[ch] || {};
      const fam = FAMILIES.find(function (f) {
        return f.id === fromInv.familyHint;
      });
      rows.push({
        channel: ch,
        family: fromInv.familyHint,
        familyLabel: fam ? fam.label : fromInv.familyHint,
        spend: fromInv.spend,
        currency: fromInv.currency,
        multiCurrency: Object.keys(fromInv.currencies).length > 1,
        attributedRevenue: m.attributedRevenue != null ? Number(m.attributedRevenue) : null,
        incrementalRevenue: m.incrementalRevenue != null ? Number(m.incrementalRevenue) : null,
        incrementalCustomers: m.incrementalCustomers != null ? Number(m.incrementalCustomers) : null,
        incrementalProfit: m.incrementalProfit != null ? Number(m.incrementalProfit) : null,
        evidence: m.evidence || "none",
        coverageNotes: m.coverageNotes || "",
        hasTrackerSpend: true
      });
    });

    return { rows: rows, mode: mode, metrics: metrics };
  }

  function evidenceLabel(id) {
    const e = EVIDENCE_LEVELS.find(function (x) {
      return x.id === id;
    });
    return e ? e.label : id;
  }

  function evidenceScore(id) {
    const e = EVIDENCE_LEVELS.find(function (x) {
      return x.id === id;
    });
    return e ? e.score : 0;
  }

  function costPerIncCustomer(row) {
    if (row.incrementalCustomers == null || row.incrementalCustomers <= 0) return null;
    if (!(row.spend > 0)) return null;
    return row.spend / row.incrementalCustomers;
  }

  /* ---------- State ---------- */
  let state = {
    familyFilter: "",
    sort: "spend",
    editingChannel: null
  };

  let chartRef = null;

  /* ---------- Render ---------- */
  function render(container) {
    buildRows()
      .then(function (data) {
        paint(container, data);
      })
      .catch(function (err) {
        container.innerHTML =
          '<div class="mii-card"><p style="color:#fca5a5;">' +
          escapeHtml(err.message || err) +
          "</p></div>";
      });
  }

  function paint(container, data) {
    let rows = data.rows.slice();
    if (state.familyFilter) {
      rows = rows.filter(function (r) {
        return r.family === state.familyFilter;
      });
    }

    rows.sort(function (a, b) {
      if (state.sort === "evidence") return evidenceScore(b.evidence) - evidenceScore(a.evidence);
      if (state.sort === "name") return a.channel.localeCompare(b.channel);
      return (b.spend || 0) - (a.spend || 0);
    });

    const withInc = rows.filter(function (r) {
      return r.incrementalRevenue != null && r.incrementalRevenue !== 0;
    });

    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">▦</span><div>' +
      "<strong>Channel Effectiveness.</strong> Spend comes from the Investment Tracker when available. " +
      "Attributed and incremental metrics are <em>user-entered evidence</em> — this module does not invent lift. " +
      "Never sum channel-level incremental estimates across overlapping tests." +
      "</div></div>";

    // Filters
    html +=
      '<div class="mii-card" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      '<select id="mii-ch-family" style="padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="">All families</option>' +
      FAMILIES.map(function (f) {
        return (
          '<option value="' +
          f.id +
          '"' +
          (state.familyFilter === f.id ? " selected" : "") +
          ">" +
          escapeHtml(f.label) +
          "</option>"
        );
      }).join("") +
      "</select>" +
      '<select id="mii-ch-sort" style="padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="spend"' +
      (state.sort === "spend" ? " selected" : "") +
      ">Sort by spend</option>" +
      '<option value="evidence"' +
      (state.sort === "evidence" ? " selected" : "") +
      ">Sort by evidence</option>" +
      '<option value="name"' +
      (state.sort === "name" ? " selected" : "") +
      ">Sort by name</option>" +
      "</select></div>" +
      '<div style="display:flex;gap:8px;">' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="mii-ch-report">Download report</button>' +
      "</div></div>";

    // Summary KPIs — spend only aggregated; incremental NOT summed across channels
    const totalSpend = rows.reduce(function (s, r) {
      return s + (r.spend || 0);
    }, 0);
    const measured = rows.filter(function (r) {
      return evidenceScore(r.evidence) >= 4;
    }).length;

    html +=
      '<div class="mii-grid mii-grid-4" style="margin-bottom:16px;">' +
      kpi("Tracked spend (view)", money(totalSpend), "Sum of direct spend in view") +
      kpi("Channels listed", String(rows.length), "Taxonomy + tracker") +
      kpi("Strong evidence", String(measured), "Test or RCT labelled") +
      kpi(
        "Inc. metrics entered",
        String(withInc.length),
        "User-supplied — not auto-summed"
      ) +
      "</div>";

    // Chart
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div class="mii-card-header"><div><h2 class="mii-card-title">Investment by channel</h2>' +
      '<p class="mii-card-subtitle">Direct spend from tracker (top channels in current filter)</p></div></div>' +
      '<div class="mii-chart-box"><canvas id="mii-ch-chart"></canvas></div></div>';

    // Table
    html +=
      '<div class="mii-card" style="padding:0;overflow:hidden;margin-bottom:16px;">' +
      '<div class="mii-table-wrap" style="border:none;"><table class="mii-table"><thead><tr>' +
      "<th>Channel</th><th>Family</th><th>Spend</th><th>Attributed rev.</th>" +
      "<th>Inc. revenue</th><th>Inc. customers</th><th>Inc. profit</th>" +
      "<th>Cost / inc. customer</th><th>Evidence</th><th></th>" +
      "</tr></thead><tbody>";

    rows.forEach(function (r) {
      const cpic = costPerIncCustomer(r);
      html +=
        "<tr>" +
        "<td><strong>" +
        escapeHtml(r.channel) +
        "</strong></td>" +
        "<td>" +
        escapeHtml(r.familyLabel) +
        "</td>" +
        "<td>" +
        (r.spend ? money(r.spend, r.currency) : "—") +
        (r.multiCurrency ? " *" : "") +
        "</td>" +
        "<td>" +
        (r.attributedRevenue != null ? money(r.attributedRevenue) : "—") +
        "</td>" +
        "<td>" +
        (r.incrementalRevenue != null ? money(r.incrementalRevenue) : "—") +
        "</td>" +
        "<td>" +
        (r.incrementalCustomers != null ? Number(r.incrementalCustomers).toLocaleString() : "—") +
        "</td>" +
        "<td>" +
        (r.incrementalProfit != null ? money(r.incrementalProfit) : "—") +
        "</td>" +
        "<td>" +
        (cpic != null ? money(cpic) : "—") +
        "</td>" +
        "<td>" +
        escapeHtml(evidenceLabel(r.evidence)) +
        "</td>" +
        '<td><button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-ch-edit" data-ch="' +
        escapeHtml(r.channel) +
        '">Metrics</button></td></tr>';
    });
    html += "</tbody></table></div></div>";

    html +=
      '<p class="mii-text-soft" style="font-size:0.8rem;margin:-8px 0 16px;">* Multiple currencies on this channel — spend sum is unconverted. Use FX rates in Investment Tracker before comparing.</p>';

    // Edit panel
    html +=
      '<div class="mii-card" id="mii-ch-edit-panel" hidden style="margin-bottom:16px;"></div>';

    // Limitations
    html +=
      '<div class="mii-card">' +
      '<h2 class="mii-card-title">Limitations &amp; measurement coverage</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.65;">' +
      "<li><strong>Attributed ≠ incremental.</strong> Platform or MTA numbers are not causal lift.</li>" +
      "<li><strong>Do not sum</strong> channel-level incremental estimates when tests overlap in time, audience or geography, or when methods differ.</li>" +
      "<li><strong>Infrastructure</strong> spend enables other channels; treating it as a stand-alone ROI channel usually misleads.</li>" +
      "<li><strong>Evidence quality</strong> is a label you set — the app does not validate external experiments.</li>" +
      "<li>Empty incremental fields mean <em>unknown</em>, not zero.</li>" +
      "</ul></div>";

    container.innerHTML = html;

    // Chart
    requestAnimationFrame(function () {
      drawChart(rows);
    });

    // Events
    const fam = document.getElementById("mii-ch-family");
    const srt = document.getElementById("mii-ch-sort");
    if (fam)
      fam.addEventListener("change", function () {
        state.familyFilter = fam.value;
        render(container);
      });
    if (srt)
      srt.addEventListener("change", function () {
        state.sort = srt.value;
        render(container);
      });

    document.querySelectorAll(".mii-ch-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openEditor(container, data, btn.getAttribute("data-ch"));
      });
    });

    const rep = document.getElementById("mii-ch-report");
    if (rep)
      rep.addEventListener("click", function () {
        downloadReport(rows);
      });
  }

  function kpi(label, value, sub) {
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

  function drawChart(rows) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("mii-ch-chart");
    if (!canvas) return;
    if (chartRef) {
      chartRef.destroy();
      chartRef = null;
    }
    const top = rows
      .filter(function (r) {
        return r.spend > 0;
      })
      .slice(0, 12);
    if (!top.length) return;
    chartRef = new Chart(canvas, {
      type: "bar",
      data: {
        labels: top.map(function (r) {
          return r.channel;
        }),
        datasets: [
          {
            label: "Direct spend",
            data: top.map(function (r) {
              return r.spend;
            }),
            backgroundColor: "rgba(59,130,246,0.7)",
            borderRadius: 6,
            maxBarThickness: 26
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "#94a3b8" },
            grid: { color: "rgba(148,163,184,0.1)" }
          },
          y: {
            ticks: { color: "#94a3b8", font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  function openEditor(container, data, channelName) {
    const row = data.rows.find(function (r) {
      return r.channel === channelName;
    });
    const panel = document.getElementById("mii-ch-edit-panel");
    if (!panel || !row) return;
    panel.hidden = false;
    panel.innerHTML =
      '<h2 class="mii-card-title">Metrics for ' +
      escapeHtml(channelName) +
      "</h2>" +
      '<p class="mii-card-subtitle">Enter only values you have evidence for. Leave blank if unknown.</p>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px;">' +
      field("Attributed revenue", "cm-attr", row.attributedRevenue) +
      field("Incremental revenue", "cm-inc-rev", row.incrementalRevenue) +
      field("Incremental customers", "cm-inc-cust", row.incrementalCustomers) +
      field("Incremental profit", "cm-inc-profit", row.incrementalProfit) +
      '<div><label class="mii-kpi-label">Evidence quality</label>' +
      '<select id="cm-evidence" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      EVIDENCE_LEVELS.map(function (e) {
        return (
          '<option value="' +
          e.id +
          '"' +
          (row.evidence === e.id ? " selected" : "") +
          ">" +
          escapeHtml(e.label) +
          "</option>"
        );
      }).join("") +
      "</select></div></div>" +
      '<div style="margin-top:12px;"><label class="mii-kpi-label">Coverage / method notes</label>' +
      '<textarea id="cm-notes" rows="2" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      escapeHtml(row.coverageNotes) +
      "</textarea></div>" +
      '<div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button type="button" class="mii-btn mii-btn--primary mii-btn--sm" id="cm-save">Save metrics</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="cm-cancel">Cancel</button></div>';

    document.getElementById("cm-cancel").addEventListener("click", function () {
      panel.hidden = true;
    });
    document.getElementById("cm-save").addEventListener("click", function () {
      function numOrNull(id) {
        const el = document.getElementById(id);
        if (!el || el.value === "") return null;
        const v = parseFloat(el.value);
        return isFinite(v) ? v : null;
      }
      const next = Object.assign({}, data.metrics);
      next[channelName] = {
        attributedRevenue: numOrNull("cm-attr"),
        incrementalRevenue: numOrNull("cm-inc-rev"),
        incrementalCustomers: numOrNull("cm-inc-cust"),
        incrementalProfit: numOrNull("cm-inc-profit"),
        evidence: document.getElementById("cm-evidence").value,
        coverageNotes: document.getElementById("cm-notes").value
      };
      saveChannelMetrics(next).then(function () {
        render(container);
      });
    });
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function field(label, id, val) {
    return (
      "<div><label class=\"mii-kpi-label\">" +
      escapeHtml(label) +
      '</label><input id="' +
      id +
      '" type="number" step="any" value="' +
      (val != null ? escapeHtml(val) : "") +
      '" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function downloadReport(rows) {
    const lines = [
      "Channel Effectiveness Report — Marketing Incrementality Intelligence",
      "Generated: " + new Date().toISOString(),
      "",
      "NOTE: Incremental columns are user-supplied. Do not sum them across overlapping experiments.",
      ""
    ];
    lines.push(
      [
        "Channel",
        "Family",
        "Spend",
        "AttributedRevenue",
        "IncrementalRevenue",
        "IncrementalCustomers",
        "IncrementalProfit",
        "CostPerIncCustomer",
        "Evidence",
        "Notes"
      ].join(",")
    );
    rows.forEach(function (r) {
      const cpic = costPerIncCustomer(r);
      lines.push(
        [
          csv(r.channel),
          csv(r.familyLabel),
          r.spend,
          r.attributedRevenue,
          r.incrementalRevenue,
          r.incrementalCustomers,
          r.incrementalProfit,
          cpic,
          csv(evidenceLabel(r.evidence)),
          csv(r.coverageNotes)
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "channel-effectiveness-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function csv(v) {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? '"' + s + '"' : s;
  }

  /* ---------- Tests ---------- */
  function runSelfTests() {
    const tests = [];
    tests.push({
      name: "Taxonomy has 6 families",
      pass: FAMILIES.length === 6
    });
    tests.push({
      name: "Paid includes Google Ads",
      pass: FAMILIES[0].channels.indexOf("Google Ads") !== -1
    });
    tests.push({
      name: "Cost per inc customer null when no customers",
      pass: costPerIncCustomer({ spend: 1000, incrementalCustomers: 0 }) === null
    });
    tests.push({
      name: "Cost per inc customer computes",
      pass: Math.abs(costPerIncCustomer({ spend: 1000, incrementalCustomers: 10 }) - 100) < 1e-9
    });
    tests.push({
      name: "Evidence RCT scores highest",
      pass: evidenceScore("rct") > evidenceScore("platform")
    });
    return tests;
  }

  MII.Channels.render = render;
  MII.Channels.FAMILIES = FAMILIES;
  MII.Channels.runSelfTests = runSelfTests;
  MII.Channels.costPerIncCustomer = costPerIncCustomer;
})();
