import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

const scrollChatTop = (page) =>
	page.locator("#chatContainer").evaluate((el) => {
		el.scrollTop = 0;
		el.dispatchEvent(new Event("scroll"));
	});

const debugState = async () => (await fetch(`${STUB}/v1/_debug`)).json();

test.beforeEach(async ({ page }) => {
	await page
		.context()
		.addCookies([
			{ name: "session", value: "test-session", url: "http://localhost:5173" },
		]);
	await fetch(`${STUB}/v1/_reset`, { method: "POST" });
});

test("loads older messages on scroll with an advancing cursor", async ({
	page,
}) => {
	await page.goto("/chat.html", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Hi! I'm Session One.")).toBeVisible();

	// Round 1: scroll to top -> first older batch, cursor = oldest message
	await scrollChatTop(page);
	await expect(page.getByText("Older message A")).toBeVisible();
	await expect(page.getByText("Older message B")).toBeVisible();
	let debug = await debugState();
	expect(debug.beforeRequests).toHaveLength(1);
	expect(debug.beforeRequests[0].session_id).toBe("s1");

	// Round 2: scroll again -> second batch, cursor advances to the new oldest
	await scrollChatTop(page);
	await expect(page.getByText("Even older message C")).toBeVisible();
	debug = await debugState();
	expect(debug.beforeRequests).toHaveLength(2);
	expect(debug.beforeRequests[1].before_ts).not.toBe(
		debug.beforeRequests[0].before_ts,
	);

	// Round 3: has_more:false -> no further requests
	await scrollChatTop(page);
	await page.waitForTimeout(800);
	debug = await debugState();
	expect(debug.beforeRequests).toHaveLength(2);
});
