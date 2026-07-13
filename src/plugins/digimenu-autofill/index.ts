import type { PluginDescriptor } from "emdash";
import { fileURLToPath } from "node:url";

/**
 * Auto-assigns `restaurante` on new productos when the field is empty.
 * v1: if exactly one published restaurant exists, use it.
 * Later: map CMS user → restaurant.
 *
 * Absolute entrypoint: Vite resolves relative paths from the virtual
 * `virtual:emdash/plugins` module (breaks `astro build`).
 */
export function digimenuAutofillPlugin(): PluginDescriptor {
	return {
		id: "digimenu-autofill",
		version: "1.0.0",
		format: "standard",
		entrypoint: fileURLToPath(new URL("./sandbox-entry.ts", import.meta.url)),
		capabilities: ["content:read", "content:write"],
		options: {},
	};
}
