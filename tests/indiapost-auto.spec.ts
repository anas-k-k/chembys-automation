import { test, expect } from "@playwright/test";

const INDEFINITE_TIMEOUT = 0; // No timeout
/**
 * Main test suite for Chembys Auto.
 */
test.describe("India Post Auto", () => {
  test("should load the India Post page", async ({ page }) => {
    test.setTimeout(INDEFINITE_TIMEOUT);
    await page.goto(
      "https://indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx"
    );

    // Fill in consignment number, etc.
    await page.fill('input[aria-label="Consignment Number"]', "EL643998761IN");

    // --- CAPTCHA solving with 2Captcha ---
    // 1. Locate the CAPTCHA image element (updated selector)
    const captchaImg = await page.locator(
      "#ctl00_PlaceHolderMain_ucNewLegacyControl_ucCaptcha1_imgMathCaptcha"
    );
    const captchaBuffer = await captchaImg.screenshot();

    // 2. Send the image to 2Captcha
    const apiKey = "d25a5c0450c4149341ffaef72d862b43";
    const formData = new FormData();
    formData.append("method", "base64");
    formData.append("key", apiKey);
    formData.append("body", captchaBuffer.toString("base64"));
    formData.append("json", "1");

    const captchaRes = await fetch("http://2captcha.com/in.php", {
      method: "POST",
      body: formData,
    });
    const captchaJson = await captchaRes.json();
    if (captchaJson.status !== 1)
      throw new Error("2Captcha failed: " + captchaJson.request);
    const captchaId = captchaJson.request;

    // 3. Poll for the result
    let solved = "";
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 5000)); // wait 5s
      const res = await fetch(
        `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`
      );
      const json = await res.json();
      if (json.status === 1) {
        solved = json.request;
        break;
      }
      if (json.request !== "CAPCHA_NOT_READY")
        throw new Error("2Captcha error: " + json.request);
    }
    if (!solved) throw new Error("CAPTCHA not solved in time");

    // 4. Fill the solved CAPTCHA
    await page.fill('input[aria-label="Enter the Third number"]', solved);
    // --- End CAPTCHA solving ---

    // Wait for the Event Details section to appear
    await page.waitForSelector(
      "span#ctl00_PlaceHolderMain_ucNewLegacyControl_lblMailArticleDtlsOER"
    );

    // ...rest of your automation
  });
});
