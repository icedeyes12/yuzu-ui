import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

test.beforeEach(async ({ page }) => {
	await page.context().addCookies([
		{ name: "session", value: "test-session", url: "http://localhost:5173" },
		{
			name: "yuzu_session",
			value: "test-session",
			url: "http://localhost:5173",
		},
		{ name: "session", value: "test-session", url: "http://localhost:5000" },
		{
			name: "yuzu_session",
			value: "test-session",
			url: "http://localhost:5000",
		},
	]);
	await fetch(`${STUB}/v1/_reset`, { method: "POST" });
});

test("keeps the view anchored when older messages prepend", async ({
	page,
}) => {
	// s-long seeds 60 messages so the container is genuinely scrollable.
	await page.goto("/chat.html?session=s-long", {
		waitUntil: "domcontentloaded",
	});
	await expect(page.getByText("Long message 01")).toBeVisible();

	const reference = page.locator('[data-message-id="long-01"]');

	// Scroll to the very top; capture the anchored view BEFORE the load.
	await page.locator("#chatContainer").evaluate((el) => {
		el.scrollTop = 0;
	});
	const before = await reference.evaluate(
		(el) => el.getBoundingClientRect().top,
	);

	// Trigger pagination (scrollTop < 100 fires the scroll listener).
	await page.locator("#chatContainer").evaluate((el) => {
		el.dispatchEvent(new Event("scroll"));
	});

	// Older messages load above the view; the reference message must stay put.
	await expect(page.getByText("Older message A")).toBeVisible();
	const after = await reference.evaluate(
		(el) => el.getBoundingClientRect().top,
	);
	const scrollTop = await page
		.locator("#chatContainer")
		.evaluate((el) => el.scrollTop);

	// The scroll correction compensates for the prepended height: the message
	// that was at the top of the viewport is still at the top of the viewport.
	expect(Math.abs(after - before)).toBeLessThan(3);
	// Content was preserved above: we're no longer at the absolute top.
	expect(scrollTop).toBeGreaterThan(0);
});
