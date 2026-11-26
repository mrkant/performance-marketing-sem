(function(){const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;const navToggle=document.querySelector(".nav-toggle");const siteNav=document.getElementById("site-nav");if(navToggle&&siteNav){navToggle.addEventListener("click",()=>{const open=siteNav.classList.toggle("open");navToggle.setAttribute("aria-expanded",String(open));});}const revealEls=document.querySelectorAll(".reveal");if(reduce){revealEls.forEach(el=>el.classList.add("is-visible"));}else if("IntersectionObserver" in window){const io=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");io.unobserve(entry.target);}});},{threshold:.12});revealEls.forEach(el=>io.observe(el));}else{revealEls.forEach(el=>el.classList.add("is-visible"));}const pathContent={hiring:{title:"For hiring teams",body:"I am most relevant for work where digital growth depends on search, paid media, ecommerce, agencies, analytics and cross-border execution working together."},growth:{title:"For growth support",body:"The focus is to identify where growth slows down across search, media, ecommerce, reporting, agencies and local execution."},search:{title:"For SEO/SEM help",body:"The work connects search intent, paid media structure, organic visibility, ecommerce pages and performance signals."},apac:{title:"For Japan/APAC support",body:"The focus is to connect global business goals with local market behavior, culture, agency work and execution realities."}};const pathButtons=document.querySelectorAll(".path-card");const pathResult=document.getElementById("path-result");pathButtons.forEach(button=>{button.addEventListener("click",()=>{pathButtons.forEach(b=>b.classList.remove("active"));button.classList.add("active");const item=pathContent[button.dataset.path==="japan"?"apac":button.dataset.path];if(pathResult&&item){pathResult.innerHTML=`<h3>${item.title}</h3><p>${item.body}</p>`;}});});const stageDataEl=document.getElementById("stage-data");const marker=document.querySelector("[data-journey-marker]");const detail=document.getElementById("journey-detail");const nodes=document.querySelectorAll(".journey-node");let stages=[];if(stageDataEl){try{stages=JSON.parse(stageDataEl.textContent);}catch(e){stages=[];}}const markerCoords=[[8,48],[17,42],[26,35],[35,28],[44,21],[53,28],[62,35],[71,42],[80,49],[89,42]];function setJourney(index){const s=stages[index];if(!s)return;nodes.forEach(n=>n.classList.toggle("active",Number(n.dataset.stage)===index));if(marker){const mobile=window.matchMedia("(max-width: 720px)").matches;if(mobile){marker.style.top=`${5+index*9}%`;}else{marker.style.left=`${markerCoords[index][0]}%`;marker.style.top=`${markerCoords[index][1]}%`;}}if(detail){detail.innerHTML=`<p class="eyebrow">${s.period} - ${s.environment}</p><h3>${s.title}</h3><p>${s.challenge}</p><span>Skill gained: ${s.skill}</span>`;}}nodes.forEach(n=>n.addEventListener("click",()=>setJourney(Number(n.dataset.stage))));if(nodes.length)setJourney(1);const matcherData={seo:{title:"SEO & Search Growth Review",body:"Useful when organic visibility, technical SEO, content structure or search intent needs clearer priorities."},sem:{title:"SEM & Paid Search Review",body:"Useful when paid search, PMax, budget allocation or paid/organic overlap needs clearer decision-making."},commerce:{title:"eCommerce Discovery Review",body:"Useful when product pages, metadata, merchandising, navigation or onsite discovery need improvement."},apac:{title:"Japan & APAC Execution Review",body:"Useful when global goals need stronger local execution across Japan, India, Korea or APAC."}};const matcherButtons=document.querySelectorAll("[data-match]");const matcherResult=document.getElementById("matcher-result");matcherButtons.forEach(button=>{button.addEventListener("click",()=>{matcherButtons.forEach(b=>b.classList.remove("active"));button.classList.add("active");const item=matcherData[button.dataset.match];if(matcherResult&&item)matcherResult.innerHTML=`<h3>${item.title}</h3><p>${item.body}</p>`;});});

  const app = document.querySelector("[data-search-app]");
  if (!app) return;

  const input = document.getElementById("site-search");
  const resultsEl = document.getElementById("search-results");
  const countEl = document.getElementById("search-count");
  if (!input || !resultsEl || !countEl) return;

  const facets = [
    { key: "type", select: document.getElementById("type-filter") },
    { key: "status", select: document.getElementById("status-filter") },
    { key: "topic", select: document.getElementById("topic-filter") },
    { key: "language", select: document.getElementById("language-filter") }
  ].filter(facet => facet.select);
  const languageNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" })
    : null;
  const segmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
  const showMore = document.getElementById("search-more");
  const indexUrl = new URL(app.dataset.searchIndex || "search-data.json", window.location.href);
  const pageSize = 24;
  let records = [];
  let results = [];
  let visible = 0;
  let terms = [];
  let timer;
  let state = "loading";
  let lastSearch;

  function fold(text) {
    return text.normalize("NFKC").toLowerCase().normalize("NFD")
      .replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC");
  }

  function tokenize(text) {
    return fold(text).match(/[\p{L}\p{N}\p{M}]+/gu) || [];
  }

  function field(text) {
    const normalized = fold(text);
    return { normalized, words: tokenize(text) };
  }

  function readRecord(item) {
    if (!item || typeof item !== "object") return null;
    const string = key => typeof item[key] === "string" ? item[key].trim() : "";
    const list = key => Array.isArray(item[key])
      ? item[key].filter(value => typeof value === "string" && value.trim()).map(value => value.trim())
      : [];
    const title = string("title");
    const rawUrl = string("url");
    if (!title || !rawUrl) return null;

    let url;
    try {
      url = new URL(rawUrl, indexUrl);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== window.location.origin ||
        url.username || url.password) return null;

    const description = string("description");
    const excerpt = string("excerpt");
    const summary = string("contentSummary");
    const tags = list("tags");
    const keywords = list("keywords");
    const topics = list("topics");
    const companies = list("relatedCompanies");
    const skills = list("relatedSkills");
    const type = string("type") || "Page";
    const status = string("status") || "Live";
    const language = string("language") || document.documentElement.lang || "en";
    return {
      title, url: url.href, type, status, language, tags, topics,
      excerpt: excerpt || description || summary,
      titleField: tokenize(title).join(" "),
      priority: Number.isFinite(item.priority) ? Math.min(10, Math.max(0, item.priority)) : 5,
      fields: [
        [field(title), 24],
        ...topics.map(value => [field(value), 16]),
        ...keywords.map(value => [field(value), 15]),
        ...companies.map(value => [field(value), 15]),
        ...tags.map(value => [field(value), 13]),
        ...skills.map(value => [field(value), 12]),
        [field(description), 9],
        [field(excerpt), 8],
        [field(summary), 5]
      ],
      topicText: [title, ...topics, ...tags, ...keywords, ...companies, ...skills, description, summary]
        .map(value => " " + tokenize(value).join(" ") + " ")
    };
  }

  function score(record, phrase) {
    let relevance = 0;
    for (const term of terms) {
      let best = 0;
      for (const [value, weight] of record.fields) {
        if (!value.normalized.includes(term)) continue;
        const quality = value.normalized === term ? 3
          : value.words.includes(term) ? 2
          : value.words.some(word => word.startsWith(term)) ? 1.5 : 1;
        best = Math.max(best, weight * quality);
      }
      if (!best) return -1;
      relevance += best;
    }
    if (phrase && record.titleField === phrase) relevance += 90;
    else if (terms.length > 1 && (" " + record.titleField + " ").includes(" " + phrase + " ")) {
      relevance += 40;
    }
    return relevance + record.priority;
  }

  function appendHighlight(element, value) {
    if (!terms.length) {
      element.textContent = value;
      return;
    }

    // Map normalized offsets back to the original graphemes, including combining marks.
    const graphemes = segmenter
      ? Array.from(segmenter.segment(value), part => part.segment)
      : value.match(/\P{M}\p{M}*|\p{M}+/gu) || [];
    let normalized = "";
    let offset = 0;
    const bounds = [];
    for (const grapheme of graphemes) {
      const part = fold(grapheme);
      const end = offset + grapheme.length;
      for (let index = 0; index < part.length; index++) bounds.push([offset, end]);
      normalized += part;
      offset = end;
    }

    const ranges = [];
    for (const term of terms) {
      let start = normalized.indexOf(term);
      while (start !== -1) {
        ranges.push([bounds[start][0], bounds[start + term.length - 1][1]]);
        start = normalized.indexOf(term, start + term.length);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (let index = 0; index < ranges.length; index++) {
      const [start, firstEnd] = ranges[index];
      let end = firstEnd;
      while (index + 1 < ranges.length && ranges[index + 1][0] < end) {
        end = Math.max(end, ranges[++index][1]);
      }
      const mark = document.createElement("mark");
      mark.textContent = value.slice(start, end);
      element.append(value.slice(cursor, start), mark);
      cursor = end;
    }
    element.append(value.slice(cursor));
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function resultCard(item) {
    const article = makeElement("article", "result-card");
    const meta = makeElement("div", "result-top");
    const title = document.createElement("h2");
    const excerpt = document.createElement("p");
    const tagRow = makeElement("div", "tag-row");
    const link = makeElement("a", "btn quiet", "Open page");
    title.lang = item.language;
    excerpt.lang = item.language;
    tagRow.lang = item.language;
    article.dir = "auto";
    meta.append(makeElement("span", "result-type", item.type), makeElement("span", "result-status", item.status));
    appendHighlight(title, item.title);
    appendHighlight(excerpt, item.excerpt);
    for (const tag of item.tags.slice(0, 6)) {
      const chip = document.createElement("span");
      appendHighlight(chip, tag);
      tagRow.append(chip);
    }
    link.href = item.url;
    link.hreflang = item.language;
    link.setAttribute("aria-label", "Open page: " + item.title);
    article.append(meta, title, excerpt, tagRow, link);
    return article;
  }

  function appendResults(size) {
    const fragment = document.createDocumentFragment();
    for (const item of results.slice(visible, visible + size)) fragment.append(resultCard(item));
    const firstLink = fragment.querySelector("a");
    resultsEl.append(fragment);
    visible = Math.min(visible + size, results.length);
    countEl.textContent = results.length + (results.length === 1 ? " result found" : " results found")
      + (visible < results.length ? ". Showing " + visible + "." : ".");
    if (showMore) showMore.hidden = visible >= results.length;
    return firstLink;
  }

  function matchesFacet(record, key, value) {
    if (key === "topic") {
      const topic = " " + tokenize(value).join(" ") + " ";
      return topic.trim() && record.topicText.some(text => text.includes(topic));
    }
    return fold(record[key]) === fold(value);
  }

  function updateOptions() {
    for (const { key, select } of facets) {
      const known = new Set(Array.from(select.options, option => fold(option.value)));
      const values = new Map();
      for (const record of records) {
        for (const value of key === "topic" ? record.topics : [record[key]]) {
          if (!known.has(fold(value))) values.set(fold(value), value);
        }
      }
      const label = value => {
        if (key !== "language" || !languageNames) return value;
        try {
          return languageNames.of(value) || value;
        } catch {
          return value;
        }
      };
      for (const value of [...values.values()].sort((a, b) => label(a).localeCompare(label(b)))) {
        select.add(new Option(label(value), value));
      }
    }
  }

  function readLocation() {
    const params = new URLSearchParams(window.location.search);
    input.value = (params.get("q") || "").slice(0, input.maxLength > 0 ? input.maxLength : 200);
    for (const { key, select } of facets) {
      const requested = fold(params.get(key) || "");
      const option = Array.from(select.options).find(entry => fold(entry.value) === requested);
      select.value = option ? option.value : "All";
    }
  }

  function writeLocation(query) {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    for (const { key, select } of facets) {
      if (select.value === "All") url.searchParams.delete(key);
      else url.searchParams.set(key, select.value);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }

  function runSearch(updateLocation) {
    if (state !== "ready") return;
    const query = input.value.trim();
    const selected = Object.fromEntries(facets.map(({ key, select }) => [key, select.value]));
    if (updateLocation) writeLocation(query);
    const searchKey = JSON.stringify([query, selected]);
    if (searchKey === lastSearch) return;
    lastSearch = searchKey;

    const tokens = tokenize(query);
    terms = [...new Set(tokens)];
    const phrase = tokens.join(" ");
    const active = facets.filter(({ key }) => selected[key] !== "All");
    const ranked = [];
    if (!query || terms.length) {
      for (const record of records) {
        if (!active.every(({ key }) => matchesFacet(record, key, selected[key]))) continue;
        const rank = score(record, phrase);
        if (rank >= 0) ranked.push({ record, rank });
      }
    }
    ranked.sort((a, b) => b.rank - a.rank || a.record.title.localeCompare(b.record.title));
    results = ranked.map(match => match.record);

    visible = 0;
    resultsEl.replaceChildren();
    appendResults(showMore ? (!query && !active.length ? 12 : pageSize) : results.length);
    if (!results.length) {
      resultsEl.append(makeElement("div", "no-results", "Try a different search or clear a filter."));
    }
    window.dispatchEvent(new CustomEvent("internal_search", {
      detail: { query, resultCount: results.length, type: "All", status: "All", topic: "All", ...selected }
    }));
  }

  input.addEventListener("input", event => {
    if (event.isComposing) return;
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(true), 150);
  });
  input.addEventListener("compositionend", () => {
    clearTimeout(timer);
    runSearch(true);
  });
  for (const { select } of facets) {
    select.addEventListener("change", () => runSearch(true));
  }
  app.querySelectorAll("[data-query]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.query;
      input.focus();
      runSearch(true);
    });
  });
  if (showMore) showMore.addEventListener("click", () => appendResults(pageSize)?.focus());
  window.addEventListener("popstate", () => {
    clearTimeout(timer);
    readLocation();
    runSearch(false);
  });

  readLocation();
  const controls = [input, ...facets.map(facet => facet.select), ...app.querySelectorAll("[data-query]")];
  controls.forEach(control => { control.disabled = true; });
  resultsEl.setAttribute("aria-busy", "true");
  countEl.textContent = "Loading search…";
  fetch(indexUrl, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error("Search index request failed");
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data)) throw new Error("Invalid search index");
      records = data.map(readRecord).filter(Boolean);
      if (!records.length) throw new Error("Empty search index");
      updateOptions();
      readLocation();
      state = "ready";
      controls.forEach(control => { control.disabled = false; });
      resultsEl.removeAttribute("aria-busy");
      runSearch(false);
    })
    .catch(() => {
      resultsEl.removeAttribute("aria-busy");
      countEl.textContent = "Search is temporarily unavailable.";
      resultsEl.replaceChildren(makeElement("div", "no-results", "Reload this page to try again."));
    });
})();
