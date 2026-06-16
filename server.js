const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "customers.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/customers") {
      if (req.method === "GET") return sendJson(res, readCustomers());
      if (req.method === "PUT") {
        const body = await readJsonBody(req);
        const customers = normalizeCustomers(body.customers);
        createBackup();
        writeCustomers(customers);
        return sendJson(res, { ok: true, customers });
      }
    }

    if (url.pathname === "/api/backup" && req.method === "GET") {
      return sendDownload(res, DATA_FILE, `customer-address-book-${dateStamp()}.json`, "application/json");
    }

    if (url.pathname === "/api/restore" && req.method === "POST") {
      const body = await readJsonBody(req);
      const customers = normalizeCustomers(body.customers);
      createBackup();
      writeCustomers(customers);
      return sendJson(res, { ok: true, customers });
    }

    if (url.pathname === "/api/backups" && req.method === "GET") {
      const backups = listBackups();
      return sendJson(res, backups);
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, { ok: true });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, { ok: false, error: error.message || "Server error" }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Customer address book running at http://localhost:${PORT}`);
});

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]\n", "utf8");
  }
}

function readCustomers() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeCustomers(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeCustomers(customers) {
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(customers, null, 2)}\n`, "utf8");
}

function normalizeCustomers(input) {
  if (!Array.isArray(input)) return [];
  const now = new Date().toISOString();
  return input
    .map((item) => ({
      id: text(item.id) || crypto.randomUUID(),
      name: text(item.name || item["客户名称"]),
      contact: text(item.contact || item["地址/联系方式"] || item["地址联系方式"]),
      note: text(item.note || item["备注"]),
      createdAt: text(item.createdAt) || now,
      updatedAt: text(item.updatedAt) || now
    }))
    .filter((item) => item.name || item.contact || item.note);
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function createBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  const backupName = `customers-${dateStamp(true)}.json`;
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, backupName));
}

function listBackups() {
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
    .map((name) => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      return { name, size: stat.size, updatedAt: stat.mtime.toISOString() };
    });
}

function dateStamp(includeTime = false) {
  const date = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!includeTime) return base;
  return `${base}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendDownload(res, filePath, fileName, contentType) {
  if (!fs.existsSync(filePath)) return sendJson(res, { ok: false, error: "File not found" }, 404);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : decodeURIComponent(requestPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}
