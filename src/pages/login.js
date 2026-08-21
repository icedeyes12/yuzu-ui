import { apiFetch, apiUrl } from "../modules/apiFetch.js";
import { homeUrl } from "../modules/links.js";

async function init() {
	// Point the provider buttons at the OAuth login route (works cross-origin
	// when VITE_API_BASE is set).
	for (const link of document.querySelectorAll("[data-auth-provider]")) {
		const provider = link.dataset.authProvider;
		if (provider) {
			const currentOrigin = window.location.origin;
			link.href = apiUrl(
				`/v1/auth/login?provider=${provider}&origin=${encodeURIComponent(currentOrigin + "/chat.html")}`,
			);
		}
	}

	// Already signed in? Skip the login page.
	try {
		const response = await apiFetch("/v1/auth/me", {
			headers: { Accept: "application/json" },
		});
		if (response.ok) {
			const me = await response.json();
			if (me?.user_id) {
				window.location.assign(homeUrl());
			}
		}
	} catch {
		// Not signed in; stay on login page.
	}
}

init();
