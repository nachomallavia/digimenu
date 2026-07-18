export type ColorMode = "light" | "dark" | "system";

export const COLOR_MODE_COOKIE = "digimenu_color_mode";
export const COLOR_MODE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseColorMode(value: string | undefined | null): ColorMode {
	if (value === "light" || value === "dark" || value === "system") return value;
	return "system";
}

export function isDarkMode(mode: ColorMode, prefersDark: boolean): boolean {
	if (mode === "dark") return true;
	if (mode === "light") return false;
	return prefersDark;
}
