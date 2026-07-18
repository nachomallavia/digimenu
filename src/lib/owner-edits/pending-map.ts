import { computed, type MapStore, type ReadableAtom } from "nanostores";

/** Scalar patch values used in owner list editors. */
export type PatchValue = string | number | boolean | null;

export function valuesEqual(a: PatchValue | undefined, b: PatchValue | undefined): boolean {
	if (a === b) return true;
	// Treat undefined and null as equal for optional refs (e.g. categoria).
	if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
	return false;
}

/**
 * Upsert a single field on a pending map store.
 * Removes the field when it matches `original`; drops the id when the patch is empty.
 */
export function setField<T extends Record<string, PatchValue | undefined>>(
	store: MapStore<Record<string, T>>,
	id: string,
	key: keyof T & string,
	value: T[keyof T],
	original: PatchValue | undefined,
): void {
	const next = { ...store.get() };
	const current = { ...(next[id] ?? ({} as T)) };

	if (valuesEqual(value as PatchValue, original)) {
		delete current[key];
	} else {
		current[key] = value;
	}

	if (Object.keys(current).length === 0) {
		delete next[id];
	} else {
		next[id] = current;
	}
	store.set(next);
}

export function discardAll<T extends Record<string, PatchValue | undefined>>(
	store: MapStore<Record<string, T>>,
): void {
	store.set({});
}

export function removeId<T extends Record<string, PatchValue | undefined>>(
	store: MapStore<Record<string, T>>,
	id: string,
): void {
	const next = { ...store.get() };
	delete next[id];
	store.set(next);
}

export function pendingCount<T extends Record<string, PatchValue | undefined>>(
	store: MapStore<Record<string, T>>,
): ReadableAtom<number> {
	return computed(store, (m) => Object.keys(m).length);
}

export function hasAnyFieldErrors(
	store: MapStore<Record<string, Record<string, string>>>,
): ReadableAtom<boolean> {
	return computed(store, (m) =>
		Object.values(m).some((fields) => Object.keys(fields).length > 0),
	);
}
