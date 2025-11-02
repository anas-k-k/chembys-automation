// scripts/generate-pincode-list.js
// Run this script to generate pincodes.json from the XLSX file
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Find the file that starts with 'Pincode' and ends with '.xlsx' in the project root (one level up from scripts)
const rootDir = path.resolve(__dirname, "..", "");
const files = fs.readdirSync(rootDir);
const pincodeFile = files.find(
  (f) =>
    f.toLowerCase().startsWith("pincode") && f.toLowerCase().endsWith(".xlsx")
);
if (!pincodeFile) throw new Error("Pincode XLSX file not found");
const filePath = path.join(rootDir, pincodeFile);
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets["Servicible Pincodes"];
if (!sheet) throw new Error("Sheet 'Servicible Picodes' not found");
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const pincodes = data
  .map((row) => row[0])
  .filter((val) => typeof val === "string" || typeof val === "number")
  .map((val) => String(val).trim())
  .filter((val) => val.length > 0 && /^\d{5,6}$/.test(val));

const outPath = path.join(__dirname, "..", "pincodes.json");
fs.writeFileSync(outPath, JSON.stringify(pincodes, null, 2));
console.log(`Wrote ${pincodes.length} pincodes to ${outPath}`);
