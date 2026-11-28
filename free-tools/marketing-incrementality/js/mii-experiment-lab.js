/**
 * Marketing Incrementality Intelligence — Advanced Experiment Lab
 * Design, document and plan incrementality experiments
 * Namespace: window.MII.ExperimentLab
 *
 * Does NOT invent lift/ROI results. Calculates planning stats and
 * documents methodology assumptions only.
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.ExperimentLab = MII.ExperimentLab || {};

  const METHODS = [
    {
      id: "randomized_holdout",
      label: "Randomized customer holdout",
      causalStrength: "strong",
      summary:
        "Randomly assign eligible customers to treatment or control. Strongest design for causal inference when randomization is clean and contamination is low."
    },
    {
      id: "geo_holdout",
      label: "Geographic holdout",
      causalStrength: "moderate_strong",
      summary:
        "Hold out entire markets/regions. Must account for market-level clustering (effective sample size is number of markets, not individuals)."
    },
    {
      id: "matched_market",
      label: "Matched-market testing",
      causalStrength: "moderate",
      summary:
        "Pair markets on baseline metrics, assign treatment within pairs. Quality depends on match quality and stable market structure."
    },
    {
      id: "diff_in_diff",
      label: "Difference-in-differences",
      causalStrength: "moderate_conditional",
      summary:
        "Compare change over time in treatment vs control. Relies on the parallel-trends assumption — not automatically true."
    },
    {
      id: "pre_post",
      label: "Pre/post observational analysis",
      causalStrength: "weak",
      summary:
        "Compare before vs after without a concurrent control. Cannot isolate the campaign from seasonality, competitors or other shocks. Not causal proof."
    }
  ];

  const KPI_OPTIONS = [
    "Conversion rate",
    "Revenue",
    "Orders",
    "New customers",
    "Retention rate",
    "Average order value",
    "Store visits",
    "Brand search volume",
    "Other"
  ];

  const STATUS_OPTIONS = ["draft", "planned", "running", "completed", "aborted"];

  /* ---------- Stats: sample size & power (two proportions) ---------- */
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [
      -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
      1.383577459334128e2, -3.066479806614716e1, 2.506628277459239
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
      6.680131188771972e1, -1.328068155288572e1
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
      -2.549732539343734, 4.374664141464968, 2.938163982698783
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
      3.754408661907416
    ];
    const plow = 0.02425,
      phigh = 1 - plow;
    let q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return (
        -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }
    q = p - 0.5;
    r = q * q;
    return (
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }

  function normCdf(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    const a1 = 0.254829592,
      a2 = -0.284496736,
      a3 = 1.421413741,
      a4 = -1.453152027,
      a5 = 1.061405429,
      p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + p * Math.abs(x));
    const y =
      1 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2);
    return 0.5 * (1 + sign * y);
  }

  /**
   * Sample size per arm for two-proportion test
   * baselineRate p, relative MDE (e.g. 0.1 = 10% relative), power, alpha (two-sided)
   */
  function sampleSizePerArm(baselineRate, mdeRelative, power, alpha) {
    const p1 = baselineRate;
    if (!(p1 > 0 && p1 < 1) || !(mdeRelative > 0) || !(power > 0 && power < 1)) {
      return null;
    }
    const p2 = Math.min(0.9999, Math.max(0.0001, p1 * (1 + mdeRelative)));
    if (Math.abs(p2 - p1) < 1e-12) return null;
    const pBar = (p1 + p2) / 2;
    const zAlpha = normInv(1 - alpha / 2);
    const zBeta = normInv(power);
    const num =
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    return Math.ceil(Math.pow(num / (p2 - p1), 2));
  }

  /**
   * Achieved power given n per arm, baseline, relative effect, alpha
   */
  function achievedPower(nPerArm, baselineRate, mdeRelative, alpha) {
    if (!(nPerArm > 0)) return null;
    const p1 = baselineRate;
    const p2 = Math.min(0.9999, p1 * (1 + mdeRelative));
    const pBar = (p1 + p2) / 2;
    const se0 = Math.sqrt(2 * pBar * (1 - pBar) / nPerArm);
    const se1 = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / nPerArm);
    if (!(se0 > 0) || !(se1 > 0)) return null;
    const zAlpha = normInv(1 - alpha / 2);
    const delta = Math.abs(p2 - p1);
    // Power ≈ 1 - Φ(zα - δ/se1) + Φ(-zα - δ/se1)  (two-sided)
    const power =
      1 - normCdf(zAlpha - delta / se1) + normCdf(-zAlpha - delta / se1);
    return Math.max(0, Math.min(1, power));
  }

  /**
   * Minimum detectable relative effect given n, baseline, power, alpha
   * Binary search on relative MDE
   */
  function minDetectableRelativeEffect(nPerArm, baselineRate, power, alpha) {
    if (!(nPerArm > 0) || !(baselineRate > 0 && baselineRate < 1)) return null;
    let lo = 0.001,
      hi = 2.0;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const nNeeded = sampleSizePerArm(baselineRate, mid, power, alpha);
      if (nNeeded == null) return null;
      if (nNeeded <= nPerArm) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Geo clustering: design effect and effective N
   * deff = 1 + (m_avg - 1) * ICC
   */
  function geoEffectiveSample(numMarkets, avgUnitsPerMarket, icc) {
    const m = Math.max(1, avgUnitsPerMarket);
    const rho = Math.max(0, Math.min(1, icc));
    const deff = 1 + (m - 1) * rho;
    const totalUnits = numMarkets * m;
    const nEff = totalUnits / deff;
    return {
      designEffect: deff,
      effectiveN: nEff,
      markets: numMarkets,
      note:
        "For geo tests, statistical power is driven primarily by the number of markets, not the number of people inside each market."
    };
  }

  /* ---------- Experiment record ---------- */
  function emptyExperiment() {
    return {
      id: null,
      name: "",
      objective: "",
      hypothesis: "",
      method: "randomized_holdout",
      status: "draft",
      treatmentDescription: "",
      controlDescription: "",
      eligibility: "",
      market: "",
      startDate: "",
      endDate: "",
      primaryKpi: "Conversion rate",
      secondaryKpis: "",
      investment: 0,
      dataSource: "",
      // Planning inputs (not results)
      baselineRate: 0.05,
      mdeRelative: 0.1,
      power: 0.8,
      alpha: 0.05,
      nPerArmAvailable: 0,
      // Geo-specific
      numMarkets: 0,
      avgUnitsPerMarket: 0,
      icc: 0.02,
      // DiD / pre-post notes (user-entered qualitative)
      prePeriodNotes: "",
      parallelTrendsNotes: "",
      contaminationNotes: "",
      multipleTestingNotes: "",
      baselineBalanceNotes: "",
      documentation: "",
      createdAt: null,
      updatedAt: null
    };
  }

  function normalizeExp(raw) {
    const e = Object.assign(emptyExperiment(), raw || {});
    e.name = String(e.name || "").trim();
    e.objective = String(e.objective || "").trim();
    e.hypothesis = String(e.hypothesis || "").trim();
    e.method = e.method || "randomized_holdout";
    e.status = e.status || "draft";
    e.investment = parseFloat(e.investment) || 0;
    e.baselineRate = parseFloat(e.baselineRate) || 0;
    e.mdeRelative = parseFloat(e.mdeRelative) || 0;
    e.power = parseFloat(e.power) || 0.8;
    e.alpha = parseFloat(e.alpha) || 0.05;
    e.nPerArmAvailable = parseInt(e.nPerArmAvailable, 10) || 0;
    e.numMarkets = parseInt(e.numMarkets, 10) || 0;
    e.avgUnitsPerMarket = parseFloat(e.avgUnitsPerMarket) || 0;
    e.icc = parseFloat(e.icc) || 0;
    if (e.id == null || e.id === "") delete e.id;
    else e.id = typeof e.id === "number" ? e.id : parseInt(e.id, 10);
    return e;
  }

  function validateExp(e) {
    const errors = [];
    if (!e.name) errors.push("Experiment name is required.");
    if (!e.method) errors.push("Methodology is required.");
    if (e.startDate && e.endDate && e.endDate < e.startDate) {
      errors.push("End date cannot be before start date.");
    }
    if (e.baselineRate < 0 || e.baselineRate > 1) {
      errors.push("Baseline rate must be between 0 and 1.");
    }
    if (e.mdeRelative < 0) errors.push("MDE cannot be negative.");
    if (e.power <= 0 || e.power >= 1) errors.push("Power must be between 0 and 1 (e.g. 0.8).");
    if (e.alpha <= 0 || e.alpha >= 1) errors.push("Significance level (alpha) must be between 0 and 1.");
    return errors;
  }

  /* ---------- Planning calculations for an experiment ---------- */
  function planStats(e) {
    const warnings = [];
    const method = METHODS.find(function (m) {
      return m.id === e.method;
    });

    let nRequired = null;
    let powerAchieved = null;
    let mdeAchieved = null;

    if (e.baselineRate > 0 && e.baselineRate < 1 && e.mdeRelative > 0) {
      nRequired = sampleSizePerArm(e.baselineRate, e.mdeRelative, e.power, e.alpha);
    } else {
      warnings.push("Enter baseline conversion rate (0–1) and relative MDE to estimate sample size.");
    }

    if (e.nPerArmAvailable > 0 && e.baselineRate > 0 && e.mdeRelative > 0) {
      powerAchieved = achievedPower(
        e.nPerArmAvailable,
        e.baselineRate,
        e.mdeRelative,
        e.alpha
      );
      mdeAchieved = minDetectableRelativeEffect(
        e.nPerArmAvailable,
        e.baselineRate,
        e.power,
        e.alpha
      );
    }

    // Geo clustering adjustment
    let geo = null;
    if (e.method === "geo_holdout" || e.method === "matched_market") {
      if (e.numMarkets > 0 && e.avgUnitsPerMarket > 0) {
        geo = geoEffectiveSample(e.numMarkets, e.avgUnitsPerMarket, e.icc || 0.02);
        if (e.numMarkets < 10) {
          warnings.push(
            "Few markets (" +
              e.numMarkets +
              "). Geo experiments with fewer than ~10–20 markets often have low power after clustering."
          );
        }
        if ((e.icc || 0) < 0.01) {
          warnings.push(
            "ICC is very low. If markets are more correlated than assumed, effective sample size is overstated."
          );
        }
      } else {
        warnings.push(
          "For geo / matched-market designs, enter number of markets and average units per market to assess clustering."
        );
      }
    }

    // Methodology-specific warnings
    if (e.method === "pre_post") {
      warnings.push(
        "Pre/post analysis is observational. It is not causal proof of incrementality. Seasonality, competitors and concurrent campaigns can explain the change."
      );
    }
    if (e.method === "diff_in_diff") {
      warnings.push(
        "Difference-in-differences requires the parallel-trends assumption: without treatment, treatment and control would have followed similar paths. Document pre-period trends; do not assume parallelism."
      );
    }
    if (e.method === "randomized_holdout") {
      warnings.push(
        "Check contamination (control users exposed to ads/offers) and randomization balance on key baselines before trusting results."
      );
    }

    // Duration heuristic (informational only)
    let durationDays = null;
    if (e.startDate && e.endDate) {
      const a = new Date(e.startDate);
      const b = new Date(e.endDate);
      if (!isNaN(a) && !isNaN(b)) {
        durationDays = Math.round((b - a) / 86400000);
        if (durationDays < 7) {
          warnings.push("Very short duration (< 7 days). Noise and day-of-week effects may dominate.");
        }
      }
    }

    // Multiple testing
    warnings.push(
      "If you will examine many KPIs or peek repeatedly, false-positive risk rises. Pre-register primary KPI and avoid unplanned multiple testing without adjustment."
    );

    const insufficient =
      nRequired != null &&
      e.nPerArmAvailable > 0 &&
      e.nPerArmAvailable < nRequired;

    return {
      method: method,
      nRequiredPerArm: nRequired,
      powerAchieved: powerAchieved,
      mdeAchieved: mdeAchieved,
      geo: geo,
      durationDays: durationDays,
      warnings: warnings,
      insufficientData: insufficient,
      insufficientNote: insufficient
        ? "Available sample per arm is below the estimate required for the target MDE, power and alpha. Label results as underpowered if you proceed."
        : null
    };
  }

  /* ---------- State ---------- */
  let state = {
    experiments: [],
    editingId: null,
    tab: "list", // list | design | calculator
    filterMethod: "",
    filterStatus: ""
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function methodLabel(id) {
    const m = METHODS.find(function (x) {
      return x.id === id;
    });
    return m ? m.label : id;
  }

  async function loadExperiments() {
    const rows = await MII.Data.getExperiments();
    state.experiments = (rows || []).map(normalizeExp);
  }

  async function saveExperiment(rec) {
    const e = normalizeExp(rec);
    const errors = validateExp(e);
    if (errors.length) return { ok: false, errors: errors };
    const now = new Date().toISOString();
    if (!e.createdAt) e.createdAt = now;
    e.updatedAt = now;
    const id = await MII.Data.putExperiment(e);
    e.id = id;
    await loadExperiments();
    return { ok: true, id: id };
  }

  async function deleteExperiment(id) {
    await MII.Data.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction("experiments", "readwrite");
        tx.objectStore("experiments").delete(id);
        tx.oncomplete = resolve;
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
    await loadExperiments();
  }

  /* ---------- Report download ---------- */
  function downloadReport(exp, plan) {
    const lines = [];
    lines.push("Marketing Incrementality Intelligence — Experiment documentation");
    lines.push("Generated: " + new Date().toISOString());
    lines.push("");
    lines.push("=== Identity ===");
    lines.push("Name: " + exp.name);
    lines.push("Status: " + exp.status);
    lines.push("Method: " + methodLabel(exp.method));
    lines.push("Objective: " + exp.objective);
    lines.push("Hypothesis: " + exp.hypothesis);
    lines.push("Market: " + exp.market);
    lines.push("Eligibility: " + exp.eligibility);
    lines.push("Treatment: " + exp.treatmentDescription);
    lines.push("Control: " + exp.controlDescription);
    lines.push("Start: " + exp.startDate + "  End: " + exp.endDate);
    lines.push("Primary KPI: " + exp.primaryKpi);
    lines.push("Secondary KPIs: " + exp.secondaryKpis);
    lines.push("Investment: " + exp.investment);
    lines.push("Data source: " + exp.dataSource);
    lines.push("");
    lines.push("=== Planning parameters (inputs, not measured results) ===");
    lines.push("Baseline rate: " + exp.baselineRate);
    lines.push("Target relative MDE: " + exp.mdeRelative);
    lines.push("Target power: " + exp.power);
    lines.push("Significance level (alpha): " + exp.alpha);
    lines.push("Available N per arm: " + exp.nPerArmAvailable);
    if (plan.nRequiredPerArm != null) {
      lines.push("Estimated N per arm required: " + plan.nRequiredPerArm);
    }
    if (plan.powerAchieved != null) {
      lines.push("Estimated power at available N: " + plan.powerAchieved.toFixed(3));
    }
    if (plan.mdeAchieved != null) {
      lines.push("Approx. MDE at target power with available N: " + plan.mdeAchieved.toFixed(4));
    }
    if (plan.geo) {
      lines.push("");
      lines.push("=== Geo clustering ===");
      lines.push("Markets: " + plan.geo.markets);
      lines.push("Design effect: " + plan.geo.designEffect.toFixed(3));
      lines.push("Effective N (units): " + plan.geo.effectiveN.toFixed(0));
      lines.push(plan.geo.note);
    }
    lines.push("");
    lines.push("=== Methodology note ===");
    if (plan.method) lines.push(plan.method.summary);
    lines.push("");
    lines.push("=== User documentation ===");
    lines.push(exp.documentation || "(none)");
    lines.push("Pre-period / trends notes: " + (exp.prePeriodNotes || "(none)"));
    lines.push("Parallel-trends notes: " + (exp.parallelTrendsNotes || "(none)"));
    lines.push("Contamination notes: " + (exp.contaminationNotes || "(none)"));
    lines.push("Baseline balance notes: " + (exp.baselineBalanceNotes || "(none)"));
    lines.push("Multiple testing notes: " + (exp.multipleTestingNotes || "(none)"));
    lines.push("");
    lines.push("=== Warnings ===");
    (plan.warnings || []).forEach(function (w) {
      lines.push("- " + w);
    });
    if (plan.insufficientData) lines.push("- " + plan.insufficientNote);
    lines.push("");
    lines.push(
      "DISCLAIMER: This document records design and planning inputs. It does not invent or certify measured lift, ROI or causal impact."
    );

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "experiment-" +
      (exp.name || "draft").replace(/[^\w\-]+/g, "-").slice(0, 40) +
      ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- UI ---------- */
  function render(container) {
    // Combined Experiment Lab: tabs for Advanced lab + Basic calculator
    let html =
      '<div class="mii-card" style="margin-bottom:16px;padding:10px 14px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
      tabBtn("list", "Experiment registry") +
      tabBtn("design", "Design & planning") +
      tabBtn("calculator", "Basic incrementality calculator") +
      "</div></div>";

    html += '<div id="mii-lab-body"></div>';
    container.innerHTML = html;

    $all(".mii-lab-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.tab = btn.getAttribute("data-tab");
        render(container);
      });
    });

    const body = document.getElementById("mii-lab-body");
    if (state.tab === "calculator") {
      if (MII.Incrementality && MII.Incrementality.render) {
        MII.Incrementality.render(body);
      } else {
        body.innerHTML = "<p class=\"mii-text-muted\">Basic calculator not loaded.</p>";
      }
      return;
    }

    loadExperiments()
      .then(function () {
        if (state.tab === "design") paintDesign(body);
        else paintList(body);
      })
      .catch(function (err) {
        body.innerHTML =
          '<div class="mii-card"><p style="color:#fca5a5;">' +
          escapeHtml(err.message || err) +
          "</p></div>";
      });
  }

  function tabBtn(id, label) {
    return (
      '<button type="button" class="mii-btn mii-lab-tab ' +
      (state.tab === id ? "mii-btn--primary" : "mii-btn--ghost") +
      ' mii-btn--sm" data-tab="' +
      id +
      '">' +
      escapeHtml(label) +
      "</button>"
    );
  }

  function $(sel) {
    return document.querySelector(sel);
  }
  function $all(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  function paintList(body) {
    let rows = state.experiments.slice();
    if (state.filterMethod) {
      rows = rows.filter(function (e) {
        return e.method === state.filterMethod;
      });
    }
    if (state.filterStatus) {
      rows = rows.filter(function (e) {
        return e.status === state.filterStatus;
      });
    }

    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">⚗</span><div>' +
      "<strong>Advanced Experiment Lab.</strong> Design and document incrementality tests. " +
      "Planning statistics (sample size, MDE, power) are calculations from your inputs — they are not measured campaign results." +
      "</div></div>";

    html +=
      '<div class="mii-card" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mii-exp-new">+ New experiment</button>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<select id="mii-exp-f-method" style="padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="">All methods</option>' +
      METHODS.map(function (m) {
        return (
          '<option value="' +
          m.id +
          '"' +
          (state.filterMethod === m.id ? " selected" : "") +
          ">" +
          escapeHtml(m.label) +
          "</option>"
        );
      }).join("") +
      "</select>" +
      '<select id="mii-exp-f-status" style="padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="">All statuses</option>' +
      STATUS_OPTIONS.map(function (s) {
        return (
          '<option value="' +
          s +
          '"' +
          (state.filterStatus === s ? " selected" : "") +
          ">" +
          s +
          "</option>"
        );
      }).join("") +
      "</select></div></div>";

    if (!rows.length) {
      html +=
        '<div class="mii-card"><div class="mii-placeholder" style="min-height:140px;"><h3>No experiments yet</h3>' +
        "<p>Create a design to document methodology, KPIs, sample-size plans and risks.</p></div></div>";
    } else {
      html +=
        '<div class="mii-card" style="padding:0;overflow:hidden;"><div class="mii-table-wrap" style="border:none;">' +
        '<table class="mii-table"><thead><tr>' +
        "<th>Name</th><th>Method</th><th>Status</th><th>Primary KPI</th><th>Dates</th><th></th>" +
        "</tr></thead><tbody>";
      rows.forEach(function (e) {
        html +=
          "<tr><td><strong>" +
          escapeHtml(e.name) +
          "</strong></td><td>" +
          escapeHtml(methodLabel(e.method)) +
          "</td><td>" +
          escapeHtml(e.status) +
          "</td><td>" +
          escapeHtml(e.primaryKpi) +
          "</td><td>" +
          escapeHtml(e.startDate || "—") +
          (e.endDate ? " → " + escapeHtml(e.endDate) : "") +
          '</td><td style="white-space:nowrap;">' +
          '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-exp-open" data-id="' +
          e.id +
          '">Open</button> ' +
          '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-exp-del" data-id="' +
          e.id +
          '">Delete</button>' +
          "</td></tr>";
      });
      html += "</tbody></table></div></div>";
    }

    // Methodology reference cards
    html +=
      '<div class="mii-card mii-mt-20"><h2 class="mii-card-title">Methodologies</h2>' +
      '<div class="mii-grid mii-grid-2" style="margin-top:12px;">';
    METHODS.forEach(function (m) {
      html +=
        '<div style="background:var(--mii-bg);border-radius:10px;padding:12px;">' +
        "<strong>" +
        escapeHtml(m.label) +
        '</strong><p class="mii-text-muted" style="margin:6px 0 0;font-size:0.85rem;">' +
        escapeHtml(m.summary) +
        "</p></div>";
    });
    html += "</div></div>";

    body.innerHTML = html;

    const newBtn = document.getElementById("mii-exp-new");
    if (newBtn) {
      newBtn.addEventListener("click", function () {
        state.editingId = null;
        state.tab = "design";
        render(document.getElementById("mii-content").querySelector(".mii-view:not([hidden])") || body.parentElement);
        // safer: re-render full module
        const panel = body.closest(".mii-view") || body.parentElement;
        state.tab = "design";
        MII.ExperimentLab.render(panel);
      });
    }

    $all(".mii-exp-open").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.editingId = parseInt(btn.getAttribute("data-id"), 10);
        state.tab = "design";
        const panel = body.closest(".mii-view") || body.parentElement;
        MII.ExperimentLab.render(panel);
      });
    });

    $all(".mii-exp-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Delete this experiment record?")) return;
        deleteExperiment(parseInt(btn.getAttribute("data-id"), 10)).then(function () {
          const panel = body.closest(".mii-view") || body.parentElement;
          MII.ExperimentLab.render(panel);
        });
      });
    });

    const fm = document.getElementById("mii-exp-f-method");
    const fs = document.getElementById("mii-exp-f-status");
    if (fm)
      fm.addEventListener("change", function () {
        state.filterMethod = fm.value;
        paintList(body);
      });
    if (fs)
      fs.addEventListener("change", function () {
        state.filterStatus = fs.value;
        paintList(body);
      });
  }

  function paintDesign(body) {
    const exp =
      state.editingId != null
        ? state.experiments.find(function (e) {
            return e.id === state.editingId;
          }) || emptyExperiment()
        : emptyExperiment();

    const plan = planStats(normalizeExp(exp));

    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">📐</span><div>' +
      "<strong>Design &amp; planning.</strong> Fill inputs to estimate required sample size and power. " +
      "These are planning tools — they do not report measured lift from live campaigns." +
      "</div></div>";

    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">' +
      (exp.id ? "Edit experiment" : "New experiment") +
      "</h2>" +
      '<div id="mii-exp-errors" style="color:#fca5a5;font-size:0.85rem;margin:8px 0;"></div>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px;">';

    html += finput("Name *", "ex-name", exp.name);
    html += fselect(
      "Status",
      "ex-status",
      STATUS_OPTIONS.map(function (s) {
        return { value: s, label: s };
      }),
      exp.status
    );
    html += fselect(
      "Methodology *",
      "ex-method",
      METHODS.map(function (m) {
        return { value: m.id, label: m.label };
      }),
      exp.method
    );
    html += finput("Market", "ex-market", exp.market);
    html += finput("Start date", "ex-start", exp.startDate, "date");
    html += finput("End date", "ex-end", exp.endDate, "date");
    html += fselect(
      "Primary KPI",
      "ex-pkpi",
      KPI_OPTIONS.map(function (k) {
        return { value: k, label: k };
      }),
      exp.primaryKpi
    );
    html += finput("Secondary KPIs", "ex-skpi", exp.secondaryKpis);
    html += finput("Investment", "ex-invest", exp.investment, "number");
    html += finput("Data source", "ex-source", exp.dataSource);

    html +=
      '<div style="grid-column:1/-1;">' +
      flabel("Business objective") +
      '<textarea id="ex-objective" rows="2" style="' +
      taStyle() +
      '">' +
      escapeHtml(exp.objective) +
      "</textarea></div>";
    html +=
      '<div style="grid-column:1/-1;">' +
      flabel("Hypothesis") +
      '<textarea id="ex-hypothesis" rows="2" style="' +
      taStyle() +
      '">' +
      escapeHtml(exp.hypothesis) +
      "</textarea></div>";
    html +=
      '<div style="grid-column:1/-1;">' +
      flabel("Treatment group") +
      '<textarea id="ex-treatment" rows="2" style="' +
      taStyle() +
      '">' +
      escapeHtml(exp.treatmentDescription) +
      "</textarea></div>";
    html +=
      '<div style="grid-column:1/-1;">' +
      flabel("Control group") +
      '<textarea id="ex-control" rows="2" style="' +
      taStyle() +
      '">' +
      escapeHtml(exp.controlDescription) +
      "</textarea></div>";
    html +=
      '<div style="grid-column:1/-1;">' +
      flabel("Eligibility") +
      '<textarea id="ex-eligibility" rows="2" style="' +
      taStyle() +
      '">' +
      escapeHtml(exp.eligibility) +
      "</textarea></div>";

    html += "</div></div>";

    // Planning stats inputs
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Sample size &amp; power planning</h2>' +
      '<p class="mii-card-subtitle">Binary conversion KPI approximation (two-proportion). Adjust if KPI is continuous.</p>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:12px;">' +
      finput("Baseline rate (0–1)", "ex-base", exp.baselineRate, "number") +
      finput("Relative MDE (e.g. 0.1 = 10%)", "ex-mde", exp.mdeRelative, "number") +
      finput("Target power", "ex-power", exp.power, "number") +
      finput("Alpha (e.g. 0.05)", "ex-alpha", exp.alpha, "number") +
      finput("Available N per arm", "ex-navail", exp.nPerArmAvailable, "number") +
      "</div>";

    // Live plan summary from current form defaults (recomputed on save / recalc)
    html +=
      '<div id="mii-plan-out" style="margin-top:14px;">' +
      renderPlanBlock(plan) +
      "</div>" +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="mii-exp-recalc" style="margin-top:10px;">Recalculate plan</button>' +
      "</div>";

    // Geo block
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Geo / matched-market clustering</h2>' +
      '<p class="mii-card-subtitle">Relevant for geographic holdout and matched-market tests</p>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:12px;">' +
      finput("Number of markets", "ex-markets", exp.numMarkets, "number") +
      finput("Avg units per market", "ex-avgunits", exp.avgUnitsPerMarket, "number") +
      finput("ICC (intraclass correlation)", "ex-icc", exp.icc, "number") +
      "</div></div>";

    // Qualitative checks
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Design checks &amp; documentation</h2>' +
      '<div style="display:grid;gap:12px;margin-top:12px;">' +
      tarea("Baseline balance checks", "ex-balance", exp.baselineBalanceNotes) +
      tarea("Contamination risks / mitigation", "ex-contam", exp.contaminationNotes) +
      tarea("Pre-period trends (especially for DiD)", "ex-pre", exp.prePeriodNotes) +
      tarea("Parallel-trends discussion (DiD)", "ex-parallel", exp.parallelTrendsNotes) +
      tarea("Multiple testing plan", "ex-multi", exp.multipleTestingNotes) +
      tarea("Full documentation / protocol notes", "ex-doc", exp.documentation) +
      "</div></div>";

    html +=
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mii-exp-save">Save experiment</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mii-exp-report">Download documentation</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mii-exp-cancel">Back to list</button>' +
      "</div>";

    body.innerHTML = html;

    document.getElementById("mii-exp-recalc").addEventListener("click", function () {
      const draft = readForm(exp.id);
      const p = planStats(draft);
      document.getElementById("mii-plan-out").innerHTML = renderPlanBlock(p);
    });

    document.getElementById("mii-exp-save").addEventListener("click", function () {
      const draft = readForm(exp.id);
      saveExperiment(draft).then(function (res) {
        const err = document.getElementById("mii-exp-errors");
        if (!res.ok) {
          err.textContent = res.errors.join(" ");
          return;
        }
        state.editingId = res.id;
        state.tab = "list";
        const panel = body.closest(".mii-view") || body.parentElement;
        MII.ExperimentLab.render(panel);
      });
    });

    document.getElementById("mii-exp-cancel").addEventListener("click", function () {
      state.editingId = null;
      state.tab = "list";
      const panel = body.closest(".mii-view") || body.parentElement;
      MII.ExperimentLab.render(panel);
    });

    document.getElementById("mii-exp-report").addEventListener("click", function () {
      const draft = readForm(exp.id);
      downloadReport(draft, planStats(draft));
    });
  }

  function renderPlanBlock(plan) {
    let html = '<div class="mii-grid mii-grid-4">';
    html +=
      mini(
        "N per arm (est.)",
        plan.nRequiredPerArm != null ? plan.nRequiredPerArm.toLocaleString() : "—"
      );
    html +=
      mini(
        "Power at available N",
        plan.powerAchieved != null ? (plan.powerAchieved * 100).toFixed(1) + "%" : "—"
      );
    html +=
      mini(
        "MDE at target power",
        plan.mdeAchieved != null ? (plan.mdeAchieved * 100).toFixed(1) + "% rel." : "—"
      );
    html +=
      mini(
        "Duration",
        plan.durationDays != null ? plan.durationDays + " days" : "—"
      );
    html += "</div>";

    if (plan.geo) {
      html +=
        '<p class="mii-text-muted" style="margin:12px 0 0;font-size:0.85rem;">' +
        "Geo design effect ≈ " +
        plan.geo.designEffect.toFixed(2) +
        " · effective unit N ≈ " +
        Math.round(plan.geo.effectiveN).toLocaleString() +
        ". " +
        escapeHtml(plan.geo.note) +
        "</p>";
    }

    if (plan.insufficientData) {
      html +=
        '<p style="margin:12px 0 0;color:#fbbf24;font-size:0.85rem;"><strong>Insufficient sample for target MDE:</strong> ' +
        escapeHtml(plan.insufficientNote) +
        "</p>";
    }

    if (plan.method) {
      html +=
        '<p class="mii-text-muted" style="margin:12px 0 0;font-size:0.85rem;"><strong>' +
        escapeHtml(plan.method.label) +
        ":</strong> " +
        escapeHtml(plan.method.summary) +
        "</p>";
    }

    if (plan.warnings.length) {
      html +=
        '<ul style="margin:12px 0 0;padding-left:18px;font-size:0.85rem;color:#fde68a;">';
      plan.warnings.forEach(function (w) {
        html += "<li>" + escapeHtml(w) + "</li>";
      });
      html += "</ul>";
    }
    return html;
  }

  function mini(label, value) {
    return (
      '<div style="background:var(--mii-bg);border-radius:10px;padding:12px;">' +
      '<div style="font-size:1.1rem;font-weight:800;">' +
      escapeHtml(String(value)) +
      '</div><div class="mii-kpi-label">' +
      escapeHtml(label) +
      "</div></div>"
    );
  }

  function finput(label, id, val, type) {
    return (
      "<div>" +
      flabel(label) +
      '<input id="' +
      id +
      '" type="' +
      (type || "text") +
      '" value="' +
      escapeHtml(val) +
      '" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function fselect(label, id, options, current) {
    return (
      "<div>" +
      flabel(label) +
      '<select id="' +
      id +
      '" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      options
        .map(function (o) {
          return (
            '<option value="' +
            escapeHtml(o.value) +
            '"' +
            (o.value === current ? " selected" : "") +
            ">" +
            escapeHtml(o.label) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>"
    );
  }

  function flabel(t) {
    return '<label class="mii-kpi-label">' + escapeHtml(t) + "</label>";
  }

  function taStyle() {
    return "width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);";
  }

  function tarea(label, id, val) {
    return (
      "<div>" +
      flabel(label) +
      '<textarea id="' +
      id +
      '" rows="2" style="' +
      taStyle() +
      '">' +
      escapeHtml(val) +
      "</textarea></div>"
    );
  }

  function readForm(existingId) {
    function v(id) {
      const el = document.getElementById(id);
      return el ? el.value : "";
    }
    return normalizeExp({
      id: existingId,
      name: v("ex-name"),
      status: v("ex-status"),
      method: v("ex-method"),
      market: v("ex-market"),
      startDate: v("ex-start"),
      endDate: v("ex-end"),
      primaryKpi: v("ex-pkpi"),
      secondaryKpis: v("ex-skpi"),
      investment: v("ex-invest"),
      dataSource: v("ex-source"),
      objective: v("ex-objective"),
      hypothesis: v("ex-hypothesis"),
      treatmentDescription: v("ex-treatment"),
      controlDescription: v("ex-control"),
      eligibility: v("ex-eligibility"),
      baselineRate: v("ex-base"),
      mdeRelative: v("ex-mde"),
      power: v("ex-power"),
      alpha: v("ex-alpha"),
      nPerArmAvailable: v("ex-navail"),
      numMarkets: v("ex-markets"),
      avgUnitsPerMarket: v("ex-avgunits"),
      icc: v("ex-icc"),
      baselineBalanceNotes: v("ex-balance"),
      contaminationNotes: v("ex-contam"),
      prePeriodNotes: v("ex-pre"),
      parallelTrendsNotes: v("ex-parallel"),
      multipleTestingNotes: v("ex-multi"),
      documentation: v("ex-doc")
    });
  }

  /* ---------- Self-tests ---------- */
  function runSelfTests() {
    const tests = [];
    // Known-order: higher MDE → smaller n
    const n10 = sampleSizePerArm(0.05, 0.1, 0.8, 0.05);
    const n20 = sampleSizePerArm(0.05, 0.2, 0.8, 0.05);
    tests.push({ name: "Larger MDE needs fewer samples", pass: n10 != null && n20 != null && n20 < n10 });

    // Power increases with n
    const pSmall = achievedPower(1000, 0.05, 0.2, 0.05);
    const pLarge = achievedPower(20000, 0.05, 0.2, 0.05);
    tests.push({
      name: "Power rises with N",
      pass: pSmall != null && pLarge != null && pLarge > pSmall
    });

    // Geo design effect
    const g = geoEffectiveSample(20, 5000, 0.05);
    tests.push({
      name: "Design effect > 1 when ICC > 0",
      pass: g.designEffect > 1 && g.effectiveN < 20 * 5000
    });

    // Pre/post warning present
    const plan = planStats(
      normalizeExp({ method: "pre_post", name: "t", baselineRate: 0.05, mdeRelative: 0.1 })
    );
    tests.push({
      name: "Pre/post not causal warning",
      pass: plan.warnings.some(function (w) {
        return /not causal/i.test(w);
      })
    });

    // DiD parallel trends warning
    const plan2 = planStats(
      normalizeExp({ method: "diff_in_diff", name: "t", baselineRate: 0.05, mdeRelative: 0.1 })
    );
    tests.push({
      name: "DiD parallel-trends warning",
      pass: plan2.warnings.some(function (w) {
        return /parallel-trends/i.test(w);
      })
    });

    // Validation requires name
    tests.push({
      name: "Name required",
      pass: validateExp(normalizeExp({ name: "" })).length > 0
    });

    return tests;
  }

  MII.ExperimentLab.render = render;
  MII.ExperimentLab.METHODS = METHODS;
  MII.ExperimentLab.sampleSizePerArm = sampleSizePerArm;
  MII.ExperimentLab.achievedPower = achievedPower;
  MII.ExperimentLab.minDetectableRelativeEffect = minDetectableRelativeEffect;
  MII.ExperimentLab.geoEffectiveSample = geoEffectiveSample;
  MII.ExperimentLab.planStats = planStats;
  MII.ExperimentLab.runSelfTests = runSelfTests;
})();
