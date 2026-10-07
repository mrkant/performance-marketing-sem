/* Shared interactions & animations */

document.addEventListener("DOMContentLoaded", () => {
  // Navbar scroll effect
  const nav = document.querySelector(".nav");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  });

  // Mobile menu
  const toggle = document.querySelector(".menu-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle) {
    toggle.addEventListener("click", () => {
      links.classList.toggle("open");
    });
  }

  // Fade-in on scroll
  const fadeEls = document.querySelectorAll(".fade-in, .timeline-item");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.15 }
  );
  fadeEls.forEach((el) => observer.observe(el));

  // Simple search (for search.html)
  const searchInput = document.getElementById("site-search");
  const resultsBox = document.getElementById("search-results");
  if (searchInput && resultsBox) {
    const items = [
      { title: "ホーム", desc: "検索・メディア・eコマース成長", url: "index.html", keywords: "ホーム 成長 SEO SEM" },
      { title: "プロフィール", desc: "Shashi Kantの経歴とスキル", url: "about.html", keywords: "プロフィール 経歴 スキル About" },
      { title: "検索・メディア・eコマース", desc: "SEO / SEM / eコマース / エージェンシー連携", url: "search-media-ecommerce.html", keywords: "SEO SEM eコマース エージェンシー" },
      { title: "キャリアの旅", desc: "POSCO・Samsung・IBM・Google Play・H&M・Estee Lauder", url: "journey.html", keywords: "キャリア 旅 POSCO Samsung IBM Google H&M Estee" },
      { title: "サービス", desc: "SEOレビュー・SEMレビュー・eコマース発見・エージェンシー連携", url: "services.html", keywords: "サービス SEO SEM eコマース レビュー" },
      { title: "対応エリア", desc: "東京・日本全国・APAC", url: "area.html", keywords: "対応エリア 東京 日本 APAC 地域" },
      { title: "よくある質問", desc: "サービス・進め方・対応範囲について", url: "faq.html", keywords: "FAQ 質問 よくある" },
      { title: "お問い合わせ", desc: "ビジネス課題から始めましょう", url: "contact.html", keywords: "連絡 問い合わせ 相談" },
      { title: "日本・APAC実行", desc: "現地市場の理解と実行", url: "services.html", keywords: "日本 APAC 市場 実行" },
      { title: "プロダクトリードSEO", desc: "検索意図とUX・開発の連携", url: "journey.html", keywords: "プロダクト SEO UX" },
      { title: "マーケットプレイス", desc: "Google Play マーチャンダイジング", url: "journey.html", keywords: "マーケットプレイス Google Play メタデータ" }
    ];

    function render(list) {
      if (list.length === 0) {
        resultsBox.innerHTML = `<p style="color:var(--text-soft);text-align:center;padding:2rem;">該当する結果がありません</p>`;
        return;
      }
      resultsBox.innerHTML = list
        .map(
          (item) => `
        <a href="${item.url}" class="search-item">
          <strong>${item.title}</strong><br>
          <span style="color:var(--text-soft);font-size:0.9rem;">${item.desc}</span>
        </a>`
        )
        .join("");
    }

    render(items);

    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        render(items);
        return;
      }
      const filtered = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q)
      );
      render(filtered);
    });
  }

  // Add a few floating dots for delight
  const hero = document.querySelector(".hero");
  if (hero) {
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement("div");
      dot.className = "floating-dot";
      dot.style.left = `${15 + Math.random() * 70}%`;
      dot.style.top = `${20 + Math.random() * 50}%`;
      dot.style.animationDelay = `${Math.random() * 4}s`;
      dot.style.background = i % 2 === 0 ? "var(--accent)" : "var(--accent2)";
      hero.appendChild(dot);
    }
  }
});