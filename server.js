const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const port = Number(process.env.PORT) || 8080;
// Postgres scales to zero when idle; keep idle connections short-lived.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, idleTimeoutMillis: 10000 });
const schema = fs.readFileSync(path.join(__dirname, "migrations", "001_visits.sql"), "utf8");
let ready;

function ensureSchema() {
  ready = ready || pool.query(schema).catch((err) => { ready = null; throw err; });
  return ready;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendMockup(res, file = "ui-mockup.html") {
  const page = fs.readFileSync(path.join(__dirname, "docs", file), "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0}[hidden]{display:none!important}</style></head><body>${page}</body></html>`);
}

http.createServer(async (req, res) => {
  if (req.url === "/healthz") return send(res, 200, { ok: true });
  const url = req.url.split("?")[0];
  if (url === "/mockup" || url === "/ui-mockup.html") return sendMockup(res);
  if (url === "/plant" || url === "/plant-3d.html") return sendMockup(res, "plant-3d.html");
  // Local dev without a database: show the 3D site view instead of the DB status.
  if (url === "/" && !process.env.DATABASE_URL) return sendMockup(res, "plant-3d.html");
  if (req.url !== "/") return send(res, 404, { error: "not found" });
  try {
    await ensureSchema();
    await pool.query("INSERT INTO visits DEFAULT VALUES");
    const { rows } = await pool.query("SELECT count(*)::int AS visits, now() AS db_time FROM visits");
    send(res, 200, { message: "PlantAPI is running on InstaCloud", ...rows[0] });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: "database unavailable" });
  }
}).listen(port, () => console.log(`listening on ${port}`));
