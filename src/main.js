import { mountSidebar } from "./components/sidebar.js";
import { redirectToLogin } from "./modules/apiFetch.js";
import { bootstrapAuth } from "./modules/authBootstrap.js";
import { applySavedTheme } from "./modules/theme.js";

/**
 * Mounts the sidebar after first paint without blocking the initial render.
 *
 * Uses requestIdleCallback (with a hard timeout) so the page shell paints
 * first; falls back to a next-tick setTimeout where rIC is unavailable. If the
 * user reaches for the sidebar (hamburger, drawer, overlay) before the idle
 * callback fires, the mount is flushed immediately so the very first
 * interaction behaves correctly.
 */
function mountSidebarWhenIdle() {
	let mounted = false;
	let idleHandle = null;
	let timeoutHandle = null;

	const mount = () => {
		if (mounted) return;
		mounted = true;
		document.removeEventListener("pointerdown", onSidebarInteraction, true);
		document.removeEventListener("keydown", onSidebarInteraction, true);
		if (
			idleHandle !== null &&
			typeof window.cancelIdleCallback === "function"
		) {
			window.cancelIdleCallback(idleHandle);
		}
		if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
		mountSidebar();
	};

	const onSidebarInteraction = (event) => {
		if (
			event.target?.closest?.("[data-action='toggle-sidebar'], #sidebarRoot")
		) {
			mount();
		}
	};

	document.addEventListener("pointerdown", onSidebarInteraction, {
		capture: true,
	});
	document.addEventListener("keydown", onSidebarInteraction, {
		capture: true,
	});

	if (typeof window.requestIdleCallback === "function") {
		idleHandle = window.requestIdleCallback(mount, { timeout: 300 });
	} else {
		timeoutHandle = window.setTimeout(mount, 0);
	}
}

function setupNetworkMonitor() {
	const updateStatus = () => {
		if (navigator.onLine) {
			document.body.removeAttribute("data-network-offline");
		} else {
			document.body.setAttribute("data-network-offline", "true");
		}
	};
	window.addEventListener("online", updateStatus);
	window.addEventListener("offline", updateStatus);
	updateStatus();
}

/**
 * Initializes the shared page shell, applies the saved theme, and bootstraps authentication.
 * @param {{ page?: string }} [options] - Optional page identifier applied to the document body.
 * @returns {Promise<object|null>} The authenticated user payload, or `null` if authentication fails.
 */
export async function bootApp({ page } = {}) {
	if (page) document.body.dataset.page = page;

	applySavedTheme();
	setupNetworkMonitor();

	try {
		const me = await bootstrapAuth({ redirectOnUnauthorized: true });
		if (!me) {
			return null;
		}

		// Authenticated: reveal layout and mount the sidebar immediately
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
