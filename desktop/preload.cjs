const { contextBridge, ipcRenderer } = require("electron");

function request(operation, key, value) {
  const result = ipcRenderer.sendSync("engraving:settings", { operation, key, value });
  if (!result?.ok) throw new Error("Desktop settings could not be accessed");
  return result.value;
}

contextBridge.exposeInMainWorld("engravingStorage", {
  getItem: (key) => request("get", key),
  setItem: (key, value) => request("set", key, value),
});
