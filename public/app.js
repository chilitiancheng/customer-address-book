const state = {
  customers: [],
  selectedId: "",
  editingId: "",
  query: ""
};

const el = {
  summary: document.querySelector("#summary"),
  countBadge: document.querySelector("#countBadge"),
  customerList: document.querySelector("#customerList"),
  searchInput: document.querySelector("#searchInput"),
  emptyState: document.querySelector("#emptyState"),
  detailView: document.querySelector("#detailView"),
  customerForm: document.querySelector("#customerForm"),
  detailName: document.querySelector("#detailName"),
  detailContact: document.querySelector("#detailContact"),
  detailNote: document.querySelector("#detailNote"),
  detailUpdated: document.querySelector("#detailUpdated"),
  formEyebrow: document.querySelector("#formEyebrow"),
  formTitle: document.querySelector("#formTitle"),
  nameInput: document.querySelector("#nameInput"),
  contactInput: document.querySelector("#contactInput"),
  noteInput: document.querySelector("#noteInput"),
  toast: document.querySelector("#toast"),
  excelInput: document.querySelector("#excelInput"),
  restoreInput: document.querySelector("#restoreInput")
};

document.querySelector("#newBtn").addEventListener("click", () => openForm());
document.querySelector("#editBtn").addEventListener("click", () => openForm(state.selectedId));
document.querySelector("#deleteBtn").addEventListener("click", deleteSelected);
document.querySelector("#cancelBtn").addEventListener("click", cancelForm);
document.querySelector("#customerForm").addEventListener("submit", saveForm);
document.querySelector("#importBtn").addEventListener("click", () => el.excelInput.click());
document.querySelector("#exportBtn").addEventListener("click", exportExcel);
document.querySelector("#backupBtn").addEventListener("click", backupData);
document.querySelector("#restoreBtn").addEventListener("click", () => el.restoreInput.click());
el.excelInput.addEventListener("change", importExcel);
el.restoreInput.addEventListener("change", restoreData);
el.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  render();
});

loadCustomers();

async function loadCustomers() {
  const response = await fetch("/api/customers");
  state.customers = await response.json();
  state.selectedId = state.customers[0]?.id || "";
  render();
}

async function persistCustomers(message = "已保存") {
  const response = await fetch("/api/customers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customers: state.customers })
  });
  if (!response.ok) throw new Error("保存失败");
  const result = await response.json();
  state.customers = result.customers;
  showToast(message);
  render();
}

