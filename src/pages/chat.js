// Ported from static/js/chat.js: chat entry point that initializes the
// ConversationStore -> DOMRenderer pipeline, the URL router, the multimodal
// manager, and session handling. API calls route through apiFetch (session
// cookie, BYOK header injection, 401 auth gate).

import { bootApp } from "../main.js";
import { apiFetch } from "../modules/apiFetch.js";
import {
	chatStore,
	createScrollButton,
	initializeInputBehavior,
	initializeMessageActions,
	MultimodalManager,
} from "../modules/index.js";
import "../modules/vendor.js";
import { router } from "../modules/router.js";
import {
	focusChatInput,
	handleSessionSwitch,
	initializeChatSession,
} from "../modules/session-controller.js";

/**
 * Fetches the profile once: session name, partner name, active session id.
 * @returns {Promise<object|null>} Profile payload, or null on failure.
 */
async function fetchProfile() {
	try {
		const response = await apiFetch("/v1/profile", {
			headers: { Accept: "application/json" },
		});
		if (!response.ok)
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		return await response.json();
	} catch (error) {
		chatStore.setError(error.message || "Failed to load profile.");
		return null;
	}
}

/**
 * Reflects the profile's session and partner names in the chat header.
 * @param {object|null} data - Profile payload.
 */
function applyProfileToHeader(data) {
	if (!data) return;
	const sessionNameElement = document.getElementById("sessionName");
	if (sessionNameElement && data.active_session) {
		sessionNameElement.textContent = data.active_session.name || "Current Chat";
	}

	// Reflect partner/user name in header if present
	const partnerEl = document.getElementById("partnerName");
	if (partnerEl && data.partner_name) {
		partnerEl.textContent = data.partner_name;
	}
}

/**
 * Initialize the chat interface and active conversation.
 */
async function initializeChat() {
	if (document.body.dataset.yuzuChatInitialized === "true") return;
	document.body.dataset.yuzuChatInitialized = "true";

	try {
		// Initialize scroll button
		createScrollButton();

		// Initialize input behavior
		initializeInputBehavior();
		initializeMessageActions();

		// Initialize URL router. Back/forward navigation switches sessions
		// client-side (the no-op handler initFromURL registered is replaced).
		const urlSessionId = router.initFromURL();
		router.setupPopStateHandler(handleSessionSwitch);

		// Single profile fetch: header names + active session id
		const profileData = await fetchProfile();
		applyProfileToHeader(profileData);

		// Stream state is now fully managed by ConversationStore + EventRouter

		const sessionId = urlSessionId || profileData?.active_session?.id;
		if (sessionId) {
			await initializeChatSession(sessionId);
		} else if (profileData) {
			chatStore.setError("No active conversation is available.");
		}

		// Initialize multimodal from the same canonical model metadata as config.
		const configResponse = await apiFetch("/v1/config", {
			headers: { Accept: "application/json" },
		});
		const config = configResponse.ok ? await configResponse.json() : {};
		const provider =
			config.current_provider || config.ai_providers?.current_provider;
		const model = config.current_model || config.ai_providers?.current_model;
		const modelInfo = (config.model_infos?.[provider] || []).find(
			(info) => info.id === model,
		);
		const multimodal = new MultimodalManager(modelInfo);
		multimodal.init();

		// Auto-focus input on initial load
		focusChatInput();
	} catch (error) {
		chatStore.setError(error.message || "Chat initialization failed.");
	}
}

/**
 * Boots the chat page and initializes it for authenticated users.
 */
async function init() {
	const me = await bootApp({ page: "chat" });
	if (!me) return; // User unauthenticated, bootApp already triggers redirect to /login
	await initializeChat();
}

init();
