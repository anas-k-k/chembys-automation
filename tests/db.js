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

function exportAllToHTML(htmlPath) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM awb_logs", (err, rows) => {
      if (err) return reject(err);
      // Escape < in JSON for safe embedding
      const safeRows = JSON.stringify(rows).replace(/</g, "\u003c");
      let html =
        `<!DOCTYPE html><html><head><meta charset='utf-8'><title>AWB Log</title><style>
        body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 0; }
        h2 { text-align: center; margin-top: 24px; }
        .container { max-width: 900px; margin: 32px auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #0001; padding: 24px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th, td { border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }
        th { background: #007bff; color: #fff; position: sticky; top: 0; z-index: 1; }
        tr:nth-child(even) { background: #f2f2f2; }
        input, select { padding: 4px 8px; margin-right: 8px; border-radius: 4px; border: 1px solid #ccc; }
        .filters { margin-bottom: 12px; }
        .pagination { display: flex; justify-content: center; align-items: center; margin: 16px 0; }
        .pagination button { margin: 0 4px; padding: 4px 10px; border-radius: 4px; border: 1px solid #007bff; background: #fff; color: #007bff; cursor: pointer; }
        .pagination button.active, .pagination button:disabled { background: #007bff; color: #fff; cursor: default; }
      </style></head><body><div class='container'><h2>AWB Log</h2>
      <div class='filters'>
        <label>AWB No: <input type='text' id='awbFilter' placeholder='Filter by AWB No'></label>
        <label>Date: <input type='text' id='dateFilter' placeholder='YYYYMMDD'></label>
        <label>Category: <select id='categoryFilter'><option value=''>All</option></select></label>
        <button onclick='resetFilters()'>Reset</button>
      </div>
      <table id='awbTable'><thead><tr><th>ID</th><th>AWB No</th><th>Date</th><th>Category</th></tr></thead><tbody></tbody></table>
      <div class='pagination' id='pagination'></div>
      <script>
        const allRows = JSON.parse(` +
        "`" +
        safeRows +
        "`" +
        `);
        const awbInput = document.getElementById('awbFilter');
        const dateInput = document.getElementById('dateFilter');
        const categorySelect = document.getElementById('categoryFilter');
        const tableBody = document.getElementById('awbTable').tBodies[0];
        const paginationDiv = document.getElementById('pagination');
        const PAGE_SIZE = 50;
        let filteredRows = allRows.slice();
        let currentPage = 1;
        // Populate category filter
        const categories = [...new Set(allRows.map(r => r.category))];
        for (const cat of categories) {
          if (cat) {
            const opt = document.createElement('option');
            opt.value = cat; opt.textContent = cat;
            categorySelect.appendChild(opt);
          }
        }
        function renderTable() {
          tableBody.innerHTML = '';
          const start = (currentPage - 1) * PAGE_SIZE;
          const end = start + PAGE_SIZE;
          filteredRows.slice(start, end).forEach(function(row) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + row.id + '</td><td>' + row.awbno + '</td><td>' + row.date + '</td><td>' + row.category + '</td>';
            tableBody.appendChild(tr);
          });
        }
        function renderPagination() {
          paginationDiv.innerHTML = '';
          const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE) || 1;
          for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === currentPage) btn.classList.add('active');
            btn.disabled = i === currentPage;
            btn.onclick = () => { currentPage = i; renderTable(); renderPagination(); };
            paginationDiv.appendChild(btn);
          }
        }
        function filterTable() {
          const awbVal = awbInput.value.trim().toLowerCase();
          const dateVal = dateInput.value.trim();
          const catVal = categorySelect.value;
          filteredRows = allRows.filter(function(row) {
            let show = true;
            if (awbVal && !row.awbno.toLowerCase().includes(awbVal)) show = false;
            if (dateVal && !row.date.includes(dateVal)) show = false;
            if (catVal && row.category !== catVal) show = false;
            return show;
          });
          currentPage = 1;
          renderTable();
          renderPagination();
        }
        awbInput.addEventListener('input', filterTable);
        dateInput.addEventListener('input', filterTable);
        categorySelect.addEventListener('change', filterTable);
        function resetFilters() {
          awbInput.value = '';
          dateInput.value = '';
          categorySelect.value = '';
          filterTable();
        }
        window.resetFilters = resetFilters;
        // Initial render
        filterTable();
      <\/script></div></body></html>`;
      require("fs").writeFileSync(htmlPath, html, "utf-8");
      resolve();
    });
  });
}

module.exports = { insertAWB, dbPath, deleteAllRows, exportAllToHTML };
