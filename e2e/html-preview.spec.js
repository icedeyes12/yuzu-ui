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

test("renders the html fence preview in the sandbox: content, scripts, auto-height", async ({
	page,
}) => {
	await page.goto("/chat/s-html", {
		waitUntil: "domcontentloaded",
	});

	const iframe = page.locator(".fence-html-iframe");
	await iframe.waitFor({ state: "attached" });
	const frame = iframe.contentFrame();

	// Previewed content renders inside the sandboxed iframe...
	await expect(frame.locator("#preview-heading")).toHaveText(
		"Sandboxed preview works",
	);
	// ...its inline script executed...
	expect(await frame.locator("body").evaluate(() => window.__previewRan)).toBe(
		"inline",
	);
	// ...and inline event handlers are live too.
	await frame.locator("#preview-btn").click();
	expect(await frame.locator("body").evaluate(() => window.__previewRan)).toBe(
		"click",
	);

	// The auto-height helper grew the iframe past its 380px floor.
	await expect
		.poll(async () => (await iframe.boundingBox())?.height, {
			message: "iframe should be auto-grown by the resize helper",
		})
		.toBeGreaterThan(380);
});

test("unclosed html fence with a script still renders (source recovered from the code carrier)", async ({
	page,
}) => {
	await page.goto("/chat/s-unclosed", {
		waitUntil: "domcontentloaded",
	});

	// The pending placeholder flushes into the real preview component.
	await expect(page.locator(".fence-block--pending")).toHaveCount(0);
	const iframe = page.locator(".fence-html-iframe");
	await iframe.waitFor({ state: "attached" });
	const frame = iframe.contentFrame();

	// The full source — including the script — survived the DOMPurify
	// attribute strip and renders inside the sandbox.
	await expect(frame.locator("#unclosed-para")).toHaveText(
		"Unclosed fence content",
	);
	expect(await frame.locator("body").evaluate(() => window.__unclosedRan)).toBe(
		"yes",
	);

	// The Copy button carries the full raw source too.
	const copySource = await page
		.locator(".fence-block--html-preview .fence-html-source-block code")
		.textContent();
	expect(copySource).toContain("<script>window.__unclosedRan");
	expect(copySource).toContain("Unclosed fence content");
});

test("directly visiting preview-shell.html is inert (content arrives only via postMessage)", async ({
	page,
}) => {
	await page.goto(
		`/preview-shell.html?content=${encodeURIComponent(
			"<script>window.__pwned = 1;</script><h1>injected</h1>",
		)}`,
	);

	// No script executed and no content was injected via the URL.
	expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
	expect(await page.locator("h1")).toHaveCount(0);
	expect(await page.locator("body").evaluate((b) => b.childElementCount)).toBe(
		1,
	);
});
