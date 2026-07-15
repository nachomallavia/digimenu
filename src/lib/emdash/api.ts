/**
 * Shared HTTP helpers for EmDash REST writes (PAT / server-only).
 *
 * Prefer Cloudflare runtime secrets (`cloudflare:workers` / `process.env`) over
 * `import.meta.env` so production deploys do not bake `localhost` from `.env`.
 */

import { env } from "cloudflare:workers";

export type EmDashApiConfig = {
	base: string;
	token: string;
};

function readServerEnv(key: string): string | undefined {
	try {
		const fromCf = (env as Record<string, unknown>)[key];
		if (typeof fromCf === "string" && fromCf.length > 0) return fromCf;
	} catch {
		// cloudflare:workers unavailable outside Workers runtime
	}

	const fromProcess =
		typeof process !== "undefined" ? process.env?.[key] : undefined;
	if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;

	const fromMeta = (import.meta.env as Record<string, unknown>)[key];
	return typeof fromMeta === "string" && fromMeta.length > 0 ? fromMeta : undefined;
}

export function getEmDashApiConfig(): EmDashApiConfig | null {
	const base = (readServerEnv("EMDASH_API_BASE") ?? "").replace(/\/$/, "");
	const token = readServerEnv("EMDASH_API_TOKEN");
	if (!base || !token) return null;
	return { base, token };
}

export function writesEnabled(): boolean {
	return getEmDashApiConfig() !== null;
}

export async function emdashFetch(
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	const config = getEmDashApiConfig();
	if (!config) {
		throw new Error("EMDASH_API_BASE and EMDASH_API_TOKEN required for writes");
	}

	const headers = new Headers(init.headers);
	headers.set("Authorization", `Bearer ${config.token}`);
	headers.set("Accept", "application/json");
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	return fetch(`${config.base}${path}`, { ...init, headers });
}

function extractErrorMessage(body: unknown, fallback: string): string {
	if (typeof body !== "object" || !body) return fallback;
	const err = (body as { error?: unknown }).error;
	if (typeof err === "string") return err;
	if (typeof err === "object" && err && "message" in err) {
		const msg = (err as { message: unknown }).message;
		if (typeof msg === "string") return msg;
	}
	return fallback;
}

/**
 * EmDash API success envelope is `{ data: T }`.
 */
export async function emdashJson<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await emdashFetch(path, init);
	const text = await res.text();
	let body: unknown = null;
	if (text) {
		try {
			body = JSON.parse(text);
		} catch {
			body = { raw: text };
		}
	}
	if (!res.ok) {
		throw new Error(
			extractErrorMessage(body, `EmDash API ${res.status}: ${text.slice(0, 200)}`),
		);
	}
	if (typeof body === "object" && body && "data" in body) {
		return (body as { data: T }).data;
	}
	return body as T;
}
