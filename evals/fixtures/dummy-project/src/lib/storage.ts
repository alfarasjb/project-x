import type { Todo } from "@/types/todo"

// Intentional concern: app-specific key buried in a "utility" file.
// AI Review should flag this as `hardcoded-domain-values`.
const STORAGE_KEY = "dummy-todo-app/todos/v1"
const MAX_TODOS = 500

export function loadTodos(): Todo[] {
	const raw = localStorage.getItem(STORAGE_KEY)
	if (!raw) return []
	try {
		const parsed = JSON.parse(raw) as Todo[]
		return Array.isArray(parsed) ? parsed.slice(0, MAX_TODOS) : []
	} catch {
		return []
	}
}

export function saveTodos(todos: Todo[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(todos.slice(0, MAX_TODOS)))
}

export function clearTodos(): void {
	localStorage.removeItem(STORAGE_KEY)
}
