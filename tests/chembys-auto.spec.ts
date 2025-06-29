import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Disable the timeout for the test.
 */
const INDEFINITE_TIMEOUT = 0; // No timeout

/**
 * Logs request failures for debugging purposes.
 * @param {import('@playwright/test').Page} page - The Playwright page object.
 */
function setupRequestFailureLogging(page) {
  page.on("requestfailed", (request) => {
    console.log(
      `Request failed: ${request.url()} - ${request.failure()?.errorText}`
    );
  });
}

/**
 * Logs into the Chembys admin portal.
 * @param {import('@playwright/test').Page} page - The Playwright page object.
 */
async function loginToChembysAdmin(page) {
  await page.goto("https://chembys.com/login/admin");
  await page.waitForSelector("h1:text-is('Sign in')");
  await page
    .getByPlaceholder("email@address.com")
    .fill("superadmin@chembys.com");
  await page.locator("#signingAdminPassword").fill("chembys@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Navigates to the Orders page and filters by "Time Breached".
 * @param {import('@playwright/test').Page} page - The Playwright page object.
 */
async function filterOrdersByTimeBreached(page) {
  await page
    .locator("a.nav-link[href='https://chembys.com/admin/orders/list/all']")
    .click();
  await page.selectOption("select.status.form-control", "Time_Breached");
  await page.locator("button#formUrlChange.btn.btn--primary.px-5").click();
  await page.waitForTimeout(5000); // Wait for elements to load
}

/**
 * Extracts AWB numbers from the Orders page.
 * @param {import('@playwright/test').Page} page - The Playwright page object.
 * @returns {Promise<string[]>} - List of AWB numbers.
 */
async function extractAWBNumbers(page) {
  let allAWBNumbers: string[] = [];
  while (true) {
    // Extract AWB numbers from the current page
    const awbs = await page.$$eval(
      "td.text-center.text-capitalize span:has-text('delhivery - delhivery') + br + span a",
      (elements) =>
        elements.map(
          (el) => el.textContent?.replace("AWBNO - ", "").trim() || ""
        )
    );
    allAWBNumbers.push(...awbs);

    // Check if the next button is disabled
    const isNextDisabled = await page
      .locator('li.page-item.disabled[aria-label="Next »"]')
      .isVisible()
      .catch(() => false);
    if (isNextDisabled) break;

    // Click the next button
    const nextButton = page.locator(
      'li.page-item:not(.disabled) a.page-link:has-text("›")'
    );
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(3000); // Wait for the next page to load
    } else {
      break;
    }
  }
  return allAWBNumbers;
}

/**
 * Logs into the Delhivery portal.
 * @param {import('@playwright/test').Browser} browser - The Playwright browser object.
 * @returns {Promise<import('@playwright/test').Page>} - The logged-in page object.
 */
async function loginToDelhivery(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://one.delhivery.com/login?redirectFrom=/home");
  await page
    .getByPlaceholder("Enter your email ID")
    .fill("shanjalal@gmail.com");
  await page.getByRole("button", { name: "Proceed" }).click();
  await page.locator("#password").fill("Shayaan@1983");
  await page.getByRole("button", { name: "Login" }).click();
  return page;
}

/**
 * Utility to get today's date in YYYYMMDD format.
 */
function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Get the next run number for today by checking existing files in logs.
 */
function getNextRunNumber(logsDir, todayStr) {
  if (!fs.existsSync(logsDir)) return 1;
  const files = fs.readdirSync(logsDir);
  const regex = new RegExp(`^processed_awb_${todayStr}_(\\d+)\\.json$`);
  let maxRun = 0;
  for (const file of files) {
    const match = file.match(regex);
    if (match) {
      const runNum = parseInt(match[1], 10);
      if (runNum > maxRun) maxRun = runNum;
    }
  }
  return maxRun + 1;
}

/**
 * Get all processed AWBs for today (across all runs).
 */
function getProcessedAWBsForToday(logsDir: string, todayStr: string): string[] {
  if (!fs.existsSync(logsDir)) return [];
  const files = fs.readdirSync(logsDir);
  const regex = new RegExp(`^processed_awb_${todayStr}_(\\d+)\\.json$`);
  let awbs: string[] = [];
  for (const file of files) {
    if (file.match(regex)) {
      try {
        const data = fs.readFileSync(path.join(logsDir, file), "utf-8");
        const arr: string[] = JSON.parse(data);
        if (Array.isArray(arr)) awbs.push(...arr);
      } catch {}
    }
  }
  return awbs;
}

/**
 * Get all processed AWBs for the last N days (including today).
 */
function getProcessedAWBsForRecentDays(
  logsDir: string,
  days: number = 3
): string[] {
  if (!fs.existsSync(logsDir)) return [];
  const files = fs.readdirSync(logsDir);
  let awbs: string[] = [];
  const dateStrings: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dateStrings.push(`${yyyy}${mm}${dd}`);
  }
  for (const dateStr of dateStrings) {
    const regex = new RegExp(`^processed_awb_${dateStr}_(\\d+)\\.json$`);
    for (const file of files) {
      if (file.match(regex)) {
        try {
          const data = fs.readFileSync(path.join(logsDir, file), "utf-8");
          const arr: string[] = JSON.parse(data);
          if (Array.isArray(arr)) awbs.push(...arr);
        } catch {}
      }
    }
  }
  return awbs;
}

