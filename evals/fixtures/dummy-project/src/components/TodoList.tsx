import { useEffect, useState } from "react"
import { TodoItem } from "@/components/TodoItem"
import { loadTodos, saveTodos } from "@/lib/storage"
import type { Todo, TodoFilter } from "@/types/todo"

export function TodoList() {
	const [todos, setTodos] = useState<Todo[]>([])
	const [filter, setFilter] = useState<TodoFilter["status"]>("all")
	const [draft, setDraft] = useState("")

	useEffect(() => {
		setTodos(loadTodos())
	}, [])

	useEffect(() => {
		saveTodos(todos)
	}, [todos])

	const visible = todos.filter((t) => {
		if (filter === "active") return !t.completed
		if (filter === "completed") return t.completed
		return true
	})

	function addTodo() {
		const title = draft.trim()
		if (!title) return
		setTodos([
			...todos,
			{ id: crypto.randomUUID(), title, completed: false, createdAt: new Date().toISOString() }
		])
		setDraft("")
	}

	function toggleTodo(id: string) {
		setTodos(todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)))
	}

	function deleteTodo(id: string) {
		setTodos(todos.filter((t) => t.id !== id))
	}

	return (
		<section>
			<header>
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => event.key === "Enter" && addTodo()}
					placeholder="What needs doing?"
				/>
				<button type="button" onClick={addTodo}>
					Add
				</button>
			</header>
			<nav>
				{(["all", "active", "completed"] as const).map((status) => (
					<button
						key={status}
						type="button"
						onClick={() => setFilter(status)}
						aria-pressed={filter === status}
					>
						{status}
					</button>
				))}
			</nav>
			<ul>
				{visible.map((todo) => (
					<TodoItem key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} />
				))}
			</ul>
		</section>
	)
}
