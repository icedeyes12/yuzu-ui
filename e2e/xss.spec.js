import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

const XSS_PAYLOAD_TEXT = /Injected/;

test.beforeEach(async ({ page }) => {
	await page
		.context()
		.addCookies([
			{ name: "session", value: "test-session", url: "http://localhost:5173" },
		]);
	await fetch(`${STUB}/v1/_reset`, { method: "POST" });
});

test("renders stored-XSS payloads inertly (no script, handler, or javascript: URL)", async ({
	page,
}) => {
	await page.goto("/chat.html?session=s-xss", {
		waitUntil: "domcontentloaded",
	});

	// The malicious message renders as visible text...
	await expect(page.getByText(XSS_PAYLOAD_TEXT)).toBeVisible();
	// ...but nothing from the payload executed or survived as markup.
	expect(await page.evaluate(() => window.__xssPwned)).toBeUndefined();
	// The app's own <script> tags are fine; nothing may carry the payload.
	await expect(page.locator('script:has-text("__xssPwned")')).toHaveCount(0);
	await expect(
		page.locator("[onerror], [onclick], [onload], [onmouseover]"),
	).toHaveCount(0);
	await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
	// The img survives sanitization as an inert element (src kept, handler dropped).
	await expect(page.locator('img[src="x"]')).toHaveCount(1);

	// The benign parts of the message are still shown as plain text.
	await expect(page.getByText("click")).toBeVisible();
});