function render() {
  const filtered = filteredCustomers();
  el.summary.textContent = `${state.customers.length} 位客户，本地自动保存`;
  el.countBadge.textContent = filtered.length;
  el.customerList.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<p>${state.query ? "没有匹配的客户" : "还没有客户信息"}</p>`;
    el.customerList.appendChild(empty);
  }

  filtered.forEach((customer) => {
    const button = document.createElement("button");
    button.className = `customer-item${customer.id === state.selectedId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(customer.name || "未命名客户")}</strong><span>${escapeHtml(customer.contact || customer.note || "暂无地址/联系方式")}</span>`;
    button.addEventListener("click", () => selectCustomer(customer.id));
    el.customerList.appendChild(button);
  });

  if (state.editingId !== "") return;
  const selected = selectedCustomer();
  if (!selected) return showEmpty();
  showDetail(selected);
}

function filteredCustomers() {
  const sorted = [...state.customers].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  if (!state.query) return sorted;
  return sorted.filter((customer) => [customer.name, customer.contact, customer.note].join(" ").toLowerCase().includes(state.query));
}

function selectCustomer(id) {
  state.selectedId = id;
  state.editingId = "";
  render();
}

function selectedCustomer() {
  return state.customers.find((customer) => customer.id === state.selectedId);
}

function showEmpty() {
  el.emptyState.classList.remove("hidden");
  el.detailView.classList.add("hidden");
  el.customerForm.classList.add("hidden");
}

function showDetail(customer) {
  el.emptyState.classList.add("hidden");
  el.detailView.classList.remove("hidden");
  el.customerForm.classList.add("hidden");
  el.detailName.textContent = customer.name || "未命名客户";
  el.detailContact.textContent = customer.contact || "暂无";
  el.detailNote.textContent = customer.note || "暂无";
  el.detailUpdated.textContent = formatTime(customer.updatedAt);
}

function openForm(id = "") {
  const customer = state.customers.find((item) => item.id === id);
  state.editingId = id || "__new__";
  el.emptyState.classList.add("hidden");
  el.detailView.classList.add("hidden");
  el.customerForm.classList.remove("hidden");
  el.formEyebrow.textContent = customer ? "编辑客户" : "新增客户";
  el.formTitle.textContent = customer?.name || "客户信息";
  el.nameInput.value = customer?.name || "";
  el.contactInput.value = customer?.contact || "";
  el.noteInput.value = customer?.note || "";
  el.nameInput.focus();
}

function cancelForm() {
  state.editingId = "";
  render();
}

async function saveForm(event) {
  event.preventDefault();
  const now = new Date().toISOString();
  const payload = {
    name: el.nameInput.value.trim(),
    contact: el.contactInput.value.trim(),
    note: el.noteInput.value.trim()
  };

  if (!payload.name) {
    showToast("请填写客户名称");
    el.nameInput.focus();
    return;
  }

  if (state.editingId === "__new__") {
    const customer = { id: crypto.randomUUID(), ...payload, createdAt: now, updatedAt: now };
    state.customers.unshift(customer);
    state.selectedId = customer.id;
  } else {
    state.customers = state.customers.map((customer) =>
      customer.id === state.editingId ? { ...customer, ...payload, updatedAt: now } : customer
    );
    state.selectedId = state.editingId;
  }

  state.editingId = "";
  await persistCustomers("客户信息已保存");
}

async function deleteSelected() {
  const customer = selectedCustomer();
  if (!customer) return;
  if (!confirm(`确认删除“${customer.name || "未命名客户"}”？`)) return;
  state.customers = state.customers.filter((item) => item.id !== customer.id);
  state.selectedId = state.customers[0]?.id || "";
  await persistCustomers("已删除客户");
}

async function importExcel(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const rows = await readTableFile(file);
  const now = new Date().toISOString();
  const imported = rows
    .map((row) => ({
      id: crypto.randomUUID(),
      name: readColumn(row, ["客户名称", "客户名字", "名称", "姓名", "name"]),
      contact: readColumn(row, ["地址/联系方式", "地址联系方式", "联系方式", "地址", "电话", "contact"]),
      note: readColumn(row, ["备注", "说明", "note"]),
      createdAt: now,
      updatedAt: now
    }))
    .filter((item) => item.name || item.contact || item.note);

  if (!imported.length) {
    showToast("没有读取到可导入的数据");
    return;
  }

  const mode = confirm(`读取到 ${imported.length} 条客户。点击“确定”追加导入，点击“取消”替换当前全部数据。`);
  state.customers = mode ? [...imported, ...state.customers] : imported;
  state.selectedId = state.customers[0]?.id || "";
  state.editingId = "";
  await persistCustomers(`已导入 ${imported.length} 条客户`);
}

function exportExcel() {
  const rows = state.customers.map((customer) => ({
    客户名称: customer.name,
    "地址/联系方式": customer.contact,
    备注: customer.note,
    更新时间: formatTime(customer.updatedAt)
  }));
  downloadBlob(createXlsx(rows), `客户地址簿-${today()}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function backupData() {
  window.location.href = `/api/backup?t=${Date.now()}`;
}

async function restoreData(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    showToast("备份文件格式不正确");
    return;
  }
  const customers = Array.isArray(data) ? data : data.customers;
  if (!Array.isArray(customers)) {
    showToast("备份文件里没有客户数据");
    return;
  }
  if (!confirm(`确认用备份文件中的 ${customers.length} 条客户覆盖当前数据？`)) return;
  const response = await fetch("/api/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customers })
  });
  const result = await response.json();
  state.customers = result.customers;
  state.selectedId = state.customers[0]?.id || "";
  state.editingId = "";
  showToast("数据已恢复");
  render();
}

function readColumn(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim()) return String(row[name]).trim();
  }
  return "";
}

