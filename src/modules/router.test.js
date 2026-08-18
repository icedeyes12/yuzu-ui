import { afterEach, describe, expect, it, vi } from "vitest";

import { RouterManager } from "./router.js";

function stubLocation({ pathname = "/chat", search = "" } = {}) {
	const pathnameSpy = vi
		.spyOn(window.location, "pathname", "get")
		.mockReturnValue(pathname);
	const searchSpy = vi
		.spyOn(window.location, "search", "get")
		.mockReturnValue(search);
	return { pathnameSpy, searchSpy };
}

afterEach(() => {
	vi.restoreAllMocks();
});

// ── initFromURL ───────────────────────────────────────────────────────────

describe("RouterManager.initFromURL", () => {
	it("extracts the session id from a /chat/<id> path", () => {
		stubLocation({ pathname: "/chat/abc-123" });
		const router = new RouterManager();

		expect(router.initFromURL()).toBe("abc-123");
		expect(router.currentSessionId).toBe("abc-123");
		expect(router.isInitialized).toBe(true);
	});

	it("extracts the session id from the ?session= query parameter", () => {
		stubLocation({ pathname: "/chat", search: "?session=def-456" });
		const router = new RouterManager();

		expect(router.initFromURL()).toBe("def-456");
		expect(router.currentSessionId).toBe("def-456");
	});

	it("returns null when no session is present", () => {
		stubLocation({ pathname: "/" });
		const router = new RouterManager();

		expect(router.initFromURL()).toBeNull();
		expect(router.currentSessionId).toBeNull();
	});
});

// ── updateUrl / clearURL ──────────────────────────────────────────────────

describe("RouterManager.updateUrl", () => {
	it("pushes a /chat/<id> history entry and tracks the session", () => {
		stubLocation({ pathname: "/chat" });
		const router = new RouterManager();
		router.initFromURL();
		const pushState = vi.spyOn(window.history, "pushState");

		router.updateUrl("sess-9");

		expect(pushState).toHaveBeenCalledTimes(1);
		const [state, title, url] = pushState.mock.calls[0];
		expect(state).toEqual({ sessionId: "sess-9" });
		expect(title).toBe("");
		expect(String(url)).toContain("/chat/sess-9");
		expect(router.currentSessionId).toBe("sess-9");
	});

	it("is a no-op for the current or an empty session id", () => {
		stubLocation({ pathname: "/chat" });
		const router = new RouterManager();
		router.initFromURL();
		router.updateUrl("sess-9");

		const pushState = vi.spyOn(window.history, "pushState");
		router.updateUrl("sess-9"); // same session
		router.updateUrl(""); // empty

		expect(pushState).not.toHaveBeenCalled();
	});
});
describe("RouterManager.clearURL", () => {
	it("resets the path and clears the tracked session", () => {
		stubLocation({ pathname: "/chat/sess-9" });
		const router = new RouterManager();
		router.initFromURL();
		const pushState = vi.spyOn(window.history, "pushState");

		router.clearURL();

		expect(pushState).toHaveBeenCalledTimes(1);
		expect(pushState.mock.calls[0][0]).toEqual({});
		expect(String(pushState.mock.calls[0][2])).toContain("/chat");
		expect(router.currentSessionId).toBeNull();
	});
});

// ── popstate (back/forward) ───────────────────────────────────────────────

describe("RouterManager popstate handling", () => {
	it("calls the switch handler when the URL session changes on back/forward", () => {
		const { pathnameSpy } = stubLocation({ pathname: "/chat/sess-1" });
		const router = new RouterManager();
		router.currentSessionId = "sess-1";

		// Back/forward lands on a different session.
		pathnameSpy.mockReturnValue("/chat/sess-2");
		const handleSessionSwitch = vi.fn();
		router.setupPopStateHandler(handleSessionSwitch);
		window.dispatchEvent(new Event("popstate"));

		expect(handleSessionSwitch).toHaveBeenCalledWith("sess-2", false);
		expect(router.currentSessionId).toBe("sess-2");
	});

	it("does not call the switch handler when the session is unchanged", () => {
		stubLocation({ pathname: "/chat/sess-1" });
		const router = new RouterManager();
		router.initFromURL();

		const handleSessionSwitch = vi.fn();
		router.setupPopStateHandler(handleSessionSwitch);
		window.dispatchEvent(new Event("popstate"));

		expect(handleSessionSwitch).not.toHaveBeenCalled();
	});

	it("re-registering replaces the previous handler (no duplicate listeners)", () => {
		const { pathnameSpy } = stubLocation({ pathname: "/chat/sess-1" });
		const router = new RouterManager();
		router.initFromURL();
		pathnameSpy.mockReturnValue("/chat/sess-2");

		const first = vi.fn();
		router.setupPopStateHandler(first);
		const second = vi.fn();
		router.setupPopStateHandler(second);

		window.dispatchEvent(new Event("popstate"));

		// Only the latest handler runs; the earlier one was removed.
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith("sess-2", false);
	});
});
