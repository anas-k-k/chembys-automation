const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

// Force pkg to include these modules
require("express");
require("sqlite3");

// Create a logs directory for error logs
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = path.join(logsDir, `server-log-${timestamp}.txt`);
function log(message) {
  const timePrefix = `[${new Date().toISOString()}] `;
  console.log(timePrefix + message);
  try {
    fs.appendFileSync(logFile, timePrefix + message + "\n");
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}

// Start the local server for AWB log dynamic view
const serverPath = path.join(__dirname, "server.js");
const serverProcess = exec(`node "${serverPath}"`, { cwd: process.cwd() });
log("Started local server for AWB log dynamic view on http://localhost:3000/");

serverProcess.on("error", (err) => {
  log("Server process error: " + err.message);
});
serverProcess.stderr &&
  serverProcess.stderr.on("data", (data) => {
    log("Server STDERR: " + data.toString());
  });

// Wait a moment, then open the browser to the dynamic HTML page (Windows native)
setTimeout(() => {
  exec("start http://localhost:3000/");
  log("Opened browser to http://localhost:3000/");
}, 2000); // 2 seconds delay to allow server to start

// Keep the process alive so the window doesn't close immediately
process.stdin.resume();
