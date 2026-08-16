import { mountSidebar } from "./components/sidebar.js";
import { bootstrapAuth } from "./modules/authBootstrap.js";
import { applySavedTheme } from "./modules/theme.js";

/**
 * Initializes the shared page shell, applies the saved theme, and bootstraps authentication.
 * @param {{ page?: string }} [options] - Optional page identifier applied to the document body.
 * @returns {Promise<object|null>} The authenticated user payload, or `null` if authentication fails.
 */
export async function bootApp({ page } = {}) {
	if (page) document.body.dataset.page = page;

	applySavedTheme();

	try {
		const me = await bootstrapAuth({ redirectOnUnauthorized: true });
		if (!me) return null;

		// Authenticated: reveal layout and mount sidebar
		document.body.removeAttribute("data-auth-state");
		mountSidebar();
		applySavedTheme();
		return me;
	} catch (error) {
		console.error("[boot] Auth bootstrap failed:", error);
		document.body.setAttribute("data-auth-state", "error");
		const layout = document.querySelector(".page-layout");
		if (layout) {
			layout.innerHTML = `
				<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;text-align:center;padding:2rem;">
					<h2 style="color:var(--text-primary,#fff);margin-bottom:1rem;">Backend Service Unavailable</h2>
					<p style="color:var(--text-secondary,#aaa);max-width:400px;margin-bottom:1.5rem;">Could not connect to the Yuzu API server. Please check your network or try again later.</p>
					<button onclick="window.location.reload()" style="background:var(--primary,#ff69b4);color:#fff;border:none;padding:0.6rem 1.5rem;border-radius:20px;cursor:pointer;font-weight:600;">Retry</button>
				</div>
			`;
			document.body.removeAttribute("data-auth-state");
		}
		return null;
	}
}
