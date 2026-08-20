import { bootApp } from "../main.js";
import { apiFetch } from "../modules/apiFetch.js";

/**
 * Renders the user's name and partner name in the home page greeting elements.
 */
async function _renderGreeting() {
	const response = await apiFetch("/v1/profile", {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) return;
	const profile = await response.json();

	const greeting = document.getElementById("homeGreeting");
	if (greeting && profile.user_name) {
		greeting.textContent = `Welcome back, ${profile.user_name}`;
	}

	const intro = document.getElementById("homeIntroCopy");
	if (intro && profile.partner_name) {
		intro.textContent = `Continue with ${profile.partner_name} whenever you are ready. No setup required.`;
	}

	const primaryAction = document.querySelector(".home-primary-action");
	if (primaryAction && profile.active_session?.id) {
		const sessionId = profile.active_session.id;
		primaryAction.href = `/chat/${encodeURIComponent(sessionId)}`;
	}
}

/**
 * Initializes the home page for the current user.
 *
 * Exits when no user is available; otherwise loads the user's profile.
 */
async function init() {
	const me = await bootApp({ page: "home" });
	if (!me) return;
	await _renderGreeting();
}

init();
