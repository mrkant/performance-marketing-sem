/**
 * Free A/B Testing Calculator
 * Namespace: window.STH.ABTesting
 *
 * Two-proportion z-test, p-value, confidence levels,
 * relative lift, sample-size estimation.
 * Clear "winner / inconclusive" messaging.
 * No claim that statistical significance = business significance.
 */
(function () {
  "use strict";

  const STH = window.STH || {};
  window.STH = STH;
  STH.ABTesting = STH.ABTesting || {};

  /* ---------- Math helpers ---------- */

  /** Standard normal CDF (Abramowitz & Stegun approximation) */
  function normCdf(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1 / (1 + p * Math.abs(x));
    const y =
      1 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
    return 0.5 * (1 + sign * y);
  }

  /** Inverse normal CDF approximation (for critical z values) */
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    // Rational approximation (Beasley-Springer-Moro style simplified)
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
    const plow = 0.02425;
    const phigh = 1 - plow;
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

  function criticalZ(confidence) {
    // two-tailed
    const alpha = 1 - confidence;
    return normInv(1 - alpha / 2);
  }

  /**
   * Two-proportion z-test (pooled)
   * Returns z, pValue (two-tailed), significant at given confidence
   */
  function twoProportionTest(visitorsA, convA, visitorsB, convB, confidence) {
    const n1 = visitorsA;
    const n2 = visitorsB;
    const x1 = convA;
    const x2 = convB;

    if (n1 <= 0 || n2 <= 0) {
      return { error: "Visitors must be greater than zero for both variations." };
    }
    if (x1 < 0 || x2 < 0 || x1 > n1 || x2 > n2) {
      return { error: "Conversions cannot exceed visitors or be negative." };
    }

    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const pPool = (x1 + x2) / (n1 + n2);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));

    if (se === 0) {
      // No variance (identical rates or zero conversions everywhere)
      return {
        p1: p1,
        p2: p2,
        absDiff: p2 - p1,
        relLift: p1 === 0 ? null : (p2 - p1) / p1,
        z: 0,
        pValue: 1,
        significant: false,
        winner: "inconclusive",
        se: 0
      };
    }

    const z = (p2 - p1) / se;
    const pValue = 2 * (1 - normCdf(Math.abs(z)));
    const zCrit = criticalZ(confidence);
    const significant = Math.abs(z) >= zCrit;

    let winner = "inconclusive";
    if (significant) {
      winner = p2 > p1 ? "B" : "A";
    }

    return {
      p1: p1,
      p2: p2,
      absDiff: p2 - p1,
      relLift: p1 === 0 ? (p2 > 0 ? Infinity : 0) : (p2 - p1) / p1,
      z: z,
      pValue: pValue,
      significant: significant,
      winner: winner,
      se: se,
      zCrit: zCrit
    };
  }

  /**
   * Sample size per variation for detecting a relative lift
   * (standard formula for two proportions)
   */
  function sampleSizePerVariation(baselineRate, mdeRelative, power, confidence) {
    // baselineRate = p1, mdeRelative = relative improvement we want to detect
    // e.g. baseline 0.05, mde 0.20 means detect 20% relative lift → p2 = 0.06
    if (baselineRate <= 0 || baselineRate >= 1) return null;
    if (mdeRelative <= 0) return null;

    const p1 = baselineRate;
    const p2 = Math.min(0.999, p1 * (1 + mdeRelative));
    const pBar = (p1 + p2) / 2;

    const zAlpha = criticalZ(confidence); // two-sided
    const zBeta = normInv(power); // one-sided for power

    const numerator =
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    const n = Math.pow(numerator / (p2 - p1), 2);
    return Math.ceil(n);
  }

  /* ---------- Formatting ---------- */
  function pct(x, digits) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    return (x * 100).toFixed(digits == null ? 2 : digits) + "%";
  }

  function num(x, digits) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    return Number(x).toFixed(digits == null ? 4 : digits);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Core calculation from form ---------- */
  function calculate(inputs) {
    const nA = parseInt(inputs.visitorsA, 10);
    const cA = parseInt(inputs.conversionsA, 10);
    const nB = parseInt(inputs.visitorsB, 10);
    const cB = parseInt(inputs.conversionsB, 10);
    const confidence = parseFloat(inputs.confidence) || 0.95;

    const warnings = [];

    if (isNaN(nA) || isNaN(cA) || isNaN(nB) || isNaN(cB)) {
      return { error: "Please enter valid numbers for all visitor and conversion fields." };
    }
    if (nA < 1 || nB < 1) {
      return { error: "Visitors must be at least 1 for both variations." };
    }
    if (cA < 0 || cB < 0) {
      return { error: "Conversions cannot be negative." };
    }
    if (cA > nA || cB > nB) {
      return { error: "Conversions cannot exceed visitors." };
    }

    // Small sample warnings
    if (nA < 100 || nB < 100) {
      warnings.push("Small sample sizes (< 100 visitors). Results may be unstable.");
    }
    if (cA < 5 || cB < 5) {
      warnings.push("Very few conversions (< 5). The normal approximation is less reliable.");
    }

    const test = twoProportionTest(nA, cA, nB, cB, confidence);
    if (test.error) return { error: test.error };

    // Sample size estimate (using control rate and a 20% relative MDE as default illustration)
    const baseline = test.p1;
    const mdeOptions = [0.1, 0.2, 0.3, 0.5];
    const sampleSizes = mdeOptions.map(function (mde) {
      return {
        mdeRelative: mde,
        perVariation: sampleSizePerVariation(baseline, mde, 0.8, confidence)
      };
    });

    // Additional visitors needed to reach illustrative 20% MDE sample size
    const target20 = sampleSizePerVariation(baseline, 0.2, 0.8, confidence);
    let additionalA = null;
    let additionalB = null;
    if (target20 != null) {
      additionalA = Math.max(0, target20 - nA);
      additionalB = Math.max(0, target20 - nB);
    }

    return {
      visitorsA: nA,
      conversionsA: cA,
      visitorsB: nB,
      conversionsB: cB,
      confidence: confidence,
      rateA: test.p1,
      rateB: test.p2,
      absDiff: test.absDiff,
      relLift: test.relLift,
      z: test.z,
      pValue: test.pValue,
      significant: test.significant,
      winner: test.winner,
      zCrit: test.zCrit,
      warnings: warnings,
      sampleSizes: sampleSizes,
      additionalA: additionalA,
      additionalB: additionalB,
      calculatedAt: new Date().toISOString()
    };
  }

  /* ---------- Render ---------- */
  function render(result) {
    const container = document.getElementById("sth-ab-results");
    if (!container) return;

    if (result.error) {
      container.innerHTML =
        '<div class="sth-alert sth-alert--error">' + escapeHtml(result.error) + "</div>";
      container.hidden = false;
      return;
    }

    const confPct = Math.round(result.confidence * 100);
    let winnerHtml = "";
    if (result.winner === "inconclusive") {
      winnerHtml =
        '<div class="sth-alert sth-alert--warning" style="margin-bottom:0;">' +
        "<strong>Inconclusive</strong> — The observed difference is not statistically significant at the " +
        confPct +
        "% confidence level. Do not declare a winner yet." +
        "</div>";
    } else {
      const winLabel = result.winner === "A" ? "Variation A" : "Variation B";
      winnerHtml =
        '<div class="sth-alert sth-alert--success" style="margin-bottom:0;">' +
        "<strong>" +
        winLabel +
        " is statistically significant</strong> at the " +
        confPct +
        "% confidence level. " +
        "Remember: statistical significance ≠ practical business significance." +
        "</div>";
    }

    let warningsHtml = "";
    if (result.warnings.length) {
      warningsHtml =
        '<div class="sth-alert sth-alert--warning">' +
        result.warnings.map(function (w) {
          return "• " + escapeHtml(w);
        }).join("<br>") +
        "</div>";
    }

    // Comparison bars
    const maxRate = Math.max(result.rateA, result.rateB, 0.01);
    const barA = Math.round((result.rateA / maxRate) * 100);
    const barB = Math.round((result.rateB / maxRate) * 100);

    let html = "";

    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px;">' +
      "<div><h2 style=\"margin:0 0 4px;font-size:1.25rem;color:var(--sth-navy);\">Results</h2>" +
      '<p style="margin:0;font-size:0.85rem;color:var(--sth-text-muted);">' +
      new Date(result.calculatedAt).toLocaleString() +
      "</p></div>" +
      '<div class="sth-actions-bar" style="margin:0;">' +
      '<button type="button" class="sth-btn sth-btn--outline sth-btn--sm" id="sth-ab-csv">Download CSV</button>' +
      '<button type="button" class="sth-btn sth-btn--ghost sth-btn--sm" id="sth-ab-print">Print / PDF</button>' +
      "</div></div>" +
      winnerHtml +
      warningsHtml +
      "</div>";

    // Rates comparison
    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<h3 style="margin:0 0 16px;font-size:1.05rem;color:var(--sth-navy);">Conversion rates</h3>' +
      '<div style="margin-bottom:14px;">' +
      '<div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:4px;">' +
      "<span><strong>A</strong> — " +
      result.conversionsA +
      " / " +
      result.visitorsA +
      "</span><span style=\"font-weight:800;color:var(--sth-navy);\">" +
      pct(result.rateA) +
      "</span></div>" +
      '<div style="height:12px;background:#e2e8f0;border-radius:6px;overflow:hidden;">' +
      '<div style="height:100%;width:' +
      barA +
      '%;background:#3b82f6;border-radius:6px;"></div></div></div>' +
      '<div>' +
      '<div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:4px;">' +
      "<span><strong>B</strong> — " +
      result.conversionsB +
      " / " +
      result.visitorsB +
      "</span><span style=\"font-weight:800;color:var(--sth-navy);\">" +
      pct(result.rateB) +
      "</span></div>" +
      '<div style="height:12px;background:#e2e8f0;border-radius:6px;overflow:hidden;">' +
      '<div style="height:100%;width:' +
      barB +
      '%;background:#10b981;border-radius:6px;"></div></div></div>' +
      "</div>";

    // Key metrics table
    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--sth-navy);">Key metrics</h3>' +
      '<div class="sth-table-wrap"><table class="sth-table"><tbody>' +
      row("Conversion rate A", pct(result.rateA)) +
      row("Conversion rate B", pct(result.rateB)) +
      row("Absolute difference (B − A)", pct(result.absDiff)) +
      row(
        "Relative improvement",
        result.relLift === Infinity
          ? "∞ (A had 0%)"
          : pct(result.relLift)
      ) +
      row("Z-score", num(result.z, 3)) +
      row("P-value (two-tailed)", num(result.pValue, 4)) +
      row("Confidence level", confPct + "%") +
      row("Critical |Z|", num(result.zCrit, 3)) +
      row(
        "Statistically significant?",
        result.significant ? "Yes" : "No"
      ) +
      row(
        "Winner",
        result.winner === "inconclusive"
          ? "Inconclusive"
          : "Variation " + result.winner
      ) +
      "</tbody></table></div></div>";

    // Sample size guidance
    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<h3 style="margin:0 0 8px;font-size:1.05rem;color:var(--sth-navy);">Sample-size guidance</h3>' +
      '<p style="margin:0 0 14px;font-size:0.9rem;color:var(--sth-text-muted);">' +
      "Approximate visitors needed <em>per variation</em> to detect a relative lift from the observed control rate (" +
      pct(result.rateA) +
      "), at 80% power and " +
      confPct +
      "% confidence. These are planning estimates, not guarantees." +
      "</p>" +
      '<div class="sth-table-wrap"><table class="sth-table"><thead><tr>' +
      "<th>Relative MDE</th><th>Visitors per variation</th></tr></thead><tbody>";

    result.sampleSizes.forEach(function (s) {
      html +=
        "<tr><td>" +
        Math.round(s.mdeRelative * 100) +
        "%</td><td>" +
        (s.perVariation != null ? s.perVariation.toLocaleString() : "—") +
        "</td></tr>";
    });
    html += "</tbody></table></div>";

    if (result.additionalA != null) {
      html +=
        '<p style="margin:14px 0 0;font-size:0.9rem;color:var(--sth-text-muted);">' +
        "To reach the ~20% relative MDE sample size from current traffic: " +
        "Variation A needs ~" +
        result.additionalA.toLocaleString() +
        " more visitors; Variation B needs ~" +
        result.additionalB.toLocaleString() +
        " more." +
        "</p>";
    }
    html += "</div>";

    // Explanation
    html +=
      '<div class="sth-card" style="background:#f8fafc;">' +
      '<h3 style="margin:0 0 10px;font-size:1.05rem;color:var(--sth-navy);">How to read these results</h3>' +
      '<ul style="margin:0;padding-left:18px;font-size:0.9rem;color:var(--sth-text-muted);line-height:1.65;">' +
      "<li><strong>P-value</strong> — probability of seeing a difference at least this large if the true rates were identical. Lower is stronger evidence against “no difference”.</li>" +
      "<li><strong>Statistical significance</strong> — the p-value is below the threshold for your chosen confidence level (e.g. 0.05 for 95%).</li>" +
      "<li><strong>Practical significance</strong> — whether the lift is large enough to matter for revenue, cost or user experience. The calculator does not decide this.</li>" +
      "<li><strong>Multiple tests</strong> — running many experiments or peeking repeatedly inflates false-positive risk. Plan sample size in advance when possible.</li>" +
      "</ul></div>";

    container.innerHTML = html;
    container.hidden = false;
    container.scrollIntoView({ behavior: "smooth", block: "start" });

    // Wire export / print
    const csvBtn = document.getElementById("sth-ab-csv");
    if (csvBtn) {
      csvBtn.addEventListener("click", function () {
        exportCsv(result);
      });
    }
    const printBtn = document.getElementById("sth-ab-print");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        window.print();
      });
    }
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

  function exportCsv(result) {
    const rows = [
      ["Metric", "Value"],
      ["Visitors A", result.visitorsA],
      ["Conversions A", result.conversionsA],
      ["Conversion rate A", pct(result.rateA)],
      ["Visitors B", result.visitorsB],
      ["Conversions B", result.conversionsB],
      ["Conversion rate B", pct(result.rateB)],
      ["Absolute difference", pct(result.absDiff)],
      [
        "Relative improvement",
        result.relLift === Infinity ? "Infinity" : pct(result.relLift)
      ],
      ["Z-score", num(result.z, 4)],
      ["P-value", num(result.pValue, 6)],
      ["Confidence level", Math.round(result.confidence * 100) + "%"],
      ["Significant", result.significant ? "Yes" : "No"],
      ["Winner", result.winner]
    ];

    const csv = rows
      .map(function (r) {
        return r
          .map(function (c) {
            return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
          })
          .join(",");
      })
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "ab-test-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- Built-in test cases (for verification) ---------- */
  function runSelfTests() {
    const tests = [];

    // Classic example: clear winner
    let r = twoProportionTest(1000, 100, 1000, 150, 0.95);
    tests.push({
      name: "Clear lift B",
      pass: r.significant === true && r.winner === "B" && r.pValue < 0.01
    });

    // No difference
    r = twoProportionTest(1000, 100, 1000, 100, 0.95);
    tests.push({
      name: "Identical rates",
      pass: r.significant === false && r.winner === "inconclusive" && r.pValue > 0.9
    });

    // Small sample — should often be inconclusive
    r = twoProportionTest(50, 5, 50, 8, 0.95);
    tests.push({
      name: "Small sample",
      pass: typeof r.pValue === "number"
    });

    // Zero conversions
    r = twoProportionTest(500, 0, 500, 0, 0.95);
    tests.push({
      name: "Zero conversions",
      pass: r.significant === false
    });

    return tests;
  }

  /* ---------- UI ---------- */
  function onCalculate() {
    const inputs = {
      visitorsA: document.getElementById("sth-visitors-a").value,
      conversionsA: document.getElementById("sth-conversions-a").value,
      visitorsB: document.getElementById("sth-visitors-b").value,
      conversionsB: document.getElementById("sth-conversions-b").value,
      confidence: document.getElementById("sth-confidence").value
    };
    const result = calculate(inputs);
    render(result);
  }

  function init() {
    const btn = document.getElementById("sth-ab-run");
    if (btn) btn.addEventListener("click", onCalculate);

    // Enter key on inputs
    ["sth-visitors-a", "sth-conversions-a", "sth-visitors-b", "sth-conversions-b"].forEach(
      function (id) {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              onCalculate();
            }
          });
        }
      }
    );

    // Optional: expose self-tests in console
    STH.ABTesting.runSelfTests = runSelfTests;
    STH.ABTesting.calculate = calculate;
    STH.ABTesting.twoProportionTest = twoProportionTest;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
