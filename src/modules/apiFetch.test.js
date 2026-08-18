import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, redirectToLogin } from "./apiFetch.js";
import { encodeByokConfig } from "./clientStorage.js";

vi.mock("./clientStorage.js", () => ({
	encodeByokConfig: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function stubFetch(status, body = "") {
	const response = new Response(body, { status });
	const fetchMock = vi.fn(() => Promise.resolve(response));
	vi.stubGlobal("fetch", fetchMock);
	return { fetchMock, response };
}

function spyAssign() {
	return vi.spyOn(window.location, "assign").mockImplementation(() => {});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// ── 401/403 redirect path ────────────────────────────────────────────────

describe("apiFetch 401/403 redirect", () => {
	it("redirects to login on a 401 for a same-origin /v1/ endpoint", async () => {
		stubFetch(401);
		const assign = spyAssign();

		const response = await apiFetch("/v1/config");

		expect(response.status).toBe(401);
		expect(assign).toHaveBeenCalledWith("/login.html");
	});

	it("redirects to login on a 403 as well", async () => {
		stubFetch(403);
		const assign = spyAssign();

		await apiFetch("/v1/config");

		expect(assign).toHaveBeenCalledWith("/login.html");
	});

	it("does not redirect for a 401 on a same-origin non-/v1/ path", async () => {
		stubFetch(401);
		const assign = spyAssign();

		await apiFetch("/static/app.js");

		expect(assign).not.toHaveBeenCalled();
	});

	it("does not redirect for a cross-origin 401 even under /v1/", async () => {
		stubFetch(401);
		const assign = spyAssign();

		await apiFetch("https://other.example.com/v1/config");

		expect(assign).not.toHaveBeenCalled();
	});

	it("does not redirect for non-auth statuses", async () => {
		stubFetch(500);
		const assign = spyAssign();

		await apiFetch("/v1/config");

		expect(assign).not.toHaveBeenCalled();
	});
});

// ── redirectToLogin guard ────────────────────────────────────────────────

describe("redirectToLogin", () => {
	it("is a no-op when already on the login page", () => {
		vi.spyOn(window.location, "pathname", "get").mockReturnValue("/login.html");
		const assign = spyAssign();

		redirectToLogin();

		expect(assign).not.toHaveBeenCalled();
	});
});

// ── BYOK header injection ───────────────────────────────────────────────

describe("apiFetch BYOK header injection", () => {
	beforeEach(() => {
		encodeByokConfig.mockReset();
	});

	it("injects X-BYOK-Config on same-origin LLM endpoints", async () => {
		encodeByokConfig.mockReturnValue("ZW5jb2RlZA==");
		const { fetchMock } = stubFetch(200);

		await apiFetch("/v1/send_message");
		await apiFetch("/v1/send_message_stream");
		await apiFetch("/v1/generate_image");

		fetchMock.mock.calls.forEach(([, init]) => {
			expect(init.headers.get("X-BYOK-Config")).toBe("ZW5jb2RlZA==");
		});
	});

	it("does not inject the header for same-origin non-LLM endpoints", async () => {
		encodeByokConfig.mockReturnValue("ZW5jb2RlZA==");
		const { fetchMock } = stubFetch(200);

		await apiFetch("/v1/config");

		expect(fetchMock.mock.calls[0][1].headers.get("X-BYOK-Config")).toBeNull();
	});

	it("does not inject the header for cross-origin LLM endpoints", async () => {
		encodeByokConfig.mockReturnValue("ZW5jb2RlZA==");
		const { fetchMock } = stubFetch(200);

		await apiFetch("https://other.example.com/v1/send_message");

		expect(fetchMock.mock.calls[0][1].headers.get("X-BYOK-Config")).toBeNull();
	});

	it("omits the header when no BYOK config is encoded", async () => {
		encodeByokConfig.mockReturnValue("");
		const { fetchMock } = stubFetch(200);

		await apiFetch("/v1/send_message");

		expect(fetchMock.mock.calls[0][1].headers.get("X-BYOK-Config")).toBeNull();
	});

	it("preserves caller-supplied headers alongside BYOK", async () => {
		encodeByokConfig.mockReturnValue("ZW5jb2RlZA==");
		const { fetchMock } = stubFetch(200);

		await apiFetch("/v1/send_message", {
			headers: { "X-Custom": "yes" },
		});

		const headers = fetchMock.mock.calls[0][1].headers;
		expect(headers.get("X-Custom")).toBe("yes");
		expect(headers.get("X-BYOK-Config")).toBe("ZW5jb2RlZA==");
	});
});

// ── Request shape ────────────────────────────────────────────────────────

describe("apiFetch request", () => {
	it("returns the response and sends credentials for successful requests", async () => {
		const { fetchMock, response } = stubFetch(200);
		const assign = spyAssign();

		await expect(apiFetch("/v1/config")).resolves.toBe(response);

		expect(fetchMock).toHaveBeenCalledWith(
			"/v1/config",
			expect.objectContaining({ credentials: "include" }),
		);
		expect(assign).not.toHaveBeenCalled();
	});
});
