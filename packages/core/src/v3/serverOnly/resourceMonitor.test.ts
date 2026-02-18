import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ResourceMonitor } from "./resourceMonitor.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
    exec: vi.fn(),
}));

// Mock node:v8
vi.mock("node:v8", () => ({
    getHeapStatistics: vi.fn(() => ({
        total_heap_size: 50 * 1024 * 1024,
        total_heap_size_executable: 0,
        total_physical_size: 50 * 1024 * 1024,
        total_available_size: 100 * 1024 * 1024,
        used_heap_size: 25 * 1024 * 1024,
        heap_size_limit: 200 * 1024 * 1024,
        malloced_memory: 0,
        peak_malloced_memory: 0,
        does_zap_garbage: 0,
        number_of_native_contexts: 1,
        number_of_detached_contexts: 0,
        total_global_handles_size: 0,
        used_global_handles_size: 0,
        external_memory: 0,
    })),
}));

import os from "node:os";
import { exec } from "node:child_process";

const mockedExec = vi.mocked(exec);

describe("ResourceMonitor", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mocks for os module
        vi.spyOn(os, "totalmem").mockReturnValue(4 * 1024 * 1024 * 1024); // 4 GB
        vi.spyOn(os, "freemem").mockReturnValue(2 * 1024 * 1024 * 1024); // 2 GB free
        vi.spyOn(os, "cpus").mockReturnValue([
            { model: "test", speed: 2400, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
            { model: "test", speed: 2400, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
        ]);

        // Mock process.memoryUsage
        vi.spyOn(process, "memoryUsage").mockReturnValue({
            rss: 100 * 1024 * 1024, // 100 MB RSS
            heapTotal: 50 * 1024 * 1024,
            heapUsed: 25 * 1024 * 1024,
            external: 0,
            arrayBuffers: 0,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("should return properly formatted system memory metrics", async () => {
        // Mock disk metrics (du command fails on non-Linux, so simulate failure)
        mockedExec.mockImplementation(((
            cmd: string,
            callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
            if (callback) {
                callback(new Error("Command not available"), { stdout: "", stderr: "" });
            }
            return {} as any;
        }) as any);

        const monitor = new ResourceMonitor({
            dirName: "/tmp",
            ctx: {},
            verbose: false,
        });

        const payload = await monitor.getResourceSnapshotPayload();

        // System memory should reflect our mocked values
        // 4GB total, 2GB free = 50% used
        expect(parseFloat(payload.system.memory.percentUsed)).toBeCloseTo(50.0, 0);
        expect(parseFloat(payload.system.memory.freeGB)).toBeCloseTo(2.0, 0);
    });

    test("should calculate node process memory percentage correctly", async () => {
        mockedExec.mockImplementation(((
            cmd: string,
            callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
            if (callback) {
                callback(new Error("Command not available"), { stdout: "", stderr: "" });
            }
            return {} as any;
        }) as any);

        const monitor = new ResourceMonitor({
            dirName: "/tmp",
            ctx: {},
            verbose: false,
        });

        const payload = await monitor.getResourceSnapshotPayload();

        // 100 MB RSS out of 4 GB total = ~2.44%
        const nodeMemPercent = parseFloat(payload.process.node.memoryUsagePercent);
        expect(nodeMemPercent).toBeCloseTo(2.4, 0);

        // RSS should be ~100 MB
        const nodeMemMB = parseFloat(payload.process.node.memoryUsageMB);
        expect(nodeMemMB).toBeCloseTo(100.0, 0);
    });

    test("should calculate heap usage percentage correctly", async () => {
        mockedExec.mockImplementation(((
            cmd: string,
            callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
            if (callback) {
                callback(new Error("Command not available"), { stdout: "", stderr: "" });
            }
            return {} as any;
        }) as any);

        const monitor = new ResourceMonitor({
            dirName: "/tmp",
            ctx: {},
            verbose: false,
        });

        const payload = await monitor.getResourceSnapshotPayload();

        // 25 MB used / 200 MB limit = 12.5%
        const heapPercent = parseFloat(payload.process.node.heapUsagePercent);
        expect(heapPercent).toBeCloseTo(12.5, 0);
        expect(payload.process.node.isNearHeapLimit).toBe(false);
    });

    test("should detect near heap limit condition", async () => {
        // Override getHeapStatistics to return near-limit values
        const { getHeapStatistics } = await import("node:v8");
        vi.mocked(getHeapStatistics).mockReturnValue({
            total_heap_size: 180 * 1024 * 1024,
            total_heap_size_executable: 0,
            total_physical_size: 180 * 1024 * 1024,
            total_available_size: 20 * 1024 * 1024,
            used_heap_size: 170 * 1024 * 1024, // 85% of 200MB limit
            heap_size_limit: 200 * 1024 * 1024,
            malloced_memory: 0,
            peak_malloced_memory: 0,
            does_zap_garbage: 0,
            number_of_native_contexts: 1,
            number_of_detached_contexts: 0,
            total_global_handles_size: 0,
            used_global_handles_size: 0,
            external_memory: 0,
        });

        mockedExec.mockImplementation(((
            cmd: string,
            callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
            if (callback) {
                callback(new Error("Command not available"), { stdout: "", stderr: "" });
            }
            return {} as any;
        }) as any);

        const monitor = new ResourceMonitor({
            dirName: "/tmp",
            ctx: {},
            verbose: false,
        });

        const payload = await monitor.getResourceSnapshotPayload();

        // 170/200 = 85% > 80% threshold
        expect(payload.process.node.isNearHeapLimit).toBe(true);
    });

    test("should include constraint information", async () => {
        mockedExec.mockImplementation(((
            cmd: string,
            callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
            if (callback) {
                callback(new Error("Command not available"), { stdout: "", stderr: "" });
            }
            return {} as any;
        }) as any);

        const monitor = new ResourceMonitor({
            dirName: "/tmp",
            ctx: {},
            verbose: false,
        });

        const payload = await monitor.getResourceSnapshotPayload();

        expect(payload.constraints).toBeDefined();
        expect(payload.constraints.cpu).toBe(2); // 2 CPUs mocked
        expect(payload.constraints.memoryGB).toBe(4); // 4 GB mocked
        expect(payload.timestamp).toBeDefined();
    });
});
