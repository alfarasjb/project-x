import { createRoot } from "react-dom/client"
import { TodoList } from "@/components/TodoList"

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root container")
createRoot(root).render(<TodoList />)