async function readTableFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (!name.endsWith(".xlsx")) {
    showToast("建议导入 .xlsx 或 .csv 文件");
  }
  return readXlsx(await file.arrayBuffer());
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }
  row.push(value);
  rows.push(row);
  return rowsToObjects(rows);
}

async function readXlsx(buffer) {
  const files = await unzip(buffer);
  const workbookXml = decodeUtf8(files["xl/workbook.xml"]);
  const relsXml = decodeUtf8(files["xl/_rels/workbook.xml.rels"]);
  const sheetTarget = findFirstSheetTarget(workbookXml, relsXml);
  const sheetXml = decodeUtf8(files[sheetTarget] || files["xl/worksheets/sheet1.xml"]);
  const sharedStrings = parseSharedStrings(decodeUtf8(files["xl/sharedStrings.xml"] || new Uint8Array()));
  const rows = parseSheet(sheetXml, sharedStrings);
  return rowsToObjects(rows);
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("无法读取 Excel 文件");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < entries; i += 1) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeUtf8(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(start, start + compressedSize);
    files[name] = method === 0 ? data : await inflateRaw(data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

async function inflateRaw(data) {
  if (!("DecompressionStream" in window)) {
    throw new Error("当前浏览器不支持读取压缩 Excel，请改用新版 Chrome/Edge 或导入 CSV");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findFirstSheetTarget(workbookXml, relsXml) {
  const doc = new DOMParser().parseFromString(workbookXml, "application/xml");
  const sheet = doc.querySelector("sheet");
  const relId = sheet?.getAttribute("r:id");
  if (!relId) return "xl/worksheets/sheet1.xml";
  const rels = new DOMParser().parseFromString(relsXml, "application/xml");
  const rel = [...rels.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relId);
  const target = rel?.getAttribute("Target") || "worksheets/sheet1.xml";
  return `xl/${target.replace(/^\/?xl\//, "")}`;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("si")].map((si) => [...si.querySelectorAll("t")].map((t) => t.textContent || "").join(""));
}

function parseSheet(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("sheetData row")].map((rowNode) => {
    const row = [];
    [...rowNode.querySelectorAll("c")].forEach((cell) => {
      const ref = cell.getAttribute("r") || "";
      const index = columnIndex(ref.replace(/\d+/g, ""));
      const type = cell.getAttribute("t");
      const valueNode = cell.querySelector("v");
      const inlineNode = cell.querySelector("is t");
      let value = inlineNode?.textContent || valueNode?.textContent || "";
      if (type === "s") value = sharedStrings[Number(value)] || "";
      row[index] = value;
    });
    return row.map((value) => value || "");
  });
}

function rowsToObjects(rows) {
  const cleanRows = rows.filter((row) => row.some((cell) => String(cell || "").trim()));
  if (!cleanRows.length) return [];
  const headers = cleanRows[0].map((cell) => String(cell || "").trim());
  return cleanRows.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      if (header) item[header] = String(row[index] || "").trim();
    });
    return item;
  });
}

function createXlsx(rows) {
  const headers = ["客户名称", "地址/联系方式", "备注", "更新时间"];
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] || ""))];
  const sheetXml = createSheetXml(matrix);
  const files = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="客户地址簿" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": xml(sheetXml)
  };
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function createSheetXml(matrix) {
  const rows = matrix
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = content instanceof Uint8Array ? content : encoder.encode(content);
    const crc = crc32(data);
    const local = concatBytes(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data
    );
    const central = concatBytes(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
    );
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });
  const central = concatBytes(...centralParts);
  const end = concatBytes(u32(0x06054b50), u16(0), u16(0), u16(centralParts.length), u16(centralParts.length), u32(central.length), u32(offset), u16(0));
  return concatBytes(...localParts, central, end);
}

function xml(value) {
  return new TextEncoder().encode(value);
}

function columnIndex(name) {
  return [...name].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function columnName(index) {
  let name = "";
  let num = index + 1;
  while (num > 0) {
    const mod = (num - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    num = Math.floor((num - mod) / 26);
  }
  return name;
}

function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 255];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function downloadBlob(blob, fileName, type) {
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function today() {
  const date = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2200);
}
