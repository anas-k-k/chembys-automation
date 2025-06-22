import { test } from "@playwright/test";

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
  return await page.$$eval(
    "td.text-center.text-capitalize span:has-text('delhivery') + br + span a",
    (elements) =>
      elements.map((el) => el.textContent?.replace("AWBNO - ", "").trim() || "")
  );
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
 * Processes AWB numbers and raises issues for "Behaviour complaint against staff".
 * Stops after successfully raising issues for 3 AWB numbers.
 * @param {import('@playwright/test').Page} page - The logged-in Delhivery page object.
 * @param {string[]} awbNumbers - List of AWB numbers.
 */
async function processAWBNumbers(page, awbNumbers) {
  let successCount = 0;

  for (const [index, awb] of awbNumbers.entries()) {
    console.log(`Processing AWB ${index + 1} out of ${awbNumbers.length}`);
    //if (successCount >= 3) break; // Stop after 3 successful additions

    try {
      await searchAWB(page, awb);

      if (await isAWBFound(page, awb)) {
        await handleAWB(page, awb);
        successCount++;
      }
    } catch (error) {
      console.error(`Error processing AWB: ${awb}.`, error);
    }
  }
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
  const needHelpButton = page.locator(
    "button.ap-button.white.base.rounded.filled:has-text('Need Help')"
  );

  if (await needHelpButton.isVisible()) {
    const moreInfoButton = page.locator(
      "button.ap-button.text.base.rounded.filled.status-action:has-text('More info')"
    );

    if (await moreInfoButton.isVisible()) {
      daysDiff = await handleMoreInfo(page, awb);
    }
    if (daysDiff > 4) {
      await handleNeedHelp(page, awb, daysDiff);
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
    }
  }

  const closeMoreInfoIcon = page.locator(
    "span.ap-icon.modal-header__actions--close"
  );

  if (await closeMoreInfoIcon.isVisible()) {
    await closeMoreInfoIcon.click();
    await page.waitForTimeout(2000);
  }

  return dayDifferenceCalculated;
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
        `(${globalThis.raisedAWBNumbers.length} - AWB numbers for which issues were raised): ${globalThis.raisedAWBNumbers}`
      );
    } else {
      console.log("No issues were raised for any AWB numbers.");
    }
  });
});
