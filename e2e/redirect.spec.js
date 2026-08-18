import { expect, test } from "@playwright/test";

// Without the session cookie the stub returns 401 for every /v1 request,
// which must land the user on the login page.
const AUTH_GATED_PAGES = ["/chat.html", "/config.html", "/about.html"];

for (const path of AUTH_GATED_PAGES) {
	test(`redirects ${path} to /login.html when unauthenticated`, async ({
		page,
	}) => {
		await page.goto(path, { waitUntil: "domcontentloaded" });
		await page.waitForURL((url) => url.pathname.endsWith("/login.html"), {
			timeout: 10_000,
		});
		expect(page.url()).toMatch(/\/login\.html$/);
	});
}
