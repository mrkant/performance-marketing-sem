/**
 * Marketing Incrementality Intelligence — Basic Incrementality Calculator
 * Beginner-friendly treatment vs control calculator
 * Namespace: window.MII.Incrementality
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Incrementality = MII.Incrementality || {};

  /* ---------- Stats helpers (shared patterns with A/B tool) ---------- */
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

  function n(v) {
    const x = parseFloat(v);
    return isFinite(x) ? x : 0;
  }

  function safeDiv(a, b) {
    if (!b || !isFinite(b) || b === 0) return null;
    return a / b;
  }

  /* ---------- Core calculation ---------- */
  /**
   * @param {object} input
   * treatment: { population, conversions, revenue, investment }
   * control: { population, conversions, revenue }
   * finance: { costOfGoodsPct, variableCostPct, otherFixed }  // optional margins
   * design: { type: "randomized" | "observational", confidence: 0.95 }
   */
  function calculate(input) {
    const t = input.treatment || {};
    const c = input.control || {};
    const fin = input.finance || {};
    const design = input.design || {};
    const confidence = design.confidence || 0.95;
    const designType = design.type === "observational" ? "observational" : "randomized";

    const warnings = [];
    const errors = [];

    const nT = n(t.population);
    const xT = n(t.conversions);
    const revT = n(t.revenue);
    const invest = n(t.investment);

    const nC = n(c.population);
    const xC = n(c.conversions);
    const revC = n(c.revenue);

    if (nT <= 0 || nC <= 0) errors.push("Eligible population must be greater than zero for both groups.");
    if (xT < 0 || xC < 0) errors.push("Conversions cannot be negative.");
    if (xT > nT || xC > nC) errors.push("Conversions cannot exceed eligible population.");
    if (revT < 0 || revC < 0) errors.push("Revenue cannot be negative.");
    if (invest < 0) errors.push("Marketing investment cannot be negative.");

    if (errors.length) return { ok: false, errors: errors };

    // Conversion rates
    const rateT = xT / nT;
    const rateC = xC / nC;

    // Absolute & relative lift (conversion)
    const absLift = rateT - rateC;
    const relLift = rateC === 0 ? (rateT > 0 ? Infinity : 0) : absLift / rateC;

    // Incremental conversions (scaled to treatment population)
    const incrementalConversions = absLift * nT;

    // Counterfactual treatment revenue using control ARPU per eligible unit
    const arpuC = revC / nC; // average revenue per eligible control unit
    const counterfactualRevT = arpuC * nT;
    const incrementalRevenue = revT - counterfactualRevT;

    // Small sample warnings
    if (nT < 100 || nC < 100) {
      warnings.push("Small sample sizes (< 100 per group). Estimates and significance tests are less reliable.");
    }
    if (xT < 5 || xC < 5) {
      warnings.push("Very few conversions (< 5 in a group). Prefer exact tests or Bayesian methods for binary outcomes.");
    }
    if (designType === "observational") {
      warnings.push(
        "Observational comparison: results may be biased by selection and confounding. Prefer randomized experiments when possible."
      );
    }

    // Two-proportion z-test on conversion rates
    const pPool = (xT + xC) / (nT + nC);
    const se =
      pPool * (1 - pPool) * (1 / nT + 1 / nC) > 0
        ? Math.sqrt(pPool * (1 - pPool) * (1 / nT + 1 / nC))
        : 0;
    let z = 0;
    let pValue = 1;
    if (se > 0) {
      z = absLift / se;
      pValue = 2 * (1 - normCdf(Math.abs(z)));
    }
    const zCrit = normInv(1 - (1 - confidence) / 2);
    const significant = se > 0 && Math.abs(z) >= zCrit;

    // CI for absolute lift (normal approximation)
    const seLift = se; // same SE under H1 approximation using pooled; for CI use unpooled:
    const seUnpooled = Math.sqrt(
      (rateT * (1 - rateT)) / nT + (rateC * (1 - rateC)) / nC
    );
    const ciHalf = zCrit * (seUnpooled || 0);
    const absLiftCi = {
      low: absLift - ciHalf,
      high: absLift + ciHalf
    };

    // CI for incremental conversions
    const incConvCi = {
      low: absLiftCi.low * nT,
      high: absLiftCi.high * nT
    };

    // Rough CI for incremental revenue (scale CI of rate by treatment ARPU if available,
    // else by control ARPU — illustrative uncertainty only)
    const arpuT = nT > 0 ? revT / nT : 0;
    const revenueScale = arpuT > 0 ? arpuT : arpuC;
    const incRevCi = {
      low: absLiftCi.low * nT * revenueScale,
      high: absLiftCi.high * nT * revenueScale,
      note: "Approximate CI scaled from conversion-rate uncertainty; not a full revenue model."
    };

    // Financial layers
    const cogsPct = Math.min(100, Math.max(0, n(fin.costOfGoodsPct))) / 100;
    const varPct = Math.min(100, Math.max(0, n(fin.variableCostPct))) / 100;
    const otherFixed = Math.max(0, n(fin.otherFixed));

    // Gross revenue (observed treatment) vs incremental
    const grossRevenueIncremental = incrementalRevenue;

    // Net revenue after COGS (on incremental revenue only)
    const netRevenueIncremental = grossRevenueIncremental * (1 - cogsPct);

    // Contribution after variable marketing-unrelated costs
    const contributionIncremental = netRevenueIncremental * (1 - varPct);

    // Incremental profit = contribution − marketing investment − other fixed allocated to test
    // Only subtract investment if we are measuring the treatment exposure cost
    const incrementalProfit = contributionIncremental - invest - otherFixed;

    // Efficiency metrics — suppress when incremental outcomes ≤ 0
    const positiveIncConv = incrementalConversions > 0;
    const positiveIncRev = incrementalRevenue > 0;

    let iROAS = null;
    let costPerIncConv = null;
    if (positiveIncRev && invest > 0) {
      iROAS = incrementalRevenue / invest;
    }
    if (positiveIncConv && invest > 0) {
      costPerIncConv = invest / incrementalConversions;
    }
    // If outcomes zero or negative, explicitly null efficiency metrics
    if (!positiveIncRev) iROAS = null;
    if (!positiveIncConv) costPerIncConv = null;

    return {
      ok: true,
      designType: designType,
      confidence: confidence,
      warnings: warnings,
      groups: {
        treatment: {
          population: nT,
          conversions: xT,
          revenue: revT,
          investment: invest,
          rate: rateT,
          arpu: arpuT
        },
        control: {
          population: nC,
          conversions: xC,
          revenue: revC,
          rate: rateC,
          arpu: arpuC
        }
      },
      conversion: {
        rateT: rateT,
        rateC: rateC,
        absLift: absLift,
        relLift: relLift,
        absLiftCi: absLiftCi,
        incrementalConversions: incrementalConversions,
        incrementalConversionsCi: incConvCi
      },
      revenue: {
        counterfactualRevT: counterfactualRevT,
        incrementalRevenue: incrementalRevenue,
        incrementalRevenueCi: incRevCi,
        method:
          "Counterfactual treatment revenue = control revenue per eligible unit × treatment eligible population."
      },
      stats: {
        z: z,
        pValue: pValue,
        zCrit: zCrit,
        significant: significant,
        seUnpooled: seUnpooled
      },
      finance: {
        cogsPct: cogsPct,
        variableCostPct: varPct,
        otherFixed: otherFixed,
        grossRevenueIncremental: grossRevenueIncremental,
        netRevenueIncremental: netRevenueIncremental,
        contributionIncremental: contributionIncremental,
        incrementalProfit: incrementalProfit,
        iROAS: iROAS,
        costPerIncConv: costPerIncConv
      },
      calculatedAt: new Date().toISOString()
    };
  }

  /* ---------- Sample dataset ---------- */
  const SAMPLE = {
    name: "Illustrative geo / audience holdout (demo only)",
    design: { type: "randomized", confidence: 0.95 },
    treatment: {
      population: 50000,
      conversions: 2400,
      revenue: 18000000,
      investment: 2500000
    },
    control: {
      population: 50000,
      conversions: 2000,
      revenue: 15000000
    },
    finance: {
      costOfGoodsPct: 40,
      variableCostPct: 5,
      otherFixed: 0
    },
    note: "All numbers are fictional and for calculator demonstration only."
  };

  /* ---------- Self-tests ---------- */
  function runSelfTests() {
    const tests = [];

    // Classic equal-size positive lift
    let r = calculate({
      treatment: { population: 1000, conversions: 120, revenue: 120000, investment: 10000 },
      control: { population: 1000, conversions: 100, revenue: 100000 },
      design: { type: "randomized", confidence: 0.95 },
      finance: { costOfGoodsPct: 0, variableCostPct: 0, otherFixed: 0 }
    });
    tests.push({
      name: "Positive abs lift",
      pass: r.ok && Math.abs(r.conversion.absLift - 0.02) < 1e-9
    });
    tests.push({
      name: "Incremental conversions = 20",
      pass: r.ok && Math.abs(r.conversion.incrementalConversions - 20) < 1e-6
    });
    // Counterfactual rev = 100 * 1000 = 100000; actual 120000 → inc rev 20000
    tests.push({
      name: "Incremental revenue via control ARPU",
      pass: r.ok && Math.abs(r.revenue.incrementalRevenue - 20000) < 1e-6
    });
    tests.push({
      name: "iROAS = 2 when invest 10000",
      pass: r.ok && r.finance.iROAS != null && Math.abs(r.finance.iROAS - 2) < 1e-9
    });

    // Zero lift → no positive efficiency
    r = calculate({
      treatment: { population: 500, conversions: 50, revenue: 50000, investment: 5000 },
      control: { population: 500, conversions: 50, revenue: 50000 },
      design: { type: "randomized", confidence: 0.95 }
    });
    tests.push({
      name: "Zero lift nulls iROAS",
      pass: r.ok && r.finance.iROAS === null && r.conversion.incrementalConversions === 0
    });

    // Negative lift
    r = calculate({
      treatment: { population: 800, conversions: 40, revenue: 40000, investment: 3000 },
      control: { population: 800, conversions: 60, revenue: 60000 },
      design: { type: "observational", confidence: 0.95 }
    });
    tests.push({
      name: "Negative lift nulls efficiency metrics",
      pass:
        r.ok &&
        r.conversion.incrementalConversions < 0 &&
        r.finance.iROAS === null &&
        r.finance.costPerIncConv === null
    });
    tests.push({
      name: "Observational warning present",
      pass: r.warnings.some(function (w) {
        return /observational/i.test(w);
      })
    });

    // Unequal sizes
    r = calculate({
      treatment: { population: 2000, conversions: 200, revenue: 200000, investment: 15000 },
      control: { population: 500, conversions: 40, revenue: 40000 },
      design: { type: "randomized", confidence: 0.9 }
    });
    tests.push({
      name: "Unequal group sizes supported",
      pass: r.ok && Math.abs(r.conversion.rateT - 0.1) < 1e-12 && Math.abs(r.conversion.rateC - 0.08) < 1e-12
    });

    // Division by zero guards
    r = calculate({
      treatment: { population: 0, conversions: 0, revenue: 0, investment: 0 },
      control: { population: 100, conversions: 10, revenue: 1000 }
    });
    tests.push({ name: "Zero population errors", pass: !r.ok && r.errors.length > 0 });

    // Sample dataset runs
    r = calculate(SAMPLE);
    tests.push({ name: "Sample dataset calculates", pass: r.ok && r.conversion.incrementalConversions > 0 });

    return tests;
  }

  /* ---------- Formatting ---------- */
  function pct(x, d) {
    if (x === null || !isFinite(x)) return "—";
    if (x === Infinity) return "∞";
    return (x * 100).toFixed(d == null ? 2 : d) + "%";
  }
  function numFmt(x, d) {
    if (x === null || !isFinite(x)) return "—";
    return Number(x).toLocaleString(undefined, {
      maximumFractionDigits: d == null ? 2 : d
    });
  }
  function money(x) {
    if (x === null || !isFinite(x)) return "—";
    return Number(x).toLocaleString(undefined, {
      maximumFractionDigits: 0
    });
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- UI ---------- */
  function render(container) {
    let html = "";

    html +=
      '<div class="mii-demo-banner"><span aria-hidden="true">ℹ</span><div>' +
      "<strong>Basic Incrementality Calculator.</strong> Compare a treatment group to a control group. " +
      "Counterfactual revenue uses control average revenue per eligible unit. " +
      "Efficiency metrics (iROAS, cost per incremental conversion) are hidden when incremental outcomes are zero or negative." +
      "</div></div>";

    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;">' +
      "<div><h2 class=\"mii-card-title\" style=\"margin:0;\">Experiment design</h2>" +
      '<p class="mii-card-subtitle">Label the comparison correctly</p></div>' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="mii-inc-sample">Load sample dataset</button>' +
      "</div>" +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px;">' +
      '<div><label class="mii-kpi-label">Comparison type</label>' +
      '<select id="mii-inc-type" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="randomized">Randomized experiment</option>' +
      '<option value="observational">Observational comparison</option>' +
      "</select></div>" +
      '<div><label class="mii-kpi-label">Confidence level</label>' +
      '<select id="mii-inc-conf" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      '<option value="0.90">90%</option>' +
      '<option value="0.95" selected>95%</option>' +
      '<option value="0.99">99%</option>' +
      "</select></div></div></div>";

    // Inputs
    html +=
      '<div class="mii-grid mii-grid-2" style="margin-bottom:16px;">' +
      groupCard("Treatment (exposed)", "t", true) +
      groupCard("Control (holdout)", "c", false) +
      "</div>";

    // Finance optional
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Optional margin assumptions</h2>' +
      '<p class="mii-card-subtitle">Used only for net revenue, contribution and incremental profit layers</p>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px;">' +
      field("COGS % of revenue", "mii-cogs", "40", "number") +
      field("Other variable cost %", "mii-var", "5", "number") +
      field("Other fixed allocated", "mii-fixed", "0", "number") +
      "</div></div>";

    html +=
      '<div style="margin-bottom:16px;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mii-inc-run">Calculate incrementality</button>' +
      "</div>";

    html += '<div id="mii-inc-errors" hidden></div>';
    html += '<div id="mii-inc-results"></div>';

    // Method notes
    html +=
      '<div class="mii-card mii-mt-20">' +
      '<h2 class="mii-card-title">How to read results</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.65;">' +
      "<li><strong>Absolute lift</strong> = treatment conversion rate − control conversion rate.</li>" +
      "<li><strong>Incremental conversions</strong> = absolute lift × treatment eligible population (supports unequal group sizes).</li>" +
      "<li><strong>Counterfactual revenue</strong> = control revenue per eligible unit × treatment population.</li>" +
      "<li><strong>Incremental revenue</strong> = observed treatment revenue − counterfactual revenue.</li>" +
      "<li><strong>iROAS / cost per incremental conversion</strong> are only shown when incremental outcomes are strictly positive.</li>" +
      "<li><strong>Significance</strong> uses a two-proportion z-test on conversion rates. Revenue CIs are approximate.</li>" +
      "<li><strong>Randomized vs observational</strong> is a label for interpretation quality — it does not change the arithmetic.</li>" +
      "</ul></div>";

    container.innerHTML = html;
    wire(container);
  }

  function groupCard(title, prefix, includeInvest) {
    let html =
      '<div class="mii-card"><h2 class="mii-card-title">' +
      escapeHtml(title) +
      "</h2>" +
      '<div style="display:grid;gap:10px;margin-top:12px;">' +
      field("Eligible population", "mii-" + prefix + "-pop", "", "number") +
      field("Conversions", "mii-" + prefix + "-conv", "", "number") +
      field("Total revenue", "mii-" + prefix + "-rev", "", "number");
    if (includeInvest) {
      html += field("Marketing investment", "mii-" + prefix + "-inv", "", "number");
    }
    html += "</div></div>";
    return html;
  }

  function field(label, id, val, type) {
    return (
      "<div><label class=\"mii-kpi-label\" for=\"" +
      id +
      '">' +
      escapeHtml(label) +
      '</label><input id="' +
      id +
      '" type="' +
      (type || "text") +
      '" value="' +
      escapeHtml(val) +
      '" min="0" step="any" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function readInputs() {
    return {
      design: {
        type: ($("mii-inc-type") && $("mii-inc-type").value) || "randomized",
        confidence: parseFloat(($("mii-inc-conf") && $("mii-inc-conf").value) || "0.95")
      },
      treatment: {
        population: val("mii-t-pop"),
        conversions: val("mii-t-conv"),
        revenue: val("mii-t-rev"),
        investment: val("mii-t-inv")
      },
      control: {
        population: val("mii-c-pop"),
        conversions: val("mii-c-conv"),
        revenue: val("mii-c-rev")
      },
      finance: {
        costOfGoodsPct: val("mii-cogs"),
        variableCostPct: val("mii-var"),
        otherFixed: val("mii-fixed")
      }
    };
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }
  function $(id) {
    return document.getElementById(id);
  }

  function fillSample() {
    const s = SAMPLE;
    $("mii-inc-type").value = s.design.type;
    $("mii-inc-conf").value = String(s.design.confidence);
    $("mii-t-pop").value = s.treatment.population;
    $("mii-t-conv").value = s.treatment.conversions;
    $("mii-t-rev").value = s.treatment.revenue;
    $("mii-t-inv").value = s.treatment.investment;
    $("mii-c-pop").value = s.control.population;
    $("mii-c-conv").value = s.control.conversions;
    $("mii-c-rev").value = s.control.revenue;
    $("mii-cogs").value = s.finance.costOfGoodsPct;
    $("mii-var").value = s.finance.variableCostPct;
    $("mii-fixed").value = s.finance.otherFixed;
  }

  function paintResults(r) {
    const box = $("mii-inc-results");
    const err = $("mii-inc-errors");
    if (!box) return;

    if (!r.ok) {
      if (err) {
        err.hidden = false;
        err.className = "mii-card";
        err.style.color = "#fca5a5";
        err.innerHTML = r.errors.map(escapeHtml).join("<br>");
      }
      box.innerHTML = "";
      return;
    }
    if (err) err.hidden = true;

    const confPct = Math.round(r.confidence * 100);
    let html = "";

    // Design badge + significance
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;">' +
      '<span class="mii-badge ' +
      (r.designType === "randomized" ? "mii-badge--live" : "mii-badge--demo") +
      '">' +
      (r.designType === "randomized" ? "Randomized experiment" : "Observational comparison") +
      "</span>" +
      '<span class="mii-badge mii-badge--info">' +
      confPct +
      "% confidence</span>" +
      (r.stats.significant
        ? '<span class="mii-badge mii-badge--live">Significant conversion lift</span>'
        : '<span class="mii-badge mii-badge--demo">Not significant at ' + confPct + "%</span>") +
      "</div>";

    if (r.warnings.length) {
      html +=
        '<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px;font-size:0.85rem;color:#fde68a;margin-bottom:12px;">' +
        r.warnings.map(function (w) {
          return "• " + escapeHtml(w);
        }).join("<br>") +
        "</div>";
    }

    // KPI row
    html +=
      '<div class="mii-grid mii-grid-4">' +
      miniKpi("Treatment CVR", pct(r.conversion.rateT)) +
      miniKpi("Control CVR", pct(r.conversion.rateC)) +
      miniKpi("Absolute lift", pct(r.conversion.absLift)) +
      miniKpi(
        "Relative lift",
        r.conversion.relLift === Infinity ? "∞" : pct(r.conversion.relLift)
      ) +
      "</div></div>";

    // Conversion detail
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Conversion incrementality</h2>' +
      '<div class="mii-table-wrap" style="margin-top:12px;"><table class="mii-table"><tbody>' +
      row("Estimated incremental conversions", numFmt(r.conversion.incrementalConversions, 1)) +
      row(
        "95% CI (approx.) for absolute lift",
        pct(r.conversion.absLiftCi.low) + " to " + pct(r.conversion.absLiftCi.high)
      ) +
      row(
        "CI for incremental conversions",
        numFmt(r.conversion.incrementalConversionsCi.low, 1) +
          " to " +
          numFmt(r.conversion.incrementalConversionsCi.high, 1)
      ) +
      row("Z-score", numFmt(r.stats.z, 3)) +
      row("P-value (two-tailed)", numFmt(r.stats.pValue, 4)) +
      "</tbody></table></div></div>";

    // Revenue
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Revenue incrementality</h2>' +
      '<p class="mii-card-subtitle">' +
      escapeHtml(r.revenue.method) +
      "</p>" +
      '<div class="mii-table-wrap" style="margin-top:12px;"><table class="mii-table"><tbody>' +
      row("Control revenue / eligible unit", money(r.groups.control.arpu)) +
      row("Counterfactual treatment revenue", money(r.revenue.counterfactualRevT)) +
      row("Observed treatment revenue", money(r.groups.treatment.revenue)) +
      row("Estimated incremental revenue", money(r.revenue.incrementalRevenue)) +
      row(
        "Approx. CI for incremental revenue",
        money(r.revenue.incrementalRevenueCi.low) +
          " to " +
          money(r.revenue.incrementalRevenueCi.high)
      ) +
      "</tbody></table></div>" +
      '<p class="mii-text-soft" style="margin:10px 0 0;font-size:0.8rem;">' +
      escapeHtml(r.revenue.incrementalRevenueCi.note) +
      "</p></div>";

    // Finance
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Financial contribution</h2>' +
      '<div class="mii-table-wrap" style="margin-top:12px;"><table class="mii-table"><tbody>' +
      row("Gross incremental revenue", money(r.finance.grossRevenueIncremental)) +
      row(
        "Net incremental revenue (after COGS " + pct(r.finance.cogsPct, 0) + ")",
        money(r.finance.netRevenueIncremental)
      ) +
      row(
        "Incremental contribution (after var. " + pct(r.finance.variableCostPct, 0) + ")",
        money(r.finance.contributionIncremental)
      ) +
      row("Marketing investment", money(r.groups.treatment.investment)) +
      row("Other fixed allocated", money(r.finance.otherFixed)) +
      row("Incremental profit", money(r.finance.incrementalProfit)) +
      row(
        "Incremental ROAS (iROAS)",
        r.finance.iROAS == null
          ? "Not shown (incremental revenue ≤ 0 or no spend)"
          : numFmt(r.finance.iROAS, 2) + "×"
      ) +
      row(
        "Cost per incremental conversion",
        r.finance.costPerIncConv == null
          ? "Not shown (incremental conversions ≤ 0 or no spend)"
          : money(r.finance.costPerIncConv)
      ) +
      "</tbody></table></div></div>";

    // Persist last result for dashboard hook
    try {
      sessionStorage.setItem(
        "mii_last_incrementality",
        JSON.stringify({
          at: r.calculatedAt,
          absLift: r.conversion.absLift,
          incConv: r.conversion.incrementalConversions,
          incRev: r.revenue.incrementalRevenue,
          iROAS: r.finance.iROAS,
          significant: r.stats.significant,
          designType: r.designType
        })
      );
    } catch (e) {}

    box.innerHTML = html;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function miniKpi(label, value) {
    return (
      '<div style="background:var(--mii-bg);border-radius:10px;padding:12px;">' +
      '<div style="font-size:1.15rem;font-weight:800;">' +
      escapeHtml(value) +
      '</div><div class="mii-kpi-label">' +
      escapeHtml(label) +
      "</div></div>"
    );
  }

  function row(label, value) {
    return (
      "<tr><td><strong>" +
      escapeHtml(label) +
      "</strong></td><td>" +
      escapeHtml(String(value)) +
      "</td></tr>"
    );
  }

  function wire(container) {
    const run = $("mii-inc-run");
    if (run) {
      run.addEventListener("click", function () {
        const result = calculate(readInputs());
        paintResults(result);
      });
    }
    const sample = $("mii-inc-sample");
    if (sample) {
      sample.addEventListener("click", function () {
        fillSample();
        paintResults(calculate(readInputs()));
      });
    }
  }

  /* ---------- Public ---------- */
  MII.Incrementality.calculate = calculate;
  MII.Incrementality.render = render;
  MII.Incrementality.SAMPLE = SAMPLE;
  MII.Incrementality.runSelfTests = runSelfTests;
})();
