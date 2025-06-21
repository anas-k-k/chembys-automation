import { test } from "@playwright/test";

// Disable the timeout for the test
const indefiniteTimeout = 0; // No timeout

test.describe("Chembys Auto", () => {
  test("should load the Chembys Auto page", async ({ page, browser }) => {
    test.setTimeout(indefiniteTimeout); // Set indefinite timeout for the test

    page.on("requestfailed", (request) => {
      console.log(
        `Request failed: ${request.url()} - ${request.failure()?.errorText}`
      );
    });
    await page.goto("https://chembys.com/login/admin");
    await page.waitForSelector("h1:text-is('Sign in')");
    await page
      .getByPlaceholder("email@address.com")
      .fill("superadmin@chembys.com");

    await page.locator("#signingAdminPassword").fill("chembys@1234");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Select and click the Orders link
    await page
      .locator("a.nav-link[href='https://chembys.com/admin/orders/list/all']")
      .click();

    // Select "Time Breached" option from the dropdown
    await page.selectOption("select.status.form-control", "Time_Breached");

    // Click the "Show data" button
    await page.locator("button#formUrlChange.btn.btn--primary.px-5").click();

    // Wait for all elements to load
    await page.waitForTimeout(5000);

    // Extract AWBNO numbers for sibling condition with partial text match
    const awbNumbers = await page.$$eval(
      "td.text-center.text-capitalize span:has-text('delhivery') + br + span a", // Targeting <a> sibling of <span> containing 'delhivery'
      (elements) =>
        elements.map(
          (el) => el.textContent?.replace("AWBNO - ", "").trim() || ""
        )
    );
    console.log("Filtered AWBNO Numbers:", awbNumbers);
    console.log("Filtered AWBNO Count:", awbNumbers.length);

    // Navigate to the logged-in page and search for each AWB number
    const context = await browser.newContext();
    const loggedInPage = await context.newPage();
    await loggedInPage.goto(
      "https://one.delhivery.com/login?redirectFrom=/home"
    );
    await loggedInPage
      .getByPlaceholder("Enter your email ID")
      .fill("shanjalal@gmail.com");
    await loggedInPage.getByRole("button", { name: "Proceed" }).click();
    await loggedInPage.locator("#password").fill("Shayaan@1983");
    await loggedInPage.getByRole("button", { name: "Login" }).click();

    let successCount = 0; // Track successful additions

    for (let i = 0; i < awbNumbers.length; i++) {
      if (successCount >= 3) break; // Stop loop after 3 successful additions

      const awb = awbNumbers[i];
      try {
        await loggedInPage.getByPlaceholder("Search multiple AWBs").fill(awb);
        await loggedInPage.waitForTimeout(2000); // Increased timeout for processing

        const resultDiv = loggedInPage.locator(
          `.ucp__global-search__result >> text=AWB ${awb}`
        );

        if (await resultDiv.isVisible()) {
          console.log(`AWB ${awb} found in results.`);
          await resultDiv.click();
          await loggedInPage.waitForTimeout(2000);

          const supportTicketsSpan = loggedInPage.locator(
            "span.badge.blue.small.pill.outlined:has(span:has-text('0 Support Tickets'))"
          );

          if (await supportTicketsSpan.isVisible()) {
            console.log(`Support Tickets span found for AWB ${awb}.`);
            const needHelpButton = loggedInPage.locator(
              "button.ap-button.white.base.rounded.filled:has-text('Need Help')"
            );

            if (await needHelpButton.isVisible()) {
              console.log(`Need Help button found for AWB ${awb}. Clicking.`);
              await needHelpButton.click();
              await loggedInPage.waitForTimeout(2000); // Ensure action completes before proceeding

              const behaviourIssueSpan = loggedInPage.locator(
                "span.badge.custom.small.pill.outlined.badge:has(span:has-text('Behaviour complaint against staff'))"
              );

              if (await behaviourIssueSpan.isVisible()) {
                console.log(
                  `Behaviour issue span found for AWB ${awb}. Clicking.`
                );
                await behaviourIssueSpan.click();
                await loggedInPage.waitForTimeout(2000);
                await loggedInPage
                  .getByPlaceholder("Please describe your issue here")
                  .fill("Not delivered on time");
                await loggedInPage
                  .getByRole("button", {
                    name: "Raise this Issue",
                  })
                  .click();
                await loggedInPage.waitForTimeout(2000);
                console.log(
                  `Behaviour issue added for AWB ${awb}. closure modal.`
                );
                await loggedInPage
                  .locator(
                    ".modal-header__actions .modal-header__actions--close"
                  )
                  .click();

                successCount++; // Increment success count
              } else {
                console.log(
                  `Behaviour issue span not found for AWB ${awb}. Skipping.`
                );
              }
            } else {
              console.log(
                `Need Help button not found for AWB ${awb}. Skipping.`
              );
            }
          } else {
            console.log(
              `Support Tickets span not found for AWB ${awb}. Skipping.`
            );
          }
        } else {
          console.log(`AWB ${awb} not found in results. Skipping.`);
        }

        console.log(`Processed ${i + 1} out of ${awbNumbers.length}`); // Progress message
      } catch (error) {
        console.error(`Error searching for AWB: ${awb}.`);
      }
    }

    // Add more assertions or interactions as needed
  });
});
