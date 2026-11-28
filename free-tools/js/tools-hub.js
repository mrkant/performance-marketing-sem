/**
 * Shashi Tools Hub — client-side interactions
 * Namespace: window.STH
 */
(function () {
  "use strict";

  const STH = window.STH || {};
  window.STH = STH;

  /* ---------- Year in footer ---------- */
  function setYear() {
    const el = document.getElementById("sth-year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ---------- FAQ accordion ---------- */
  function initFaq() {
    const list = document.getElementById("sth-faq");
    if (!list) return;

    list.addEventListener("click", function (e) {
      const btn = e.target.closest(".sth-faq-q");
      if (!btn) return;

      const item = btn.closest(".sth-faq-item");
      const isOpen = item.classList.contains("sth-open");

      // Close others
      list.querySelectorAll(".sth-faq-item.sth-open").forEach(function (openItem) {
        if (openItem !== item) {
          openItem.classList.remove("sth-open");
          openItem.querySelector(".sth-faq-q").setAttribute("aria-expanded", "false");
        }
      });

      item.classList.toggle("sth-open", !isOpen);
      btn.setAttribute("aria-expanded", String(!isOpen));
    });
  }

  /* ---------- Tool search & category filter ---------- */
  function initToolFilter() {
    const grid = document.getElementById("sth-tools-grid");
    const searchInput = document.getElementById("sth-tool-search");
    const searchBtn = document.getElementById("sth-search-btn");
    const chips = document.querySelectorAll(".sth-cat-chip");

    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll(".sth-tool-card"));

    function applyFilter() {
      const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
      const activeChip = document.querySelector(".sth-cat-chip.sth-active");
      const cat = activeChip ? activeChip.getAttribute("data-cat") : "all";

      cards.forEach(function (card) {
        const name = (card.getAttribute("data-name") || "").toLowerCase();
        const cats = (card.getAttribute("data-cats") || "").toLowerCase();
        const text = (card.textContent || "").toLowerCase();

        const matchesQuery =
          !query ||
          name.includes(query) ||
          cats.includes(query) ||
          text.includes(query);

        const matchesCat =
          cat === "all" ||
          cats.split(/\s+/).includes(cat);

        card.style.display = matchesQuery && matchesCat ? "" : "none";
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", applyFilter);
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          applyFilter();
        }
      });
    }
    if (searchBtn) searchBtn.addEventListener("click", applyFilter);

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) {
          c.classList.remove("sth-active");
        });
        chip.classList.add("sth-active");
        applyFilter();
      });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    setYear();
    initFaq();
    initToolFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
