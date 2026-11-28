/**
 * Marketing Incrementality Intelligence — Data layer
 * IndexedDB wrapper + illustrative demo dataset
 * Namespace: window.MII.Data
 *
 * IMPORTANT: All numbers below are ILLUSTRATIVE only.
 * They do not represent real campaign performance.
 */
(function () {
  "use strict";

  const MII = window.MII || {};
  window.MII = MII;
  MII.Data = MII.Data || {};

  const DB_NAME = "mii_incrementality_v1";
  const DB_VERSION = 2;
  const STORE_INVESTMENTS = "investments";
  const STORE_EXPERIMENTS = "experiments";
  const STORE_SETTINGS = "settings";

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB not available in this browser."));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error || new Error("Failed to open IndexedDB"));
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_INVESTMENTS)) {
          const inv = db.createObjectStore(STORE_INVESTMENTS, {
            keyPath: "id",
            autoIncrement: true
          });
          inv.createIndex("by_channel", "channel", { unique: false });
          inv.createIndex("by_date", "date", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_EXPERIMENTS)) {
          db.createObjectStore(STORE_EXPERIMENTS, {
            keyPath: "id",
            autoIncrement: true
          });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("fx_rates")) {
          db.createObjectStore("fx_rates", { keyPath: "pair" });
        }
        // v2: ensure investment indexes for category and startDate
        if (db.objectStoreNames.contains(STORE_INVESTMENTS)) {
          const inv = e.target.transaction.objectStore(STORE_INVESTMENTS);
          if (!inv.indexNames.contains("by_category")) {
            try { inv.createIndex("by_category", "category", { unique: false }); } catch (err) {}
          }
          if (!inv.indexNames.contains("by_start")) {
            try { inv.createIndex("by_start", "startDate", { unique: false }); } catch (err) {}
          }
        }
      };
    });
    return dbPromise;
  }

  function txStore(storeName, mode) {
    return openDb().then(function (db) {
      const tx = db.transaction(storeName, mode || "readonly");
      return tx.objectStore(storeName);
    });
  }

  function getAll(storeName) {
    return txStore(storeName, "readonly").then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function put(storeName, record) {
    return txStore(storeName, "readwrite").then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.put(record);
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function clearStore(storeName) {
    return txStore(storeName, "readwrite").then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.clear();
        req.onsuccess = function () {
          resolve();
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function getSetting(key, fallback) {
    return txStore(STORE_SETTINGS, "readonly").then(function (store) {
      return new Promise(function (resolve) {
        const req = store.get(key);
        req.onsuccess = function () {
          resolve(req.result ? req.result.value : fallback);
        };
        req.onerror = function () {
          resolve(fallback);
        };
      });
    });
  }

  function setSetting(key, value) {
    return put(STORE_SETTINGS, { key: key, value: value });
  }

  /* ---------- Illustrative demo dataset ---------- */
  /**
   * DEMO DATA ONLY — fictional channels, spend and outcomes
   * for UI demonstration. Not real performance.
   */
  const DEMO_INVESTMENTS = [
    { id: 1, date: "2026-01-01", channel: "Paid Search", type: "online", spend: 12500, currency: "JPY", notes: "Brand + non-brand" },
    { id: 2, date: "2026-01-01", channel: "Paid Social", type: "online", spend: 8200, currency: "JPY", notes: "Meta + LinkedIn" },
    { id: 3, date: "2026-01-01", channel: "Display / Programmatic", type: "online", spend: 5400, currency: "JPY", notes: "" },
    { id: 4, date: "2026-01-01", channel: "Email / CRM", type: "online", spend: 1800, currency: "JPY", notes: "Platform + creative" },
    { id: 5, date: "2026-01-01", channel: "SEO / Content", type: "online", spend: 6200, currency: "JPY", notes: "Agency retainer" },
    { id: 6, date: "2026-01-01", channel: "TV / CTV", type: "offline", spend: 45000, currency: "JPY", notes: "Regional flight" },
    { id: 7, date: "2026-01-01", channel: "OOH", type: "offline", spend: 18000, currency: "JPY", notes: "Station panels" },
    { id: 8, date: "2026-01-01", channel: "Events / Sponsorship", type: "offline", spend: 22000, currency: "JPY", notes: "Trade show" },
    { id: 9, date: "2026-02-01", channel: "Paid Search", type: "online", spend: 13200, currency: "JPY", notes: "" },
    { id: 10, date: "2026-02-01", channel: "Paid Social", type: "online", spend: 9100, currency: "JPY", notes: "" },
    { id: 11, date: "2026-02-01", channel: "Display / Programmatic", type: "online", spend: 4800, currency: "JPY", notes: "" },
    { id: 12, date: "2026-02-01", channel: "Email / CRM", type: "online", spend: 1800, currency: "JPY", notes: "" },
    { id: 13, date: "2026-02-01", channel: "SEO / Content", type: "online", spend: 6200, currency: "JPY", notes: "" },
    { id: 14, date: "2026-02-01", channel: "TV / CTV", type: "offline", spend: 0, currency: "JPY", notes: "No flight" },
    { id: 15, date: "2026-02-01", channel: "OOH", type: "offline", spend: 12000, currency: "JPY", notes: "" },
    { id: 16, date: "2026-02-01", channel: "Events / Sponsorship", type: "offline", spend: 5000, currency: "JPY", notes: "" }
  ];

  const DEMO_EXPERIMENTS = [
    {
      id: 1,
      name: "Brand search geo holdout (illustrative)",
      type: "geo_holdout",
      status: "completed",
      channel: "Paid Search",
      startDate: "2025-10-01",
      endDate: "2025-11-15",
      notes: "Illustrative only — fictional lift range for UI demo."
    },
    {
      id: 2,
      name: "CRM email frequency test (illustrative)",
      type: "ab_test",
      status: "running",
      channel: "Email / CRM",
      startDate: "2026-01-10",
      endDate: null,
      notes: "Illustrative design — no real results attached."
    },
    {
      id: 3,
      name: "OOH + Search incrementality (illustrative)",
      type: "matched_market",
      status: "planned",
      channel: "OOH",
      startDate: "2026-03-01",
      endDate: null,
      notes: "Placeholder for future experiment design module."
    }
  ];

  const DEMO_DASHBOARD = {
    periodLabel: "Jan–Feb 2026 (illustrative)",
    totalSpend: 171400,
    onlineSpend: 69200,
    offlineSpend: 102200,
    channelsTracked: 8,
    experimentsActive: 1,
    experimentsCompleted: 1,
    // Illustrative KPI cards — NOT real ROI/iROAS
    kpis: [
      {
        id: "spend",
        label: "Total tracked spend",
        value: "¥171,400",
        delta: "Illustrative period",
        deltaType: "neutral"
      },
      {
        id: "online",
        label: "Online share",
        value: "40%",
        delta: "Of tracked spend",
        deltaType: "neutral"
      },
      {
        id: "offline",
        label: "Offline share",
        value: "60%",
        delta: "Of tracked spend",
        deltaType: "neutral"
      },
      {
        id: "experiments",
        label: "Experiments",
        value: "3",
        delta: "1 running · 1 planned",
        deltaType: "neutral"
      }
    ],
    spendByChannel: [
      { channel: "TV / CTV", spend: 45000, type: "offline" },
      { channel: "Events / Sponsorship", spend: 27000, type: "offline" },
      { channel: "Paid Search", spend: 25700, type: "online" },
      { channel: "OOH", spend: 30000, type: "offline" },
      { channel: "Paid Social", spend: 17300, type: "online" },
      { channel: "SEO / Content", spend: 12400, type: "online" },
      { channel: "Display / Programmatic", spend: 10200, type: "online" },
      { channel: "Email / CRM", spend: 3600, type: "online" }
    ],
    monthlyTrend: [
      { month: "2025-09", online: 28000, offline: 40000 },
      { month: "2025-10", online: 31000, offline: 55000 },
      { month: "2025-11", online: 29500, offline: 38000 },
      { month: "2025-12", online: 33000, offline: 62000 },
      { month: "2026-01", online: 34100, offline: 85000 },
      { month: "2026-02", online: 35100, offline: 17000 }
    ],
    disclaimer:
      "All figures on this dashboard are ILLUSTRATIVE demonstration data. " +
      "They do not represent actual campaign results, ROI, or incrementality estimates."
  };

  async function seedDemoIfEmpty() {
    const mode = await getSetting("dataMode", null);
    if (mode === "demo" || mode === "user") return mode;

    const existing = await getAll(STORE_INVESTMENTS);
    if (existing.length === 0) {
      for (let i = 0; i < DEMO_INVESTMENTS.length; i++) {
        await put(STORE_INVESTMENTS, DEMO_INVESTMENTS[i]);
      }
      for (let i = 0; i < DEMO_EXPERIMENTS.length; i++) {
        await put(STORE_EXPERIMENTS, DEMO_EXPERIMENTS[i]);
      }
      await setSetting("dataMode", "demo");
      return "demo";
    }
    await setSetting("dataMode", "user");
    return "user";
  }

  async function loadDemoDashboard() {
    return DEMO_DASHBOARD;
  }

  async function resetToDemo() {
    await clearStore(STORE_INVESTMENTS);
    await clearStore(STORE_EXPERIMENTS);
    for (let i = 0; i < DEMO_INVESTMENTS.length; i++) {
      await put(STORE_INVESTMENTS, DEMO_INVESTMENTS[i]);
    }
    for (let i = 0; i < DEMO_EXPERIMENTS.length; i++) {
      await put(STORE_EXPERIMENTS, DEMO_EXPERIMENTS[i]);
    }
    await setSetting("dataMode", "demo");
  }


  function remove(storeName, id) {
    return txStore(storeName, "readwrite").then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getById(storeName, id) {
    return txStore(storeName, "readonly").then(function (store) {
      return new Promise(function (resolve, reject) {
        const req = store.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // Public API
  MII.Data.open = openDb;
  MII.Data.getInvestments = function () {
    return getAll(STORE_INVESTMENTS);
  };
  MII.Data.getExperiments = function () {
    return getAll(STORE_EXPERIMENTS);
  };
  MII.Data.putInvestment = function (rec) {
    return put(STORE_INVESTMENTS, rec);
  };
  MII.Data.deleteInvestment = function (id) {
    return remove(STORE_INVESTMENTS, id);
  };
  MII.Data.getInvestment = function (id) {
    return getById(STORE_INVESTMENTS, id);
  };
  MII.Data.clearInvestments = function () {
    return clearStore(STORE_INVESTMENTS);
  };
  MII.Data.putExperiment = function (rec) {
    return put(STORE_EXPERIMENTS, rec);
  };
  MII.Data.getFxRates = function () {
    return getAll("fx_rates");
  };
  MII.Data.putFxRate = function (rec) {
    return put("fx_rates", rec);
  };
  MII.Data.clearFxRates = function () {
    return clearStore("fx_rates");
  };
  MII.Data.getSetting = getSetting;
  MII.Data.setSetting = setSetting;
  MII.Data.seedDemoIfEmpty = seedDemoIfEmpty;
  MII.Data.loadDemoDashboard = loadDemoDashboard;
  MII.Data.resetToDemo = resetToDemo;
  MII.Data.DEMO_DASHBOARD = DEMO_DASHBOARD;
})();
