import { defineConfig } from "@playwright/test";

// E2E suite. The stub backend (e2e/stub-backend.mjs) simulates the /v1 API;
// the vite dev server proxies /v1 to it on :5000. Tests share one stub
// process with in-memory state, so they run serially and reset it via
// POST /v1/_reset in their beforeEach hooks.
export default defineConfig({
	testDir: "./e2e",
	reporter: [["list"], ["html", { open: "never" }]],
	fullyParallel: false,
	workers: 1,
	timeout: 30_000,
	use: {
		baseURL: "http://localhost:5173",
		headless: true,
	},
	webServer: [
		{
			command: "node e2e/stub-backend.mjs",
			port: 5000,
			reuseExistingServer: !process.env.CI,
		},
		{
			command: "bun run dev",
			port: 5173,
			reuseExistingServer: !process.env.CI,
		},
	],
});
