import { test } from "@playwright/test";

test.describe("Chembys Auto", () => {
  test("should load the Chembys Auto page", async ({ page }) => {
    page.on("requestfailed", (request) => {
      console.log(
        `Request failed: ${request.url()} - ${request.failure()?.errorText}`
      );
    });
    await page.goto("https://anas-k-k.github.io/mishal-nihal/index.html");
    await page.waitForSelector(
      "h1:has-text('Hi, Thanks for visiting our site.')"
    );
    const title = await page.title();
    console.log("Page title:", title);

    await page.waitForTimeout(3000); // Delay before clicking "Fun Events"
    await page.getByText("Fun Events").click();

    await page.waitForSelector("h2:has-text('Moments Captured:')");
    const funEventsTitle = await page.title();
    console.log("Fun Events page title:", funEventsTitle);
    await page.waitForTimeout(3000); // Delay before waiting for "Moments Captured"

    await page.getByRole("link", { name: "Videos" }).click();

    // Add more assertions or interactions as needed
  });
});
