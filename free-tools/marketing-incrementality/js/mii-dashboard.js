/**
 * Marketing Incrementality Intelligence — Executive Dashboard
 * Renders illustrative KPIs, spend mix and trend chart
 * Namespace: window.MII.Dashboard
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Dashboard = MII.Dashboard || {};

  let chartInstance = null;

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatYen(n) {
    return "¥" + Number(n).toLocaleString("en-JP");
  }

  async function render(container, options) {
    options = options || {};
    const mode = options.mode || "business";

    let data;
    try {
      data = await MII.Data.loadDemoDashboard();
    } catch (e) {
      data = MII.Data.DEMO_DASHBOARD;
    }

    // Overlay live investment tracker totals when records exist
    try {
      const live = await MII.Data.getInvestments();
      const modeFlag = await MII.Data.getSetting("dataMode", "demo");
      if (live && live.length && modeFlag === "user" && MII.Investments) {
        const direct = MII.Investments.directSpend;
        let totalDirect = 0;
        let online = 0;
        let offline = 0;
        const byChannel = {};
        live.forEach(function (r) {
          const d = direct(r);
          // Live multi-currency not combined here without FX — sum same-currency only if mixed
          totalDirect += d;
          const cat = r.category || "";
          if (cat === "traditional" || cat === "experiential" || cat === "trade_retail") offline += d;
          else online += d;
          const ch = r.channel || "Other";
          byChannel[ch] = (byChannel[ch] || 0) + d;
        });
        const currencies = {};
        live.forEach(function (r) { currencies[r.currency || "JPY"] = true; });
        const multi = Object.keys(currencies).length > 1;
        data = Object.assign({}, data, {
          periodLabel: multi
            ? "Live data (multiple currencies — totals not FX-adjusted on dashboard)"
            : "Live data from Investment Tracker",
          kpis: [
            {
              id: "spend",
              label: "Direct spend (tracker)",
              value: multi ? live.length + " records" : "¥" + Math.round(totalDirect).toLocaleString(),
              delta: multi ? "Open tracker for FX totals" : "From Investment Tracker",
              deltaType: "neutral"
            },
            {
              id: "online",
              label: "Online-ish share",
              value: totalDirect ? Math.round((online / totalDirect) * 100) + "%" : "—",
              delta: "Category heuristic",
              deltaType: "neutral"
            },
            {
              id: "offline",
              label: "Offline-ish share",
              value: totalDirect ? Math.round((offline / totalDirect) * 100) + "%" : "—",
              delta: "Category heuristic",
              deltaType: "neutral"
            },
            {
              id: "experiments",
              label: "Records",
              value: String(live.length),
              delta: "In Investment Tracker",
              deltaType: "neutral"
            }
          ],
          spendByChannel: Object.keys(byChannel)
            .map(function (ch) {
              return { channel: ch, spend: byChannel[ch], type: "online" };
            })
            .sort(function (a, b) { return b.spend - a.spend; }),
          disclaimer:
            "Figures below include live records from the Investment Tracker. " +
            (multi
              ? "Multiple currencies detected — dashboard does not auto-convert without explicit FX rates in the tracker."
              : "Direct spend excludes allocated overhead (tracked separately).")
        });
      }
    } catch (liveErr) {
      /* keep demo */
    }

    let html = "";

    // Demo banner — always visible so users know data is illustrative
    html +=
      '<div class="mii-demo-banner">' +
      "<span aria-hidden=\"true\">⚠</span>" +
      "<div><strong>Demonstration mode.</strong> " +
      escapeHtml(data.disclaimer) +
      "</div></div>";

    // KPI row
    html += '<div class="mii-grid mii-grid-4">';
    data.kpis.forEach(function (kpi) {
      html +=
        '<div class="mii-card">' +
        '<div class="mii-kpi-value">' +
        escapeHtml(kpi.value) +
        "</div>" +
        '<div class="mii-kpi-label">' +
        escapeHtml(kpi.label) +
        "</div>" +
        '<div class="mii-kpi-delta ' +
        escapeHtml(kpi.deltaType) +
        '">' +
        escapeHtml(kpi.delta) +
        "</div></div>";
    });
    html += "</div>";

    // Charts row
    html +=
      '<div class="mii-grid mii-grid-2 mii-mt-20">' +
      '<div class="mii-card">' +
      '<div class="mii-card-header">' +
      "<div><h2 class=\"mii-card-title\">Spend by channel</h2>" +
      '<p class="mii-card-subtitle">Illustrative mix · ' +
      escapeHtml(data.periodLabel) +
      "</p></div>" +
      '<span class="mii-badge mii-badge--demo">Demo</span></div>' +
      '<div class="mii-chart-box"><canvas id="mii-chart-channels"></canvas></div>' +
      "</div>" +
      '<div class="mii-card">' +
      '<div class="mii-card-header">' +
      "<div><h2 class=\"mii-card-title\">Online vs offline trend</h2>" +
      '<p class="mii-card-subtitle">Illustrative monthly spend</p></div>' +
      '<span class="mii-badge mii-badge--demo">Demo</span></div>' +
      '<div class="mii-chart-box"><canvas id="mii-chart-trend"></canvas></div>' +
      "</div></div>";

    // Channel table
    html +=
      '<div class="mii-card mii-mt-20">' +
      '<div class="mii-card-header">' +
      "<div><h2 class=\"mii-card-title\">Channel spend detail</h2>" +
      '<p class="mii-card-subtitle">Illustrative totals for the demo period</p></div>' +
      '<span class="mii-badge mii-badge--demo">Demo</span></div>' +
      '<div class="mii-table-wrap"><table class="mii-table"><thead><tr>' +
      "<th>Channel</th><th>Type</th><th>Spend</th><th>Share</th>" +
      "</tr></thead><tbody>";

    const total = data.spendByChannel.reduce(function (s, c) {
      return s + c.spend;
    }, 0);

    data.spendByChannel.forEach(function (row) {
      const share = total ? ((row.spend / total) * 100).toFixed(1) + "%" : "—";
      html +=
        "<tr><td><strong>" +
        escapeHtml(row.channel) +
        "</strong></td><td>" +
        escapeHtml(row.type) +
        "</td><td>" +
        formatYen(row.spend) +
        "</td><td>" +
        share +
        "</td></tr>";
    });
    html += "</tbody></table></div></div>";

    // Mode-specific note
    if (mode === "professional") {
      html +=
        '<div class="mii-card mii-mt-20">' +
        '<h2 class="mii-card-title">Professional mode notes</h2>' +
        '<p class="mii-text-muted" style="margin:8px 0 0;font-size:0.9rem;">' +
        "In later modules this view will surface experiment designs, confidence intervals, " +
        "MMM coefficient summaries and holdout diagnostics. " +
        "The current shell only displays illustrative spend structure." +
        "</p></div>";
    } else {
      html +=
        '<div class="mii-card mii-mt-20">' +
        '<h2 class="mii-card-title">What to do next</h2>' +
        '<p class="mii-text-muted" style="margin:8px 0 0;font-size:0.9rem;">' +
        "This dashboard shows how marketing investment is distributed across online and offline channels. " +
        "Use the Investment Tracker to log real spend, and the Experiment Lab to design tests that measure incremental impact. " +
        "Those modules will be enabled in upcoming phases." +
        "</p></div>";
    }


    // Optional: last incrementality calculator snapshot
    try {
      const raw = sessionStorage.getItem("mii_last_incrementality");
      if (raw) {
        const snap = JSON.parse(raw);
        html +=
          '<div class="mii-card mii-mt-20">' +
          '<div class="mii-card-header"><div><h2 class="mii-card-title">Latest incrementality run</h2>' +
          '<p class="mii-card-subtitle">From Experiment Lab calculator (this browser session)</p></div>' +
          '<span class="mii-badge mii-badge--info">' +
          (snap.designType === "randomized" ? "Randomized" : "Observational") +
          "</span></div>" +
          '<div class="mii-grid mii-grid-4">' +
          '<div><div class="mii-kpi-value" style="font-size:1.2rem;">' +
          (snap.absLift != null ? (snap.absLift * 100).toFixed(2) + "%" : "—") +
          '</div><div class="mii-kpi-label">Abs. conversion lift</div></div>' +
          '<div><div class="mii-kpi-value" style="font-size:1.2rem;">' +
          (snap.incConv != null ? Number(snap.incConv).toLocaleString(undefined,{maximumFractionDigits:0}) : "—") +
          '</div><div class="mii-kpi-label">Inc. conversions</div></div>' +
          '<div><div class="mii-kpi-value" style="font-size:1.2rem;">' +
          (snap.incRev != null ? Number(snap.incRev).toLocaleString(undefined,{maximumFractionDigits:0}) : "—") +
          '</div><div class="mii-kpi-label">Inc. revenue</div></div>' +
          '<div><div class="mii-kpi-value" style="font-size:1.2rem;">' +
          (snap.iROAS != null ? Number(snap.iROAS).toFixed(2) + "×" : "—") +
          '</div><div class="mii-kpi-label">iROAS</div></div>' +
          "</div>" +
          '<p class="mii-text-soft" style="margin:10px 0 0;font-size:0.8rem;">' +
          (snap.significant ? "Conversion lift was statistically significant at the chosen confidence level." : "Conversion lift was not statistically significant at the chosen confidence level.") +
          ' · <button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="mii-goto-experiments">Open Experiment Lab</button></p></div>';
      }
    } catch (e) {}

    container.innerHTML = html;

    const gotoExp = document.getElementById("mii-goto-experiments");
    if (gotoExp && MII.navigate) {
      gotoExp.addEventListener("click", function () {
        MII.navigate("experiments");
      });
    }


    // Charts (Chart.js from CDN)
    requestAnimationFrame(function () {
      renderCharts(data);
    });
  }

  function renderCharts(data) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js not loaded — charts skipped.");
      return;
    }

    // Destroy previous
    if (chartInstance && chartInstance.channels) {
      chartInstance.channels.destroy();
    }
    if (chartInstance && chartInstance.trend) {
      chartInstance.trend.destroy();
    }
    chartInstance = {};

    const channelCanvas = document.getElementById("mii-chart-channels");
    const trendCanvas = document.getElementById("mii-chart-trend");

    if (channelCanvas) {
      chartInstance.channels = new Chart(channelCanvas, {
        type: "bar",
        data: {
          labels: data.spendByChannel.map(function (c) {
            return c.channel;
          }),
          datasets: [
            {
              label: "Spend (illustrative)",
              data: data.spendByChannel.map(function (c) {
                return c.spend;
              }),
              backgroundColor: data.spendByChannel.map(function (c) {
                return c.type === "online" ? "rgba(59, 130, 246, 0.75)" : "rgba(16, 185, 129, 0.75)";
              }),
              borderRadius: 6,
              maxBarThickness: 28
            }
          ]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return "¥" + Number(ctx.raw).toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: "#94a3b8",
                callback: function (v) {
                  return "¥" + (v / 1000) + "k";
                }
              },
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

    if (trendCanvas) {
      chartInstance.trend = new Chart(trendCanvas, {
        type: "line",
        data: {
          labels: data.monthlyTrend.map(function (m) {
            return m.month;
          }),
          datasets: [
            {
              label: "Online (illustrative)",
              data: data.monthlyTrend.map(function (m) {
                return m.online;
              }),
              borderColor: "#3b82f6",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              fill: true,
              tension: 0.3,
              pointRadius: 3
            },
            {
              label: "Offline (illustrative)",
              data: data.monthlyTrend.map(function (m) {
                return m.offline;
              }),
              borderColor: "#10b981",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              fill: true,
              tension: 0.3,
              pointRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: "#94a3b8", boxWidth: 12, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ctx.dataset.label + ": ¥" + Number(ctx.raw).toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: "#94a3b8", font: { size: 11 } },
              grid: { color: "rgba(148,163,184,0.08)" }
            },
            y: {
              ticks: {
                color: "#94a3b8",
                callback: function (v) {
                  return "¥" + (v / 1000) + "k";
                }
              },
              grid: { color: "rgba(148,163,184,0.1)" }
            }
          }
        }
      });
    }
  }

  MII.Dashboard.render = render;
})();
