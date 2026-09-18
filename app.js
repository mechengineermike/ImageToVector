import { init, potrace } from "./libs/potrace.js";

const TRACE_SCALE = 4;
const MAX_TRACE_PIXELS = 32_000_000;
const state = { items: [], selectedId: null, view: "split", traceVersion: 0 };
const elements = {
  fileInput: document.querySelector("#file-input"), upload: document.querySelector("#upload-button"), fileList: document.querySelector("#file-list"),
  threshold: document.querySelector("#threshold"), thresholdValue: document.querySelector("#threshold-value"), speckles: document.querySelector("#speckles"),
  specklesValue: document.querySelector("#speckles-value"), optimize: document.querySelector("#optimize"), invert: document.querySelector("#invert"),
  download: document.querySelector("#download-button"), downloadAll: document.querySelector("#download-all-button"), dropZone: document.querySelector("#drop-zone"),
  stage: document.querySelector("#preview-stage"), original: document.querySelector("#original-preview"), vector: document.querySelector("#vector-preview"),
  title: document.querySelector("#preview-title"), meta: document.querySelector("#preview-meta"), status: document.querySelector("#status"),
  stats: document.querySelector("#vector-stats"), working: document.querySelector("#working"), error: document.querySelector("#error")
};

let traceTimer;
let runtimeReady = false;

function selectedItem() { return state.items.find(item => item.id === state.selectedId); }
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function escapeXml(value) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]); }
function setStatus(message, busy = false) {
  const dot = document.createElement("i");
  elements.status.replaceChildren(dot, document.createTextNode(` ${message}`));
  elements.working.classList.toggle("visible", busy);
}
function showError(message) {
  elements.error.textContent = message;
  elements.error.classList.add("visible");
  setTimeout(() => elements.error.classList.remove("visible"), 6000);
}

async function decodeImage(file) {
  const bitmap = await createImageBitmap(file);
  if (!bitmap.width || !bitmap.height) throw new Error("The image has no usable dimensions.");
  return bitmap;
}

function traceScaleFor(width, height) {
  const idealPixels = width * height * TRACE_SCALE * TRACE_SCALE;
  if (idealPixels <= MAX_TRACE_PIXELS) return TRACE_SCALE;
  return Math.max(1, Math.sqrt(MAX_TRACE_PIXELS / (width * height)));
}

function makeThresholdBitmap(bitmap) {
  const scale = traceScaleFor(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const threshold = Number(elements.threshold.value);
  const invert = elements.invert.checked;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    const black = invert ? luminance >= threshold : luminance < threshold;
    const value = black ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { imageData, scale };
}

async function traceItem(item, version) {
  setStatus(`Tracing ${item.file.name}`, true);
  item.status = "working";
  renderFileList();
  const { imageData, scale } = makeThresholdBitmap(item.bitmap);
  const paths = await potrace(imageData, {
    pathonly: true,
    extractcolors: false,
    turdsize: Number(elements.speckles.value),
    turnpolicy: 4,
    alphamax: 1,
    opticurve: elements.optimize.checked ? 1 : 0,
    opttolerance: 0.2
  });
  if (version !== state.traceVersion || item.id !== state.selectedId) return;
  const d = paths.join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${item.bitmap.width}" height="${item.bitmap.height}" viewBox="0 0 ${imageData.width} ${imageData.height}">\n  <title>${escapeXml(item.file.name.replace(/\.[^.]+$/, ""))}</title>\n  <path d="${d}" fill="#000000" stroke="none" fill-rule="evenodd"/>\n</svg>\n`;
  if (item.vectorUrl) URL.revokeObjectURL(item.vectorUrl);
  item.svg = svg;
  item.vectorUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  item.paths = paths.length;
  item.commands = (d.match(/[MLC]/g) || []).length;
  item.scale = scale;
  item.status = "done";
  elements.vector.src = item.vectorUrl;
  elements.stats.textContent = `${item.paths.toLocaleString()} paths · ${item.commands.toLocaleString()} commands · ${formatBytes(new Blob([svg]).size)}`;
  elements.download.disabled = false;
  elements.downloadAll.disabled = !state.items.length;
  setStatus("Vector ready");
  renderFileList();
}

async function retraceSelected() {
  const item = selectedItem();
  if (!item || !runtimeReady) return;
  const version = ++state.traceVersion;
  try { await traceItem(item, version); }
  catch (error) {
    console.error(error);
    item.status = "error";
    renderFileList();
    setStatus("Trace failed");
    showError("This image could not be traced. Try a smaller image or a different format.");
  } finally {
    if (version === state.traceVersion) elements.working.classList.remove("visible");
  }
}

function scheduleTrace() {
  clearTimeout(traceTimer);
  elements.download.disabled = true;
  traceTimer = setTimeout(retraceSelected, 140);
}

function renderFileList() {
  elements.fileList.replaceChildren(...state.items.map(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `file-item${item.id === state.selectedId ? " active" : ""}`;
    button.dataset.id = item.id;
    const thumb = document.createElement("img");
    thumb.src = item.sourceUrl;
    thumb.alt = "";
    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = item.file.name;
    const detail = document.createElement("small");
    detail.textContent = `${item.bitmap.width} × ${item.bitmap.height} · ${formatBytes(item.file.size)}`;
    text.append(name, detail);
    const status = document.createElement("b");
    status.className = "file-state";
    status.textContent = item.status === "done" ? "READY" : item.status === "working" ? "..." : item.status === "error" ? "ERROR" : "NEW";
    button.append(thumb, text, status);
    return button;
  }));
}

