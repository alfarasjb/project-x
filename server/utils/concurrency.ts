/**
 * Run `worker` over `items` with a fixed pool of in-flight calls. We avoid a
 * dependency (p-limit etc.) — the worker loop is ~10 lines and lets us keep
 * Project X's tight dep footprint. Shared by the analyze pass and the
 * cluster-label stage; both fan a bounded number of LLM calls over a list.
 */
export async function runWithConcurrency<T>(
	items: readonly T[],
	limit: number,
	worker: (item: T) => Promise<void>
): Promise<void> {
	let cursor = 0
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++
			const item = items[index]
			if (item === undefined) continue
			await worker(item)
		}
	})
	await Promise.all(runners)
}
