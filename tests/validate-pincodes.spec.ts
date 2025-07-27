import { test, expect } from "@playwright/test";
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

function loadPincodesFromXlsx() {
  // Find the file that starts with 'Pincode' and ends with '.xlsx' in the project root (one level up from tests)
  const rootDir = path.resolve(__dirname, "..", "");
  const files = fs.readdirSync(rootDir);
  const pincodeFile = files.find(
    (f) =>
      f.toLowerCase().startsWith("pincode") && f.toLowerCase().endsWith(".xlsx")
  );
  if (!pincodeFile) throw new Error("Pincode XLSX file not found");
  const filePath = path.join(rootDir, pincodeFile);
  // Try both possible sheet names for robustness
  const workbook = XLSX.readFile(filePath);
  let sheet = workbook.Sheets["Servicible Picodes"];
  if (!sheet) sheet = workbook.Sheets["Servicible Pincodes"];
  if (!sheet)
    throw new Error(
      "Sheet 'Servicible Picodes' or 'Servicible Pincodes' not found"
    );
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const pincodes = data
    .map((row) => row[0])
    .filter((val) => typeof val === "string" || typeof val === "number")
    .map((val) => String(val).trim())
    .filter((val) => val.length > 0 && /^\d{5,6}$/.test(val));
  return pincodes;
}

const PINCODE_LIST = loadPincodesFromXlsx();

