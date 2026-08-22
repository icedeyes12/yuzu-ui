// FILE: static/js/modules/router.js
// DESCRIPTION: URL-based session routing for shareable URLs

/**
 * Handles URL-based session routing for shareable URLs.
 * Uses /chat/<public_id> as the canonical session URL.
 */
export class RouterManager {
	constructor() {
		this.currentSessionId = null;
		this.isInitialized = false;
	}

	/**
	 * Initialize router from current URL on page load.
	 * @returns {string|null} Session ID from URL or null
	 */
	initFromURL() {
		const pathParts = window.location.pathname.split("/").filter((p) => p);
		if (pathParts.length >= 2 && pathParts[0] === "chat") {
			this.currentSessionId = pathParts[1];
		}

		this.isInitialized = true;
		this.setupPopStateHandler();
		return this.currentSessionId;
	}

	/**
	 * Update URL to reflect current session without page reload.
	 * In SPA clean routing mode, standardizes on /chat/<session_id>.
	 * @param {string} sessionId - Public session ID (ses_...) to set in URL
	 */
	updateUrl(sessionId) {
		if (!sessionId || sessionId === this.currentSessionId) return;
		this.currentSessionId = sessionId;
		const url = new URL(window.location.href);
		url.pathname = `/chat/${encodeURIComponent(sessionId)}`;
		url.searchParams.delete("session");
		window.history.pushState({ sessionId }, "", url);
	}

	/**
	 * Clear session parameter from URL.
	 */
	clearURL() {
		const url = new URL(window.location.href);
		if (url.pathname.startsWith("/chat/")) {
			url.pathname = "/chat";
		}
		url.searchParams.delete("session");
		window.history.pushState({}, "", url);
		this.currentSessionId = null;
	}

	/**
	 * Setup browser back/forward navigation handler. Replaces any previously
	 * registered handler: initFromURL registers a no-op, and callers wire the
	 * real callback afterwards — without replacement the two listeners would
	 * race (the no-op would consume the session change first).
	 */
	setupPopStateHandler(handleSessionSwitch) {
		if (this._popStateHandler) {
			window.removeEventListener("popstate", this._popStateHandler);
		}
		const listener = (_event) => {
			// Extract from path first
			const pathParts = window.location.pathname.split("/").filter((p) => p);
			let sessionId = null;

			if (pathParts.length >= 2 && pathParts[0] === "chat") {
				sessionId = pathParts[1];
			}

			if (sessionId !== this.currentSessionId) {
				this.currentSessionId = sessionId;
				if (typeof handleSessionSwitch === "function") {
					void handleSessionSwitch(sessionId, false);
				}
			}
		};
		this._popStateHandler = listener;
		window.addEventListener("popstate", listener);
	}
}

// Create singleton instance
export const router = new RouterManager();
