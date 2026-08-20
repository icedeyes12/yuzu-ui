// Clean route URLs served by the backend in SPA mode (/chat/{id}, /config,
// /about, ...). The Vite dev server maps these to the MPA entries via the
// fallback middleware in vite.config.js; the backend serves the built dist at
// the same paths, so one URL scheme works in dev, local single-origin, and the
/**
 * Builds the chat page URL, optionally targeting a session.
 * @param {string} [sessionId] - The session identifier to include in the URL.
 * @return {string} The chat page URL.
 */
export function chatUrl(sessionId) {
	return sessionId ? `/chat/${encodeURIComponent(sessionId)}` : "/chat";
}

/**
 * Creates the URL for the home page.
 * @returns {string} The home page URL.
 */
export function homeUrl() {
	return "/index.html";
}

export function configUrl() {
	return "/config.html";
}

export function aboutUrl() {
	return "/about.html";
}

export function loginUrl() {
	return "/login.html";
}
