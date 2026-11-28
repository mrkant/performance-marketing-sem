/**
 * Free SEO + AI Audit — client-side engine
 * Namespace: window.STH.SEOAudit
 *
 * - HTML file analysis: fully local (FileReader + DOMParser)
 * - URL analysis: optional PageSpeed Insights (user API key) + best-effort fetch
 * - AI/GEO readiness heuristics
 * - Checklist scoring, CSV export, print
 */
(function () {
  "use strict";

  const STH = window.STH || {};
  window.STH = STH;
  STH.SEOAudit = STH.SEOAudit || {};

  const CHECKS = {
    title: { id: "title", label: "Title tag", weight: 8, category: "basic" },
    titleLength: { id: "titleLength", label: "Title length (30–60 chars)", weight: 5, category: "basic" },
    metaDesc: { id: "metaDesc", label: "Meta description", weight: 7, category: "basic" },
    metaDescLength: { id: "metaDescLength", label: "Meta description length (70–160)", weight: 4, category: "basic" },
    h1: { id: "h1", label: "H1 heading present", weight: 7, category: "structure" },
    h1Single: { id: "h1Single", label: "Single H1 (preferred)", weight: 4, category: "structure" },
    h2: { id: "h2", label: "H2 headings present", weight: 4, category: "structure" },
    viewport: { id: "viewport", label: "Mobile viewport meta", weight: 6, category: "technical" },
    canonical: { id: "canonical", label: "Canonical URL", weight: 5, category: "technical" },
    robots: { id: "robots", label: "Robots meta (not noindex)", weight: 5, category: "technical" },
    lang: { id: "lang", label: "HTML lang attribute", weight: 3, category: "technical" },
    imagesAlt: { id: "imagesAlt", label: "Images have alt attributes", weight: 6, category: "content" },
    ogTitle: { id: "ogTitle", label: "Open Graph title", weight: 3, category: "social" },
    ogDesc: { id: "ogDesc", label: "Open Graph description", weight: 3, category: "social" },
    ogImage: { id: "ogImage", label: "Open Graph image", weight: 3, category: "social" },
    schema: { id: "schema", label: "Structured data (JSON-LD)", weight: 6, category: "ai" },
    contentLength: { id: "contentLength", label: "Sufficient content length", weight: 4, category: "content" },
    internalLinks: { id: "internalLinks", label: "Internal links present", weight: 3, category: "content" },
    // AI / GEO readiness
    descriptiveHeadings: { id: "descriptiveHeadings", label: "Descriptive headings", weight: 4, category: "ai" },
    faqSignals: { id: "faqSignals", label: "FAQ / Q&A style content", weight: 3, category: "ai" },
    authorSignals: { id: "authorSignals", label: "Author / byline signals", weight: 3, category: "ai" },
    sourceSignals: { id: "sourceSignals", label: "Source / reference signals", weight: 3, category: "ai" },
    clearStructure: { id: "clearStructure", label: "Clear content organisation", weight: 4, category: "ai" }
  };

  function sanitize(str) {
    if (typeof str !== "string") return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  function getMetaContent(doc, nameOrProp, attr) {
    attr = attr || "name";
    const el = doc.querySelector('meta[' + attr + '="' + nameOrProp + '"]');
    return el ? (el.getAttribute("content") || "").trim() : "";
  }

  function analyseDocument(doc, sourceUrl) {
    const results = [];
    const details = {
      title: "",
      titleLength: 0,
      metaDescription: "",
      metaDescLength: 0,
      h1s: [],
      h2s: [],
      images: { total: 0, withAlt: 0, missingAlt: [] },
      links: { internal: 0, external: 0, total: 0 },
      canonical: "",
      robots: "",
      viewport: "",
      lang: "",
      og: { title: "", description: "", image: "" },
      schemas: [],
      contentLength: 0,
      wordCount: 0,
      textSample: ""
    };

    // Title
    const titleEl = doc.querySelector("title");
    details.title = titleEl ? titleEl.textContent.trim() : "";
    details.titleLength = details.title.length;

    results.push({
      check: CHECKS.title,
      status: details.title ? "pass" : "fail",
      message: details.title
        ? "Title found: “" + truncate(details.title, 70) + "”"
        : "No <title> tag found."
    });

    results.push({
      check: CHECKS.titleLength,
      status: !details.title
        ? "fail"
        : details.titleLength >= 30 && details.titleLength <= 60
        ? "pass"
        : details.titleLength > 0
        ? "warn"
        : "fail",
      message: details.title
        ? details.titleLength + " characters" +
          (details.titleLength < 30
            ? " (short — aim 30–60)"
            : details.titleLength > 60
            ? " (long — aim 30–60)"
            : " (good range)")
        : "No title to measure."
    });

    // Meta description
    details.metaDescription = getMetaContent(doc, "description");
    details.metaDescLength = details.metaDescription.length;

    results.push({
      check: CHECKS.metaDesc,
      status: details.metaDescription ? "pass" : "fail",
      message: details.metaDescription
        ? "Meta description found: “" + truncate(details.metaDescription, 90) + "”"
        : "No meta description found."
    });

    results.push({
      check: CHECKS.metaDescLength,
      status: !details.metaDescription
        ? "fail"
        : details.metaDescLength >= 70 && details.metaDescLength <= 160
        ? "pass"
        : "warn",
      message: details.metaDescription
        ? details.metaDescLength + " characters" +
          (details.metaDescLength < 70
            ? " (short)"
            : details.metaDescLength > 160
            ? " (long)"
            : " (good range)")
        : "No meta description."
    });

    // Headings
    const h1Nodes = doc.querySelectorAll("h1");
    details.h1s = Array.from(h1Nodes).map(function (n) {
      return n.textContent.trim();
    });
    const h2Nodes = doc.querySelectorAll("h2");
    details.h2s = Array.from(h2Nodes).map(function (n) {
      return n.textContent.trim();
    });

    results.push({
      check: CHECKS.h1,
      status: details.h1s.length > 0 ? "pass" : "fail",
      message:
        details.h1s.length > 0
          ? details.h1s.length + " H1 found: “" + truncate(details.h1s[0], 60) + "”"
          : "No H1 heading found."
    });

    results.push({
      check: CHECKS.h1Single,
      status:
        details.h1s.length === 1
          ? "pass"
          : details.h1s.length === 0
          ? "fail"
          : "warn",
      message:
        details.h1s.length === 1
          ? "Single H1 (preferred)."
          : details.h1s.length === 0
          ? "No H1."
          : details.h1s.length + " H1 tags found (prefer one primary H1)."
    });

    results.push({
      check: CHECKS.h2,
      status: details.h2s.length > 0 ? "pass" : "warn",
      message:
        details.h2s.length > 0
          ? details.h2s.length + " H2 headings found."
          : "No H2 headings — consider structuring content with H2s."
    });

    // Viewport
    details.viewport = getMetaContent(doc, "viewport");
    results.push({
      check: CHECKS.viewport,
      status: details.viewport ? "pass" : "fail",
      message: details.viewport
        ? "Viewport meta present."
        : "Missing mobile viewport meta tag."
    });

    // Canonical
    const canonicalEl = doc.querySelector('link[rel="canonical"]');
    details.canonical = canonicalEl ? (canonicalEl.getAttribute("href") || "").trim() : "";
    results.push({
      check: CHECKS.canonical,
      status: details.canonical ? "pass" : "warn",
      message: details.canonical
        ? "Canonical: " + truncate(details.canonical, 80)
        : "No canonical URL found."
    });

    // Robots
    details.robots = getMetaContent(doc, "robots").toLowerCase();
    const isNoindex =
      details.robots.indexOf("noindex") !== -1 ||
      details.robots.indexOf("none") !== -1;
    results.push({
      check: CHECKS.robots,
      status: isNoindex ? "fail" : "pass",
      message: details.robots
        ? "Robots meta: " + details.robots + (isNoindex ? " (blocking indexing)" : "")
        : "No robots meta (defaults to index,follow)."
    });

    // Lang
    details.lang = (doc.documentElement.getAttribute("lang") || "").trim();
    results.push({
      check: CHECKS.lang,
      status: details.lang ? "pass" : "warn",
      message: details.lang
        ? "HTML lang=\"" + details.lang + "\""
        : "Missing lang attribute on <html>."
    });

    // Images & alt
    const imgs = doc.querySelectorAll("img");
    details.images.total = imgs.length;
    imgs.forEach(function (img) {
      const alt = img.getAttribute("alt");
      if (alt !== null && alt.trim() !== "") {
        details.images.withAlt++;
      } else {
        const src = img.getAttribute("src") || img.getAttribute("data-src") || "(no src)";
        if (details.images.missingAlt.length < 8) {
          details.images.missingAlt.push(truncate(src, 60));
        }
      }
    });

    const altRatio =
      details.images.total === 0
        ? 1
        : details.images.withAlt / details.images.total;
    results.push({
      check: CHECKS.imagesAlt,
      status:
        details.images.total === 0
          ? "pass"
          : altRatio >= 0.9
          ? "pass"
          : altRatio >= 0.5
          ? "warn"
          : "fail",
      message:
        details.images.total === 0
          ? "No images found."
          : details.images.withAlt +
            "/" +
            details.images.total +
            " images have alt text." +
            (details.images.missingAlt.length
              ? " Missing examples: " + details.images.missingAlt.slice(0, 3).join(", ")
              : "")
    });

    // Open Graph
    details.og.title = getMetaContent(doc, "og:title", "property");
    details.og.description = getMetaContent(doc, "og:description", "property");
    details.og.image = getMetaContent(doc, "og:image", "property");

    results.push({
      check: CHECKS.ogTitle,
      status: details.og.title ? "pass" : "warn",
      message: details.og.title
        ? "og:title present."
        : "Missing Open Graph title."
    });
    results.push({
      check: CHECKS.ogDesc,
      status: details.og.description ? "pass" : "warn",
      message: details.og.description
        ? "og:description present."
        : "Missing Open Graph description."
    });
    results.push({
      check: CHECKS.ogImage,
      status: details.og.image ? "pass" : "warn",
      message: details.og.image
        ? "og:image present."
        : "Missing Open Graph image."
    });

    // Structured data (JSON-LD)
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach(function (s) {
      try {
        const parsed = JSON.parse(s.textContent);
        details.schemas.push(parsed);
      } catch (e) {
        /* ignore invalid JSON-LD */
      }
    });

    results.push({
      check: CHECKS.schema,
      status: details.schemas.length > 0 ? "pass" : "warn",
      message:
        details.schemas.length > 0
          ? details.schemas.length + " JSON-LD block(s) found."
          : "No JSON-LD structured data detected."
    });

    // Content length / word count (body text approximation)
    const body = doc.body;
    let text = "";
    if (body) {
      const clone = body.cloneNode(true);
      clone
        .querySelectorAll("script, style, noscript, nav, footer, header")
        .forEach(function (n) {
          n.remove();
        });
      text = (clone.textContent || "").replace(/\s+/g, " ").trim();
    }
    details.contentLength = text.length;
    details.wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    details.textSample = truncate(text, 200);

    results.push({
      check: CHECKS.contentLength,
      status:
        details.wordCount >= 300
          ? "pass"
          : details.wordCount >= 100
          ? "warn"
          : "fail",
      message:
        "Approx. " +
        details.wordCount +
        " words of main content." +
        (details.wordCount < 300
          ? " Thin content may underperform for informational queries."
          : "")
    });

    // Links
    const anchors = doc.querySelectorAll("a[href]");
    let baseHost = "";
    try {
      if (sourceUrl) baseHost = new URL(sourceUrl).hostname;
    } catch (e) {}

    anchors.forEach(function (a) {
      const href = (a.getAttribute("href") || "").trim();
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;
      details.links.total++;
      try {
        const u = new URL(href, sourceUrl || "https://example.com");
        if (baseHost && u.hostname === baseHost) details.links.internal++;
        else if (href.startsWith("http") || href.startsWith("//")) details.links.external++;
        else details.links.internal++;
      } catch (e) {
        details.links.internal++;
      }
    });

    results.push({
      check: CHECKS.internalLinks,
      status: details.links.internal > 0 ? "pass" : "warn",
      message:
        details.links.internal +
        " internal / " +
        details.links.external +
        " external links detected."
    });

    // ---- AI / GEO readiness heuristics ----
    const allHeadings = details.h1s.concat(details.h2s).join(" ").toLowerCase();
    const headingWords = allHeadings.split(/\s+/).filter(Boolean);
    const descriptive =
      headingWords.length >= 6 ||
      details.h2s.some(function (h) {
        return h.split(/\s+/).length >= 4;
      });

    results.push({
      check: CHECKS.descriptiveHeadings,
      status: descriptive ? "pass" : "warn",
      message: descriptive
        ? "Headings appear descriptive (good for AI extraction)."
        : "Headings are short or sparse — more descriptive H2s help AI systems understand topics."
    });

    const faqPattern =
      /\b(faq|frequently asked|q&a|questions?\s+and\s+answers?|how\s+do\s+i|what\s+is|why\s+does)\b/i;
    const hasFaq =
      faqPattern.test(text) ||
      details.h2s.some(function (h) {
        return /^(what|how|why|when|where|who|which|can|does|is)\b/i.test(h);
      }) ||
      details.schemas.some(function (s) {
        const t = JSON.stringify(s).toLowerCase();
        return t.indexOf("faqpage") !== -1 || t.indexOf("question") !== -1;
      });

    results.push({
      check: CHECKS.faqSignals,
      status: hasFaq ? "pass" : "warn",
      message: hasFaq
        ? "FAQ / Q&A style signals detected."
        : "No clear FAQ or question-style headings detected."
    });

    const authorPattern =
      /\b(by\s+[A-Z][a-z]+|author|written by|reviewed by|contributor)\b/i;
    const hasAuthor =
      authorPattern.test(text) ||
      !!doc.querySelector('[rel="author"], .author, .byline, [itemprop="author"]') ||
      details.schemas.some(function (s) {
        return JSON.stringify(s).toLowerCase().indexOf("author") !== -1;
      });

    results.push({
      check: CHECKS.authorSignals,
      status: hasAuthor ? "pass" : "warn",
      message: hasAuthor
        ? "Author / byline signals found."
        : "No clear author attribution detected."
    });

    const sourcePattern =
      /\b(source|reference|according to|cited|study|research|report)\b/i;
    const hasSources =
      sourcePattern.test(text) ||
      doc.querySelectorAll("cite, blockquote, [itemprop='citation']").length > 0;

    results.push({
      check: CHECKS.sourceSignals,
      status: hasSources ? "pass" : "warn",
      message: hasSources
        ? "Source / reference language or elements found."
        : "Limited source or reference signals."
    });

    const structureScore =
      (details.h1s.length > 0 ? 1 : 0) +
      (details.h2s.length >= 2 ? 1 : 0) +
      (details.schemas.length > 0 ? 1 : 0) +
      (details.wordCount >= 200 ? 1 : 0);

    results.push({
      check: CHECKS.clearStructure,
      status: structureScore >= 3 ? "pass" : structureScore >= 2 ? "warn" : "fail",
      message:
        "Structure signals score: " +
        structureScore +
        "/4 (H1, multiple H2s, schema, content length)."
    });

    // Score
    let totalWeight = 0;
    let earned = 0;
    results.forEach(function (r) {
      totalWeight += r.check.weight;
      if (r.status === "pass") earned += r.check.weight;
      else if (r.status === "warn") earned += r.check.weight * 0.5;
    });
    const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

    return {
      score: score,
      results: results,
      details: details,
      sourceUrl: sourceUrl || null,
      analysedAt: new Date().toISOString()
    };
  }

  function analyseHtmlString(html, sourceUrl) {
    const parser = new DOMParser();
    // Parse as text/html — scripts are not executed by DOMParser
    const doc = parser.parseFromString(html, "text/html");
    return analyseDocument(doc, sourceUrl);
  }

  /* ---------- PageSpeed Insights (optional, user key) ---------- */
  async function fetchPageSpeed(url, apiKey) {
    const endpoint =
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
      "?url=" +
      encodeURIComponent(url) +
      "&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES" +
      (apiKey ? "&key=" + encodeURIComponent(apiKey) : "");

    const res = await fetch(endpoint);
    if (!res.ok) {
      const errText = await res.text().catch(function () {
        return "";
      });
      throw new Error(
        "PageSpeed Insights request failed (" +
          res.status +
          "). " +
          (res.status === 429
            ? "Rate limit reached."
            : res.status === 400
            ? "Invalid URL or request."
            : "Check your API key and quota.")
      );
    }
    return res.json();
  }

  function extractPsiSummary(psi) {
    if (!psi || !psi.lighthouseResult) return null;
    const lr = psi.lighthouseResult;
    const cats = lr.categories || {};
    const audits = lr.audits || {};

    function scoreOf(key) {
      return cats[key] && typeof cats[key].score === "number"
        ? Math.round(cats[key].score * 100)
        : null;
    }

    const metrics = {};
    ["first-contentful-paint", "largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time", "speed-index", "interactive"].forEach(
      function (id) {
        if (audits[id]) {
          metrics[id] = {
            title: audits[id].title,
            display: audits[id].displayValue || "",
            score: audits[id].score
          };
        }
      }
    );

    const opportunities = [];
    Object.keys(audits).forEach(function (id) {
      const a = audits[id];
      if (a.details && a.details.type === "opportunity" && a.score !== null && a.score < 0.9) {
        opportunities.push({
          id: id,
          title: a.title,
          display: a.displayValue || "",
          score: a.score
        });
      }
    });

    return {
      performance: scoreOf("performance"),
      seo: scoreOf("seo"),
      accessibility: scoreOf("accessibility"),
      bestPractices: scoreOf("best-practices"),
      metrics: metrics,
      opportunities: opportunities.slice(0, 8),
      finalUrl: lr.finalUrl || "",
      fetchTime: lr.fetchTime || ""
    };
  }

  /* ---------- Render helpers ---------- */
  function statusClass(status) {
    if (status === "pass") return "sth-status-pass";
    if (status === "fail") return "sth-status-fail";
    return "sth-status-warn";
  }

  function statusLabel(status) {
    if (status === "pass") return "Pass";
    if (status === "fail") return "Fail";
    return "Warning";
  }

  function renderResults(report, psiSummary) {
    const container = document.getElementById("sth-results");
    if (!container) return;

    const score = report.score;
    let scoreColor = "#10b981";
    if (score < 50) scoreColor = "#ef4444";
    else if (score < 75) scoreColor = "#f59e0b";

    let html = "";

    // Score header
    html +=
      '<div class="sth-card" style="display:flex;flex-wrap:wrap;gap:28px;align-items:center;">' +
      '<div style="text-align:center;">' +
      '<div class="sth-score-ring" style="--score:' +
      score +
      ";background:conic-gradient(" +
      scoreColor +
      " calc(var(--score)*1%),#e2e8f0 0);\">" +
      "<span>" +
      score +
      "</span></div>" +
      '<div style="margin-top:8px;font-size:0.85rem;font-weight:700;color:#64748b;">SEO Checklist</div>' +
      "</div>" +
      '<div style="flex:1;min-width:200px;">' +
      "<h2 style=\"margin:0 0 8px;font-size:1.35rem;color:var(--sth-navy);\">Audit complete</h2>" +
      "<p style=\"margin:0;color:var(--sth-text-muted);font-size:0.95rem;\">" +
      (report.sourceUrl
        ? "Source: " + sanitize(report.sourceUrl)
        : "Source: uploaded HTML file") +
      "<br>Analysed at " +
      new Date(report.analysedAt).toLocaleString() +
      "</p>" +
      '<div class="sth-actions-bar">' +
      '<button type="button" class="sth-btn sth-btn--outline sth-btn--sm" id="sth-export-csv">Download CSV</button>' +
      '<button type="button" class="sth-btn sth-btn--ghost sth-btn--sm" id="sth-print-report">Print / PDF</button>' +
      "</div></div></div>";

    // PSI block
    if (psiSummary) {
      html +=
        '<div class="sth-card" style="margin-top:20px;">' +
        '<h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--sth-navy);">PageSpeed Insights (Lighthouse)</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-bottom:20px;">' +
        scoreBox("Performance", psiSummary.performance) +
        scoreBox("SEO", psiSummary.seo) +
        scoreBox("Accessibility", psiSummary.accessibility) +
        scoreBox("Best Practices", psiSummary.bestPractices) +
        "</div>";

      if (Object.keys(psiSummary.metrics).length) {
        html +=
          '<h4 style="margin:0 0 10px;font-size:0.9rem;color:#64748b;">Core Web Vitals &amp; metrics</h4><ul style="margin:0 0 16px;padding-left:18px;font-size:0.9rem;color:#334155;">';
        Object.keys(psiSummary.metrics).forEach(function (k) {
          const m = psiSummary.metrics[k];
          html +=
            "<li><strong>" +
            sanitize(m.title) +
            ":</strong> " +
            sanitize(m.display) +
            "</li>";
        });
        html += "</ul>";
      }

      if (psiSummary.opportunities.length) {
        html +=
          '<h4 style="margin:0 0 10px;font-size:0.9rem;color:#64748b;">Top opportunities</h4><ul style="margin:0;padding-left:18px;font-size:0.9rem;color:#334155;">';
        psiSummary.opportunities.forEach(function (o) {
          html +=
            "<li>" +
            sanitize(o.title) +
            (o.display ? " — " + sanitize(o.display) : "") +
            "</li>";
        });
        html += "</ul>";
      }
      html += "</div>";
    }

    // Checklist table
    html +=
      '<div class="sth-card" style="margin-top:20px;">' +
      '<h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--sth-navy);">SEO &amp; content checklist</h3>' +
      '<div class="sth-table-wrap"><table class="sth-table"><thead><tr>' +
      "<th>Check</th><th>Status</th><th>Details</th></tr></thead><tbody>";

    report.results.forEach(function (r) {
      html +=
        "<tr><td><strong>" +
        sanitize(r.check.label) +
        '</strong></td><td class="' +
        statusClass(r.status) +
        '">' +
        statusLabel(r.status) +
        "</td><td>" +
        sanitize(r.message) +
        "</td></tr>";
    });
    html += "</tbody></table></div></div>";

    // AI note
    html +=
      '<div class="sth-alert sth-alert--info" style="margin-top:20px;">' +
      "<strong>About AI / GEO readiness checks:</strong> These are technical and content-structure indicators " +
      "(headings, FAQ patterns, schema, author/source signals). They do <em>not</em> guarantee visibility in AI answers or search rankings. " +
      "Treat them as readiness signals, not ranking factors." +
      "</div>";

    // Recommendations
    const fails = report.results.filter(function (r) {
      return r.status === "fail";
    });
    const warns = report.results.filter(function (r) {
      return r.status === "warn";
    });

    if (fails.length || warns.length) {
      html +=
        '<div class="sth-card" style="margin-top:20px;">' +
        '<h3 style="margin:0 0 12px;font-size:1.1rem;color:var(--sth-navy);">Prioritised recommendations</h3><ol style="margin:0;padding-left:20px;font-size:0.95rem;color:#334155;">';
      fails.concat(warns).slice(0, 10).forEach(function (r) {
        html +=
          "<li style=\"margin-bottom:8px;\"><strong>" +
          sanitize(r.check.label) +
          ":</strong> " +
          sanitize(r.message) +
          "</li>";
      });
      html += "</ol></div>";
    }

    container.innerHTML = html;
    container.hidden = false;
    container.scrollIntoView({ behavior: "smooth", block: "start" });

    // Wire export / print
    const csvBtn = document.getElementById("sth-export-csv");
    if (csvBtn) {
      csvBtn.addEventListener("click", function () {
        exportCsv(report, psiSummary);
      });
    }
    const printBtn = document.getElementById("sth-print-report");
    if (printBtn) {
      printBtn.addEventListener("click", function () {
        window.print();
      });
    }
  }

  function scoreBox(label, value) {
    if (value === null || value === undefined) {
      return (
        '<div style="text-align:center;padding:12px;background:#f8fafc;border-radius:12px;">' +
        '<div style="font-size:1.5rem;font-weight:800;color:#94a3b8;">—</div>' +
        '<div style="font-size:0.75rem;font-weight:600;color:#64748b;">' +
        label +
        "</div></div>"
      );
    }
    let color = "#10b981";
    if (value < 50) color = "#ef4444";
    else if (value < 90) color = "#f59e0b";
    return (
      '<div style="text-align:center;padding:12px;background:#f8fafc;border-radius:12px;">' +
      '<div style="font-size:1.5rem;font-weight:800;color:' +
      color +
      ';">' +
      value +
      "</div>" +
      '<div style="font-size:0.75rem;font-weight:600;color:#64748b;">' +
      label +
      "</div></div>"
    );
  }

  function exportCsv(report, psiSummary) {
    const rows = [
      ["Check", "Status", "Details", "Category", "Weight"]
    ];
    report.results.forEach(function (r) {
      rows.push([
        r.check.label,
        statusLabel(r.status),
        r.message.replace(/"/g, '""'),
        r.check.category,
        r.check.weight
      ]);
    });
    rows.push([]);
    rows.push(["Overall SEO Checklist Score", report.score]);
    if (psiSummary) {
      rows.push([]);
      rows.push(["PageSpeed Performance", psiSummary.performance]);
      rows.push(["PageSpeed SEO", psiSummary.seo]);
      rows.push(["PageSpeed Accessibility", psiSummary.accessibility]);
      rows.push(["PageSpeed Best Practices", psiSummary.bestPractices]);
    }

    const csv = rows
      .map(function (row) {
        return row
          .map(function (cell) {
            return '"' + String(cell == null ? "" : cell) + '"';
          })
          .join(",");
      })
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "seo-audit-" +
      (report.sourceUrl
        ? report.sourceUrl.replace(/https?:\/\//, "").replace(/[^\w.-]+/g, "-").slice(0, 40)
        : "html-file") +
      "-" +
      new Date().toISOString().slice(0, 10) +
      ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------- UI wiring ---------- */
  function setLoading(isLoading, msg) {
    const el = document.getElementById("sth-loading");
    const runBtn = document.getElementById("sth-run-audit");
    if (el) {
      el.hidden = !isLoading;
      if (msg) {
        const t = el.querySelector(".sth-loading-text");
        if (t) t.textContent = msg;
      }
    }
    if (runBtn) runBtn.disabled = isLoading;
  }

  function showError(msg) {
    const box = document.getElementById("sth-error");
    if (!box) return;
    box.hidden = false;
    box.textContent = msg;
  }

  function clearError() {
    const box = document.getElementById("sth-error");
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
  }

  async function runAudit() {
    clearError();
    const mode = document.querySelector('input[name="sth-mode"]:checked');
    const modeVal = mode ? mode.value : "url";

    const resultsEl = document.getElementById("sth-results");
    if (resultsEl) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
    }

    try {
      if (modeVal === "file") {
        const fileInput = document.getElementById("sth-html-file");
        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
          showError("Please choose an HTML file to analyse.");
          return;
        }
        const file = fileInput.files[0];
        if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
          showError("Please upload a .html or .htm file.");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showError("File is too large (max 5 MB).");
          return;
        }

        setLoading(true, "Reading and analysing HTML…");
        const text = await file.text();
        // Safety: do not execute scripts — DOMParser does not run them
        const report = analyseHtmlString(text, null);
        setLoading(false);
        renderResults(report, null);
      } else {
        const urlInput = document.getElementById("sth-url");
        const url = (urlInput ? urlInput.value : "").trim();
        if (!url) {
          showError("Please enter a public website URL.");
          return;
        }
        let parsed;
        try {
          parsed = new URL(url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("Invalid protocol");
          }
        } catch (e) {
          showError("Enter a valid http:// or https:// URL.");
          return;
        }

        const apiKeyInput = document.getElementById("sth-psi-key");
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
        // Persist key only in sessionStorage (never sent to our servers)
        if (apiKey) {
          try {
            sessionStorage.setItem("sth_psi_key", apiKey);
          } catch (e) {}
        }

        setLoading(true, "Requesting PageSpeed Insights…");
        let psiSummary = null;
        try {
          const psi = await fetchPageSpeed(parsed.href, apiKey || undefined);
          psiSummary = extractPsiSummary(psi);
        } catch (psiErr) {
          console.warn("PSI error:", psiErr);
          // Continue with HTML fetch attempt
        }

        // Best-effort: try to fetch HTML for on-page checks (CORS often blocks)
        setLoading(true, "Attempting on-page HTML analysis…");
        let report = null;
        try {
          const htmlRes = await fetch(parsed.href, {
            method: "GET",
            mode: "cors",
            credentials: "omit"
          });
          if (htmlRes.ok) {
            const html = await htmlRes.text();
            report = analyseHtmlString(html, parsed.href);
          }
        } catch (fetchErr) {
          // Expected for most sites due to CORS
        }

        if (!report && !psiSummary) {
          setLoading(false);
          showError(
            "Could not analyse this URL from the browser (CORS or network). " +
              "Use the HTML file upload method instead, or provide a valid PageSpeed Insights API key for Lighthouse scores. " +
              "You can create a free key at Google Cloud Console (PageSpeed Insights API)."
          );
          return;
        }

        if (!report) {
          // Minimal report shell so UI still shows PSI
          report = {
            score: psiSummary && psiSummary.seo != null ? psiSummary.seo : 0,
            results: [
              {
                check: { id: "cors", label: "On-page HTML analysis", weight: 0, category: "technical" },
                status: "warn",
                message:
                  "Browser CORS blocked direct HTML fetch. Only PageSpeed Insights data is available. Upload the HTML file for full checklist."
              }
            ],
            details: {},
            sourceUrl: parsed.href,
            analysedAt: new Date().toISOString()
          };
        }

        setLoading(false);
        renderResults(report, psiSummary);
      }
    } catch (err) {
      setLoading(false);
      showError(err.message || "Unexpected error during analysis.");
      console.error(err);
    }
  }

  function init() {
    // Restore PSI key from session
    const keyInput = document.getElementById("sth-psi-key");
    if (keyInput) {
      try {
        const saved = sessionStorage.getItem("sth_psi_key");
        if (saved) keyInput.value = saved;
      } catch (e) {}
    }

    // Mode toggle
    const modeRadios = document.querySelectorAll('input[name="sth-mode"]');
    const urlPanel = document.getElementById("sth-panel-url");
    const filePanel = document.getElementById("sth-panel-file");

    function syncPanels() {
      const checked = document.querySelector('input[name="sth-mode"]:checked');
      const val = checked ? checked.value : "url";
      if (urlPanel) urlPanel.hidden = val !== "url";
      if (filePanel) filePanel.hidden = val !== "file";
    }
    modeRadios.forEach(function (r) {
      r.addEventListener("change", syncPanels);
    });
    syncPanels();

    const runBtn = document.getElementById("sth-run-audit");
    if (runBtn) runBtn.addEventListener("click", runAudit);

    // Enter key on URL field
    const urlInput = document.getElementById("sth-url");
    if (urlInput) {
      urlInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runAudit();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for testing
  STH.SEOAudit.analyseHtmlString = analyseHtmlString;
  STH.SEOAudit.analyseDocument = analyseDocument;
})();
