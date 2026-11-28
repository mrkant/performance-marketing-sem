/**
 * Marketing Incrementality Intelligence — Budget Optimizer
 * Namespace: window.MII.Optimizer
 *
 * Principles:
 *  - Do not recommend spend solely from historical ROAS.
 *  - Constrained optimisation only when response-curve parameters exist.
 *  - Otherwise: transparent what-if scenarios with explicit assumptions.
 *  - Integrate spend baselines from Investment Tracker when available.
 *  - Uncertainty and measurement confidence are first-class inputs.
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Optimizer = MII.Optimizer || {};

  /* ---------- Response curve: concave power / Hill-like marginal ---------- */
  /**
   * Expected incremental outcome from spend x given curve params:
   *   response(x) = a * (1 - exp(-b * x))     saturating exponential
   * Marginal at x: a * b * exp(-b * x)
   * Historical ROAS is NOT used as the objective.
   */
  function responseSatExp(x, a, b) {
    x = Math.max(0, x);
    a = Math.max(0, a);
    b = Math.max(1e-12, b);
    return a * (1 - Math.exp(-b * x));
  }

  function marginalSatExp(x, a, b) {
    x = Math.max(0, x);
    a = Math.max(0, a);
    b = Math.max(1e-12, b);
    return a * b * Math.exp(-b * x);
  }

  /**
   * Greedy equalise marginal returns under box constraints.
   * channels: [{ id, spend, min, max, a, b, confidence }]
   * Returns new allocation summing to totalBudget (as far as constraints allow).
   */
  function optimizeAllocation(channels, totalBudget, steps) {
    steps = steps || 400;
    const ch = channels.map(function (c) {
      return {
        id: c.id,
        min: Math.max(0, Number(c.min) || 0),
        max: c.max != null && c.max !== "" ? Math.max(0, Number(c.max)) : Infinity,
        a: Math.max(0, Number(c.a) || 0),
        b: Math.max(1e-12, Number(c.b) || 1e-12),
        confidence: c.confidence || "low",
        spend: 0
      };
    });

    // Start at floors
    let remaining = totalBudget;
    ch.forEach(function (c) {
      c.spend = Math.min(c.min, c.max);
      remaining -= c.spend;
    });
    if (remaining < -1e-6) {
      return { ok: false, error: "Sum of minimum channel budgets exceeds total budget." };
    }

    // Greedy: add small increments to channel with highest marginal under caps
    const unit = remaining > 0 ? remaining / steps : 0;
    for (let s = 0; s < steps && remaining > 1e-8; s++) {
      let best = -1;
      let bestM = -1;
      for (let i = 0; i < ch.length; i++) {
        if (ch[i].spend >= ch[i].max - 1e-9) continue;
        if (ch[i].a <= 0) continue;
        const m = marginalSatExp(ch[i].spend, ch[i].a, ch[i].b);
        if (m > bestM) {
          bestM = m;
          best = i;
        }
      }
      if (best < 0) break;
      const add = Math.min(unit, remaining, ch[best].max - ch[best].spend);
      if (add <= 0) break;
      ch[best].spend += add;
      remaining -= add;
    }

    // If still remaining (all at max), leave unallocated
    const allocated = ch.reduce(function (s, c) {
      return s + c.spend;
    }, 0);

    return {
      ok: true,
      channels: ch,
      allocated: allocated,
      unallocated: Math.max(0, totalBudget - allocated),
      totalBudget: totalBudget
    };
  }

  function expectedOutcome(channels) {
    let rev = 0;
    channels.forEach(function (c) {
      rev += responseSatExp(c.spend, c.a, c.b);
    });
    return rev;
  }

  /* ---------- State ---------- */
  let state = {
    totalBudget: 1000000,
    horizon: "quarter",
    marginPct: 40,
    channels: [],
    mode: "whatif", // whatif | optimize
    scenarios: []
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function defaultChannelsFromTracker(investments) {
    const map = {};
    (investments || []).forEach(function (r) {
      const name = (r.channel || "Other").trim();
      if (!map[name]) map[name] = 0;
      const direct =
        Math.max(
          0,
          (Number(r.grossSpend) || 0) -
            (Number(r.discountsRebates) || 0) +
            (Number(r.agencyFees) || 0) +
            (Number(r.productionCosts) || 0)
        );
      map[name] += direct;
    });
    const names = Object.keys(map);
    if (!names.length) {
      return [
        { id: "Paid Search", spend: 200000, min: 50000, max: 400000, a: 0, b: 0.00001, confidence: "low" },
        { id: "Paid Social", spend: 150000, min: 30000, max: 300000, a: 0, b: 0.00001, confidence: "low" },
        { id: "TV / CTV", spend: 300000, min: 0, max: 600000, a: 0, b: 0.000005, confidence: "low" },
        { id: "SEO / Content", spend: 80000, min: 40000, max: 150000, a: 0, b: 0.00002, confidence: "low" },
        { id: "Email / CRM", spend: 40000, min: 20000, max: 80000, a: 0, b: 0.00005, confidence: "low" }
      ];
    }
    return names.map(function (n) {
      return {
        id: n,
        spend: map[n],
        min: 0,
        max: map[n] * 3 || 100000,
        a: 0,
        b: 0.00001,
        confidence: "low"
      };
    });
  }

  /** Suggest curve params only when user provides explicit saturation level + scale — still assumptions */
  function hasUsableCurves(channels) {
    return channels.some(function (c) {
      return Number(c.a) > 0 && Number(c.b) > 0;
    });
  }

  /* ---------- Render ---------- */
  function render(container) {
    Promise.resolve()
      .then(function () {
        if (state.channels.length) return null;
        return MII.Data.getInvestments();
      })
      .then(function (inv) {
        if (!state.channels.length) {
          state.channels = defaultChannelsFromTracker(inv || []);
          state.totalBudget = state.channels.reduce(function (s, c) {
            return s + (Number(c.spend) || 0);
          }, 0) || state.totalBudget;
        }
        paint(container);
      })
      .catch(function () {
        if (!state.channels.length) state.channels = defaultChannelsFromTracker([]);
        paint(container);
      });
  }

  function paint(container) {
    const curvesOk = hasUsableCurves(state.channels);

    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">◇</span><div>' +
      "<strong>Budget Optimizer.</strong> " +
      "Reallocation is driven by <em>response curves and constraints you enter</em>, not by ranking historical ROAS. " +
      "Without curve parameters, the tool stays in <strong>what-if scenario</strong> mode and will not claim an optimal plan. " +
      "Baselines can pull from the Investment Tracker." +
      "</div></div>";

    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Planning setup</h2>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px;">' +
      field("Total budget", "opt-budget", state.totalBudget, "number") +
      '<div><label class="mii-kpi-label">Horizon</label>' +
      '<select id="opt-horizon" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      ["month", "quarter", "year"]
        .map(function (h) {
          return (
            '<option value="' +
            h +
            '"' +
            (state.horizon === h ? " selected" : "") +
            ">" +
            h +
            "</option>"
          );
        })
        .join("") +
      "</select></div>" +
      field("Contribution margin %", "opt-margin", state.marginPct, "number") +
      "</div>" +
      '<p class="mii-text-soft" style="margin:10px 0 0;font-size:0.8rem;">Margin applies only when estimating incremental profit from curve-based expected revenue.</p></div>';

    // Channel table
    html +=
      '<div class="mii-card" style="margin-bottom:16px;padding:0;overflow:hidden;">' +
      '<div style="padding:16px 18px 0;"><h2 class="mii-card-title">Channels</h2>' +
      '<p class="mii-card-subtitle">Current spend · min/max · response curve (a, b) · measurement confidence. Leave a=0 if unknown.</p></div>' +
      '<div class="mii-table-wrap" style="border:none;margin-top:8px;"><table class="mii-table"><thead><tr>' +
      "<th>Channel</th><th>Current</th><th>Min</th><th>Max</th><th>Curve a</th><th>Curve b</th><th>Confidence</th><th></th>" +
      "</tr></thead><tbody id=\"opt-rows\">";

    state.channels.forEach(function (c, idx) {
      html += channelRow(c, idx);
    });
    html +=
      "</tbody></table></div>" +
      '<div style="padding:12px 18px 16px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="opt-add-ch">+ Channel</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="opt-reload-tracker">Reload from Investment Tracker</button>' +
      "</div></div>";

    // Mode actions
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Actions</h2>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="opt-whatif">Run what-if (manual shifts)</button>' +
      '<button type="button" class="mii-btn ' +
      (curvesOk ? "mii-btn--primary" : "mii-btn--ghost") +
      '" id="opt-optimize" ' +
      (curvesOk ? "" : "title=\"Enter curve parameters (a,b) first\"") +
      ">" +
      (curvesOk ? "Optimize under constraints" : "Optimize (needs response curves)") +
      "</button>" +
      '<button type="button" class="mii-btn mii-btn--ghost" id="opt-sensitivity">Sensitivity (±20% curves)</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="opt-export">Export scenarios</button>' +
      "</div>";

    if (!curvesOk) {
      html +=
        '<p style="margin:12px 0 0;font-size:0.85rem;color:#fde68a;">No usable response curves yet (all a=0). ' +
        "Optimisation is disabled. Use what-if scenarios or supply curve parameters from MMM / experiments.</p>";
    } else {
      html +=
        '<p style="margin:12px 0 0;font-size:0.85rem;color:var(--mii-text-muted);">Curves detected. Optimisation equalises marginal returns under min/max — still conditional on those assumptions.</p>';
    }
    html += "</div>";

    // What-if controls
    html +=
      '<div class="mii-card" id="opt-whatif-panel" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">What-if shifts</h2>' +
      '<p class="mii-card-subtitle">Percent change applied to current spend, then renormalised or clipped to min/max if “Respect constraints” is on.</p>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:10px;" id="opt-shift-grid">';
    state.channels.forEach(function (c, idx) {
      html +=
        '<div><label class="mii-kpi-label">' +
        escapeHtml(c.id) +
        ' Δ%</label><input type="number" class="opt-shift" data-idx="' +
        idx +
        '" value="0" step="1" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>';
    });
    html +=
      '</div><label style="display:block;margin-top:10px;font-size:0.85rem;color:var(--mii-text-muted);">' +
      '<input type="checkbox" id="opt-respect" checked> Respect min/max and total budget</label></div>';

    html += '<div id="opt-results"></div>';

    html += assumptionsFooter();

    container.innerHTML = html;
    wire(container);
  }

  function channelRow(c, idx) {
    return (
      "<tr>" +
      '<td><input data-f="id" data-i="' +
      idx +
      '" value="' +
      escapeHtml(c.id) +
      '" style="width:120px;padding:6px;border-radius:6px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></td>' +
      numCell(idx, "spend", c.spend) +
      numCell(idx, "min", c.min) +
      numCell(idx, "max", c.max) +
      numCell(idx, "a", c.a) +
      numCell(idx, "b", c.b) +
      '<td><select data-f="confidence" data-i="' +
      idx +
      '" style="padding:6px;border-radius:6px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      ["low", "medium", "high"]
        .map(function (v) {
          return (
            '<option value="' +
            v +
            '"' +
            (c.confidence === v ? " selected" : "") +
            ">" +
            v +
            "</option>"
          );
        })
        .join("") +
      '</select></td>' +
      '<td><button type="button" class="mii-btn mii-btn--ghost mii-btn--sm opt-del" data-i="' +
      idx +
      '">×</button></td></tr>'
    );
  }

  function numCell(idx, field, val) {
    return (
      '<td><input type="number" step="any" data-f="' +
      field +
      '" data-i="' +
      idx +
      '" value="' +
      escapeHtml(val) +
      '" style="width:90px;padding:6px;border-radius:6px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></td>'
    );
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
      '" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function assumptionsFooter() {
    return (
      '<div class="mii-card">' +
      '<h2 class="mii-card-title">Assumptions &amp; uncertainty</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.65;">' +
      "<li><strong>No ROAS ranking:</strong> channels are never ordered by historical ROAS alone.</li>" +
      "<li><strong>Curves are assumptions:</strong> parameters a,b should come from experiments or a validated MMM — not from this optimiser inventing them.</li>" +
      "<li><strong>Confidence labels</strong> are qualitative; low-confidence curves should not drive large reallocation without further measurement.</li>" +
      "<li><strong>Integration:</strong> current spend can load from Investment Tracker; curve shapes may be informed by the MMM workbench (exported coefficients are not auto-imported as causal curves).</li>" +
      "<li>Expected incremental profit uses your margin % on curve-based expected revenue minus spend delta — illustrative under the stated response functions.</li>" +
      "</ul></div>"
    );
  }

  function readChannelsFromDom() {
    const inputs = document.querySelectorAll("#opt-rows input, #opt-rows select");
    const byIdx = {};
    inputs.forEach(function (el) {
      const i = parseInt(el.getAttribute("data-i"), 10);
      const f = el.getAttribute("data-f");
      if (!byIdx[i]) byIdx[i] = {};
      byIdx[i][f] = el.value;
    });
    state.channels = Object.keys(byIdx)
      .sort(function (a, b) {
        return a - b;
      })
      .map(function (k) {
        const r = byIdx[k];
        return {
          id: r.id || "Channel",
          spend: parseFloat(r.spend) || 0,
          min: parseFloat(r.min) || 0,
          max: r.max === "" || r.max == null ? Infinity : parseFloat(r.max),
          a: parseFloat(r.a) || 0,
          b: parseFloat(r.b) || 0,
          confidence: r.confidence || "low"
        };
      });
    const b = document.getElementById("opt-budget");
    const m = document.getElementById("opt-margin");
    const h = document.getElementById("opt-horizon");
    if (b) state.totalBudget = parseFloat(b.value) || 0;
    if (m) state.marginPct = parseFloat(m.value) || 0;
    if (h) state.horizon = h.value;
  }

  function wire(container) {
    document.getElementById("opt-add-ch").addEventListener("click", function () {
      readChannelsFromDom();
      state.channels.push({
        id: "New channel",
        spend: 0,
        min: 0,
        max: 100000,
        a: 0,
        b: 0.00001,
        confidence: "low"
      });
      paint(container);
    });

    document.querySelectorAll(".opt-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        readChannelsFromDom();
        state.channels.splice(parseInt(btn.getAttribute("data-i"), 10), 1);
        paint(container);
      });
    });

    document.getElementById("opt-reload-tracker").addEventListener("click", function () {
      MII.Data.getInvestments().then(function (inv) {
        state.channels = defaultChannelsFromTracker(inv || []);
        state.totalBudget =
          state.channels.reduce(function (s, c) {
            return s + c.spend;
          }, 0) || state.totalBudget;
        paint(container);
      });
    });

    document.getElementById("opt-whatif").addEventListener("click", function () {
      readChannelsFromDom();
      runWhatIf(container);
    });

    document.getElementById("opt-optimize").addEventListener("click", function () {
      readChannelsFromDom();
      if (!hasUsableCurves(state.channels)) {
        alert("Enter at least one channel with curve parameter a > 0 before optimising.");
        return;
      }
      runOptimize(container);
    });

    document.getElementById("opt-sensitivity").addEventListener("click", function () {
      readChannelsFromDom();
      runSensitivity(container);
    });

    document.getElementById("opt-export").addEventListener("click", function () {
      exportScenarios();
    });
  }

  function baselineOutcome(channels) {
    // Only meaningful if curves exist; still reported as model-based
    return expectedOutcome(
      channels.map(function (c) {
        return { spend: c.spend, a: c.a, b: c.b };
      })
    );
  }

  function runWhatIf(container) {
    const shifts = [];
    document.querySelectorAll(".opt-shift").forEach(function (el) {
      shifts[parseInt(el.getAttribute("data-idx"), 10)] = parseFloat(el.value) || 0;
    });
    const respect = document.getElementById("opt-respect").checked;

    let next = state.channels.map(function (c, i) {
      const factor = 1 + (shifts[i] || 0) / 100;
      let spend = c.spend * factor;
      if (respect) {
        spend = Math.max(c.min, Math.min(c.max === Infinity ? spend : c.max, spend));
      }
      return Object.assign({}, c, { spend: spend });
    });

    if (respect) {
      // Scale to total budget if over
      let sum = next.reduce(function (s, c) {
        return s + c.spend;
      }, 0);
      if (sum > state.totalBudget && sum > 0) {
        const scale = state.totalBudget / sum;
        next = next.map(function (c) {
          return Object.assign({}, c, {
            spend: Math.max(c.min, c.spend * scale)
          });
        });
      }
    }

    const scenario = buildScenario("What-if manual shifts", state.channels, next);
    state.scenarios.unshift(scenario);
    paintScenarioResults(container, [scenario], "whatif");
  }

  function runOptimize(container) {
    const res = optimizeAllocation(state.channels, state.totalBudget, 500);
    if (!res.ok) {
      document.getElementById("opt-results").innerHTML =
        '<div class="mii-card"><p style="color:#fca5a5;">' +
        escapeHtml(res.error) +
        "</p></div>";
      return;
    }
    const next = res.channels.map(function (c) {
      const orig = state.channels.find(function (o) {
        return o.id === c.id;
      }) || {};
      return {
        id: c.id,
        spend: c.spend,
        min: c.min,
        max: c.max,
        a: c.a,
        b: c.b,
        confidence: orig.confidence || "low"
      };
    });
    const scenario = buildScenario("Constrained marginal-return allocation", state.channels, next);
    scenario.unallocated = res.unallocated;
    state.scenarios.unshift(scenario);
    paintScenarioResults(container, [scenario], "optimize");
  }

  function runSensitivity(container) {
    if (!hasUsableCurves(state.channels)) {
      alert("Sensitivity on curves requires a > 0 on at least one channel.");
      return;
    }
    const variants = [
      { label: "Curves −20% (a)", scale: 0.8 },
      { label: "Base curves", scale: 1 },
      { label: "Curves +20% (a)", scale: 1.2 }
    ];
    const scenarios = variants.map(function (v) {
      const scaled = state.channels.map(function (c) {
        return Object.assign({}, c, { a: c.a * v.scale });
      });
      const res = optimizeAllocation(scaled, state.totalBudget, 400);
      const next = (res.ok ? res.channels : scaled).map(function (c, i) {
        return Object.assign({}, state.channels[i], {
          spend: res.ok ? c.spend : state.channels[i].spend,
          a: scaled[i].a
        });
      });
      const sc = buildScenario(v.label, state.channels, next);
      sc.curveScale = v.scale;
      return sc;
    });
    state.scenarios = scenarios.concat(state.scenarios).slice(0, 12);
    paintScenarioResults(container, scenarios, "sensitivity");
  }

  function buildScenario(name, before, after) {
    const baseOut = baselineOutcome(before);
    const newOut = baselineOutcome(after);
    const deltaRev = newOut - baseOut;
    const deltaSpend =
      after.reduce(function (s, c) {
        return s + c.spend;
      }, 0) -
      before.reduce(function (s, c) {
        return s + c.spend;
      }, 0);
    const margin = state.marginPct / 100;
    const deltaProfit = deltaRev * margin - deltaSpend;
    return {
      name: name,
      at: new Date().toISOString(),
      horizon: state.horizon,
      before: before.map(function (c) {
        return { id: c.id, spend: c.spend, confidence: c.confidence };
      }),
      after: after.map(function (c) {
        return {
          id: c.id,
          spend: c.spend,
          confidence: c.confidence,
          a: c.a,
          b: c.b
        };
      }),
      expectedDeltaRevenue: hasUsableCurves(after) ? deltaRev : null,
      expectedDeltaProfit: hasUsableCurves(after) ? deltaProfit : null,
      curvesUsed: hasUsableCurves(after)
    };
  }

  function paintScenarioResults(container, scenarios, mode) {
    // Re-read not needed; append results panel only
    let html = "";
    scenarios.forEach(function (sc) {
      html +=
        '<div class="mii-card" style="margin-bottom:16px;">' +
        '<div class="mii-card-header"><div><h2 class="mii-card-title">' +
        escapeHtml(sc.name) +
        '</h2><p class="mii-card-subtitle">Horizon: ' +
        escapeHtml(sc.horizon) +
        " · " +
        (sc.curvesUsed
          ? "Curve-based expectation"
          : "Allocation only — no outcome claim without curves") +
        "</p></div>" +
        '<span class="mii-badge mii-badge--info">' +
        escapeHtml(mode) +
        "</span></div>";

      if (sc.curvesUsed) {
        html +=
          '<div class="mii-grid mii-grid-3" style="margin-bottom:12px;">' +
          miniKpi("Expected Δ revenue", money(sc.expectedDeltaRevenue)) +
          miniKpi("Expected Δ profit", money(sc.expectedDeltaProfit)) +
          miniKpi(
            "Uncertainty",
            sc.after.some(function (c) {
              return c.confidence === "low";
            })
              ? "High (low-confidence curves)"
              : "See confidence column"
          ) +
          "</div>";
      } else {
        html +=
          '<p class="mii-text-muted" style="font-size:0.9rem;">Outcomes not estimated — response curves missing. Showing allocation comparison only.</p>';
      }

      html +=
        '<div class="mii-table-wrap"><table class="mii-table"><thead><tr>' +
        "<th>Channel</th><th>Before</th><th>After</th><th>Δ</th><th>Confidence</th></tr></thead><tbody>";
      sc.after.forEach(function (a, i) {
        const b = sc.before[i] || { spend: 0 };
        const d = a.spend - b.spend;
        html +=
          "<tr><td>" +
          escapeHtml(a.id) +
          "</td><td>" +
          money(b.spend) +
          "</td><td>" +
          money(a.spend) +
          "</td><td>" +
          (d >= 0 ? "+" : "") +
          money(d) +
          "</td><td>" +
          escapeHtml(a.confidence || "—") +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
      if (sc.unallocated > 0) {
        html +=
          '<p class="mii-text-soft" style="margin:10px 0 0;font-size:0.85rem;">Unallocated under caps: ' +
          money(sc.unallocated) +
          "</p>";
      }
      html += "</div>";
    });

    // Chart comparison for first scenario
    if (scenarios[0]) {
      html =
        '<div class="mii-card" style="margin-bottom:16px;">' +
        '<h2 class="mii-card-title">Allocation comparison</h2>' +
        '<div class="mii-chart-box"><canvas id="opt-chart"></canvas></div></div>' +
        html;
    }

    document.getElementById("opt-results").innerHTML = html;
    if (scenarios[0]) {
      requestAnimationFrame(function () {
        drawCompare(scenarios[0]);
      });
    }
  }

  function miniKpi(label, value) {
    return (
      '<div style="background:var(--mii-bg);border-radius:10px;padding:12px;">' +
      '<div style="font-size:1.1rem;font-weight:800;">' +
      escapeHtml(String(value)) +
      '</div><div class="mii-kpi-label">' +
      escapeHtml(label) +
      "</div></div>"
    );
  }

  let chartRef = null;
  function drawCompare(sc) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("opt-chart");
    if (!canvas) return;
    if (chartRef) {
      chartRef.destroy();
      chartRef = null;
    }
    chartRef = new Chart(canvas, {
      type: "bar",
      data: {
        labels: sc.after.map(function (c) {
          return c.id;
        }),
        datasets: [
          {
            label: "Before",
            data: sc.before.map(function (c) {
              return c.spend;
            }),
            backgroundColor: "rgba(148,163,184,0.5)"
          },
          {
            label: "After",
            data: sc.after.map(function (c) {
              return c.spend;
            }),
            backgroundColor: "rgba(59,130,246,0.75)"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#94a3b8" } } },
        scales: {
          x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } }
        }
      }
    });
  }

  function exportScenarios() {
    const payload = {
      app: "MII Budget Optimizer",
      disclaimer:
        "Scenarios are conditional on user-entered constraints and response curves. Not based on historical ROAS ranking. Not guaranteed outcomes.",
      totalBudget: state.totalBudget,
      horizon: state.horizon,
      marginPct: state.marginPct,
      scenarios: state.scenarios,
      exportedAt: new Date().toISOString()
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    );
    a.download = "budget-scenarios-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- Tests ---------- */
  function runSelfTests() {
    const tests = [];
    // Marginal decreases with spend
    const m0 = marginalSatExp(0, 1000, 0.001);
    const m1 = marginalSatExp(1000, 1000, 0.001);
    tests.push({ name: "Diminishing marginal", pass: m1 < m0 });

    // Optimiser respects mins
    const res = optimizeAllocation(
      [
        { id: "A", min: 100, max: 500, a: 1000, b: 0.01 },
        { id: "B", min: 50, max: 500, a: 100, b: 0.01 }
      ],
      300,
      100
    );
    tests.push({
      name: "Respects minimums",
      pass: res.ok && res.channels[0].spend >= 100 - 1e-6 && res.channels[1].spend >= 50 - 1e-6
    });

    // Sum mins > budget fails
    const bad = optimizeAllocation(
      [
        { id: "A", min: 200, max: 500, a: 1, b: 0.01 },
        { id: "B", min: 200, max: 500, a: 1, b: 0.01 }
      ],
      100,
      50
    );
    tests.push({ name: "Detects infeasible mins", pass: !bad.ok });

    // hasUsableCurves
    tests.push({
      name: "Curves detection",
      pass: hasUsableCurves([{ a: 10, b: 0.1 }]) && !hasUsableCurves([{ a: 0, b: 0.1 }])
    });

    // Response at 0 is 0
    tests.push({ name: "Zero spend zero response", pass: responseSatExp(0, 100, 0.01) === 0 });

    return tests;
  }

  MII.Optimizer.render = render;
  MII.Optimizer.optimizeAllocation = optimizeAllocation;
  MII.Optimizer.responseSatExp = responseSatExp;
  MII.Optimizer.marginalSatExp = marginalSatExp;
  MII.Optimizer.runSelfTests = runSelfTests;
})();
