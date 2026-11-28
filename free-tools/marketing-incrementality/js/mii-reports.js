/**
 * Marketing Incrementality Intelligence — Reports & Insights
 * Namespace: window.MII.Reports
 *
 * Aggregates data already stored by other modules. Never invents KPIs.
 * Labels each figure as measured / user-entered / modelled / illustrative / unavailable.
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Reports = MII.Reports || {};

  const REPORT_TYPES = [
    { id: "executive", label: "Executive marketing effectiveness" },
    { id: "investments", label: "Total marketing investments" },
    { id: "channels", label: "Channel effectiveness" },
    { id: "experiments", label: "Incrementality experiments" },
    { id: "incrementality", label: "Incremental revenue and profit" },
    { id: "crosschannel", label: "Cross-channel effects" },
    { id: "mmm", label: "Marketing Mix Modelling" },
    { id: "budget", label: "Budget allocation scenarios" }
  ];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n, currency) {
    const v = Number(n);
    if (!isFinite(v)) return "—";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "JPY",
        maximumFractionDigits: 0
      }).format(v);
    } catch (e) {
      return String(Math.round(v));
    }
  }

  function evidenceLabel(id) {
    const map = {
      none: "No incrementality evidence",
      platform: "Platform-reported only",
      mto: "Multi-touch / modelled attribution",
      obs: "Observational / correlational",
      test: "Dedicated incrementality test",
      rct: "Randomized holdout (strong)"
    };
    return map[id] || id || "—";
  }

  function classify(source) {
    return source || "unavailable";
  }

  /* ---------- Gather snapshots from modules / storage ---------- */
  async function gatherContext(meta) {
    const investments = (await MII.Data.getInvestments()) || [];
    const experiments = (await MII.Data.getExperiments()) || [];
    const channelMetrics = (await MII.Data.getSetting("channel_metrics", {})) || {};
    const crossLinks = (await MII.Data.getSetting("cross_channel_links", null)) || { custom: [] };
    const dataMode = (await MII.Data.getSetting("dataMode", "demo")) || "demo";

    let lastInc = null;
    try {
      const raw = sessionStorage.getItem("mii_last_incrementality");
      if (raw) lastInc = JSON.parse(raw);
    } catch (e) {}

    // Direct spend aggregate (may mix currencies — flag it)
    const currencies = {};
    let totalDirect = 0;
    investments.forEach(function (r) {
      const cur = r.currency || "JPY";
      currencies[cur] = true;
      const direct = Math.max(
        0,
        (Number(r.grossSpend) || 0) -
          (Number(r.discountsRebates) || 0) +
          (Number(r.agencyFees) || 0) +
          (Number(r.productionCosts) || 0)
      );
      totalDirect += direct;
    });
    const multiCurrency = Object.keys(currencies).length > 1;

    return {
      meta: meta,
      investments: investments,
      experiments: experiments,
      channelMetrics: channelMetrics,
      crossLinks: crossLinks.custom || [],
      dataMode: dataMode,
      lastInc: lastInc,
      totalDirect: totalDirect,
      currencies: Object.keys(currencies),
      multiCurrency: multiCurrency,
      generatedAt: new Date().toISOString()
    };
  }

  function periodLabel(meta) {
    if (meta.periodStart && meta.periodEnd) return meta.periodStart + " → " + meta.periodEnd;
    if (meta.periodStart) return "From " + meta.periodStart;
    return "Not specified";
  }

  /* ---------- Report builders (structured objects) ---------- */
  function buildReport(type, ctx) {
    const base = {
      reportType: type,
      reportLabel: (REPORT_TYPES.find(function (t) {
        return t.id === type;
      }) || {}).label || type,
      businessName: ctx.meta.businessName || "—",
      currency: ctx.meta.currency || "JPY",
      period: periodLabel(ctx.meta),
      generatedAt: ctx.generatedAt,
      dataMode: ctx.dataMode,
      sections: [],
      findings: [],
      recommendations: [],
      assumptions: [],
      limitations: [],
      warnings: [],
      methodology: [],
      evidenceNotes: []
    };

    base.assumptions.push(
      "Figures are taken only from data entered or calculated in this browser application."
    );
    base.limitations.push(
      "This report does not invent campaign performance. Missing modules or empty stores appear as unavailable."
    );
    base.limitations.push(
      "Modelled estimates (MMM, response curves) are not experimentally verified incrementality."
    );

    if (ctx.dataMode === "demo") {
      base.warnings.push(
        "Investment data mode is still 'demo' or mixed with illustrative seed data. Treat financial totals as non-audited."
      );
    }
    if (ctx.multiCurrency) {
      base.warnings.push(
        "Multiple currencies present in investment records (" +
          ctx.currencies.join(", ") +
          "). Sums may be unconverted unless FX rates were applied in the Investment Tracker."
      );
    }

    switch (type) {
      case "executive":
        return buildExecutive(base, ctx);
      case "investments":
        return buildInvestments(base, ctx);
      case "channels":
        return buildChannels(base, ctx);
      case "experiments":
        return buildExperiments(base, ctx);
      case "incrementality":
        return buildIncrementality(base, ctx);
      case "crosschannel":
        return buildCrossChannel(base, ctx);
      case "mmm":
        return buildMmm(base, ctx);
      case "budget":
        return buildBudget(base, ctx);
      default:
        base.sections.push({
          title: "Unknown report type",
          kind: "text",
          body: "Select a valid report type."
        });
        return base;
    }
  }

  function buildExecutive(base, ctx) {
    base.methodology.push(
      "Executive view aggregates Investment Tracker spend, experiment registry counts, optional channel evidence labels, and the latest session incrementality calculator run if present."
    );

    base.sections.push({
      title: "Snapshot",
      kind: "kpis",
      items: [
        {
          label: "Investment records",
          value: String(ctx.investments.length),
          source: "measured_local"
        },
        {
          label: "Tracked direct spend (raw sum)",
          value: ctx.multiCurrency
            ? ctx.investments.length + " rows · mixed currency"
            : money(ctx.totalDirect, base.currency),
          source: ctx.investments.length ? "user_entered" : "unavailable"
        },
        {
          label: "Experiments documented",
          value: String(ctx.experiments.length),
          source: "user_entered"
        },
        {
          label: "Cross-channel links documented",
          value: String(ctx.crossLinks.length),
          source: "user_entered"
        }
      ]
    });

    if (ctx.lastInc) {
      base.sections.push({
        title: "Latest incrementality calculator run (this browser session)",
        kind: "kpis",
        items: [
          {
            label: "Absolute conversion lift",
            value:
              ctx.lastInc.absLift != null
                ? (ctx.lastInc.absLift * 100).toFixed(2) + "%"
                : "—",
            source: "calculated_session"
          },
          {
            label: "Incremental conversions (est.)",
            value:
              ctx.lastInc.incConv != null
                ? Number(ctx.lastInc.incConv).toLocaleString(undefined, {
                    maximumFractionDigits: 0
                  })
                : "—",
            source: "calculated_session"
          },
          {
            label: "Incremental revenue (est.)",
            value:
              ctx.lastInc.incRev != null
                ? money(ctx.lastInc.incRev, base.currency)
                : "—",
            source: "calculated_session"
          },
          {
            label: "iROAS",
            value: ctx.lastInc.iROAS != null ? Number(ctx.lastInc.iROAS).toFixed(2) + "×" : "—",
            source: "calculated_session"
          }
        ]
      });
      base.evidenceNotes.push(
        "Session calculator design type: " +
          (ctx.lastInc.designType || "—") +
          "; significant=" +
          String(ctx.lastInc.significant)
      );
    } else {
      base.sections.push({
        title: "Latest incrementality calculator run",
        kind: "text",
        body: "No session result found. Run the Basic Incrementality Calculator in Experiment Lab to populate this block."
      });
    }

    // Findings (only from available data)
    if (ctx.investments.length === 0) {
      base.findings.push("No investment records available in the local tracker.");
      base.recommendations.push(
        "Load or enter marketing investments in the Investment Tracker before executive review."
      );
    } else {
      base.findings.push(
        ctx.investments.length +
          " investment line(s) are stored locally for this project."
      );
    }
    if (ctx.experiments.length === 0) {
      base.findings.push("No experiments documented in the Experiment Lab registry.");
      base.recommendations.push(
        "Document planned or completed incrementality tests so leadership can see evidence quality, not only spend."
      );
    } else {
      const running = ctx.experiments.filter(function (e) {
        return e.status === "running";
      }).length;
      base.findings.push(
        ctx.experiments.length +
          " experiment record(s); " +
          running +
          " marked running."
      );
    }

    base.recommendations.push(
      "Prefer decisions backed by experiment-level evidence over platform ROAS alone."
    );
    base.recommendations.push(
      "Do not sum channel-level incremental estimates when tests overlap or methods differ."
    );

    return base;
  }

  function buildInvestments(base, ctx) {
    base.methodology.push(
      "Direct spend = gross − discounts/rebates + agency fees + production costs. Allocated overhead is stored separately in the tracker and is not added into direct totals."
    );

    base.sections.push({
      title: "Totals",
      kind: "kpis",
      items: [
        {
          label: "Records",
          value: String(ctx.investments.length),
          source: "measured_local"
        },
        {
          label: "Direct spend sum",
          value: ctx.multiCurrency
            ? "Mixed currencies — see table"
            : money(ctx.totalDirect, base.currency),
          source: ctx.investments.length ? "user_entered" : "unavailable"
        }
      ]
    });

    const rows = ctx.investments.map(function (r) {
      const direct = Math.max(
        0,
        (Number(r.grossSpend) || 0) -
          (Number(r.discountsRebates) || 0) +
          (Number(r.agencyFees) || 0) +
          (Number(r.productionCosts) || 0)
      );
      return {
        channel: r.channel || "",
        campaign: r.campaignName || "",
        category: r.category || "",
        startDate: r.startDate || r.date || "",
        currency: r.currency || "",
        direct: direct,
        planned: Number(r.plannedSpend) || 0,
        overhead: Number(r.allocatedOverhead) || 0
      };
    });

    base.sections.push({
      title: "Investment lines",
      kind: "table",
      source: "user_entered",
      columns: ["Channel", "Campaign", "Category", "Start", "Currency", "Direct", "Planned", "Overhead"],
      rows: rows.map(function (r) {
        return [
          r.channel,
          r.campaign,
          r.category,
          r.startDate,
          r.currency,
          r.direct,
          r.planned,
          r.overhead
        ];
      })
    });

    if (!rows.length) {
      base.findings.push("Investment table is empty.");
      base.recommendations.push("Import CSV or add records in Investment Tracker.");
    } else {
      base.findings.push(rows.length + " investment line(s) included.");
    }
    return base;
  }

  function buildChannels(base, ctx) {
    base.methodology.push(
      "Channel metrics (attributed / incremental) are user-entered evidence labels, not auto-generated lift."
    );
    const names = Object.keys(ctx.channelMetrics || {});
    const tableRows = names.map(function (ch) {
      const m = ctx.channelMetrics[ch] || {};
      return [
        ch,
        m.attributedRevenue != null ? m.attributedRevenue : "",
        m.incrementalRevenue != null ? m.incrementalRevenue : "",
        m.incrementalCustomers != null ? m.incrementalCustomers : "",
        m.incrementalProfit != null ? m.incrementalProfit : "",
        evidenceLabel(m.evidence),
        m.coverageNotes || ""
      ];
    });

    // Also list spend by channel from investments
    const spendMap = {};
    ctx.investments.forEach(function (r) {
      const ch = r.channel || "Unknown";
      const direct = Math.max(
        0,
        (Number(r.grossSpend) || 0) -
          (Number(r.discountsRebates) || 0) +
          (Number(r.agencyFees) || 0) +
          (Number(r.productionCosts) || 0)
      );
      spendMap[ch] = (spendMap[ch] || 0) + direct;
    });

    base.sections.push({
      title: "Spend by channel (tracker)",
      kind: "table",
      source: "user_entered",
      columns: ["Channel", "Direct spend (raw sum)"],
      rows: Object.keys(spendMap).map(function (ch) {
        return [ch, spendMap[ch]];
      })
    });

    base.sections.push({
      title: "User-entered effectiveness metrics",
      kind: "table",
      source: "user_entered",
      columns: [
        "Channel",
        "Attributed rev",
        "Inc. revenue",
        "Inc. customers",
        "Inc. profit",
        "Evidence",
        "Notes"
      ],
      rows: tableRows
    });

    if (!names.length) {
      base.findings.push("No channel incremental metrics have been entered yet.");
      base.recommendations.push(
        "In Channel Effectiveness, open Metrics on priority channels and record only evidenced values."
      );
    } else {
      base.findings.push(names.length + " channel(s) have saved metric notes.");
    }
    base.limitations.push(
      "Do not sum incremental revenue across channels when evidence comes from overlapping tests."
    );
    return base;
  }

  function buildExperiments(base, ctx) {
    base.methodology.push(
      "Experiment Lab stores design and planning metadata. Sample-size figures are planning calculations from user inputs, not measured outcomes."
    );
    base.sections.push({
      title: "Experiment registry",
      kind: "table",
      source: "user_entered",
      columns: ["Name", "Method", "Status", "Primary KPI", "Start", "End", "Investment"],
      rows: ctx.experiments.map(function (e) {
        return [
          e.name || "",
          e.method || e.type || "",
          e.status || "",
          e.primaryKpi || "",
          e.startDate || "",
          e.endDate || "",
          e.investment != null ? e.investment : ""
        ];
      })
    });
    if (!ctx.experiments.length) {
      base.findings.push("Registry is empty.");
    } else {
      base.findings.push(ctx.experiments.length + " experiment(s) listed.");
      const weak = ctx.experiments.filter(function (e) {
        return e.method === "pre_post" || e.type === "pre_post";
      }).length;
      if (weak) {
        base.warnings.push(
          weak +
            " record(s) use pre/post observational design — not causal proof of incrementality."
        );
      }
    }
    base.recommendations.push(
      "Attach measured results only after analysis; keep planning parameters distinct from outcomes."
    );
    return base;
  }

  function buildIncrementality(base, ctx) {
    base.methodology.push(
      "Basic Incrementality Calculator uses treatment vs control inputs supplied by the user; counterfactual revenue uses control ARPU × treatment population."
    );
    if (!ctx.lastInc) {
      base.sections.push({
        title: "Results",
        kind: "text",
        body: "No calculator result in this browser session. Run Experiment Lab → Basic incrementality calculator, then return here."
      });
      base.findings.push("Incremental revenue/profit not available for this report run.");
      return base;
    }
    base.sections.push({
      title: "Session calculator outputs",
      kind: "kpis",
      items: [
        {
          label: "Design",
          value: ctx.lastInc.designType || "—",
          source: "user_entered"
        },
        {
          label: "Abs. conversion lift",
          value:
            ctx.lastInc.absLift != null
              ? (ctx.lastInc.absLift * 100).toFixed(2) + "%"
              : "—",
          source: "calculated_session"
        },
        {
          label: "Inc. conversions",
          value:
            ctx.lastInc.incConv != null ? String(Math.round(ctx.lastInc.incConv)) : "—",
          source: "calculated_session"
        },
        {
          label: "Inc. revenue",
          value:
            ctx.lastInc.incRev != null
              ? money(ctx.lastInc.incRev, base.currency)
              : "—",
          source: "calculated_session"
        },
        {
          label: "iROAS",
          value: ctx.lastInc.iROAS != null ? Number(ctx.lastInc.iROAS).toFixed(2) + "×" : "—",
          source: "calculated_session"
        },
        {
          label: "Statistically significant (conversion)",
          value: String(!!ctx.lastInc.significant),
          source: "calculated_session"
        }
      ]
    });
    base.evidenceNotes.push(
      "Significance and lifts refer to the user-supplied calculator inputs at " +
        (ctx.lastInc.at || "session time") +
        "."
    );
    base.limitations.push(
      "A single calculator run is not a full experimental programme. Export Experiment Lab documentation for governance."
    );
    return base;
  }

  function buildCrossChannel(base, ctx) {
    base.methodology.push(
      "Cross-channel records document hypothesized overlaps and evidence type. Causal claims are user-asserted only."
    );
    base.sections.push({
      title: "Documented relationships",
      kind: "table",
      source: "user_entered",
      columns: [
        "Label",
        "Channel A",
        "Channel B",
        "Evidence",
        "Causal claim",
        "Do not sum",
        "Overlap risk"
      ],
      rows: ctx.crossLinks.map(function (l) {
        return [
          l.label || "",
          l.channelA || "",
          l.channelB || "",
          l.evidenceType || "",
          l.causalClaim ? "yes" : "no",
          l.doNotSum !== false ? "yes" : "no",
          l.overlapRisk || ""
        ];
      })
    });
    if (!ctx.crossLinks.length) {
      base.findings.push("No cross-channel relationships documented.");
    } else {
      const causal = ctx.crossLinks.filter(function (l) {
        return l.causalClaim;
      }).length;
      base.findings.push(
        ctx.crossLinks.length +
          " relationship(s); " +
          causal +
          " with causal claim asserted by user."
      );
      if (causal) {
        base.warnings.push(
          "Causal interaction claims require designed tests; the application does not validate them."
        );
      }
    }
    return base;
  }

  function buildMmm(base, ctx) {
    base.methodology.push(
      "MMM workbench fits exploratory OLS with user-set adstock/Hill transforms. It is not a production Bayesian MMM."
    );
    base.sections.push({
      title: "Status",
      kind: "text",
      body:
        "MMM coefficient tables are produced in the Marketing Mix Modelling module and exported there as JSON/text. " +
        "This report does not re-estimate a model. Open #mmm, fit a model, and attach the exported fit JSON to your board pack."
    });
    base.findings.push(
      "No silent MMM results are stored centrally — by design, to avoid implying a persistent validated model."
    );
    base.recommendations.push(
      "For decision-grade MMM, export prepared series and use Robyn, Meridian, or PyMC-Marketing locally."
    );
    base.limitations.push(
      "Browser OLS contributions are modelled decompositions, not experimental incrementality."
    );
    return base;
  }

  function buildBudget(base, ctx) {
    base.methodology.push(
      "Budget Optimizer scenarios are conditional on user constraints and optional response curves. Historical ROAS ranking is not used."
    );
    base.sections.push({
      title: "Status",
      kind: "text",
      body:
        "Scenario JSON is exported from the Budget Optimizer module. This report does not invent an optimal mix. " +
        "Run #optimizer, export scenarios, and archive them with this management report."
    });
    base.findings.push(
      "No automatic budget recommendation is generated in Reports without an exported scenario file."
    );
    base.recommendations.push(
      "Only treat optimised allocations as decision inputs when response curves come from experiments or a validated MMM."
    );
    return base;
  }

  /* ---------- Render UI ---------- */
  let lastReport = null;
  let chartRefs = [];

  function render(container) {
    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">☰</span><div>' +
      "<strong>Reports &amp; Insights.</strong> Builds management-ready summaries from data already in this application. " +
      "<em>Never fabricates performance.</em> Each figure is tagged by origin: user-entered, calculated in-session, modelled, or unavailable." +
      "</div></div>";

    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Report setup</h2>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px;">' +
      field("Business name", "rp-name", "") +
      field("Currency", "rp-cur", "JPY") +
      field("Period start", "rp-start", "", "date") +
      field("Period end", "rp-end", "", "date") +
      '<div style="grid-column:1/-1;"><label class="mii-kpi-label">Report type</label>' +
      '<select id="rp-type" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      REPORT_TYPES.map(function (t) {
        return (
          '<option value="' + t.id + '">' + escapeHtml(t.label) + "</option>"
        );
      }).join("") +
      "</select></div></div>" +
      '<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="rp-build">Generate report</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="rp-csv">Export CSV</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="rp-json">Export JSON</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="rp-print">Print / PDF</button>' +
      "</div></div>";

    html += '<div id="rp-out" class="rp-print-root"></div>';

    container.innerHTML = html;

    document.getElementById("rp-build").addEventListener("click", function () {
      const meta = {
        businessName: document.getElementById("rp-name").value.trim(),
        currency: document.getElementById("rp-cur").value.trim() || "JPY",
        periodStart: document.getElementById("rp-start").value,
        periodEnd: document.getElementById("rp-end").value
      };
      const type = document.getElementById("rp-type").value;
      gatherContext(meta).then(function (ctx) {
        lastReport = buildReport(type, ctx);
        paintReport(document.getElementById("rp-out"), lastReport);
      });
    });

    document.getElementById("rp-csv").addEventListener("click", function () {
      if (!lastReport) {
        alert("Generate a report first.");
        return;
      }
      exportCsv(lastReport);
    });
    document.getElementById("rp-json").addEventListener("click", function () {
      if (!lastReport) {
        alert("Generate a report first.");
        return;
      }
      exportJson(lastReport);
    });
    document.getElementById("rp-print").addEventListener("click", function () {
      if (!lastReport) {
        alert("Generate a report first.");
        return;
      }
      window.print();
    });
  }

  function field(label, id, val, type) {
    return (
      "<div><label class=\"mii-kpi-label\">" +
      escapeHtml(label) +
      '</label><input id="' +
      id +
      '" type="' +
      (type || "text") +
      '" value="' +
      escapeHtml(val) +
      '" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function paintReport(el, rep) {
    chartRefs.forEach(function (c) {
      try {
        c.destroy();
      } catch (e) {}
    });
    chartRefs = [];

    let html = "";
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      "<h1 style=\"margin:0 0 6px;font-size:1.35rem;font-weight:800;color:var(--mii-text);\">" +
      escapeHtml(rep.reportLabel) +
      "</h1>" +
      '<p class="mii-text-muted" style="margin:0;font-size:0.9rem;">' +
      escapeHtml(rep.businessName) +
      " · Period: " +
      escapeHtml(rep.period) +
      " · Currency: " +
      escapeHtml(rep.currency) +
      " · Generated: " +
      escapeHtml(rep.generatedAt) +
      "</p>" +
      '<p style="margin:8px 0 0;font-size:0.8rem;color:#fde68a;">Data mode: ' +
      escapeHtml(rep.dataMode) +
      " · Source tags: measured_local / user_entered / calculated_session / modelled / unavailable</p></div>";

    // Executive summary block
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Executive summary</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.95rem;color:var(--mii-text-muted);line-height:1.6;">';
    if (rep.findings.length) {
      rep.findings.forEach(function (f) {
        html += "<li>" + escapeHtml(f) + "</li>";
      });
    } else {
      html += "<li>No automated findings — underlying data stores were empty for this report type.</li>";
    }
    html += "</ul></div>";

    if (rep.warnings.length) {
      html +=
        '<div class="mii-card" style="margin-bottom:16px;border-color:rgba(245,158,11,0.4);">' +
        '<h2 class="mii-card-title">Data quality warnings</h2><ul style="margin:8px 0 0;padding-left:18px;color:#fde68a;font-size:0.9rem;">';
      rep.warnings.forEach(function (w) {
        html += "<li>" + escapeHtml(w) + "</li>";
      });
      html += "</ul></div>";
    }

    rep.sections.forEach(function (sec, si) {
      html += '<div class="mii-card" style="margin-bottom:16px;">';
      html += '<h2 class="mii-card-title">' + escapeHtml(sec.title) + "</h2>";
      if (sec.source) {
        html +=
          '<p class="mii-card-subtitle">Source class: ' +
          escapeHtml(sec.source) +
          "</p>";
      }
      if (sec.kind === "text") {
        html +=
          '<p class="mii-text-muted" style="margin:8px 0 0;font-size:0.95rem;">' +
          escapeHtml(sec.body) +
          "</p>";
      } else if (sec.kind === "kpis") {
        html += '<div class="mii-grid mii-grid-4" style="margin-top:12px;">';
        (sec.items || []).forEach(function (it) {
          html +=
            '<div style="background:var(--mii-bg);border-radius:10px;padding:12px;">' +
            '<div style="font-size:1.15rem;font-weight:800;">' +
            escapeHtml(String(it.value)) +
            '</div><div class="mii-kpi-label">' +
            escapeHtml(it.label) +
            '</div><div class="mii-text-soft" style="font-size:0.7rem;margin-top:4px;">' +
            escapeHtml(it.source || "") +
            "</div></div>";
        });
        html += "</div>";
      } else if (sec.kind === "table") {
        html +=
          '<div class="mii-table-wrap" style="margin-top:12px;"><table class="mii-table"><thead><tr>';
        (sec.columns || []).forEach(function (c) {
          html += "<th>" + escapeHtml(c) + "</th>";
        });
        html += "</tr></thead><tbody>";
        if (!(sec.rows || []).length) {
          html +=
            '<tr><td colspan="' +
            (sec.columns || []).length +
            '" style="color:#94a3b8;">No rows</td></tr>';
        } else {
          sec.rows.forEach(function (row) {
            html += "<tr>";
            row.forEach(function (cell) {
              html += "<td>" + escapeHtml(String(cell == null ? "" : cell)) + "</td>";
            });
            html += "</tr>";
          });
        }
        html += "</tbody></table></div>";

        // Optional small chart for 2-column numeric tables
        if (
          sec.columns &&
          sec.columns.length === 2 &&
          sec.rows &&
          sec.rows.length &&
          sec.rows.every(function (r) {
            return isFinite(Number(r[1]));
          })
        ) {
          html +=
            '<div class="mii-chart-box" style="margin-top:14px;"><canvas id="rp-chart-' +
            si +
            '"></canvas></div>';
        }
      }
      html += "</div>";
    });

    html += listCard("Key findings", rep.findings);
    html += listCard("Investment recommendations", rep.recommendations);
    html += listCard("Measurement methodology", rep.methodology);
    html += listCard("Evidence notes", rep.evidenceNotes);
    html += listCard("Assumptions", rep.assumptions);
    html += listCard("Limitations", rep.limitations);

    el.innerHTML = html;

    // Charts
    requestAnimationFrame(function () {
      rep.sections.forEach(function (sec, si) {
        if (
          sec.kind === "table" &&
          sec.columns &&
          sec.columns.length === 2 &&
          sec.rows &&
          sec.rows.length &&
          typeof Chart !== "undefined"
        ) {
          const canvas = document.getElementById("rp-chart-" + si);
          if (!canvas) return;
          const chart = new Chart(canvas, {
            type: "bar",
            data: {
              labels: sec.rows.map(function (r) {
                return String(r[0]).slice(0, 24);
              }),
              datasets: [
                {
                  label: sec.columns[1],
                  data: sec.rows.map(function (r) {
                    return Number(r[1]) || 0;
                  }),
                  backgroundColor: "rgba(59,130,246,0.7)"
                }
              ]
            },
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
                y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { display: false } }
              }
            }
          });
          chartRefs.push(chart);
        }
      });
    });
  }

  function listCard(title, items) {
    if (!items || !items.length) return "";
    let html =
      '<div class="mii-card" style="margin-bottom:16px;"><h2 class="mii-card-title">' +
      escapeHtml(title) +
      '</h2><ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.6;">';
    items.forEach(function (it) {
      html += "<li>" + escapeHtml(it) + "</li>";
    });
    html += "</ul></div>";
    return html;
  }

  function exportJson(rep) {
    const blob = new Blob([JSON.stringify(rep, null, 2)], {
      type: "application/json"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "mii-report-" +
      rep.reportType +
      "-" +
      new Date().toISOString().slice(0, 10) +
      ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCsv(rep) {
    const lines = [];
    lines.push("Report," + csv(rep.reportLabel));
    lines.push("Business," + csv(rep.businessName));
    lines.push("Period," + csv(rep.period));
    lines.push("Currency," + csv(rep.currency));
    lines.push("Generated," + csv(rep.generatedAt));
    lines.push("");
    rep.sections.forEach(function (sec) {
      lines.push("Section," + csv(sec.title));
      if (sec.kind === "text") lines.push("Body," + csv(sec.body));
      if (sec.kind === "kpis") {
        lines.push("KPI,Value,Source");
        (sec.items || []).forEach(function (it) {
          lines.push([csv(it.label), csv(it.value), csv(it.source)].join(","));
        });
      }
      if (sec.kind === "table") {
        lines.push((sec.columns || []).map(csv).join(","));
        (sec.rows || []).forEach(function (row) {
          lines.push(row.map(csv).join(","));
        });
      }
      lines.push("");
    });
    lines.push("Findings");
    rep.findings.forEach(function (f) {
      lines.push(csv(f));
    });
    lines.push("Recommendations");
    rep.recommendations.forEach(function (f) {
      lines.push(csv(f));
    });
    lines.push("Warnings");
    rep.warnings.forEach(function (f) {
      lines.push(csv(f));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "mii-report-" +
      rep.reportType +
      "-" +
      new Date().toISOString().slice(0, 10) +
      ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function csv(v) {
    const s = String(v == null ? "" : v).replace(/"/g, '""');
    return '"' + s + '"';
  }

  /* ---------- Tests ---------- */
  function runSelfTests() {
    const tests = [];
    tests.push({
      name: "Eight report types",
      pass: REPORT_TYPES.length === 8
    });
    const emptyCtx = {
      meta: { businessName: "Test Co", currency: "USD", periodStart: "", periodEnd: "" },
      investments: [],
      experiments: [],
      channelMetrics: {},
      crossLinks: [],
      dataMode: "user",
      lastInc: null,
      totalDirect: 0,
      currencies: [],
      multiCurrency: false,
      generatedAt: new Date().toISOString()
    };
    const rep = buildReport("executive", emptyCtx);
    tests.push({
      name: "Empty executive does not invent spend",
      pass:
        rep.sections.some(function (s) {
          return s.kind === "kpis";
        }) &&
        !rep.findings.some(function (f) {
          return /ROI|lift of \d/i.test(f);
        })
    });
    const rep2 = buildReport("incrementality", emptyCtx);
    tests.push({
      name: "Missing session data stated clearly",
      pass: rep2.findings.some(function (f) {
        return /not available/i.test(f);
      })
    });
    const withInv = Object.assign({}, emptyCtx, {
      investments: [
        {
          channel: "Search",
          grossSpend: 100,
          discountsRebates: 0,
          agencyFees: 0,
          productionCosts: 0,
          currency: "USD"
        }
      ],
      totalDirect: 100,
      currencies: ["USD"]
    });
    const invRep = buildReport("investments", withInv);
    tests.push({
      name: "Investment report includes row",
      pass: invRep.sections.some(function (s) {
        return s.kind === "table" && s.rows && s.rows.length === 1;
      })
    });
    return tests;
  }

  // Print CSS helper class note — uses existing page print rules from other modules where present
  MII.Reports.render = render;
  MII.Reports.buildReport = buildReport;
  MII.Reports.gatherContext = gatherContext;
  MII.Reports.REPORT_TYPES = REPORT_TYPES;
  MII.Reports.runSelfTests = runSelfTests;
})();
