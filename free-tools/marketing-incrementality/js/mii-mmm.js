/**
 * Marketing Incrementality Intelligence — Marketing Mix Modelling workbench
 * Namespace: window.MII.MMM
 *
 * Browser capabilities (transparent, limited):
 *  - Time-series input management (weekly/monthly)
 *  - Adstock + diminishing-returns transforms
 *  - Ordinary least squares (OLS) with multiple regressors
 *  - Basic diagnostics (R², residual summary, sample-size gates, collinearity flags)
 *  - Export of inputs / design matrix / coefficient table for external engines
 *
 * This is NOT a production MMM engine. Hierarchical Bayesian MMM, geometric
 * adstock optimisation, budget allocation under uncertainty, and proper
 * out-of-sample causal validation require dedicated statistical software
 * (e.g. Python: Robyn, PyMC-Marketing, Meridian; R: Robyn, modeltime).
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.MMM = MII.MMM || {};

  const MIN_OBS_WARN = 40;
  const MIN_OBS_HARD = 20;
  const MIN_OBS_PER_PARAM = 5;

  /* ---------- Math: matrix OLS ---------- */
  function transpose(A) {
    const m = A.length,
      n = A[0].length;
    const T = [];
    for (let j = 0; j < n; j++) {
      T[j] = [];
      for (let i = 0; i < m; i++) T[j][i] = A[i][j];
    }
    return T;
  }

  function matMul(A, B) {
    const m = A.length,
      n = B[0].length,
      p = B.length;
    const C = [];
    for (let i = 0; i < m; i++) {
      C[i] = [];
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < p; k++) s += A[i][k] * B[k][j];
        C[i][j] = s;
      }
    }
    return C;
  }

  function matVec(A, v) {
    return A.map(function (row) {
      let s = 0;
      for (let i = 0; i < row.length; i++) s += row[i] * v[i];
      return s;
    });
  }

  /** Gauss-Jordan invert square matrix; returns null if singular */
  function invertMatrix(M) {
    const n = M.length;
    const A = M.map(function (row, i) {
      return row.concat(
        Array.from({ length: n }, function (_, j) {
          return i === j ? 1 : 0;
        })
      );
    });
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
      }
      if (Math.abs(A[pivot][col]) < 1e-12) return null;
      const tmp = A[col];
      A[col] = A[pivot];
      A[pivot] = tmp;
      const div = A[col][col];
      for (let j = 0; j < 2 * n; j++) A[col][j] /= div;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col];
        for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
      }
    }
    return A.map(function (row) {
      return row.slice(n);
    });
  }

  /**
   * OLS: y = Xb + e
   * X is n x p (include intercept column if desired)
   */
  function ols(X, y) {
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const XtXinv = invertMatrix(XtX);
    if (!XtXinv) return { ok: false, error: "Singular design matrix (perfect collinearity or too few observations)." };
    const Xty = matVec(Xt, y);
    const beta = matVec(XtXinv, Xty);
    const yHat = matVec(X, beta);
    const resid = y.map(function (yi, i) {
      return yi - yHat[i];
    });
    const n = y.length;
    const p = beta.length;
    const yMean = y.reduce(function (a, b) {
      return a + b;
    }, 0) / n;
    let ssTot = 0,
      ssRes = 0;
    for (let i = 0; i < n; i++) {
      ssTot += Math.pow(y[i] - yMean, 2);
      ssRes += Math.pow(resid[i], 2);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
    const adjR2 =
      r2 != null && n > p ? 1 - (1 - r2) * ((n - 1) / (n - p)) : null;
    const sigma2 = n > p ? ssRes / (n - p) : null;

    // Coefficient SE from diag(sigma2 * (XtX)^-1)
    const se = [];
    if (sigma2 != null) {
      for (let j = 0; j < p; j++) {
        const v = XtXinv[j][j];
        se[j] = v >= 0 ? Math.sqrt(sigma2 * v) : null;
      }
    }

    // Approximate pairwise correlation of columns (collinearity flag)
    const collinearPairs = [];
    for (let j = 1; j < p; j++) {
      for (let k = j + 1; k < p; k++) {
        const corr = colCorr(X, j, k);
        if (corr != null && Math.abs(corr) >= 0.9) {
          collinearPairs.push({ j: j, k: k, corr: corr });
        }
      }
    }

    return {
      ok: true,
      beta: beta,
      se: se,
      yHat: yHat,
      resid: resid,
      r2: r2,
      adjR2: adjR2,
      sigma2: sigma2,
      n: n,
      p: p,
      collinearPairs: collinearPairs
    };
  }

  function colCorr(X, j, k) {
    const n = X.length;
    let sj = 0,
      sk = 0;
    for (let i = 0; i < n; i++) {
      sj += X[i][j];
      sk += X[i][k];
    }
    const mj = sj / n,
      mk = sk / n;
    let num = 0,
      dj = 0,
      dk = 0;
    for (let i = 0; i < n; i++) {
      const aj = X[i][j] - mj,
        ak = X[i][k] - mk;
      num += aj * ak;
      dj += aj * aj;
      dk += ak * ak;
    }
    if (dj < 1e-12 || dk < 1e-12) return null;
    return num / Math.sqrt(dj * dk);
  }

  /* ---------- Transforms ---------- */
  /** Geometric adstock: x'_t = x_t + λ x'_{t-1} */
  function adstock(series, lambda) {
    const L = Math.max(0, Math.min(0.95, lambda));
    const out = [];
    let prev = 0;
    for (let i = 0; i < series.length; i++) {
      const v = (Number(series[i]) || 0) + L * prev;
      out.push(v);
      prev = v;
    }
    return out;
  }

  /** Hill-style diminishing returns on already-adstocked series */
  function hillTransform(series, K, S) {
    const k = K > 0 ? K : 1;
    const s = S > 0 ? S : 1;
    return series.map(function (x) {
      const v = Math.max(0, Number(x) || 0);
      return Math.pow(v, s) / (Math.pow(v, s) + Math.pow(k, s));
    });
  }

  /** Simple log1p for log-linear variants */
  function log1pSeries(series) {
    return series.map(function (x) {
      return Math.log1p(Math.max(0, Number(x) || 0));
    });
  }

  /* ---------- CSV parse (reuse simple approach) ---------- */
  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) {
      return l.trim();
    });
    if (lines.length < 2) return { ok: false, error: "CSV needs a header and at least one row." };
    function splitLine(line) {
      const out = [];
      let cur = "",
        inQ = false;
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
    return { ok: true, headers: headers, rows: rows };
  }

  /* ---------- Sample dataset (illustrative, not real performance) ---------- */
  function buildSampleWeekly(n) {
    n = n || 104;
    const rows = [];
    let salesBase = 100000;
    for (let t = 0; t < n; t++) {
      const week = t + 1;
      const season = 1 + 0.08 * Math.sin((2 * Math.PI * t) / 52);
      const paidSearch = 5000 + 3000 * Math.max(0, Math.sin(t / 7));
      const social = 2000 + 1500 * Math.max(0, Math.cos(t / 9));
      const tv = t >= 20 && t <= 35 ? 40000 : t >= 60 && t <= 75 ? 35000 : 0;
      const price = 10 + (t % 13 === 0 ? -1 : 0);
      const promo = t % 17 === 0 ? 1 : 0;
      // Illustrative data-generating process (not claimed as estimated model truth)
      const noise = ((t * 17) % 7) - 3;
      const sales =
        salesBase * season +
        0.4 * paidSearch +
        0.25 * social +
        0.05 * tv +
        -2000 * (price - 10) +
        5000 * promo +
        noise * 200;
      rows.push({
        period: "W" + String(week).padStart(3, "0"),
        sales: Math.round(sales),
        paid_search: Math.round(paidSearch),
        social: Math.round(social),
        tv: Math.round(tv),
        price: price,
        promo: promo,
        distribution: 0.95,
        competitor_index: 100 + ((t * 3) % 11)
      });
    }
    return rows;
  }

  /* ---------- State ---------- */
  let state = {
    frequency: "weekly",
    rawRows: [],
    headers: [],
    yCol: "sales",
    dateCol: "period",
    mediaCols: [],
    controlCols: [],
    adstockLambda: 0.5,
    hillK: null, // auto median if null
    hillS: 1,
    useLogY: false,
    useHill: true,
    holdoutTail: 8,
    lastFit: null
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(v) {
    const x = parseFloat(v);
    return isFinite(x) ? x : 0;
  }

  /* ---------- Fit pipeline ---------- */
  function fitModel() {
    const warnings = [];
    const rows = state.rawRows;
    const n = rows.length;

    if (n < MIN_OBS_HARD) {
      return {
        ok: false,
        error:
          "Fewer than " +
          MIN_OBS_HARD +
          " periods. A credible MMM needs substantially more history (often 2+ years weekly). Do not interpret sparse fits as valid."
      };
    }
    if (n < MIN_OBS_WARN) {
      warnings.push(
        "Only " + n + " periods. Results are fragile; treat as exploratory, not decision-grade."
      );
    }

    if (!state.yCol || !rows[0] || rows[0][state.yCol] === undefined) {
      return { ok: false, error: "Select a valid dependent variable (sales) column." };
    }

    const media = state.mediaCols.filter(Boolean);
    const controls = state.controlCols.filter(Boolean);
    if (!media.length) {
      return { ok: false, error: "Select at least one media / investment column." };
    }

    const p = 1 + media.length + controls.length; // intercept + regressors
    if (n < p * MIN_OBS_PER_PARAM) {
      warnings.push(
        "Observations per parameter are low (n=" +
          n +
          ", parameters=" +
          p +
          "). Risk of overfitting and unstable coefficients."
      );
    }

    // Build series
    const yRaw = rows.map(function (r) {
      return num(r[state.yCol]);
    });
    const y = state.useLogY ? yRaw.map(function (v) {
      return Math.log(Math.max(v, 1e-6));
    }) : yRaw;

    // Media transforms
    const mediaTransformed = {};
    media.forEach(function (col) {
      let s = rows.map(function (r) {
        return num(r[col]);
      });
      s = adstock(s, state.adstockLambda);
      if (state.useHill) {
        const median = s.slice().sort(function (a, b) {
          return a - b;
        })[Math.floor(s.length / 2)] || 1;
        const K = state.hillK > 0 ? state.hillK : Math.max(median, 1);
        s = hillTransform(s, K, state.hillS);
      }
      mediaTransformed[col] = s;
    });

    const controlSeries = {};
    controls.forEach(function (col) {
      controlSeries[col] = rows.map(function (r) {
        return num(r[col]);
      });
    });

    // Train / holdout split (tail holdout for naive OOS check)
    const hold = Math.max(0, Math.min(state.holdoutTail, Math.floor(n / 4)));
    const nTrain = n - hold;
    if (nTrain < MIN_OBS_HARD) {
      return { ok: false, error: "After holdout split, training sample is too small." };
    }

    function buildX(from, to) {
      const X = [];
      for (let i = from; i < to; i++) {
        const row = [1]; // intercept
        media.forEach(function (col) {
          row.push(mediaTransformed[col][i]);
        });
        controls.forEach(function (col) {
          row.push(controlSeries[col][i]);
        });
        X.push(row);
      }
      return X;
    }

    const Xtrain = buildX(0, nTrain);
    const yTrain = y.slice(0, nTrain);
    const fit = ols(Xtrain, yTrain);
    if (!fit.ok) return fit;

    const names = ["intercept"].concat(media).concat(controls);

    // In-sample metrics already on train
    // Holdout prediction
    let oos = null;
    if (hold > 0) {
      const Xh = buildX(nTrain, n);
      const yH = y.slice(nTrain);
      const yHatH = matVec(Xh, fit.beta);
      let ssRes = 0,
        ssTot = 0;
      const meanH =
        yH.reduce(function (a, b) {
          return a + b;
        }, 0) / yH.length;
      for (let i = 0; i < yH.length; i++) {
        ssRes += Math.pow(yH[i] - yHatH[i], 2);
        ssTot += Math.pow(yH[i] - meanH, 2);
      }
      oos = {
        n: hold,
        r2: ssTot > 0 ? 1 - ssRes / ssTot : null,
        mape:
          yRaw
            .slice(nTrain)
            .map(function (actual, i) {
              const pred = state.useLogY ? Math.exp(yHatH[i]) : yHatH[i];
              return actual !== 0 ? Math.abs((actual - pred) / actual) : null;
            })
            .filter(function (v) {
              return v != null;
            })
            .reduce(function (a, b, _, arr) {
              return a + b / arr.length;
            }, 0)
      };
    }

    // Rough contribution share: mean(beta_j * x_j) / mean(yHat) for media only — illustrative
    const yHatFull = matVec(buildX(0, n), fit.beta);
    const contributions = media.map(function (col, idx) {
      const j = 1 + idx;
      let sum = 0;
      for (let i = 0; i < nTrain; i++) sum += fit.beta[j] * Xtrain[i][j];
      return { channel: col, meanContribution: sum / nTrain };
    });
    const meanYHat =
      yHatFull.slice(0, nTrain).reduce(function (a, b) {
        return a + b;
      }, 0) / nTrain;

    warnings.push(
      "Modelled contributions are correlational decompositions under OLS assumptions — not experimentally verified incrementality."
    );
    warnings.push(
      "Adstock λ and Hill parameters were set by the user (or simple defaults), not jointly optimised as in production MMM packages."
    );
    if (fit.collinearPairs.length) {
      warnings.push(
        "High column correlation detected (|r|≥0.9) between some regressors — coefficients may be unstable (collinearity)."
      );
    }

    // Coefficient CI (approx 95% using normal)
    const coefTable = names.map(function (name, j) {
      const b = fit.beta[j];
      const se = fit.se[j];
      const ci =
        se != null
          ? { low: b - 1.96 * se, high: b + 1.96 * se }
          : null;
      return { name: name, beta: b, se: se, ci95: ci };
    });

    return {
      ok: true,
      warnings: warnings,
      names: names,
      media: media,
      controls: controls,
      fit: fit,
      coefTable: coefTable,
      contributions: contributions,
      meanYHatTrain: meanYHat,
      oos: oos,
      n: n,
      nTrain: nTrain,
      hold: hold,
      transforms: {
        adstockLambda: state.adstockLambda,
        useHill: state.useHill,
        hillS: state.hillS,
        useLogY: state.useLogY
      },
      yHatTrain: fit.yHat,
      yTrain: yTrain,
      periods: rows.map(function (r) {
        return r[state.dateCol] || "";
      })
    };
  }

  /* ---------- UI ---------- */
  function render(container) {
    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">▣</span><div>' +
      "<strong>Marketing Mix Modelling workbench.</strong> " +
      "This browser module runs transparent OLS on user-supplied time series with adstock and optional diminishing-returns transforms. " +
      "It is <em>not</em> a full hierarchical Bayesian or production MMM. " +
      "For decision-grade models use open-source stacks locally (Robyn, PyMC-Marketing, Meridian, etc.). " +
      "Modelled contribution ≠ experimentally verified incrementality." +
      "</div></div>";

    html += renderBackendNote();
    html += renderDataPanel();
    html += '<div id="mii-mmm-config" class="mii-card" style="margin-bottom:16px;"></div>';
    html += '<div id="mii-mmm-results"></div>';

    container.innerHTML = html;
    paintConfig();
    wireData(container);
  }

  function renderBackendNote() {
    return (
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Statistical validity boundary</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.65;">' +
      "<li><strong>What this page does:</strong> data prep, geometric adstock, optional Hill saturation, OLS coefficients, basic R² / residual / holdout checks, collinearity flags, exports.</li>" +
      "<li><strong>What it does not do:</strong> Bayesian priors, hierarchical geo models, automated hyperparameter search, full budget optimiser under uncertainty, or causal identification guarantees.</li>" +
      "<li><strong>Free local options:</strong> Meta <em>Robyn</em> (R/Python), Google <em>Meridian</em> (Python), <em>PyMC-Marketing</em>, scikit-learn pipelines for custom OLS/Ridge — run on your machine at no license cost.</li>" +
      "<li>Insufficient observations, collinear media, missing confounders (price, distribution, seasonality, competitors) invalidate confident claims regardless of chart quality.</li>" +
      "</ul></div>"
    );
  }

  function renderDataPanel() {
    return (
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;">' +
      "<div><h2 class=\"mii-card-title\" style=\"margin:0;\">Time-series data</h2>" +
      '<p class="mii-card-subtitle">Weekly or monthly rows. Required: period key + sales. Recommended: media spend/impressions, price, promo, distribution, macro, competitor.</p></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="mii-mmm-sample">Load illustrative sample (104 weeks)</button>' +
      '<label class="mii-btn mii-btn--primary mii-btn--sm" style="cursor:pointer;">Upload CSV<input type="file" id="mii-mmm-csv" accept=".csv,text/csv" hidden></label>' +
      "</div></div>" +
      '<p id="mii-mmm-data-status" class="mii-text-muted" style="margin:12px 0 0;font-size:0.85rem;">No data loaded.</p></div>'
    );
  }

  function paintConfig() {
    const el = document.getElementById("mii-mmm-config");
    if (!el) return;
    if (!state.rawRows.length) {
      el.innerHTML =
        '<p class="mii-text-muted" style="margin:0;">Load data to configure the model.</p>';
      return;
    }

    const headers = state.headers;
    let html =
      '<h2 class="mii-card-title">Model specification</h2>' +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px;">';

    html += selectField("Period column", "mmm-date", headers, state.dateCol);
    html += selectField("Sales (dependent) column", "mmm-y", headers, state.yCol);
    html +=
      '<div style="grid-column:1/-1;"><label class="mii-kpi-label">Media / activity columns (multi-select)</label>' +
      '<select id="mmm-media" multiple size="5" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      headers
        .map(function (h) {
          return (
            '<option value="' +
            escapeHtml(h) +
            '"' +
            (state.mediaCols.indexOf(h) !== -1 ? " selected" : "") +
            ">" +
            escapeHtml(h) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>";
    html +=
      '<div style="grid-column:1/-1;"><label class="mii-kpi-label">Control columns (price, promo, seasonality proxies, distribution, macro…)</label>' +
      '<select id="mmm-controls" multiple size="4" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      headers
        .map(function (h) {
          return (
            '<option value="' +
            escapeHtml(h) +
            '"' +
            (state.controlCols.indexOf(h) !== -1 ? " selected" : "") +
            ">" +
            escapeHtml(h) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>";

    html +=
      numField("Adstock λ (0–0.95)", "mmm-lambda", state.adstockLambda) +
      numField("Hill shape S", "mmm-hills", state.hillS) +
      numField("Holdout periods (tail)", "mmm-hold", state.holdoutTail) +
      '<div><label class="mii-kpi-label">Transforms</label>' +
      '<div style="margin-top:6px;font-size:0.85rem;color:var(--mii-text-muted);">' +
      '<label><input type="checkbox" id="mmm-hill" ' +
      (state.useHill ? "checked" : "") +
      "> Hill diminishing returns</label><br>" +
      '<label><input type="checkbox" id="mmm-logy" ' +
      (state.useLogY ? "checked" : "") +
      "> Log dependent variable</label>" +
      "</div></div>";

    html +=
      '</div><div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mmm-fit">Fit OLS model</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mmm-export-input">Export input CSV</button>' +
      "</div>";

    el.innerHTML = html;

    document.getElementById("mmm-fit").addEventListener("click", function () {
      readConfigFromForm();
      const result = fitModel();
      state.lastFit = result;
      paintResults(result);
    });
    document.getElementById("mmm-export-input").addEventListener("click", exportInputCsv);
  }

  function selectField(label, id, options, current) {
    return (
      "<div><label class=\"mii-kpi-label\">" +
      escapeHtml(label) +
      '</label><select id="' +
      id +
      '" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      options
        .map(function (h) {
          return (
            '<option value="' +
            escapeHtml(h) +
            '"' +
            (h === current ? " selected" : "") +
            ">" +
            escapeHtml(h) +
            "</option>"
          );
        })
        .join("") +
      "</select></div>"
    );
  }

  function numField(label, id, val) {
    return (
      "<div><label class=\"mii-kpi-label\">" +
      escapeHtml(label) +
      '</label><input id="' +
      id +
      '" type="number" step="any" value="' +
      escapeHtml(val) +
      '" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function readConfigFromForm() {
    state.dateCol = document.getElementById("mmm-date").value;
    state.yCol = document.getElementById("mmm-y").value;
    state.mediaCols = multiVal("mmm-media");
    state.controlCols = multiVal("mmm-controls");
    state.adstockLambda = parseFloat(document.getElementById("mmm-lambda").value) || 0;
    state.hillS = parseFloat(document.getElementById("mmm-hills").value) || 1;
    state.holdoutTail = parseInt(document.getElementById("mmm-hold").value, 10) || 0;
    state.useHill = document.getElementById("mmm-hill").checked;
    state.useLogY = document.getElementById("mmm-logy").checked;
  }

  function multiVal(id) {
    const el = document.getElementById(id);
    if (!el) return [];
    return Array.prototype.slice
      .call(el.selectedOptions)
      .map(function (o) {
        return o.value;
      });
  }

  function paintResults(result) {
    const box = document.getElementById("mii-mmm-results");
    if (!box) return;
    if (!result.ok) {
      box.innerHTML =
        '<div class="mii-card"><p style="color:#fca5a5;">' +
        escapeHtml(result.error) +
        "</p></div>";
      return;
    }

    let html =
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Fit summary</h2>' +
      '<div class="mii-grid mii-grid-4" style="margin-top:12px;">' +
      mini("Train n", result.nTrain) +
      mini("Holdout n", result.hold) +
      mini("R² (train)", result.fit.r2 != null ? result.fit.r2.toFixed(3) : "—") +
      mini("Adj R²", result.fit.adjR2 != null ? result.fit.adjR2.toFixed(3) : "—") +
      "</div>";

    if (result.oos) {
      html +=
        '<p class="mii-text-muted" style="margin:12px 0 0;font-size:0.9rem;">Holdout R²: ' +
        (result.oos.r2 != null ? result.oos.r2.toFixed(3) : "—") +
        " · Holdout MAPE: " +
        (result.oos.mape != null ? (result.oos.mape * 100).toFixed(1) + "%" : "—") +
        " (naive tail split — not a substitute for proper time-series CV)</p>";
    }

    if (result.warnings.length) {
      html +=
        '<ul style="margin:12px 0 0;padding-left:18px;font-size:0.85rem;color:#fde68a;">';
      result.warnings.forEach(function (w) {
        html += "<li>" + escapeHtml(w) + "</li>";
      });
      html += "</ul>";
    }
    html += "</div>";

    // Coefficients
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Coefficients (OLS)</h2>' +
      '<p class="mii-card-subtitle">Approx. 95% CI uses normal quantiles; invalid under residual autocorrelation or wrong functional form.</p>' +
      '<div class="mii-table-wrap" style="margin-top:12px;"><table class="mii-table"><thead><tr>' +
      "<th>Variable</th><th>β</th><th>SE</th><th>CI low</th><th>CI high</th></tr></thead><tbody>";
    result.coefTable.forEach(function (c) {
      html +=
        "<tr><td>" +
        escapeHtml(c.name) +
        "</td><td>" +
        fmt(c.beta) +
        "</td><td>" +
        fmt(c.se) +
        "</td><td>" +
        (c.ci95 ? fmt(c.ci95.low) : "—") +
        "</td><td>" +
        (c.ci95 ? fmt(c.ci95.high) : "—") +
        "</td></tr>";
    });
    html += "</tbody></table></div></div>";

    // Contributions
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Illustrative mean media terms (train)</h2>' +
      '<p class="mii-card-subtitle">Mean(βⱼxⱼ) on the training window — a decomposition under the fitted equation, not causal share of sales.</p>' +
      '<div class="mii-table-wrap" style="margin-top:12px;"><table class="mii-table"><thead><tr><th>Channel</th><th>Mean βx</th></tr></thead><tbody>';
    result.contributions.forEach(function (c) {
      html +=
        "<tr><td>" +
        escapeHtml(c.channel) +
        "</td><td>" +
        fmt(c.meanContribution) +
        "</td></tr>";
    });
    html += "</tbody></table></div></div>";

    // Chart actual vs fitted (train)
    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<h2 class="mii-card-title">Train: actual vs fitted</h2>' +
      '<div class="mii-chart-box"><canvas id="mii-mmm-fit-chart"></canvas></div></div>';

    html +=
      '<div class="mii-card" style="margin-bottom:16px;">' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mmm-export-out">Export coefficients &amp; diagnostics (JSON)</button> ' +
      '<button type="button" class="mii-btn mii-btn--ghost" id="mmm-export-report">Download text report</button></div>';

    html +=
      '<div class="mii-card">' +
      '<h2 class="mii-card-title">Assumptions checklist</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.65;">' +
      "<li>Linear (or log-linear) additive structure after transforms.</li>" +
      "<li>Adstock and saturation parameters fixed by user — not jointly estimated.</li>" +
      "<li>No automatic treatment of endogeneity (e.g. spend reacting to demand).</li>" +
      "<li>Residual independence assumed for SE/CI; weekly marketing data often violates this.</li>" +
      "<li>Collinearity among media channels is common; inspect flags above.</li>" +
      "<li>External validity requires controls for price, promo, distribution, seasonality, competitors when material.</li>" +
      "</ul></div>";

    box.innerHTML = html;

    requestAnimationFrame(function () {
      drawFitChart(result);
    });

    document.getElementById("mmm-export-out").addEventListener("click", function () {
      exportFitJson(result);
    });
    document.getElementById("mmm-export-report").addEventListener("click", function () {
      exportTextReport(result);
    });
  }

  function mini(label, value) {
    return (
      '<div style="background:var(--mii-bg);border-radius:10px;padding:12px;">' +
      '<div style="font-size:1.15rem;font-weight:800;">' +
      escapeHtml(String(value)) +
      '</div><div class="mii-kpi-label">' +
      escapeHtml(label) +
      "</div></div>"
    );
  }

  function fmt(x) {
    if (x == null || !isFinite(x)) return "—";
    return Number(x).toPrecision(4);
  }

  let fitChart = null;
  function drawFitChart(result) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("mii-mmm-fit-chart");
    if (!canvas) return;
    if (fitChart) {
      fitChart.destroy();
      fitChart = null;
    }
    const labels = result.periods.slice(0, result.nTrain);
    const actual = state.useLogY
      ? result.yTrain.map(function (v) {
          return Math.exp(v);
        })
      : result.yTrain;
    const fitted = state.useLogY
      ? result.yHatTrain.map(function (v) {
          return Math.exp(v);
        })
      : result.yHatTrain;
    fitChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Actual",
            data: actual,
            borderColor: "#94a3b8",
            pointRadius: 0,
            borderWidth: 1.5
          },
          {
            label: "Fitted",
            data: fitted,
            borderColor: "#3b82f6",
            pointRadius: 0,
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#94a3b8" } }
        },
        scales: {
          x: { ticks: { color: "#64748b", maxTicksLimit: 12 }, grid: { display: false } },
          y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } }
        }
      }
    });
  }

  function wireData(container) {
    document.getElementById("mii-mmm-sample").addEventListener("click", function () {
      const rows = buildSampleWeekly(104);
      state.rawRows = rows;
      state.headers = Object.keys(rows[0]);
      state.yCol = "sales";
      state.dateCol = "period";
      state.mediaCols = ["paid_search", "social", "tv"];
      state.controlCols = ["price", "promo", "distribution", "competitor_index"];
      document.getElementById("mii-mmm-data-status").textContent =
        "Loaded illustrative sample: 104 weekly rows (synthetic DGP — not real campaign data).";
      paintConfig();
    });

    document.getElementById("mii-mmm-csv").addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      file.text().then(function (text) {
        const parsed = parseCsv(text);
        if (!parsed.ok) {
          alert(parsed.error);
          return;
        }
        state.rawRows = parsed.rows;
        state.headers = parsed.headers;
        state.yCol = parsed.headers.indexOf("sales") !== -1 ? "sales" : parsed.headers[1] || parsed.headers[0];
        state.dateCol = parsed.headers[0];
        state.mediaCols = [];
        state.controlCols = [];
        document.getElementById("mii-mmm-data-status").textContent =
          "Loaded " + parsed.rows.length + " rows · columns: " + parsed.headers.join(", ");
        paintConfig();
      });
      e.target.value = "";
    });
  }

  function exportInputCsv() {
    if (!state.rawRows.length) return;
    const headers = state.headers;
    const lines = [headers.join(",")];
    state.rawRows.forEach(function (r) {
      lines.push(
        headers
          .map(function (h) {
            const v = r[h] == null ? "" : String(r[h]).replace(/"/g, '""');
            return /[",\n]/.test(v) ? '"' + v + '"' : v;
          })
          .join(",")
      );
    });
    download(
      "mmm-input-" + new Date().toISOString().slice(0, 10) + ".csv",
      lines.join("\n"),
      "text/csv"
    );
  }

  function exportFitJson(result) {
    const payload = {
      app: "MII MMM workbench",
      disclaimer:
        "OLS educational/exploratory fit only. Not production Bayesian MMM. Modelled contribution is not experimental incrementality.",
      transforms: result.transforms,
      n: result.n,
      nTrain: result.nTrain,
      holdout: result.hold,
      r2_train: result.fit.r2,
      adjR2_train: result.fit.adjR2,
      oos: result.oos,
      coefficients: result.coefTable,
      contributions_mean_bx: result.contributions,
      warnings: result.warnings,
      exportedAt: new Date().toISOString()
    };
    download(
      "mmm-fit-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }

  function exportTextReport(result) {
    const lines = [];
    lines.push("MII Marketing Mix Modelling — exploratory OLS report");
    lines.push("Generated: " + new Date().toISOString());
    lines.push("");
    lines.push("DISCLAIMER: Not a production MMM. Not experimental incrementality.");
    lines.push("");
    lines.push("n=" + result.n + " train=" + result.nTrain + " holdout=" + result.hold);
    lines.push("R2_train=" + result.fit.r2 + " adjR2=" + result.fit.adjR2);
    if (result.oos) lines.push("holdout_R2=" + result.oos.r2 + " MAPE=" + result.oos.mape);
    lines.push("adstock_lambda=" + result.transforms.adstockLambda);
    lines.push("hill=" + result.transforms.useHill + " S=" + result.transforms.hillS);
    lines.push("");
    lines.push("Coefficients:");
    result.coefTable.forEach(function (c) {
      lines.push(
        c.name +
          " beta=" +
          c.beta +
          " se=" +
          c.se +
          (c.ci95 ? " ci=[" + c.ci95.low + "," + c.ci95.high + "]" : "")
      );
    });
    lines.push("");
    lines.push("Warnings:");
    result.warnings.forEach(function (w) {
      lines.push("- " + w);
    });
    download(
      "mmm-report-" + new Date().toISOString().slice(0, 10) + ".txt",
      lines.join("\n"),
      "text/plain"
    );
  }

  function download(name, content, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- Tests ---------- */
  function runSelfTests() {
    const tests = [];
    // OLS: y = 2 + 3x
    const X = [
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4]
    ];
    const y = [5, 8, 11, 14];
    const fit = ols(X, y);
    tests.push({
      name: "OLS recovers intercept≈2",
      pass: fit.ok && Math.abs(fit.beta[0] - 2) < 1e-8
    });
    tests.push({
      name: "OLS recovers slope≈3",
      pass: fit.ok && Math.abs(fit.beta[1] - 3) < 1e-8
    });

    const ad = adstock([1, 0, 0, 0], 0.5);
    tests.push({
      name: "Adstock geometric decay",
      pass: Math.abs(ad[0] - 1) < 1e-12 && Math.abs(ad[1] - 0.5) < 1e-12 && Math.abs(ad[2] - 0.25) < 1e-12
    });

    const hill = hillTransform([0, 10, 1000], 10, 1);
    tests.push({
      name: "Hill at K equals 0.5",
      pass: Math.abs(hill[1] - 0.5) < 1e-12
    });

    // Too few obs
    state.rawRows = [{ sales: 1, m: 1 }];
    state.yCol = "sales";
    state.mediaCols = ["m"];
    state.controlCols = [];
    const bad = fitModel();
    tests.push({ name: "Rejects insufficient n", pass: !bad.ok });

    return tests;
  }

  MII.MMM.render = render;
  MII.MMM.ols = ols;
  MII.MMM.adstock = adstock;
  MII.MMM.hillTransform = hillTransform;
  MII.MMM.fitModel = fitModel;
  MII.MMM.runSelfTests = runSelfTests;
  MII.MMM.buildSampleWeekly = buildSampleWeekly;
})();
