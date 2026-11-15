const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("desktop close stays open by default and discards only on explicit confirmation", () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const createWindow = source.slice(source.indexOf("function createWindow("), source.indexOf("\nlet bundledServer"));
  let choice = 0;
  let handler;
  let options;
  let prevented = false;
  const context = vm.createContext({
    BrowserWindow: class {
      webContents = {
        on(name, callback) {
          assert.equal(name, "will-prevent-unload");
          handler = callback;
        },
        setWindowOpenHandler() {},
      };
      loadURL() {}
    },
    dialog: { showMessageBoxSync(_window, value) { options = value; return choice; } },
    shell: { openExternal() {} },
  });
  vm.runInContext(createWindow, context);
  context.createWindow("http://127.0.0.1:1234");
  handler({ preventDefault() { prevented = true; } });
  assert.equal(options.defaultId, 0);
  assert.equal(options.cancelId, 0);
  assert.equal(prevented, false);
  choice = 1;
  handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});
