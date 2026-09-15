/**
 * Generates public/THIRD-PARTY-NOTICES.md from the installed production
 * dependency tree.
 *
 * Why this exists: MIT, ISC, BSD and Apache-2.0 licences all require that the
 * copyright notice and licence text ship with the software. This produces a
 * single file that is bundled into the app (public/ is copied into dist/, and
 * dist/ is packaged into the installer).
 *
 * Run it whenever dependencies change:
 *   pnpm notices
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "THIRD-PARTY-NOTICES.md");

function readLicenceFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { copyright: "", text: "" };
  }

  const match = entries.find((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
  if (!match) return { copyright: "", text: "" };

  let text;
  try {
    text = fs.readFileSync(path.join(dir, match), "utf8");
  } catch {
    return { copyright: "", text: "" };
  }

  const copyrightMatch = text.match(/^\s*(copyright[^\n]{0,160})/im);
  return {
    copyright: copyrightMatch ? copyrightMatch[1].trim() : "",
    text: text.trim(),
  };
}

function collect() {
  const args = ["licenses", "list", "--prod", "--json"];
  const options = { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };

  // Prefer the package manager that invoked this script: npm/pnpm/yarn set
  // npm_execpath to their own entry point, which avoids shell shims entirely
  // (a bare "pnpm" is a .cmd on Windows and cannot be spawned directly).
  const execPath = process.env.npm_execpath;
  let raw;
  if (execPath && /\.(c|m)?js$/i.test(execPath)) {
    // npm and some pnpm installs expose a JavaScript entry point.
    raw = execFileSync(process.execPath, [execPath, ...args], options);
  } else if (execPath) {
    // Others (including corepack's pnpm) are native executables.
    raw = execFileSync(execPath, args, options);
  } else {
    raw = execFileSync("pnpm", args, { ...options, shell: true });
  }
  const data = JSON.parse(raw);

  const packages = [];
  for (const [licence, group] of Object.entries(data)) {
    for (const entry of group) {
      const dir = entry.paths && entry.paths[0] ? entry.paths[0] : null;
      const { copyright, text } = dir ? readLicenceFile(dir) : { copyright: "", text: "" };
      packages.push({
        name: entry.name,
        version: (entry.versions || []).join(", "),
        licence,
        homepage: entry.homepage || "",
        copyright,
        text,
      });
    }
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}

function render(packages) {
  const counts = new Map();
  for (const pkg of packages) counts.set(pkg.licence, (counts.get(pkg.licence) || 0) + 1);

  const lines = [
    "# Third-Party Notices",
    "",
    "Engraving Prep Tool includes the third-party components listed below. Each is",
    "provided under the licence shown, and the copyright notices required by those",
    "licences are reproduced here.",
    "",
    `Generated from ${packages.length} production dependencies.`,
    "Regenerate with `pnpm notices` whenever dependencies change.",
    "",
    "## Licence summary",
    "",
    "| Licence | Components |",
    "| --- | --- |",
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([licence, count]) => `| ${licence} | ${count} |`),
    "",
    "## Components",
    "",
  ];

  for (const pkg of packages) {
    lines.push(`### ${pkg.name} ${pkg.version}`);
    lines.push("");
    lines.push(`- Licence: ${pkg.licence}`);
    if (pkg.copyright) lines.push(`- ${pkg.copyright}`);
    if (pkg.homepage) lines.push(`- ${pkg.homepage}`);
    lines.push("");
    if (pkg.text) {
      lines.push("```");
      lines.push(pkg.text.slice(0, 4000));
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## Electron and Chromium");
  lines.push("");
  lines.push(
    "The application is built on Electron, which bundles Chromium and Node.js."
  );
  lines.push(
    "Those licences are included with the Electron runtime and are reproduced in"
  );
  lines.push(
    "the installed application's resources directory, alongside this file."
  );
  lines.push("");

  return lines.join("\n");
}

const packages = collect();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, render(packages));

const sizeKb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`Wrote ${path.relative(ROOT, OUT)} — ${packages.length} components, ${sizeKb} KB`);
