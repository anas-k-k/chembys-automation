// db.js
// SQLite helper for AWB logging
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const dbPath = path.join(__dirname, "../Database/awb_log.db");

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS awb_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    awbno TEXT NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL
  )`);
});

// Ensure 'category' column exists (for migrations)
db.serialize(() => {
  db.get("PRAGMA table_info(awb_logs)", (err, row) => {
    if (err) return;
    db.all("PRAGMA table_info(awb_logs)", (err, columns) => {
      if (err) return;
      const hasCategory = columns.some((col) => col.name === "category");
      if (!hasCategory) {
        db.run(
          "ALTER TABLE awb_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'Reattempt or Delay'"
        );
      }
    });
  });
});

function insertAWB(awbno, date, category) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO awb_logs (awbno, date, category) VALUES (?, ?, ?)",
      [awbno, date, category],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function deleteAllRows() {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM awb_logs", function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getLatestAWBEntryDate(awbno) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT date FROM awb_logs WHERE awbno = ? ORDER BY date DESC LIMIT 1",
      [awbno],
      (err, row) => {
        if (err) return reject(err);
        if (row && row.date) resolve(row.date);
        else resolve(null);
      }
    );
  });
}

module.exports = { insertAWB, dbPath, deleteAllRows, getLatestAWBEntryDate };
