# Marketing Intelligence: Beyond Advertising, SEO and SEM

**Website:** https://shashikant.jp  
**Author:** Shashikant  
**Type:** Premium static knowledge hub (HTML5 / CSS3 / JavaScript)

---

## Project Overview

A sophisticated, editorial-style, fully responsive website that treats marketing as a 360-degree business discipline — not merely advertising, SEO or SEM. The site combines strategic frameworks, analytical tools, case studies and research methodology in the style of a premium business intelligence publication.

### Core Philosophy

> Marketing is not simply about promoting products. It is about understanding customers, creating valuable products, building desirable brands, establishing competitive differentiation, developing customer relationships and creating sustainable business opportunities.

---

## Folder Structure

```
shashikant-marketing/
├── index.html                 # Homepage
├── css/
│   └── styles.css             # Complete design system
├── js/
│   └── main.js                # Interactive behaviour
├── pages/
│   ├── fundamentals.html
│   ├── fishbone-framework.html
│   ├── 360-framework.html
│   ├── brand-intelligence.html
│   ├── luxury-strategy.html
│   ├── product-intelligence.html
│   ├── consumer-psychology.html
│   ├── campaign-intelligence.html
│   ├── pricing-strategy.html
│   ├── retail-distribution.html
│   ├── business-opportunities.html
│   ├── marketing-measurement.html
│   ├── case-studies.html
│   └── research-library.html
├── images/                    # (placeholder for future assets)
└── README.md
```

---

## Design System

| Token              | Value          | Usage                     |
|--------------------|----------------|---------------------------|
| Background         | `#F8F6F1`      | Warm ivory primary        |
| Secondary bg       | `#EEE9DF`      | Soft beige sections       |
| Dark sections      | `#111827`      | Midnight navy             |
| Primary text       | `#172235`      | Deep navy                 |
| Secondary text     | `#667085`      | Slate grey                |
| Accent             | `#C5A46D`      | Muted champagne gold      |
| Cards              | `#FFFFFF`      | White                     |
| Borders            | `#E4E7EC`      | Soft grey                 |

**Typography**
- Headings: Playfair Display (Google Fonts)
- Body: Inter (Google Fonts)

---

## How to Preview Locally

1. Download or clone the project folder.
2. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge).
3. No build step or server is required for basic viewing.
4. For best results with relative paths and search, you may optionally run a simple local server:

```bash
# Python 3
cd shashikant-marketing
python -m http.server 8000

# Then visit http://localhost:8000
```

---

## How to Publish on shashikant.jp

1. Upload the entire contents of the `shashikant-marketing` folder to the web root (or a subdirectory) of the domain.
2. Ensure `index.html` is the default document.
3. Confirm that the CSS and JS paths resolve correctly (they are relative).
4. Add an XML sitemap and robots.txt at the domain root if not already present.
5. Point the domain DNS / hosting as required by your provider.

### Suggested robots.txt

```
User-agent: *
Allow: /

Sitemap: https://shashikant.jp/sitemap.xml
```

### Suggested sitemap entries

Include all HTML pages listed in the folder structure above with their canonical URLs.

---

## How to Update Content

- Edit the relevant `.html` file directly.
- Maintain the existing CSS classes for consistency.
- When adding new factual claims, apply the three evidence labels:
  - **Verified Fact** — supported by an identifiable public source
  - **Analytical Interpretation** — reasoned conclusion
  - **Hypothesis** — idea requiring further validation
- Never invent campaign budgets, unit sales, ROI or market-share figures.
- Keep British English spelling and a professional, analytical tone.

---

## SEO Implementation Checklist

- [x] Semantic HTML5 structure
- [x] Unique `<title>` and meta description per page
- [x] Canonical URLs
- [x] Open Graph metadata on homepage
- [x] Proper heading hierarchy (H1 → H2 → H3)
- [x] Descriptive internal links
- [x] Breadcrumb navigation
- [x] Structured data (WebSite) on homepage
- [ ] XML sitemap (to be generated on publish)
- [ ] robots.txt (to be placed at domain root)
- [ ] Image alt text (add when images are introduced)
- [ ] FAQ / Article schema where appropriate for future long-form articles

---

## Key Sections Delivered

| Section                        | Status      | Notes                                      |
|--------------------------------|-------------|--------------------------------------------|
| Homepage                       | Complete    | Philosophy, 360 model, navigation          |
| Marketing Fundamentals         | Complete    | Core positioning of the resource           |
| Fishbone Framework             | Complete    | Nine branches with diagnostic questions    |
| Brand Intelligence             | Complete    | Positioning, identity, equity, architecture|
| Luxury & Premium Strategy      | Complete    | Ten principles + comparison matrix         |
| Product Intelligence           | Complete    | Opportunity Discovery Model + template     |
| Consumer Psychology            | Complete    | Motivations + decision journey             |
| Pricing & Commercial           | Complete    | Approaches + economics illustration        |
| Case Studies                   | Complete    | Hermès, UNIQLO, IKEA, Apple + outlines     |
| Retail, Campaigns, Measurement, Opportunities, Research | Structured | Ready for further expansion                |

---

## Interactive Features

- Mobile-responsive navigation
- Search overlay (keyword routing)
- Expandable accordions
- Fishbone branch interaction
- Opportunity scoring calculator (on relevant pages when expanded)
- Evidence-label system throughout

---

## Content Principles

1. Marketing is treated as a strategic business discipline.
2. Digital acquisition tools are contextualised, never dominant.
3. Facts are labelled and sourced; interpretation is marked; hypotheses are flagged.
4. No fabricated performance metrics.
5. British English, professional and analytical tone.
6. Designed for senior managers, strategists and serious students of marketing.

---

## Licence & Attribution

Educational resource created for shashikant.jp.  
Design and content © 2026 Shashikant.

---

*Marketing is not merely the art of communicating a product. It is the discipline of understanding people, markets and opportunities, then connecting that understanding to products, brands, experiences and sustainable commercial value.*
