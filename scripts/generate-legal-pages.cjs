/**
 * Publishes the legal documents as standalone static pages.
 *
 * legal/*.md is the canonical source (it carries INTERNAL NOTE comments for
 * review). This script renders those files into public/, so the published pages
 * always match the reviewed text, and it fails the build if a bracketed
 * placeholder is ever left in something a customer would read.
 *
 *   pnpm build runs this automatically.
 */
const fs = require("node:fs");
const path = require("node:path");
const { marked } = require("marked");

const ROOT = path.resolve(__dirname, "..");
const LEGAL = path.join(ROOT, "legal");
const PUBLIC = path.join(ROOT, "public");

const BRAND = "ForgeMark Industries";
const EMAIL = "support@forgemarkindustries.com";
const PHONE = "903-998-0262";
// Deliberately empty: home-based business, so the street address is not
// published. Put a PO Box or registered agent address here if one is taken.
const ADDRESS = "";

const DOCS = [
  {
    file: "EULA.md",
    out: "terms.html",
    path: "/terms",
    title: "Terms of Service",
    description:
      "Licence terms for Engraving Prep Tool: what you may do, prohibited uses, warranty and liability.",
  },
  {
    file: "PRIVACY.md",
    out: "privacy.html",
    path: "/privacy",
    title: "Privacy Policy",
    description:
      "What Engraving Prep Tool collects, what stays on your computer, and how AI features handle your content.",
  },
  {
    file: "REFUNDS-AND-SUPPORT.md",
    out: "refunds.html",
    path: "/refunds",
    title: "Refund and Support Terms",
    description:
      "Refund policy, subscription renewals, and what technical support covers for Engraving Prep Tool.",
  },
];

/** A leftover placeholder means an unresolved note is about to go public. */
function assertPublishable(html, file) {
  const leftovers = html.match(/\[[A-Z][A-Z /0-9]{4,}\]/g);
  if (leftovers) {
    throw new Error(
      `${file} still contains unresolved placeholders and must not be published: ${[
        ...new Set(leftovers),
      ].join(", ")}`
    );
  }

  // This is a home-based business. Publishing the street address invites people
  // to turn up at the house, so a street address in a customer-facing page is
  // treated as a build failure rather than a style choice.
  const street = html.match(
    /\b\d{1,6}\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl|Way|Highway|Hwy)\b/
  );
  if (street) {
    throw new Error(
      `${file} appears to publish a street address ("${street[0]}") and must not be ` +
        "published. Use email and phone for contact, or set a PO Box in ADDRESS."
    );
  }
}

function shell({ title, description, navPath, body }) {
  const nav = DOCS.map((doc) =>
    doc.path === navPath
      ? `<span class="current">${doc.title}</span>`
      : `<a href="${doc.path}">${doc.title}</a>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Engraving Prep Tool</title>
<meta name="description" content="${description}">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #12141a; color: #e7e9f0;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 780px; margin: 0 auto; padding: 32px 20px 72px; }
  header.brand { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: baseline;
    border-bottom: 1px solid #2c3142; padding-bottom: 14px; margin-bottom: 28px; }
  header.brand strong { font-size: 15px; letter-spacing: .2px; }
  header.brand nav { margin-left: auto; display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; }
  a { color: #7dabff; }
  a:hover { color: #a9c7ff; }
  nav .current { color: #8f97ad; }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 34px 0 10px; padding-top: 6px; border-top: 1px solid #232838; }
  h3 { font-size: 15px; margin: 24px 0 8px; color: #cfd5e4; }
  p, li { color: #dfe3ec; }
  ul, ol { padding-left: 22px; }
  li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #2c3142; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #1a1d26; font-weight: 600; }
  blockquote { border-left: 3px solid #4f8cff; margin: 14px 0; padding: 4px 0 4px 14px; color: #b9c0d0; }
  code { background: #1f2431; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
  pre { background: #1f2431; padding: 12px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #2c3142; margin: 28px 0; }
  footer { margin-top: 44px; padding-top: 18px; border-top: 1px solid #2c3142;
    color: #8f97ad; font-size: 13px; }
  footer p { color: #8f97ad; margin: 4px 0; }
</style>
</head>
<body>
<div class="wrap">
  <header class="brand">
    <strong>Engraving Prep Tool</strong>
    <nav>${nav}<a href="/canvas">Open the app</a></nav>
  </header>
  <main>
${body}
  </main>
  <footer>
    <p>${BRAND} — a d/b/a of Petes Guns and Stuff LLC</p>
    ${ADDRESS ? `<p>${ADDRESS}</p>` : ""}
    <p><a href="mailto:${EMAIL}">${EMAIL}</a> · ${PHONE}</p>
  </footer>
</div>
</body>
</html>
`;
}

function render() {
  fs.mkdirSync(PUBLIC, { recursive: true });
  const written = [];

  for (const doc of DOCS) {
    const source = path.join(LEGAL, doc.file);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing legal source: ${doc.file}`);
    }

    const markdown = fs.readFileSync(source, "utf8");
    const rendered = marked.parse(markdown, { async: false });

    // Internal review notes live in the markdown as HTML comments so a lawyer
    // sees them. They must never reach the published page, where anyone could
    // read them with View Source.
    const body = rendered.replace(/<!--[\s\S]*?-->/g, "");

    assertPublishable(body, doc.file);

    const html = shell({
      title: doc.title,
      description: doc.description,
      navPath: doc.path,
      body,
    });

    const target = path.join(PUBLIC, doc.out);
    fs.writeFileSync(target, html);
    written.push(doc.out + " (" + Math.round(html.length / 1024) + " KB)");
  }

  console.log("Published legal pages: " + written.join(", "));
}

render();
