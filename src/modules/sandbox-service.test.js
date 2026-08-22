import { describe, expect, it, vi } from "vitest";
import { SandboxService } from "./sandbox-service.js";

describe("SandboxService API Client", () => {
	it("fetches sandbox status correctly", async () => {
		const mockStatus = {
			has_sandbox: true,
			state: "ready",
			distribution: "debian",
			generation: 1,
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockStatus,
		});

		const status = await SandboxService.getStatus();
		expect(status.has_sandbox).toBe(true);
		expect(status.state).toBe("ready");
		expect(status.distribution).toBe("debian");
	});

	it("provisions sandbox with parameters", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ has_sandbox: true, state: "provisioning" }),
		});

		const res = await SandboxService.provision("ubuntu", "24.04");
		expect(res.state).toBe("provisioning");
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/sandbox/provision"),
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					distribution: "ubuntu",
					distribution_version: "24.04",
				}),
			}),
		);
	});

	it("throws formatted error on failure", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({ detail: "Quota exceeded" }),
		});

		await expect(SandboxService.provision("debian")).rejects.toThrow(
			"Quota exceeded",
		);
	});
});
