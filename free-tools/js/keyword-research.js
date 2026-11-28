/**
 * Free Keyword Research — client-side idea generator
 * Namespace: window.STH.KeywordResearch
 *
 * Generates variations, long-tails, questions, intent groups,
 * blog titles and FAQ ideas from a seed keyword.
 * No search volume / CPC / difficulty inventing.
 * Supports localStorage saved lists + CSV export.
 */
(function () {
  "use strict";

  const STH = window.STH || {};
  window.STH = STH;
  STH.KeywordResearch = STH.KeywordResearch || {};

  /* ---------- Pattern banks (English) ---------- */
  const PREFIXES = [
    "best", "top", "how to", "what is", "why", "guide to", "complete",
    "ultimate", "easy", "simple", "advanced", "free", "cheap", "affordable",
    "professional", "online", "local", "near me", "for beginners", "for experts"
  ];

  const SUFFIXES = [
    "guide", "tips", "examples", "tools", "software", "services", "agency",
    "cost", "price", "pricing", "benefits", "advantages", "disadvantages",
    "vs", "alternatives", "review", "reviews", "comparison", "checklist",
    "template", "templates", "strategy", "strategies", "best practices",
    "tutorial", "course", "training", "certification", "jobs", "salary",
    "near me", "in 2025", "in 2026", "for small business", "for startups"
  ];

  const QUESTION_STARTERS = [
    "what is", "what are", "how to", "how do i", "how does", "why is",
    "why do", "when should", "when to", "where to", "which", "who",
    "can i", "should i", "do i need", "is it worth", "how much does",
    "how long does", "what are the benefits of", "what is the difference between"
  ];

  const INTENT_MODIFIERS = {
    informational: [
      "what is", "how to", "guide", "tutorial", "explained", "meaning",
      "definition", "examples", "types of", "benefits of", "why"
    ],
    navigational: [
      "login", "official", "website", "portal", "app", "download",
      "account", "sign in", "customer service", "contact"
    ],
    commercial: [
      "best", "top", "review", "reviews", "comparison", "vs", "alternative",
      "alternatives", "compare", "which is better", "pros and cons"
    ],
    transactional: [
      "buy", "price", "cost", "pricing", "cheap", "discount", "deal",
      "coupon", "order", "subscribe", "hire", "get started", "free trial",
      "pricing plans", "near me"
    ]
  };

  const BLOG_TEMPLATES = [
    "The Complete Guide to {kw}",
    "How to Master {kw} in 2026",
    "{kw}: What It Is and Why It Matters",
    "10 Practical Tips for Better {kw}",
    "{kw} Best Practices for Marketers",
    "A Beginner’s Guide to {kw}",
    "Common {kw} Mistakes and How to Avoid Them",
    "How We Improved Results with {kw}",
    "{kw} vs Alternatives: Which Should You Choose?",
    "Step-by-Step {kw} Checklist"
  ];

  const FAQ_TEMPLATES = [
    "What is {kw}?",
    "How does {kw} work?",
    "Why is {kw} important?",
    "How much does {kw} cost?",
    "What are the benefits of {kw}?",
    "How do I get started with {kw}?",
    "What are common {kw} mistakes?",
    "Is {kw} worth it?",
    "How long does {kw} take?",
    "What tools do I need for {kw}?"
  ];

  const TOPIC_TEMPLATES = [
    "{kw} strategy",
    "{kw} for beginners",
    "{kw} case studies",
    "{kw} tools and software",
    "{kw} metrics and KPIs",
    "{kw} trends",
    "{kw} implementation checklist",
    "{kw} common challenges",
    "Measuring ROI of {kw}",
    "{kw} team structure and skills"
  ];

  const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

  /* ---------- Helpers ---------- */
  function cleanSeed(seed) {
    return (seed || "")
      .toLowerCase()
      .replace(/[^\w\s\-']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleCase(str) {
    return str.replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function unique(arr) {
    const seen = Object.create(null);
    return arr.filter(function (item) {
      const k = item.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  function classifyIntent(phrase) {
    const p = phrase.toLowerCase();
    let scores = { informational: 0, navigational: 0, commercial: 0, transactional: 0 };
    Object.keys(INTENT_MODIFIERS).forEach(function (intent) {
      INTENT_MODIFIERS[intent].forEach(function (mod) {
        if (p.indexOf(mod) !== -1) scores[intent] += 1;
      });
    });
    // Default lean informational for bare keywords
    if (scores.informational === 0 && scores.navigational === 0 &&
        scores.commercial === 0 && scores.transactional === 0) {
      scores.informational = 1;
    }
    let best = "informational";
    let max = -1;
    Object.keys(scores).forEach(function (k) {
      if (scores[k] > max) {
        max = scores[k];
        best = k;
      }
    });
    return best;
  }

  function generateFromSeed(seed, options) {
    options = options || {};
    const lang = options.language || "en";
    const country = options.country || "us";
    // Currently English-focused; architecture allows expansion
    if (lang !== "en") {
      // Future: load language packs
    }

    const s = cleanSeed(seed);
    if (!s || s.length < 2) {
      return { error: "Enter a seed keyword of at least 2 characters." };
    }

    const variations = [];
    const longTails = [];
    const questions = [];
    const alpha = [];
    const related = [];

    // Prefix + seed
    PREFIXES.forEach(function (pre) {
      variations.push(pre + " " + s);
    });

    // Seed + suffix
    SUFFIXES.forEach(function (suf) {
      variations.push(s + " " + suf);
    });

    // Simple plurals / forms
    if (!s.endsWith("s")) variations.push(s + "s");
    if (!s.endsWith("ing")) variations.push(s + "ing");
    variations.push(s + " for beginners");
    variations.push(s + " for business");
    variations.push(s + " strategy");
    variations.push(s + " tips");
    variations.push(s + " tools");

    // Long-tails (3–6 words)
    const longPatterns = [
      "how to improve " + s,
      "best practices for " + s,
      "step by step " + s + " guide",
      s + " for small businesses",
      "common " + s + " mistakes to avoid",
      "how to measure " + s + " success",
      s + " checklist for 2026",
      "affordable " + s + " solutions",
      s + " tools comparison",
      "what makes a good " + s + " strategy"
    ];
    longPatterns.forEach(function (p) {
      longTails.push(p);
    });

    // Questions
    QUESTION_STARTERS.forEach(function (q) {
      questions.push(q + " " + s);
    });
    questions.push("what are the best " + s + " tools");
    questions.push("how much should i spend on " + s);
    questions.push("is " + s + " still relevant");

    // Alphabetical
    ALPHABET.forEach(function (letter) {
      alpha.push(s + " " + letter);
      alpha.push(letter + " " + s);
    });

    // Related / semantic-ish expansions
    const relatedMods = [
      "strategy", "tactics", "framework", "process", "workflow",
      "automation", "analytics", "reporting", "optimization", "audit",
      "consultant", "freelancer", "agency", "platform", "software",
      "roi", "kpi", "metrics", "dashboard", "playbook"
    ];
    relatedMods.forEach(function (m) {
      related.push(s + " " + m);
    });

    // Deduplicate
    const allRaw = unique(
      variations.concat(longTails).concat(questions).concat(alpha).concat(related)
    );

    // Build structured items
    const items = allRaw.map(function (phrase, idx) {
      const intent = classifyIntent(phrase);
      const wordCount = phrase.split(/\s+/).length;
      let type = "variation";
      if (questions.indexOf(phrase) !== -1) type = "question";
      else if (longTails.indexOf(phrase) !== -1 || wordCount >= 4) type = "long-tail";
      else if (alpha.indexOf(phrase) !== -1) type = "alphabetical";
      else if (related.indexOf(phrase) !== -1) type = "related";

      return {
        id: "kw-" + idx,
        keyword: phrase,
        intent: intent,
        type: type,
        words: wordCount
      };
    });

    // Blog titles, FAQs, topics
    const blogTitles = BLOG_TEMPLATES.map(function (t) {
      return t.replace(/\{kw\}/g, titleCase(s));
    });
    const faqQuestions = FAQ_TEMPLATES.map(function (t) {
      return t.replace(/\{kw\}/g, s);
    });
    const topics = TOPIC_TEMPLATES.map(function (t) {
      return t.replace(/\{kw\}/g, s);
    });

    // Clusters by intent
    const clusters = {
      informational: [],
      navigational: [],
      commercial: [],
      transactional: []
    };
    items.forEach(function (item) {
      if (clusters[item.intent]) clusters[item.intent].push(item);
    });

    return {
      seed: s,
      language: lang,
      country: country,
      generatedAt: new Date().toISOString(),
      items: items,
      clusters: clusters,
      blogTitles: blogTitles,
      faqQuestions: faqQuestions,
      topics: topics,
      disclaimer:
        "These are generated keyword ideas based on linguistic patterns. " +
        "They are NOT real search volume, CPC or difficulty data. " +
        "Validate demand with your preferred keyword research platform before prioritising content or campaigns."
    };
  }

  /* ---------- UI state ---------- */
  let currentData = null;
  let activeFilter = "all";
  let activeIntent = "all";
  let sortMode = "alpha";

  function getFilteredItems() {
    if (!currentData) return [];
    let list = currentData.items.slice();

    if (activeFilter !== "all") {
      list = list.filter(function (i) {
        return i.type === activeFilter;
      });
    }
    if (activeIntent !== "all") {
      list = list.filter(function (i) {
        return i.intent === activeIntent;
      });
    }

    if (sortMode === "alpha") {
      list.sort(function (a, b) {
        return a.keyword.localeCompare(b.keyword);
      });
    } else if (sortMode === "words") {
      list.sort(function (a, b) {
        return a.words - b.words || a.keyword.localeCompare(b.keyword);
      });
    } else if (sortMode === "intent") {
      list.sort(function (a, b) {
        return a.intent.localeCompare(b.intent) || a.keyword.localeCompare(b.keyword);
      });
    }
    return list;
  }

  function renderResults() {
    const container = document.getElementById("sth-kw-results");
    if (!container || !currentData) return;

    const items = getFilteredItems();
    const d = currentData;

    let html = "";

    // Header + disclaimer
    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start;">' +
      "<div>" +
      '<h2 style="margin:0 0 6px;font-size:1.25rem;color:var(--sth-navy);">Results for “' +
      escapeHtml(d.seed) +
      '”</h2>' +
      '<p style="margin:0;font-size:0.9rem;color:var(--sth-text-muted);">' +
      d.items.length +
      " ideas generated · " +
      new Date(d.generatedAt).toLocaleString() +
      "</p></div>" +
      '<div class="sth-actions-bar" style="margin:0;">' +
      '<button type="button" class="sth-btn sth-btn--outline sth-btn--sm" id="sth-kw-csv">Download CSV</button>' +
      '<button type="button" class="sth-btn sth-btn--ghost sth-btn--sm" id="sth-kw-save">Save list</button>' +
      '<button type="button" class="sth-btn sth-btn--ghost sth-btn--sm" id="sth-kw-copy-all">Copy all</button>' +
      "</div></div>" +
      '<div class="sth-alert sth-alert--info" style="margin-top:16px;margin-bottom:0;">' +
      escapeHtml(d.disclaimer) +
      "</div></div>";

    // Filters
    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">' +
      '<div><label class="sth-label" style="margin-bottom:4px;">Type</label>' +
      '<select id="sth-filter-type" class="sth-select" style="width:auto;min-width:140px;">' +
      '<option value="all">All types</option>' +
      '<option value="variation">Variations</option>' +
      '<option value="long-tail">Long-tail</option>' +
      '<option value="question">Questions</option>' +
      '<option value="alphabetical">Alphabetical</option>' +
      '<option value="related">Related</option>' +
      "</select></div>" +
      '<div><label class="sth-label" style="margin-bottom:4px;">Intent</label>' +
      '<select id="sth-filter-intent" class="sth-select" style="width:auto;min-width:140px;">' +
      '<option value="all">All intents</option>' +
      '<option value="informational">Informational</option>' +
      '<option value="navigational">Navigational</option>' +
      '<option value="commercial">Commercial</option>' +
      '<option value="transactional">Transactional</option>' +
      "</select></div>" +
      '<div><label class="sth-label" style="margin-bottom:4px;">Sort</label>' +
      '<select id="sth-sort-mode" class="sth-select" style="width:auto;min-width:140px;">' +
      '<option value="alpha">A–Z</option>' +
      '<option value="words">Word count</option>' +
      '<option value="intent">Intent</option>' +
      "</select></div>" +
      '<div style="font-size:0.9rem;color:var(--sth-text-muted);align-self:flex-end;padding-bottom:4px;">' +
      items.length +
      " showing</div></div></div>";

    // Table
    html +=
      '<div class="sth-card" style="margin-bottom:20px;padding:0;overflow:hidden;">' +
      '<div class="sth-table-wrap" style="border:none;border-radius:0;">' +
      '<table class="sth-table"><thead><tr>' +
      "<th>Keyword</th><th>Type</th><th>Intent</th><th>Words</th><th></th>" +
      "</tr></thead><tbody>";

    if (items.length === 0) {
      html +=
        '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">No keywords match the current filters.</td></tr>';
    } else {
      items.forEach(function (item) {
        html +=
          "<tr>" +
          "<td><strong>" +
          escapeHtml(item.keyword) +
          "</strong></td>" +
          "<td>" +
          escapeHtml(item.type) +
          "</td>" +
          "<td><span class=\"sth-badge\">" +
          escapeHtml(item.intent) +
          "</span></td>" +
          "<td>" +
          item.words +
          "</td>" +
          '<td><button type="button" class="sth-btn sth-btn--ghost sth-btn--sm sth-copy-one" data-kw="' +
          escapeAttr(item.keyword) +
          '">Copy</button></td>' +
          "</tr>";
      });
    }
    html += "</tbody></table></div></div>";

    // Clusters summary
    html +=
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<h3 style="margin:0 0 14px;font-size:1.05rem;color:var(--sth-navy);">Intent clusters</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">';
    Object.keys(d.clusters).forEach(function (intent) {
      const count = d.clusters[intent].length;
      html +=
        '<div style="background:#f8fafc;border-radius:12px;padding:14px;text-align:center;">' +
        '<div style="font-size:1.4rem;font-weight:800;color:var(--sth-navy);">' +
        count +
        "</div>" +
        '<div style="font-size:0.8rem;font-weight:600;color:#64748b;text-transform:capitalize;">' +
        intent +
        "</div></div>";
    });
    html += "</div></div>";

    // Blog titles
    html += sectionList("Blog title suggestions", d.blogTitles);
    html += sectionList("FAQ question suggestions", d.faqQuestions);
    html += sectionList("Content topic ideas", d.topics);

    container.innerHTML = html;
    container.hidden = false;
    container.scrollIntoView({ behavior: "smooth", block: "start" });

    // Restore filter values
    const ft = document.getElementById("sth-filter-type");
    const fi = document.getElementById("sth-filter-intent");
    const sm = document.getElementById("sth-sort-mode");
    if (ft) ft.value = activeFilter;
    if (fi) fi.value = activeIntent;
    if (sm) sm.value = sortMode;

    // Wire events
    if (ft) {
      ft.addEventListener("change", function () {
        activeFilter = ft.value;
        renderResults();
      });
    }
    if (fi) {
      fi.addEventListener("change", function () {
        activeIntent = fi.value;
        renderResults();
      });
    }
    if (sm) {
      sm.addEventListener("change", function () {
        sortMode = sm.value;
        renderResults();
      });
    }

    document.querySelectorAll(".sth-copy-one").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-kw"));
        btn.textContent = "Copied";
        setTimeout(function () {
          btn.textContent = "Copy";
        }, 1200);
      });
    });

    const csvBtn = document.getElementById("sth-kw-csv");
    if (csvBtn) csvBtn.addEventListener("click", exportCsv);

    const copyAllBtn = document.getElementById("sth-kw-copy-all");
    if (copyAllBtn) {
      copyAllBtn.addEventListener("click", function () {
        const text = getFilteredItems()
          .map(function (i) {
            return i.keyword;
          })
          .join("\n");
        copyText(text);
        copyAllBtn.textContent = "Copied!";
        setTimeout(function () {
          copyAllBtn.textContent = "Copy all";
        }, 1200);
      });
    }

    const saveBtn = document.getElementById("sth-kw-save");
    if (saveBtn) saveBtn.addEventListener("click", saveList);
  }

  function sectionList(title, arr) {
    let html =
      '<div class="sth-card" style="margin-bottom:20px;">' +
      '<h3 style="margin:0 0 12px;font-size:1.05rem;color:var(--sth-navy);">' +
      escapeHtml(title) +
      '</h3><ul style="margin:0;padding-left:18px;font-size:0.95rem;color:#334155;">';
    arr.forEach(function (item) {
      html +=
        '<li style="margin-bottom:6px;display:flex;justify-content:space-between;gap:12px;align-items:center;">' +
        "<span>" +
        escapeHtml(item) +
        '</span> <button type="button" class="sth-btn sth-btn--ghost sth-btn--sm sth-copy-one" data-kw="' +
        escapeAttr(item) +
        '">Copy</button></li>';
    });
    html += "</ul></div>";
    return html;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function exportCsv() {
    if (!currentData) return;
    const items = getFilteredItems();
    const rows = [["Keyword", "Type", "Intent", "Word Count"]];
    items.forEach(function (i) {
      rows.push([i.keyword, i.type, i.intent, i.words]);
    });
    rows.push([]);
    rows.push(["Blog Titles"]);
    currentData.blogTitles.forEach(function (t) {
      rows.push([t]);
    });
    rows.push([]);
    rows.push(["FAQ Questions"]);
    currentData.faqQuestions.forEach(function (t) {
      rows.push([t]);
    });

    const csv = rows
      .map(function (row) {
        return row
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
      "keywords-" +
      currentData.seed.replace(/\s+/g, "-").slice(0, 30) +
      "-" +
      new Date().toISOString().slice(0, 10) +
      ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function saveList() {
    if (!currentData) return;
    try {
      const key = "sth_kw_lists";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.unshift({
        seed: currentData.seed,
        savedAt: new Date().toISOString(),
        count: currentData.items.length,
        items: currentData.items.map(function (i) {
          return i.keyword;
        })
      });
      // Keep last 20
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 20)));
      const btn = document.getElementById("sth-kw-save");
      if (btn) {
        btn.textContent = "Saved!";
        setTimeout(function () {
          btn.textContent = "Save list";
        }, 1500);
      }
      renderSavedLists();
    } catch (e) {
      alert("Could not save to browser storage.");
    }
  }

  function renderSavedLists() {
    const el = document.getElementById("sth-saved-lists");
    if (!el) return;
    try {
      const lists = JSON.parse(localStorage.getItem("sth_kw_lists") || "[]");
      if (!lists.length) {
        el.innerHTML =
          '<p style="color:#94a3b8;font-size:0.9rem;margin:0;">No saved lists yet.</p>';
        return;
      }
      let html = '<ul style="margin:0;padding:0;list-style:none;">';
      lists.forEach(function (list, idx) {
        html +=
          '<li style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #e2e8f0;">' +
          "<div><strong>" +
          escapeHtml(list.seed) +
          '</strong> <span style="font-size:0.8rem;color:#94a3b8;">(' +
          list.count +
          " keywords · " +
          new Date(list.savedAt).toLocaleDateString() +
          ")</span></div>" +
          '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="sth-btn sth-btn--ghost sth-btn--sm sth-load-list" data-idx="' +
          idx +
          '">Load</button>' +
          '<button type="button" class="sth-btn sth-btn--ghost sth-btn--sm sth-delete-list" data-idx="' +
          idx +
          '">Delete</button>' +
          "</div></li>";
      });
      html += "</ul>";
      el.innerHTML = html;

      el.querySelectorAll(".sth-load-list").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const idx = parseInt(btn.getAttribute("data-idx"), 10);
          const list = lists[idx];
          if (!list) return;
          // Re-generate from seed so full structure is available
          document.getElementById("sth-kw-seed").value = list.seed;
          runGenerate();
        });
      });
      el.querySelectorAll(".sth-delete-list").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const idx = parseInt(btn.getAttribute("data-idx"), 10);
          lists.splice(idx, 1);
          localStorage.setItem("sth_kw_lists", JSON.stringify(lists));
          renderSavedLists();
        });
      });
    } catch (e) {
      el.innerHTML = "";
    }
  }

  function runGenerate() {
    const seedInput = document.getElementById("sth-kw-seed");
    const seed = seedInput ? seedInput.value.trim() : "";
    const langSel = document.getElementById("sth-kw-lang");
    const countrySel = document.getElementById("sth-kw-country");
    const errBox = document.getElementById("sth-kw-error");

    if (errBox) {
      errBox.hidden = true;
      errBox.textContent = "";
    }

    const result = generateFromSeed(seed, {
      language: langSel ? langSel.value : "en",
      country: countrySel ? countrySel.value : "us"
    });

    if (result.error) {
      if (errBox) {
        errBox.hidden = false;
        errBox.textContent = result.error;
      }
      return;
    }

    currentData = result;
    activeFilter = "all";
    activeIntent = "all";
    sortMode = "alpha";
    renderResults();
  }

  function init() {
    const runBtn = document.getElementById("sth-kw-run");
    if (runBtn) runBtn.addEventListener("click", runGenerate);

    const seedInput = document.getElementById("sth-kw-seed");
    if (seedInput) {
      seedInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runGenerate();
        }
      });
    }

    renderSavedLists();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for testing
  STH.KeywordResearch.generateFromSeed = generateFromSeed;
})();