/**
 * Processes AWB numbers and raises issues for "Behaviour complaint against staff".
 * Stops after successfully raising issues for 3 AWB numbers.
 * @param {import('@playwright/test').Page} page - The logged-in Delhivery page object.
 * @param {string[]} awbNumbers - List of AWB numbers.
 */
async function processAWBNumbers(page, awbNumbers: string[]) {
  const logsDir = path.join(__dirname, "../logs");
  const todayStr = getTodayString();
  const runNumber = getNextRunNumber(logsDir, todayStr);
  const processedFile = path.join(
    logsDir,
    `processed_awb_${todayStr}_${runNumber}.json`
  );
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  // Get all already processed AWBs for last 3 days
  const alreadyProcessed: Set<string> = new Set(
    getProcessedAWBsForRecentDays(logsDir, 3)
  );
  let successCount = 0;
  let processedThisRun: string[] = [];

  for (const [index, awb] of awbNumbers.entries()) {
    if (alreadyProcessed.has(awb)) {
      console.log(`Skipping AWB ${awb} (already processed in last 3 days)`);
      continue;
    }
    console.log(`Processing AWB ${index + 1} out of ${awbNumbers.length}`);
    try {
      await searchAWB(page, awb);
      if (await isAWBFound(page, awb)) {
        await handleAWB(page, awb);
        successCount++;
        processedThisRun.push(awb);
      }
    } catch (error) {
      console.error(`Error processing AWB: ${awb}.`, error);
    }
  }
  // Write processed AWBs for this run
  fs.writeFileSync(processedFile, JSON.stringify(processedThisRun, null, 2));
}

async function searchAWB(page, awb) {
  await page.getByPlaceholder("Search multiple AWBs").fill(awb);
  await page.waitForTimeout(2000);
}

async function isAWBFound(page, awb) {
  const resultDiv = page.locator(
    `.ucp__global-search__result >> text=AWB ${awb}`
  );
  return await resultDiv.isVisible();
}

async function handleAWB(page, awb) {
  const resultDiv = page.locator(
    `.ucp__global-search__result >> text=AWB ${awb}`
  );
  await resultDiv.click();
  await page.waitForTimeout(2000);

  if (await isSupportTicketsVisible(page)) {
    await processSupportTickets(page, awb);
  }
}

async function isSupportTicketsVisible(page) {
  const supportTicketsSpan = page.locator(
    "span.badge.blue.small.pill.outlined:has(span:has-text('Support Tickets'))"
  );
  return await supportTicketsSpan.isVisible();
}

async function processSupportTickets(page, awb) {
  let daysDiff = 0;
  let extractedEstimateDeliveryDate: Date | null = null;
  const needHelpButton = page.locator(
    "button.ap-button.white.base.rounded.filled:has-text('Need Help')"
  );

  if (await needHelpButton.isVisible()) {
    const moreInfoButton = page.locator(
      "button.ap-button.text.base.rounded.filled.status-action:has-text('More info')"
    );

    if (await moreInfoButton.isVisible()) {
      const moreInfoResult = await handleMoreInfo(page, awb);
      daysDiff = moreInfoResult.dayDifferenceCalculated;
      extractedEstimateDeliveryDate =
        moreInfoResult.extractedEstimateDeliveryDate;
    }
    if (
      daysDiff > 4 &&
      extractedEstimateDeliveryDate instanceof Date &&
      extractedEstimateDeliveryDate.setHours(0, 0, 0, 0) <
        new Date().setHours(0, 0, 0, 0)
    ) {
      await handleNeedHelp(page, awb, daysDiff);
    } else {
      console.log(
        `Ticket creation rule doesn't satisfy for AWB number: ${awb}`
      );
    }
  }
}

async function handleNeedHelp(page, awb, daysDiff) {
  await page
    .locator("button.ap-button.white.base.rounded.filled:has-text('Need Help')")
    .click();
  await page.waitForTimeout(2000);

  await handleReattemptOrDelay(page, awb, daysDiff);
}

