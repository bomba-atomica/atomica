import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		extensions: [".ts", ".js", ".json"],
	},
	test: {
		globals: true,
		environment: "node",
		testTimeout: 300000,
		hookTimeout: 180000,
		sequence: {
			concurrent: false,
		},
		include: ["test/**/*.test.ts"],
		fileParallelism: false,
		pool: "forks",
		maxWorkers: 1,
		run: true,
		isolate: false,
	},
});