function selectItem(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item) return;
  state.selectedId = id;
  elements.stage.classList.add("has-image");
  elements.original.src = item.sourceUrl;
  elements.vector.src = item.vectorUrl || "";
  elements.title.textContent = item.file.name;
  elements.meta.textContent = `${item.bitmap.width} × ${item.bitmap.height} px · ${formatBytes(item.file.size)}`;
  elements.stats.textContent = item.svg ? `${item.paths.toLocaleString()} paths · ${item.commands.toLocaleString()} commands · ${formatBytes(new Blob([item.svg]).size)}` : "";
  elements.download.disabled = !item.svg;
  renderFileList();
  scheduleTrace();
}

async function addFiles(fileList) {
  const files = [...fileList].filter(file => ["image/png", "image/jpeg", "image/webp"].includes(file.type));
  if (!files.length) return showError("Choose PNG, JPG, or WebP image files.");
  setStatus("Reading images", true);
  for (const file of files) {
    if (state.items.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    try {
      const bitmap = await decodeImage(file);
      state.items.push({ id: crypto.randomUUID(), file, bitmap, sourceUrl: URL.createObjectURL(file), vectorUrl: null, svg: null, status: "new" });
    } catch (error) { console.error(error); showError(`${file.name} could not be opened.`); }
  }
  renderFileList();
  elements.downloadAll.disabled = !state.items.length;
  setStatus(`${state.items.length} image${state.items.length === 1 ? "" : "s"} loaded`);
  if (!state.selectedId && state.items.length) selectItem(state.items[0].id);
  elements.fileInput.value = "";
}

function downloadItem(item) {
  if (!item?.svg) return;
  const url = URL.createObjectURL(new Blob([item.svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${item.file.name.replace(/\.[^.]+$/, "")}.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function zipSvgFiles(items) {
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  let offset = 0;
  const write16 = (view, position, value) => view.setUint16(position, value, true);
  const write32 = (view, position, value) => view.setUint32(position, value, true);
  for (const item of items) {
    const name = encoder.encode(`${item.file.name.replace(/\.[^.]+$/, "")}.svg`);
    const data = encoder.encode(item.svg);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x0800);
    write32(localView, 14, checksum); write32(localView, 18, data.length); write32(localView, 22, data.length); write16(localView, 26, name.length);
    local.set(name, 30);
    chunks.push(local, data);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20); write16(centralView, 8, 0x0800);
    write32(centralView, 16, checksum); write32(centralView, 20, data.length); write32(centralView, 24, data.length); write16(centralView, 28, name.length); write32(centralView, 42, offset);
    central.set(name, 46);
    directory.push(central);
    offset += local.length + data.length;
  }
  const directorySize = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50); write16(endView, 8, items.length); write16(endView, 10, items.length);
  write32(endView, 12, directorySize); write32(endView, 16, offset);
  return new Blob([...chunks, ...directory, end], { type: "application/zip" });
}

async function traceAllAndDownload() {
  clearTimeout(traceTimer);
  elements.downloadAll.disabled = true;
  for (const item of state.items) {
    selectItem(item.id);
    clearTimeout(traceTimer);
    const version = ++state.traceVersion;
    await traceItem(item, version);
  }
  const url = URL.createObjectURL(zipSvgFiles(state.items));
  const link = document.createElement("a");
  link.href = url;
  link.download = "vectorized-images.zip";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  elements.downloadAll.disabled = false;
}

elements.upload.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", event => addFiles(event.target.files));
elements.fileList.addEventListener("click", event => { const item = event.target.closest("button[data-id]"); if (item) selectItem(item.dataset.id); });
elements.threshold.addEventListener("input", () => { elements.thresholdValue.value = elements.threshold.value; scheduleTrace(); });
elements.speckles.addEventListener("input", () => { elements.specklesValue.value = `${elements.speckles.value} px`; scheduleTrace(); });
elements.optimize.addEventListener("change", scheduleTrace);
elements.invert.addEventListener("change", scheduleTrace);
elements.download.addEventListener("click", () => downloadItem(selectedItem()));
elements.downloadAll.addEventListener("click", traceAllAndDownload);
document.querySelector(".view-tabs").addEventListener("click", event => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  state.view = button.dataset.view;
  document.querySelectorAll(".view-tabs button").forEach(tab => tab.classList.toggle("active", tab === button));
  elements.stage.className = `preview-stage ${state.view}-view${selectedItem() ? " has-image" : ""}`;
});
for (const type of ["dragenter", "dragover"]) document.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add("dragging"); });
for (const type of ["dragleave", "drop"]) document.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove("dragging"); });
document.addEventListener("drop", event => addFiles(event.dataTransfer.files));

try {
  setStatus("Starting vector engine", true);
  await init();
  runtimeReady = true;
  setStatus("Ready");
} catch (error) {
  console.error(error);
  setStatus("Vector engine unavailable");
  showError("The vector engine could not start in this browser.");
}
