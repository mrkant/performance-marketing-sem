/**
 * Marketing Incrementality Intelligence — App shell
 * Routing, sidebar, mode toggle, view switching
 * Namespace: window.MII
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;

  const ROUTES = [
    { id: "dashboard", label: "Executive Dashboard", icon: "◈", section: "Overview" },
    { id: "investments", label: "Investment Tracker", icon: "◎", section: "Data" },
    { id: "experiments", label: "Experiment Lab", icon: "⚗", section: "Data" },
    { id: "channels", label: "Channel Effectiveness", icon: "▦", section: "Analysis" },
    { id: "crosschannel", label: "Cross-Channel Intelligence", icon: "⇄", section: "Analysis" },
    { id: "mmm", label: "Marketing Mix Modelling", icon: "▣", section: "Analysis" },
    { id: "optimizer", label: "Budget Optimizer", icon: "◇", section: "Planning" },
    { id: "reports", label: "Reports & Insights", icon: "☰", section: "Planning" }
  ];

  let currentRoute = "dashboard";
  let currentMode = "business"; // business | professional

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $all(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ---------- Sidebar nav ---------- */
  function buildNav() {
    const nav = $("#mii-nav");
    if (!nav) return;

    let html = "";
    let lastSection = null;
    ROUTES.forEach(function (r) {
      if (r.section !== lastSection) {
        html += '<div class="mii-nav-section">' + r.section + "</div>";
        lastSection = r.section;
      }
      html +=
        '<button type="button" class="mii-nav-item' +
        (r.id === currentRoute ? " mii-active" : "") +
        '" data-route="' +
        r.id +
        '">' +
        '<span class="mii-nav-icon" aria-hidden="true">' +
        r.icon +
        "</span>" +
        r.label +
        "</button>";
    });
    nav.innerHTML = html;

    $all(".mii-nav-item", nav).forEach(function (btn) {
      btn.addEventListener("click", function () {
        navigate(btn.getAttribute("data-route"));
        closeMobileSidebar();
      });
    });
  }

  function setActiveNav(routeId) {
    $all(".mii-nav-item").forEach(function (btn) {
      btn.classList.toggle("mii-active", btn.getAttribute("data-route") === routeId);
    });
  }

  function setTopbarTitle(routeId) {
    const route = ROUTES.find(function (r) {
      return r.id === routeId;
    });
    const el = $("#mii-topbar-title");
    if (el && route) el.textContent = route.label;
  }

  /* ---------- Routing ---------- */
  function navigate(routeId) {
    if (!ROUTES.some(function (r) {
      return r.id === routeId;
    })) {
      routeId = "dashboard";
    }
    currentRoute = routeId;
    setActiveNav(routeId);
    setTopbarTitle(routeId);
    renderView(routeId);

    // Update hash without scrolling
    if (history.replaceState) {
      history.replaceState(null, "", "#" + routeId);
    } else {
      location.hash = routeId;
    }
  }

  function renderView(routeId) {
    const content = $("#mii-content");
    if (!content) return;

    // Hide all panels
    $all(".mii-view").forEach(function (v) {
      v.hidden = true;
    });

    let panel = $("#mii-view-" + routeId);
    if (!panel) {
      // Create placeholder panel for modules not yet built
      panel = document.createElement("div");
      panel.id = "mii-view-" + routeId;
      panel.className = "mii-view";
      content.appendChild(panel);
    }
    panel.hidden = false;

    if (routeId === "dashboard") {
      if (MII.Dashboard && typeof MII.Dashboard.render === "function") {
        MII.Dashboard.render(panel, { mode: currentMode });
      }
    } else if (routeId === "investments") {
      if (MII.Investments && typeof MII.Investments.render === "function") {
        MII.Investments.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else if (routeId === "experiments") {
      if (MII.ExperimentLab && typeof MII.ExperimentLab.render === "function") {
        MII.ExperimentLab.render(panel);
      } else if (MII.Incrementality && typeof MII.Incrementality.render === "function") {
        MII.Incrementality.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else if (routeId === "channels") {
      if (MII.Channels && typeof MII.Channels.render === "function") {
        MII.Channels.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else if (routeId === "crosschannel") {
      if (MII.CrossChannel && typeof MII.CrossChannel.render === "function") {
        MII.CrossChannel.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else if (routeId === "mmm") {
      if (MII.MMM && typeof MII.MMM.render === "function") {
        MII.MMM.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else if (routeId === "optimizer") {
      if (MII.Optimizer && typeof MII.Optimizer.render === "function") {
        MII.Optimizer.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else if (routeId === "reports") {
      if (MII.Reports && typeof MII.Reports.render === "function") {
        MII.Reports.render(panel);
      } else {
        renderPlaceholder(panel, routeId);
      }
    } else {
      renderPlaceholder(panel, routeId);
    }
  }

  function renderPlaceholder(panel, routeId) {
    const route = ROUTES.find(function (r) {
      return r.id === routeId;
    });
    const label = route ? route.label : routeId;
    panel.innerHTML =
      '<div class="mii-placeholder">' +
      "<h3>" +
      escapeHtml(label) +
      "</h3>" +
      "<p>This module is part of the planned application architecture. " +
      "It will be built in a later phase after the shell and data layer are approved.</p>" +
      '<span class="mii-badge mii-badge--info">Coming in a future module</span>' +
      "</div>";
  }

  /* ---------- Mode toggle ---------- */
  function setMode(mode) {
    currentMode = mode === "professional" ? "professional" : "business";
    $all(".mii-mode-btn").forEach(function (btn) {
      btn.classList.toggle("mii-active", btn.getAttribute("data-mode") === currentMode);
    });
    try {
      localStorage.setItem("mii_mode", currentMode);
    } catch (e) {}
    // Re-render current view so mode-aware content can adapt
    renderView(currentRoute);
  }

  /* ---------- Mobile sidebar ---------- */
  function openMobileSidebar() {
    const sb = $("#mii-sidebar");
    const ov = $("#mii-sidebar-overlay");
    if (sb) sb.classList.add("mii-open");
    if (ov) {
      ov.classList.add("mii-show");
      ov.hidden = false;
    }
  }

  function closeMobileSidebar() {
    const sb = $("#mii-sidebar");
    const ov = $("#mii-sidebar-overlay");
    if (sb) sb.classList.remove("mii-open");
    if (ov) {
      ov.classList.remove("mii-show");
      ov.hidden = true;
    }
  }

  /* ---------- Helpers ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Init ---------- */
  async function init() {
    buildNav();

    // Mode from storage
    try {
      const saved = localStorage.getItem("mii_mode");
      if (saved === "professional" || saved === "business") currentMode = saved;
    } catch (e) {}
    setMode(currentMode);

    // Mode buttons
    $all(".mii-mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setMode(btn.getAttribute("data-mode"));
      });
    });

    // Mobile menu
    const menuBtn = $("#mii-menu-toggle");
    if (menuBtn) menuBtn.addEventListener("click", openMobileSidebar);
    const overlay = $("#mii-sidebar-overlay");
    if (overlay) overlay.addEventListener("click", closeMobileSidebar);

    // Seed demo data
    if (MII.Data && MII.Data.seedDemoIfEmpty) {
      try {
        await MII.Data.open();
        await MII.Data.seedDemoIfEmpty();
      } catch (err) {
        console.warn("MII data layer:", err.message || err);
      }
    }

    // Initial route from hash
    const hash = (location.hash || "").replace(/^#/, "");
    navigate(hash || "dashboard");

    window.addEventListener("hashchange", function () {
      const h = (location.hash || "").replace(/^#/, "");
      if (h && h !== currentRoute) navigate(h);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  MII.navigate = navigate;
  MII.getMode = function () {
    return currentMode;
  };
  MII.getRoute = function () {
    return currentRoute;
  };
})();
