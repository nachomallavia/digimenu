/**
 * Map restaurant theme tokens to an inline style string for Menu.astro.
 * Keys may be with or without `--` (e.g. `primary` or `--primary`).
 * Future: load from EmDash `restaurantes` fields and pass into Menu.
 */
export function themeToStyle(
	theme?: Record<string, string> | null,
): string | undefined {
	if (!theme) return undefined;
	const parts: string[] = [];
	for (const [key, value] of Object.entries(theme)) {
		if (!value) continue;
		const varName = key.startsWith("--") ? key : `--${key}`;
		parts.push(`${varName}:${value}`);
	}
	return parts.length > 0 ? parts.join(";") : undefined;
}
