import { formatDate } from "@/lib/format-date"
import type { Todo } from "@/types/todo"

interface TodoItemProps {
	todo: Todo
	onToggle: (id: string) => void
	onDelete: (id: string) => void
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
	return (
		<li className="todo-item">
			<label>
				<input type="checkbox" checked={todo.completed} onChange={() => onToggle(todo.id)} />
				<span className={todo.completed ? "completed" : ""}>{todo.title}</span>
			</label>
			<time>{formatDate(todo.createdAt)}</time>
			<button type="button" onClick={() => onDelete(todo.id)} aria-label="Delete todo">
				×
			</button>
		</li>
	)
}
