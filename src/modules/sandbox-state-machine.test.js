import { describe, expect, it, vi } from "vitest";
import { SandboxService } from "./sandbox-service.js";

describe("My Computer State Machine & API Integration", () => {
	it("derives NO_SANDBOX state correctly on canonical { has_sandbox: false, state: 'none' }", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ has_sandbox: false, state: "none" }),
		});

		const status = await SandboxService.getStatus();
		expect(status.has_sandbox).toBe(false);
		expect(status.state).toBe("none");
	});

	it("handles transition and ready states deterministically", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				has_sandbox: true,
				state: "ready",
				distribution: "debian",
				generation: 1,
				storage_used_bytes: 1048576,
				storage_limit_bytes: 10737418240,
			}),
		});

		const status = await SandboxService.getStatus();
		expect(status.has_sandbox).toBe(true);
		expect(status.state).toBe("ready");
		expect(status.distribution).toBe("debian");
		expect(status.storage_limit_bytes).toBe(10737418240);
	});

	it("differentiates network/backend failures cleanly", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({ detail: "Database unavailable" }),
		});

		await expect(SandboxService.getStatus()).rejects.toThrow(
			"Database unavailable",
		);
	});
});
