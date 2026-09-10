const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDesktopStorage } = require("./storage.cjs");

const key = "laser-canvas-custom-presets";
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "engraving-storage-test-"));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("engraving-storage-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, filename: path.join(directory, "engraving-settings.json"), storage: createDesktopStorage(directory) };
}

test("presets and preferences survive new storage instances", t => {
  const { directory, storage } = fixture(t);
  assert.equal(storage.getItem(key), null);
  storage.setItem(key, '[{"name":"Plate outline"}]');
  storage.setItem("pgs-engraving-locale", "es");
  const reopened = createDesktopStorage(directory);
  assert.equal(reopened.getItem(key), '[{"name":"Plate outline"}]');
  assert.equal(reopened.getItem("pgs-engraving-locale"), "es");
  reopened.setItem(key, "[]");
  assert.equal(createDesktopStorage(directory).getItem(key), "[]");
});

test("each write preserves the latest values of other keys", t => {
  const { directory, storage } = fixture(t);
  const second = createDesktopStorage(directory);
  storage.setItem(key, "[]");
  second.setItem("pgs-engraving-locale", "es");
  storage.setItem(key, '[{"name":"Updated"}]');
  assert.equal(second.getItem("pgs-engraving-locale"), "es");
  assert.equal(second.getItem(key), '[{"name":"Updated"}]');
});

test("a failed disk write reports failure and preserves the last saved file", t => {
  const { directory, filename, storage } = fixture(t);
  storage.setItem(key, '[{"name":"Keep me"}]');
  const before = fs.readFileSync(filename, "utf8");
  fs.mkdirSync(`${filename}.tmp`);
  assert.throws(() => storage.setItem(key, "[]"));
  assert.equal(fs.readFileSync(filename, "utf8"), before);
  assert.equal(createDesktopStorage(directory).getItem(key), '[{"name":"Keep me"}]');
});

test("corrupt data is reported and never overwritten by a later save", t => {
  const { filename, storage } = fixture(t);
  fs.writeFileSync(filename, "interrupted or damaged file");
  assert.throws(() => storage.getItem(key));
  assert.throws(() => storage.setItem(key, "[]"));
  assert.equal(fs.readFileSync(filename, "utf8"), "interrupted or damaged file");
});

test("unsupported keys and oversized writes cannot replace saved data", t => {
  const { storage } = fixture(t);
  storage.setItem(key, "[]");
  assert.throws(() => storage.setItem("../../auth-secret.txt", "bad"));
  assert.throws(() => storage.getItem("__proto__"));
  assert.throws(() => storage.setItem(key, "x".repeat(32 * 1024 * 1024)));
  assert.equal(storage.getItem(key), "[]");
});
