// server.js
// Simple Express server to serve AWB log HTML and API
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const app = express();
const PORT = 3000;

// Parse JSON bodies
app.use(bodyParser.json());

// Determine runtime location for DB
const isPkg = typeof process.pkg !== "undefined";
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;
const dbAssetPath = path.join(baseDir, "Database", "awb_log.db");

// If running as pkg and DB does not exist, copy from asset
if (isPkg) {
  const assetSource = path.join(
    path.dirname(process.execPath),
    "Database",
    "awb_log.db"
  );
  if (!fs.existsSync(dbAssetPath)) {
    fs.mkdirSync(path.dirname(dbAssetPath), { recursive: true });
    fs.writeFileSync(dbAssetPath, fs.readFileSync(assetSource));
  }
}

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API endpoint to get AWB logs as JSON
app.get("/api/awb_logs", (req, res) => {
  const dbConn = new sqlite3.Database(dbAssetPath);
  dbConn.all("SELECT * FROM awb_logs", (err, rows) => {
    dbConn.close();
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add a new log
app.post("/api/awb_logs", (req, res) => {
  const { awbno, date, category } = req.body;
  if (!awbno || !date || !category)
    return res.json({ success: false, error: "Missing fields" });
  const db = new sqlite3.Database(dbAssetPath);
  db.run(
    "INSERT INTO awb_logs (awbno, date, category) VALUES (?, ?, ?)",
    [awbno, date, category],
    function (err) {
      db.close();
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Delete a log by id
app.delete("/api/awb_logs/:id", (req, res) => {
  const id = req.params.id;
  const db = new sqlite3.Database(dbAssetPath);
  db.run("DELETE FROM awb_logs WHERE id = ?", [id], function (err) {
    db.close();
    if (err) return res.json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

// Update a log by id (date and category only)
app.put("/api/awb_logs/:id", (req, res) => {
  const id = req.params.id;
  const { date, category } = req.body;
  if (!date || !category)
    return res.json({ success: false, error: "Missing fields" });
  const db = new sqlite3.Database(dbAssetPath);
  db.run(
    "UPDATE awb_logs SET date = ?, category = ? WHERE id = ?",
    [date, category, id],
    function (err) {
      db.close();
      if (err) return res.json({ success: false, error: err.message });
      if (this.changes === 0)
        return res.json({ success: false, error: "Not found" });
      res.json({ success: true });
    }
  );
});

// Serve static files (HTML, CSS, JS) AFTER API routes
app.use(express.static(path.join(__dirname, "test-report")));

// Fallback: serve awb_log_dynamic.html for root
app.get("/", (req, res) => {
  // Use pkg's path for assets if running as a pkg executable
  const isPkg = typeof process.pkg !== "undefined";
  const htmlPath = isPkg
    ? path.join(
        path.dirname(process.execPath),
        "test-report",
        "awb_log_dynamic.html"
      )
    : path.join(__dirname, "test-report", "awb_log_dynamic.html");
  res.sendFile(htmlPath);
});

// Remove the buggy app.all("*", ...) and replace with proper catch-all middleware
app.use((req, res) => {
  res
    .status(404)
    .json({ error: "Not found", method: req.method, url: req.url });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
