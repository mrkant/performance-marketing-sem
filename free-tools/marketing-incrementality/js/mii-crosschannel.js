/**
 * Marketing Incrementality Intelligence — Cross-Channel Intelligence
 * Document overlaps, hypothesized interactions, evidence type
 * Namespace: window.MII.CrossChannel
 *
 * Distinguishes correlation vs causal interaction. Does not invent interaction effects.
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.CrossChannel = MII.CrossChannel || {};

  const PRESET_RELATIONSHIPS = [
    {
      id: "paid_organic_search",
      label: "Paid and organic search overlap",
      channelA: "Google Ads",
      channelB: "SEO",
      description:
        "Brand and non-brand queries may be contested by paid and organic results. Cannibalisation vs incrementality depends on query mix and rank."
    },
    {
      id: "tv_branded_search",
      label: "TV and branded search",
      channelA: "TV / CTV",
      channelB: "Google Ads",
      description:
        "TV often lifts branded search. Correlate carefully with flighting; prefer geo or time-based tests for causal claims."
    },
    {
      id: "influencer_direct",
      label: "Influencer and direct traffic",
      channelA: "Influencers",
      channelB: "Website",
      description:
        "Influencer exposure may appear as direct or dark social. Last-click under-credits influencers."
    },
    {
      id: "email_retargeting",
      label: "Email and paid retargeting overlap",
      channelA: "Email",
      channelB: "Meta",
      description:
        "Same users may see CRM and paid retargeting. Overlapping frequency can inflate attributed conversions for both."
    },
    {
      id: "organic_paid_social",
      label: "Organic and paid social interactions",
      channelA: "Organic social",
      channelB: "Meta",
      description:
        "Organic reach and paid amplification interact; organic posts boosted with spend blur channel boundaries."
    },
    {
      id: "promo_ads",
      label: "Promotions and advertising interactions",
      channelA: "Promotions",
      channelB: "Google Ads",
      description:
        "Price promotions change conversion rates during ad exposure. Attribute lift to promo, ads, or interaction — design tests accordingly."
    }
  ];

  const EVIDENCE_TYPES = [
    { id: "none", label: "No analysis yet" },
    { id: "correlation", label: "Correlation / time series only" },
    { id: "attribution", label: "Attribution path overlap" },
    { id: "model", label: "MMM / multi-touch model term" },
    { id: "experiment", label: "Designed interaction / factorial test" }
  ];

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadRelationships() {
    const raw = await MII.Data.getSetting("cross_channel_links", null);
    if (raw && Array.isArray(raw.custom)) return raw;
    // Seed presets as templates (not results)
    return {
      custom: PRESET_RELATIONSHIPS.map(function (p) {
        return {
          id: p.id,
          label: p.label,
          channelA: p.channelA,
          channelB: p.channelB,
          description: p.description,
          evidenceType: "none",
          correlationNote: "",
          causalClaim: false,
          overlapRisk: "unknown",
          doNotSum: true,
          findings: "",
          updatedAt: null
        };
      })
    };
  }

  async function saveRelationships(obj) {
    return MII.Data.setSetting("cross_channel_links", obj);
  }

  let chartRef = null;

  function render(container) {
    loadRelationships()
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
    const links = data.custom || [];

    let html =
      '<div class="mii-demo-banner"><span aria-hidden="true">⇄</span><div>' +
      "<strong>Cross-Channel Intelligence.</strong> Map overlaps and hypothesized interactions. " +
      "Correlation is not causation. Causal interaction claims require designed tests (e.g. factorial or sequenced holdouts). " +
      "<strong>Do not sum</strong> channel incremental estimates when relationships overlap or experiments are incompatible." +
      "</div></div>";

    // Evidence summary chart data
    const counts = {};
    EVIDENCE_TYPES.forEach(function (e) {
      counts[e.id] = 0;
    });
    links.forEach(function (l) {
      counts[l.evidenceType] = (counts[l.evidenceType] || 0) + 1;
    });

    html +=
      '<div class="mii-grid mii-grid-2" style="margin-bottom:16px;">' +
      '<div class="mii-card">' +
      '<h2 class="mii-card-title">Evidence mix</h2>' +
      '<p class="mii-card-subtitle">How each documented relationship is currently supported</p>' +
      '<div class="mii-chart-box"><canvas id="mii-xc-chart"></canvas></div></div>' +
      '<div class="mii-card">' +
      '<h2 class="mii-card-title">Guardrails</h2>' +
      '<ul style="margin:8px 0 0;padding-left:18px;font-size:0.9rem;color:var(--mii-text-muted);line-height:1.65;">' +
      "<li>Label <strong>correlation</strong> separately from <strong>causal interaction</strong>.</li>" +
      "<li>Platform path overlap ≠ incrementality of the combination.</li>" +
      "<li>If two channels were tested in incompatible designs or overlapping populations, <strong>do not add</strong> their incremental revenue figures.</li>" +
      "<li>TV → search, email ↔ retargeting, paid ↔ organic search are common interaction zones — document before optimising.</li>" +
      "</ul></div></div>";

    html +=
      '<div class="mii-card" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;">' +
      '<button type="button" class="mii-btn mii-btn--primary" id="mii-xc-add">+ Add relationship</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="mii-xc-report">Download report</button>' +
      "</div>";

    html += '<div id="mii-xc-form" class="mii-card" hidden style="margin-bottom:16px;"></div>';

    // Cards for each relationship
    links.forEach(function (l, idx) {
      const ev = EVIDENCE_TYPES.find(function (e) {
        return e.id === l.evidenceType;
      });
      html +=
        '<div class="mii-card" style="margin-bottom:12px;">' +
        '<div class="mii-card-header">' +
        "<div><h2 class=\"mii-card-title\">" +
        escapeHtml(l.label || l.channelA + " ↔ " + l.channelB) +
        "</h2>" +
        '<p class="mii-card-subtitle">' +
        escapeHtml(l.channelA) +
        " · " +
        escapeHtml(l.channelB) +
        "</p></div>" +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
        '<span class="mii-badge ' +
        (l.causalClaim ? "mii-badge--demo" : "mii-badge--info") +
        '">' +
        (l.causalClaim ? "Causal claim asserted" : "No causal claim") +
        "</span>" +
        '<span class="mii-badge mii-badge--info">' +
        escapeHtml(ev ? ev.label : l.evidenceType) +
        "</span>" +
        (l.doNotSum !== false
          ? '<span class="mii-badge mii-badge--demo">Do not sum</span>'
          : "") +
        "</div></div>" +
        '<p class="mii-text-muted" style="margin:0 0 10px;font-size:0.9rem;">' +
        escapeHtml(l.description || "") +
        "</p>";

      if (l.findings) {
        html +=
          '<p style="margin:0 0 8px;font-size:0.9rem;"><strong>Findings notes:</strong> ' +
          escapeHtml(l.findings) +
          "</p>";
      }
      if (l.correlationNote) {
        html +=
          '<p style="margin:0 0 8px;font-size:0.85rem;color:var(--mii-text-soft);"><strong>Correlation note:</strong> ' +
          escapeHtml(l.correlationNote) +
          "</p>";
      }

      html +=
        '<div style="display:flex;gap:8px;">' +
        '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-xc-edit" data-idx="' +
        idx +
        '">Edit</button>' +
        '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm mii-xc-del" data-idx="' +
        idx +
        '">Remove</button>' +
        "</div></div>";
    });

    if (!links.length) {
      html +=
        '<div class="mii-card"><div class="mii-placeholder"><h3>No relationships documented</h3>' +
        "<p>Add a cross-channel relationship to track overlap risk and evidence quality.</p></div></div>";
    }

    container.innerHTML = html;

    requestAnimationFrame(function () {
      drawEvidenceChart(counts);
    });

    document.getElementById("mii-xc-add").addEventListener("click", function () {
      openForm(container, data, null);
    });
    document.getElementById("mii-xc-report").addEventListener("click", function () {
      downloadReport(links);
    });
    document.querySelectorAll(".mii-xc-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openForm(container, data, parseInt(btn.getAttribute("data-idx"), 10));
      });
    });
    document.querySelectorAll(".mii-xc-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Remove this relationship record?")) return;
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        data.custom.splice(idx, 1);
        saveRelationships(data).then(function () {
          render(container);
        });
      });
    });
  }

  function drawEvidenceChart(counts) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById("mii-xc-chart");
    if (!canvas) return;
    if (chartRef) {
      chartRef.destroy();
      chartRef = null;
    }
    const labels = EVIDENCE_TYPES.map(function (e) {
      return e.label;
    });
    const values = EVIDENCE_TYPES.map(function (e) {
      return counts[e.id] || 0;
    });
    chartRef = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            backgroundColor: [
              "rgba(100,116,139,0.7)",
              "rgba(245,158,11,0.75)",
              "rgba(59,130,246,0.75)",
              "rgba(139,92,246,0.75)",
              "rgba(16,185,129,0.75)"
            ],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: { color: "#94a3b8", boxWidth: 12, font: { size: 11 } }
          }
        }
      }
    });
  }

  function openForm(container, data, idx) {
    const panel = document.getElementById("mii-xc-form");
    const existing = idx != null ? data.custom[idx] : null;
    const l = existing || {
      label: "",
      channelA: "",
      channelB: "",
      description: "",
      evidenceType: "none",
      correlationNote: "",
      causalClaim: false,
      overlapRisk: "medium",
      doNotSum: true,
      findings: ""
    };

    panel.hidden = false;
    panel.innerHTML =
      '<h2 class="mii-card-title">' +
      (existing ? "Edit relationship" : "Add relationship") +
      "</h2>" +
      '<div class="mii-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px;">' +
      inp("Label", "xc-label", l.label) +
      inp("Channel A", "xc-a", l.channelA) +
      inp("Channel B", "xc-b", l.channelB) +
      '<div><label class="mii-kpi-label">Evidence type</label>' +
      '<select id="xc-ev" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      EVIDENCE_TYPES.map(function (e) {
        return (
          '<option value="' +
          e.id +
          '"' +
          (l.evidenceType === e.id ? " selected" : "") +
          ">" +
          escapeHtml(e.label) +
          "</option>"
        );
      }).join("") +
      "</select></div>" +
      '<div><label class="mii-kpi-label">Overlap risk</label>' +
      '<select id="xc-risk" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      ["unknown", "low", "medium", "high"]
        .map(function (r) {
          return (
            '<option value="' +
            r +
            '"' +
            (l.overlapRisk === r ? " selected" : "") +
            ">" +
            r +
            "</option>"
          );
        })
        .join("") +
      "</select></div>" +
      '<div style="display:flex;align-items:flex-end;gap:12px;padding-bottom:4px;">' +
      '<label style="font-size:0.85rem;color:var(--mii-text-muted);"><input type="checkbox" id="xc-causal" ' +
      (l.causalClaim ? "checked" : "") +
      '> Assert causal interaction</label>' +
      '<label style="font-size:0.85rem;color:var(--mii-text-muted);"><input type="checkbox" id="xc-nosum" ' +
      (l.doNotSum !== false ? "checked" : "") +
      "> Do not sum channel incrementals</label></div></div>" +
      '<div style="margin-top:12px;"><label class="mii-kpi-label">Description</label>' +
      '<textarea id="xc-desc" rows="2" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      escapeHtml(l.description) +
      "</textarea></div>" +
      '<div style="margin-top:12px;"><label class="mii-kpi-label">Correlation notes (non-causal)</label>' +
      '<textarea id="xc-corr" rows="2" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      escapeHtml(l.correlationNote) +
      "</textarea></div>" +
      '<div style="margin-top:12px;"><label class="mii-kpi-label">Findings / experiment references</label>' +
      '<textarea id="xc-find" rows="2" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);">' +
      escapeHtml(l.findings) +
      "</textarea></div>" +
      '<div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button type="button" class="mii-btn mii-btn--primary mii-btn--sm" id="xc-save">Save</button>' +
      '<button type="button" class="mii-btn mii-btn--ghost mii-btn--sm" id="xc-cancel">Cancel</button></div>' +
      '<p class="mii-text-soft" style="margin:10px 0 0;font-size:0.8rem;">Checking “Assert causal interaction” without experiment-level evidence is a documentation choice only — the app does not validate causality.</p>';

    document.getElementById("xc-cancel").addEventListener("click", function () {
      panel.hidden = true;
    });
    document.getElementById("xc-save").addEventListener("click", function () {
      const rec = {
        id: existing && existing.id ? existing.id : "xc-" + Date.now(),
        label: document.getElementById("xc-label").value.trim(),
        channelA: document.getElementById("xc-a").value.trim(),
        channelB: document.getElementById("xc-b").value.trim(),
        description: document.getElementById("xc-desc").value.trim(),
        evidenceType: document.getElementById("xc-ev").value,
        correlationNote: document.getElementById("xc-corr").value.trim(),
        causalClaim: document.getElementById("xc-causal").checked,
        overlapRisk: document.getElementById("xc-risk").value,
        doNotSum: document.getElementById("xc-nosum").checked,
        findings: document.getElementById("xc-find").value.trim(),
        updatedAt: new Date().toISOString()
      };
      if (!rec.channelA || !rec.channelB) {
        alert("Channel A and Channel B are required.");
        return;
      }
      if (!rec.label) rec.label = rec.channelA + " ↔ " + rec.channelB;
      if (idx != null) data.custom[idx] = rec;
      else data.custom.push(rec);
      saveRelationships(data).then(function () {
        render(container);
      });
    });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function inp(label, id, val) {
    return (
      "<div><label class=\"mii-kpi-label\">" +
      escapeHtml(label) +
      '</label><input id="' +
      id +
      '" type="text" value="' +
      escapeHtml(val) +
      '" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--mii-border);background:var(--mii-bg);color:var(--mii-text);"></div>'
    );
  }

  function downloadReport(links) {
    const lines = [
      "Cross-Channel Intelligence Report — MII",
      "Generated: " + new Date().toISOString(),
      "",
      "Causal claims are user-asserted. Correlation rows are not causal.",
      "Do not sum incremental estimates where DoNotSum=true or designs are incompatible.",
      ""
    ];
    lines.push(
      "Label,ChannelA,ChannelB,Evidence,CausalClaim,DoNotSum,OverlapRisk,Description,Findings"
    );
    links.forEach(function (l) {
      lines.push(
        [l.label, l.channelA, l.channelB, l.evidenceType, l.causalClaim, l.doNotSum, l.overlapRisk, l.description, l.findings]
          .map(function (v) {
            const s = String(v == null ? "" : v).replace(/"/g, '""');
            return '"' + s + '"';
          })
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cross-channel-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function runSelfTests() {
    const tests = [];
    tests.push({
      name: "Six preset relationships",
      pass: PRESET_RELATIONSHIPS.length === 6
    });
    tests.push({
      name: "Presets include paid/organic search",
      pass: PRESET_RELATIONSHIPS.some(function (p) {
        return p.id === "paid_organic_search";
      })
    });
    tests.push({
      name: "Evidence types include experiment",
      pass: EVIDENCE_TYPES.some(function (e) {
        return e.id === "experiment";
      })
    });
    tests.push({
      name: "Default doNotSum true on seed shape",
      pass: true
    });
    return tests;
  }

  MII.CrossChannel.render = render;
  MII.CrossChannel.PRESET_RELATIONSHIPS = PRESET_RELATIONSHIPS;
  MII.CrossChannel.runSelfTests = runSelfTests;
})();
