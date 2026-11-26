
/*
 * Shashi Kant - Intelligent Site Search
 * Version 2.0
 *
 * Supports:
 * - Semantic keyword expansion
 * - Intent-aware relevance scoring
 * - Phrase matching
 * - Existing JSON search index
 * - Existing type/status/topic filters
 * - Safe DOM rendering
 * - Search URL sharing
 * - Search analytics events
 */

(function () {
  "use strict";

  const app = document.querySelector("[data-search-app]");
  if (!app) return;

  const input = document.getElementById("site-search");
  const typeFilter = document.getElementById("type-filter");
  const statusFilter = document.getElementById("status-filter");
  const topicFilter = document.getElementById("topic-filter");
  const resultsEl = document.getElementById("search-results");
  const countEl = document.getElementById("search-count");

  if (!input || !resultsEl || !countEl) return;

  let searchData = [];
  let dataLoaded = false;

  // --------------------------------------------------
  // 1. Search vocabulary and related expressions
  // --------------------------------------------------

  const synonyms = {
    seo: [
      "organic search", "search engine optimization",
      "google ranking", "organic visibility",
      "search visibility", "technical seo",
      "keyword optimization", "content optimization"
    ],

    sem: [
      "paid search", "search advertising",
      "search engine marketing", "ppc",
      "google ads", "paid media"
    ],

    advertising: [
      "advertisement", "ads", "paid advertising",
      "media buying", "campaign management",
      "digital advertising"
    ],

    ecommerce: [
      "e-commerce", "online store", "online retail",
      "digital commerce", "product discovery",
      "product pages", "shopping experience"
    ],

    marketplace: [
      "marketplace", "amazon", "product listing",
      "marketplace optimization", "product feed",
      "shopping platforms"
    ],

    japan: [
      "japanese market", "japan market",
      "localization", "japan business",
      "japanese consumers"
    ],

    apac: [
      "asia pacific", "asia-pacific",
      "regional markets", "cross-border",
      "india", "korea", "south korea"
    ],

    analytics: [
      "measurement", "reporting", "data analysis",
      "performance tracking", "attribution",
      "insights", "measurement strategy"
    ],

    growth: [
      "business growth", "revenue growth",
      "customer acquisition", "conversion",
      "performance improvement", "scaling"
    ],

    agency: [
      "agency management", "agency coordination",
      "partner management", "vendor management",
      "agency operations"
    ],

    intelligence: [
      "market intelligence", "competitive intelligence",
      "competitor research", "market research",
      "advertising intelligence"
    ],

    strategy: [
      "planning", "optimization", "consulting",
      "strategic planning", "business strategy"
    ]
  };

  // --------------------------------------------------
  // 2. Query normalization
  // --------------------------------------------------

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9+#.\s-]/g, " ")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(value) {
    return normalize(value)
      .split(" ")
      .filter(word => word.length > 1);
  }

  function unique(values) {
    return [...new Set(values)];
  }

  // --------------------------------------------------
  // 3. Expand queries with related terminology
  // --------------------------------------------------

  function expandQuery(query) {
    const terms = tokenize(query);
    const expanded = [...terms];

    Object.entries(synonyms).forEach(([key, related]) => {
      const normalizedRelated = related.map(normalize);

      const matches =
        terms.includes(key) ||
        normalizedRelated.some(phrase =>
          normalize(query).includes(phrase)
        );

      if (matches) {
        expanded.push(key);
        expanded.push(...related.flatMap(tokenize));
      }
    });

    // Lightweight singular/plural normalization
    terms.forEach(term => {
      if (term.length > 4 && term.endsWith("s")) {
        expanded.push(term.slice(0, -1));
      }
    });

    return unique(expanded);
  }

  // --------------------------------------------------
  // 4. Build searchable content from JSON records
  // --------------------------------------------------

  function getItemFields(item) {
    return {
      title: normalize(item.title),
      description: normalize(item.description),
      excerpt: normalize(item.excerpt),
      keywords: normalize((item.keywords || []).join(" ")),
      tags: normalize((item.tags || []).join(" ")),
      companies: normalize((item.relatedCompanies || []).join(" ")),
      skills: normalize((item.relatedSkills || []).join(" ")),
      summary: normalize(item.contentSummary),
      intent: normalize((item.searchIntent || []).join(" "))
    };
  }

  // --------------------------------------------------
  // 5. Intelligent relevance scoring
  // --------------------------------------------------

  function scoreItem(item, query, terms, topic) {
    const fields = getItemFields(item);

    const searchable = Object.values(fields).join(" ");

    let score = Number(item.priority) || 0;

    const phrase = normalize(query);

    if (phrase) {
      if (fields.title === phrase) score += 200;
      if (fields.title.includes(phrase)) score += 100;
      if (fields.keywords.includes(phrase)) score += 85;
      if (fields.tags.includes(phrase)) score += 65;
      if (fields.summary.includes(phrase)) score += 45;
      if (fields.description.includes(phrase)) score += 40;
      if (searchable.includes(phrase)) score += 30;
    }

    const expandedTerms = expandQuery(query);

    terms.forEach(term => {
      if (fields.title.includes(term)) score += 30;
      if (fields.keywords.includes(term)) score += 25;
      if (fields.tags.includes(term)) score += 20;
      if (fields.intent.includes(term)) score += 22;
      if (fields.companies.includes(term)) score += 18;
      if (fields.skills.includes(term)) score += 16;
      if (fields.description.includes(term)) score += 12;
      if (fields.excerpt.includes(term)) score += 10;
      if (fields.summary.includes(term)) score += 8;
    });

    expandedTerms.forEach(term => {
      if (terms.includes(term)) return;

      if (fields.title.includes(term)) score += 12;
      if (fields.keywords.includes(term)) score += 10;
      if (fields.tags.includes(term)) score += 8;
      if (fields.summary.includes(term)) score += 5;
    });

    // Reward records matching several original query terms.
    const matchedTerms = terms.filter(term =>
      searchable.includes(term)
    ).length;

    if (terms.length > 1) {
      score += matchedTerms * 5;

      if (matchedTerms === terms.length) {
        score += 25;
      }
    }

    // Topic filter
    if (topic && topic !== "All") {
      const selectedTopic = normalize(topic);

      if (
        fields.tags.includes(selectedTopic) ||
        fields.keywords.includes(selectedTopic) ||
        fields.summary.includes(selectedTopic) ||
        fields.intent.includes(selectedTopic)
      ) {
        score += 40;
      } else {
        score -= 25;
      }
    }

    return score;
  }

  // --------------------------------------------------
  // 6. Safe text and highlighting
  // --------------------------------------------------

  function addHighlightedText(container, text, queryTerms) {
    const original = String(text || "");

    if (!queryTerms.length) {
      container.textContent = original;
      return;
    }

    const escapedTerms = unique(queryTerms)
      .filter(term => term.length > 1)
      .sort((a, b) => b.length - a.length)
      .map(term =>
        term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );

    if (!escapedTerms.length) {
      container.textContent = original;
      return;
    }

    const regex = new RegExp(
      "(" + escapedTerms.join("|") + ")",
      "gi"
    );

    const parts = original.split(regex);

    parts.forEach(part => {
      if (!part) return;

      if (regex.test(part)) {
        const mark = document.createElement("mark");
        mark.textContent = part;
        container.appendChild(mark);
        regex.lastIndex = 0;
      } else {
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  // --------------------------------------------------
  // 7. Search URL synchronization
  // --------------------------------------------------

  function updateSearchURL() {
    const params = new URLSearchParams(window.location.search);
    const query = input.value.trim();

    if (query) {
      params.set("q", query);
    } else {
      params.delete("q");
    }

    [
      ["type", typeFilter],
      ["status", statusFilter],
      ["topic", topicFilter]
    ].forEach(([key, element]) => {
      if (element && element.value !== "All") {
        params.set(key, element.value);
      } else {
        params.delete(key);
      }
    });

    const queryString = params.toString();

    const newURL = window.location.pathname +
      (queryString ? "?" + queryString : "") +
      window.location.hash;

    window.history.replaceState({}, "", newURL);
  }

  // --------------------------------------------------
  // 8. Result card creation
  // --------------------------------------------------

  function createResultCard(item, terms) {
    const article = document.createElement("article");
    article.className = "result-card";

    const top = document.createElement("div");
    top.className = "result-top";

    const type = document.createElement("span");
    type.className = "result-type";
    type.textContent = item.type || "Page";

    const status = document.createElement("span");
    status.className = "result-status";
    status.textContent = item.status || "Live";

    top.append(type, status);

    const heading = document.createElement("h2");
    addHighlightedText(heading, item.title, terms);

    const description = document.createElement("p");
    addHighlightedText(
      description,
      item.excerpt || item.description || "",
      terms
    );

    const tags = document.createElement("div");
    tags.className = "tag-row";

    (item.tags || []).slice(0, 6).forEach(tag => {
      const span = document.createElement("span");
      addHighlightedText(span, tag, terms);
      tags.appendChild(span);
    });

    const link = document.createElement("a");
    link.className = "btn quiet";
    link.textContent = "Open page";

    // Only allow same-site URLs or valid HTTP(S) destinations.
    try {
      const destination = new URL(
        item.url,
        window.location.origin
      );

      if (
        ["http:", "https:"].includes(destination.protocol) &&
        destination.origin === window.location.origin
      ) {
        link.href = destination.href;
      } else {
        return null;
      }
    } catch {
      return null;
    }

    article.append(top, heading, description, tags, link);

    return article;
  }

  // --------------------------------------------------
  // 9. Search engine
  // --------------------------------------------------

  function renderResults() {
    if (!dataLoaded) return;

    const query = input.value.trim();

    const type = typeFilter?.value || "All";
    const status = statusFilter?.value || "All";
    const topic = topicFilter?.value || "All";

    const terms = tokenize(query);

    let results = searchData
      .map(item => ({
        item,
        score: scoreItem(item, query, terms, topic)
      }))
      .filter(result => {
        const item = result.item;

        return (
          (!terms.length || result.score > 5) &&
          (type === "All" || item.type === type) &&
          (status === "All" || item.status === status)
        );
      })
      .sort((a, b) =>
        b.score - a.score ||
        (Number(b.item.priority) || 0) -
        (Number(a.item.priority) || 0)
      )
      .slice(0, 40);

    if (
      !query &&
      topic === "All" &&
      type === "All" &&
      status === "All"
    ) {
      results = searchData
        .slice()
        .sort((a, b) =>
          (Number(b.priority) || 0) -
          (Number(a.priority) || 0)
        )
        .slice(0, 12)
        .map(item => ({ item }));
    }

    resultsEl.replaceChildren();

    const validCards = results
      .map(result => createResultCard(result.item, terms))
      .filter(Boolean);

    countEl.textContent =
      validCards.length +
      (validCards.length === 1 ? " result found" : " results found");

    if (!validCards.length) {
      const empty = document.createElement("div");
      empty.className = "no-results";
      empty.textContent =
        "No matching pages found. Try SEO, advertising, ecommerce, Japan, APAC or marketing intelligence.";

      resultsEl.appendChild(empty);
    } else {
      validCards.forEach(card => resultsEl.appendChild(card));
    }

    updateSearchURL();

    window.dispatchEvent(
      new CustomEvent("internal_search", {
        detail: {
          query,
          resultCount: validCards.length,
          type,
          status,
          topic
        }
      })
    );
  }

  // --------------------------------------------------
  // 10. Load search index
  // --------------------------------------------------

  async function loadSearchData() {
    try {
      const response = await fetch("search-data.json");

      if (!response.ok) {
        throw new Error("Search data unavailable");
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid search index format");
      }

      searchData = data.filter(item =>
        item &&
        typeof item.title === "string" &&
        typeof item.url === "string"
      );

      dataLoaded = true;

      const params = new URLSearchParams(
        window.location.search
      );

      input.value = params.get("q") || "";

      if (typeFilter && params.has("type")) {
        typeFilter.value = params.get("type");
      }

      if (statusFilter && params.has("status")) {
        statusFilter.value = params.get("status");
      }

      if (topicFilter && params.has("topic")) {
        topicFilter.value = params.get("topic");
      }

      renderResults();

    } catch (error) {
      console.error("Site search error:", error);

      countEl.textContent = "Search is temporarily unavailable.";

      const message = document.createElement("div");
      message.className = "no-results";
      message.textContent =
        "Search data could not be loaded. Please try again later.";

      resultsEl.replaceChildren(message);
    }
  }

  // --------------------------------------------------
  // 11. Event listeners
  // --------------------------------------------------

  [input, typeFilter, statusFilter, topicFilter]
    .filter(Boolean)
    .forEach(element => {
      element.addEventListener("input", renderResults);
      element.addEventListener("change", renderResults);
    });

  document.querySelectorAll("[data-query]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.query || "";
      input.focus();
      renderResults();
    });
  });

  loadSearchData();

})();
