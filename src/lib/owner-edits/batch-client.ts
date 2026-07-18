export type BatchFailedItem = { id: string; error: string };

export type BatchUpdateResponse = {
	ok: boolean;
	updated?: number;
	failed?: BatchFailedItem[];
	error?: string;
};

export type DeleteResponse = {
	ok: boolean;
	error?: string;
};

export async function postJson<T>(url: string, body: unknown): Promise<T> {
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	let data: unknown = null;
	const text = await res.text();
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			throw new Error(res.ok ? "Respuesta inválida del servidor" : `Error ${res.status}`);
		}
	}

	if (!res.ok) {
		const msg =
			typeof data === "object" &&
			data &&
			"error" in data &&
			typeof (data as { error: unknown }).error === "string"
				? (data as { error: string }).error
				: `Error ${res.status}`;
		throw new Error(msg);
	}

	return data as T;
}

export async function postBatchUpdate(
	url: string,
	changes: Record<string, Record<string, unknown>>,
): Promise<BatchUpdateResponse> {
	return postJson<BatchUpdateResponse>(url, {
		action: "batchUpdate",
		changes,
	});
}

export async function postDelete(url: string, id: string): Promise<DeleteResponse> {
	return postJson<DeleteResponse>(url, {
		action: "delete",
		id,
	});
}