test("Validate pincodes in Chembys Orders", async ({ page }) => {
  // Collect API error orders globally
  const apiErrorOrders: { orderId: string; pincode: string }[] = [];
  test.setTimeout(0); // Disable timeout for this test

  // Helper function to uncheck a checkbox if needed
  async function uncheckCheckboxIfNeeded(
    checkbox: any,
    checkboxChecked: boolean,
    page: any
  ) {
    if (checkbox && checkboxChecked) {
      await checkbox.click();
      await page.waitForTimeout(300);
      if (await checkbox.isChecked()) {
        await page.evaluate((el) => {
          (el as HTMLInputElement).checked = false;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, checkbox);
        await page.waitForTimeout(300);
      }
    }
  }

  // Helper to click the first visible span in a cell
  async function clickFirstVisibleSpan(destCell: any, row: any) {
    let spans = await destCell.$$("span");
    let hasTextContent = false;
    for (const span of spans) {
      const text = (await span.textContent())?.trim();
      if (text && text.length > 0) {
        hasTextContent = true;
        break;
      }
    }
    if (!(spans.length > 0 && hasTextContent)) return false;
    await spans[0].scrollIntoViewIfNeeded();
    await spans[0].click();
    return true;
  }

  // Helper to wait for modal popup, retrying click if needed
  async function waitForModalWithRetry(
    page: any,
    destCell: any,
    row: any,
    maxAttempts = 2
  ) {
    let popup = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        popup = await page.waitForSelector(".modal-content.modal", {
          timeout: 12000,
        });
        if (popup) break;
      } catch {
        // Retry clicking if modal didn't appear
        let spans = await destCell.$$("span");
        await row.scrollIntoViewIfNeeded();
        await page.waitForTimeout(3000);
        if (spans.length > 0) {
          await spans[0].scrollIntoViewIfNeeded();
          await spans[0].click();
        }
        await page.waitForTimeout(3000);
      }
    }
    return popup;
  }

  // Helper to extract order ID from a row
  async function extractOrderId(page: any, rowIndex: number) {
    const orderAnchor = await page.$(
      `table tbody tr:nth-child(${rowIndex + 1}) td:nth-child(4) a.title-color`
    );
    if (orderAnchor) {
      const href = await orderAnchor.getAttribute("href");
      if (href) {
        const match = href.match(/\/(\d+)$/);
        if (match) return match[1];
      }
    }
    return undefined;
  }

  // Helper to select shipment method
  async function selectShipmentMethod(page: any, method: string) {
    const globalDropdown = await page.$(
      'select[name="custom_shipment_method"]'
    );
    if (globalDropdown) {
      await globalDropdown.selectOption({ label: method });
      await page.waitForTimeout(1000);
    }
  }

  // 1. Go to login page
  await page.goto("https://chembys.com/login/admin");
  await page.waitForSelector("h1:text-is('Sign in')");

  // 2. Login
  await page
    .getByPlaceholder("email@address.com")
    .fill("superadmin@chembys.com");
  await page.locator("#signingAdminPassword").fill("chembys@1234");
  await page.getByRole("button", { name: "Sign in" }).click();

  // 3. Wait for dashboard to load
  await page.waitForSelector("aside.navbar-vertical-aside"); // Wait for sidebar to ensure dashboard is loaded

  // 4. Click "Orders" in left nav
  await page.click(
    'a.js-navbar-vertical-aside-menu-link.nav-link[href="https://chembys.com/admin/orders/list/all"]'
  );
  await page.waitForSelector("table"); // Wait for orders table

  // Arrays to track {orderId, pincode} for Delhivery and Shiprocket
  const delhiveryOrders: { orderId: string; pincode: string }[] = [];
  const shiprocketOrders: { orderId: string; pincode: string }[] = [];

  // 5. Handle pagination
  const matchingPincodes = new Set<string>();
  let allOrdersProcessed = 0;

  // Helper to process all rows on the current page
  async function processOrderRows() {
    let rowIndex = 0;
    let rows = await page.$$("table tbody tr");
    console.log("Rows found on this page:", rows.length);
    while (rowIndex < rows.length - 1) {
      console.log("Processing row index:", rowIndex);
      const row = rows[rowIndex];
      await row.scrollIntoViewIfNeeded();
      const checkbox = await row.$("td input[type='checkbox']");
      let checkboxChecked = false;
      if (checkbox) {
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
          await checkbox.click();
          await page.waitForTimeout(3000);
          checkboxChecked = true;
        }
      }

      const cells = await row.$$("td");
      const destCell = cells[6];
      if (!destCell) {
        rowIndex++;
        continue;
      }
      //if the destination cell contains an achor tage with text show note then skip like above
      const showNoteAnchor = await destCell.$("a:has-text('Show Note')");
      if (showNoteAnchor) {
        console.log("Skipping row with 'Show Note' anchor");
        await uncheckCheckboxIfNeeded(checkbox, checkboxChecked, page);
        rowIndex++;
        continue;
      }
      const destCellValue = await destCell.textContent();
      console.log("Destination cell value:", destCellValue?.trim());
      await page.waitForTimeout(3000);
      const spanClicked = await clickFirstVisibleSpan(destCell, row);
      if (!spanClicked) {
        await uncheckCheckboxIfNeeded(checkbox, checkboxChecked, page);
        rowIndex++;
        continue;
      }
      await page.waitForTimeout(3000);
      const popup = await waitForModalWithRetry(page, destCell, row, 2);
      if (!popup)
        throw new Error("Modal did not appear after multiple attempts");

      const pincodeText = await popup.textContent();
      const pincodeMatch = pincodeText?.match(/\b\d{5,6}\b/g);
      const isKeralaPincode = pincodeText?.toLowerCase().includes("kerala");
      let currentPincode: string | undefined = undefined;
      if (pincodeMatch && pincodeMatch.length > 0) {
        const pincode = pincodeMatch[pincodeMatch.length - 1];
        currentPincode = pincode;
        console.log("Extracted pincode:", pincode);
        if (PINCODE_LIST.includes(pincode)) {
          matchingPincodes.add(pincode);
        }
        allOrdersProcessed++;
      }

      await page.keyboard.press("Escape");
      await page.waitForTimeout(3000);

      const currentOrderId = await extractOrderId(page, rowIndex);

      if (currentPincode && currentOrderId) {
        if (
          (PINCODE_LIST.includes(currentPincode) && isKeralaPincode) ||
          !isKeralaPincode
        ) {
          await selectShipmentMethod(page, "Delhivery");
          delhiveryOrders.push({
            orderId: currentOrderId,
            pincode: currentPincode,
          });
          // Call the update-note-order API for Delhivery (shipmentmethod=13) with CSRF token and check for error in response
          const apiError = await page.evaluate(
            async ({ orderId, pincode }) => {
              let csrfToken = "";
              const meta = document.querySelector('meta[name="csrf-token"]');
              if (meta) {
                csrfToken = meta.getAttribute("content") || "";
              } else {
                const input = document.querySelector('input[name="_token"]');
                if (input) csrfToken = (input as HTMLInputElement).value;
              }
              if (!csrfToken) {
                throw new Error("CSRF token not found on page");
              }
              const formData = new FormData();
              formData.append("selectedidsshipment[]", orderId);
              formData.append("shipmentmethod", "13");
              formData.append("manualshipment", "unchecked");
              formData.append("orderstatus", "pending");
              formData.append("_token", csrfToken);
              const resp = await fetch(
                "https://chembys.com/admin/orders/update-note-order",
                {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                }
              );
              const text = await resp.text();
              if (text.toLowerCase().includes("error")) {
                return { orderId, pincode };
              }
              return null;
            },
            { orderId: currentOrderId, pincode: currentPincode }
          );
          if (apiError) {
            apiErrorOrders.push(apiError);
          }
        } else {
          await selectShipmentMethod(page, "Shiprocket");
          shiprocketOrders.push({
            orderId: currentOrderId,
            pincode: currentPincode,
          });
          // Call the update-note-order API for Shiprocket (shipmentmethod=12) with CSRF token and check for error in response
          const apiError = await page.evaluate(
            async ({ orderId, pincode }) => {
              let csrfToken = "";
              const meta = document.querySelector('meta[name="csrf-token"]');
              if (meta) {
                csrfToken = meta.getAttribute("content") || "";
              } else {
                const input = document.querySelector('input[name="_token"]');
                if (input) csrfToken = (input as HTMLInputElement).value;
              }
              if (!csrfToken) {
                throw new Error("CSRF token not found on page");
              }
              const formData = new FormData();
              formData.append("selectedidsshipment[]", orderId);
              formData.append("shipmentmethod", "12");
              formData.append("manualshipment", "unchecked");
              formData.append("orderstatus", "pending");
              formData.append("_token", csrfToken);
              const resp = await fetch(
                "https://chembys.com/admin/orders/update-note-order",
                {
                  method: "POST",
                  credentials: "include",
                  body: formData,
                }
              );
              const text = await resp.text();
              if (text.toLowerCase().includes("error")) {
                return { orderId, pincode };
              }
              return null;
            },
            { orderId: currentOrderId, pincode: currentPincode }
          );
          if (apiError) {
            apiErrorOrders.push(apiError);
          }
        }
        await page.waitForTimeout(3000);
      }

      await uncheckCheckboxIfNeeded(checkbox, checkboxChecked, page);
      rows = await page.$$("table tbody tr");
      rowIndex++;
    }
  }

  while (true) {
    // Move scroll bar to center if at the top
    const scrollY = await page.evaluate(() => window.scrollY);
    if (scrollY === 0) {
      await page.evaluate(() => {
        window.scrollTo({
          top: document.body.scrollHeight / 2,
          behavior: "instant",
        });
      });
      await page.waitForTimeout(500);
    }
    await processOrderRows();

    // Output API error orders if any
    if (apiErrorOrders.length > 0) {
      console.log("\n=== API Error Orders ===");
      console.table(apiErrorOrders);
    }

    // Check for next page button
    const nextBtn = await page.$(
      "li.page-item:not(.disabled) a.page-link:has-text('›')"
    );
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(2000); // Wait for next page to load
    } else {
      break;
    }
  }

  // 6. Output results
  console.log("=== Pincode Validation Summary ===");
  console.log("Total orders processed:", allOrdersProcessed);
  console.log("Total matching pincodes:", matchingPincodes.size);
  console.log("Matching pincodes:", Array.from(matchingPincodes));
  console.log("\n=== Delhivery Orders ===");
  console.table(delhiveryOrders);
  console.log("\n=== Shiprocket Orders ===");
  console.table(shiprocketOrders);
});