async function handleMoreInfo(page, awb) {
  let dayDifferenceCalculated = 0;
  let extractedDateObj: Date | null = null;
  await page
    .locator(
      "button.ap-button.text.base.rounded.filled.status-action:has-text('More info')"
    )
    .click();
  await page.waitForTimeout(2000);

  const dateSpan = page.locator(
    'ol.ap-steps__list li[name="ap-steps-step"]:first-of-type .ap-steps__list__item--circles__name div'
  );

  if (await dateSpan.isVisible()) {
    const dateText = await dateSpan.textContent();
    if (dateText) {
      const extractedDate = new Date(dateText.trim());
      const currentDate = new Date();
      const timeDifference = currentDate.getTime() - extractedDate.getTime();
      const dayDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));
      dayDifferenceCalculated = isNaN(dayDifference) ? 0 : dayDifference;

      //extract the estimated date from the description span
      // and convert it to a Date object
      const dateSpanDesc = page.locator(
        'ol.ap-steps__list li[name="ap-steps-step"]:first-of-type span.ap-steps__list__item--circles__description > span[title^="Estimated date:"]'
      );

      if (await dateSpanDesc.isVisible()) {
        const dateTextDesc = await dateSpanDesc.textContent();
        if (dateTextDesc) {
          // Extract only the date part using regex
          const match = dateTextDesc.match(/Estimated date:\s*(.+)$/);
          if (match && match[1]) {
            const extractedDateStr = match[1].trim(); // e.g., "29 Jun 2025"
            const extractedEstimatedDate = new Date(extractedDateStr);
            // If you want to return this date instead, set extractedDateObj = extractedDate2;
            extractedDateObj = extractedEstimatedDate;
          }
        }
      }
    }
  }

  const closeMoreInfoIcon = page.locator(
    "span.ap-icon.modal-header__actions--close"
  );

  if (await closeMoreInfoIcon.isVisible()) {
    await closeMoreInfoIcon.click();
    await page.waitForTimeout(2000);
  }

  return {
    extractedEstimateDeliveryDate: extractedDateObj,
    dayDifferenceCalculated,
  };
}

async function handleReattemptOrDelay(page, awb, daysDiff) {
  const reattemptOrDelaySpan = page.locator(
    "span.badge.custom.small.pill.outlined.badge:has(span:has-text('Reattempt or Delay in delivery'))"
  );

  if (await reattemptOrDelaySpan.isVisible()) {
    await reattemptOrDelaySpan.click();
    await page.waitForTimeout(2000);

    const reattemptOrDelayChildSpan = page.locator(
      "div.flex.flex-wrap.mt-3 > span.badge.custom.small.pill.outlined.badge:has(span:has-text('Reattempt or Delay in delivery / consignee pickup'))"
    );

    if (await reattemptOrDelayChildSpan.isVisible()) {
      await reattemptOrDelayChildSpan.click();
      await page.waitForTimeout(2000);
    }

    await page
      .getByPlaceholder("Please describe your issue here")
      .fill("Not delivered on time");
    await page.waitForTimeout(2000);

    const raiseIssueButton = page.locator(
      "button.ap-button.blue.base.rounded.filled[label='Raise this Issue'][event='raise'][type='button']"
    );
    if (await raiseIssueButton.isVisible()) {
      //await raiseIssueButton.click();
      await page.waitForTimeout(2000);
      console.log(`Issue raised for AWB ${awb}.`);
      //here i needd to add the logic to push awb numbers to a global array
      if (!globalThis.raisedAWBNumbers) {
        globalThis.raisedAWBNumbers = [];
      }
      globalThis.raisedAWBNumbers.push(`${awb} - ${daysDiff} Old Days`);
    }

    await page
      .locator(".modal-header__actions .modal-header__actions--close")
      .click();
  }
}

/**
 * Main test suite for Chembys Auto.
 */
test.describe("Chembys Auto", () => {
  test("should load the Chembys Auto page", async ({ page, browser }) => {
    test.setTimeout(INDEFINITE_TIMEOUT);

    setupRequestFailureLogging(page);
    await loginToChembysAdmin(page);
    await filterOrdersByTimeBreached(page);

    const awbNumbers = await extractAWBNumbers(page);
    console.log("Filtered AWBNO Numbers:", awbNumbers);
    console.log("Filtered AWBNO Count:", awbNumbers.length);

    const loggedInPage = await loginToDelhivery(browser);
    await processAWBNumbers(loggedInPage, awbNumbers);

    // Add more assertions or interactions as needed
    if (globalThis.raisedAWBNumbers && globalThis.raisedAWBNumbers.length > 0) {
      console.log(
        `(${
          globalThis.raisedAWBNumbers.length + 1
        } - AWB numbers for which issues were raised): ${
          globalThis.raisedAWBNumbers
        }`
      );
    } else {
      console.log("No issues were raised for any AWB numbers.");
    }
  });
});
