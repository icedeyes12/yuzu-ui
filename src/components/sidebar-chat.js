/**
 * Chat-page session switching for the sidebar.
 *
 * Lives in its own module so the shared sidebar shell (mounted on every
 * authenticated page) does not drag the whole chat stack — event-router,
 * ConversationStore, history, session-controller, renderer — into pages that
 * only ever navigate to /chat. This module is dynamically imported from
 * `sidebar.js` exclusively when the user is on the chat page, where those
 * modules are loaded anyway.
 */

import { eventRouter } from "../modules/event-router.js";
import { router } from "../modules/router.js";
import { handleSessionSwitch } from "../modules/session-controller.js";

/**
 * Switch the active chat session in place (chat page only).
 * Mirrors the previous sidebar behavior: cancels any active stream in the
 * outgoing session, then loads the incoming session's history.
 * @param {string} sessionId - The target session id.
 * @returns {Promise<boolean>} `true` when the switch succeeded.
 */
export async function switchSessionChat(sessionId) {
	if (router.currentSessionId) {
		eventRouter.cancelStream(router.currentSessionId);
	}
	return handleSessionSwitch(sessionId);
}

/**
 * Activate a freshly created session in place (chat page only).
 * @param {string} sessionId - The new session id.
 * @returns {Promise<boolean>} `true` when the switch succeeded.
 */
export async function createSessionChat(sessionId) {
	return handleSessionSwitch(sessionId);
}
