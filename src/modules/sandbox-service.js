/**
 * Sandbox/My Computer Client Service.
 * Interacts with the /api/v1/sandbox/ API routes.
 */

import { apiFetch } from "./apiFetch.js";

/**
 * @typedef {Object} SandboxStatus
 * @property {boolean} has_sandbox
 * @property {string} [id]
 * @property {string} [distribution]
 * @property {string} [distribution_version]
 * @property {number} [generation]
 * @property {string} state - 'none' | 'provisioning' | 'ready' | 'busy' | 'resetting' | 'deleting' | 'failed'
 * @property {number} [storage_used_bytes]
 * @property {number} [storage_limit_bytes]
 * @property {string} [last_error]
 * @property {string} [created_at]
 */

export const SandboxService = {
	/**
	 * Fetch current user's sandbox status.
	 * @returns {Promise<SandboxStatus>}
	 */
	async getStatus() {
		const res = await apiFetch("/sandbox/status");
		if (!res.ok) {
			throw new Error(`Failed to fetch sandbox status: ${res.statusText}`);
		}
		return await res.json();
	},

	/**
	 * Provision a new sandbox instance.
	 * @param {string} distribution
	 * @param {string} [version]
	 * @returns {Promise<SandboxStatus>}
	 */
	async provision(distribution = "debian", version = "12") {
		const res = await apiFetch("/sandbox/provision", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				distribution,
				distribution_version: version,
			}),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.detail || "Provisioning failed");
		}
		return await res.json();
	},

	/**
	 * Reset the sandbox with a new generation.
	 * @param {string} confirmation - Must be 'RESET'
	 */
	async reset(confirmation = "RESET") {
		const res = await apiFetch("/sandbox/reset", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ confirmation }),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.detail || "Reset failed");
		}
		return await res.json();
	},

	/**
	 * Delete the sandbox permanently.
	 * @param {string} confirmation - Must be 'DELETE'
	 */
	async deleteSandbox(confirmation = "DELETE") {
		const res = await apiFetch(
			`/sandbox?confirmation=${encodeURIComponent(confirmation)}`,
			{
				method: "DELETE",
			},
		);
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.detail || "Deletion failed");
		}
		return await res.json();
	},
};
