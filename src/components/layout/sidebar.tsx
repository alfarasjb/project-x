import { Link, useParams } from "@tanstack/react-router"
import { LayoutDashboard, Workflow } from "lucide-react"
import { cn } from "@/lib/utils"

const ITEM =
	"flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors"
const LINK = cn(
	ITEM,
	"text-muted-foreground hover:bg-muted hover:text-foreground",
	"data-[status=active]:bg-muted data-[status=active]:text-foreground"
)

/**
 * The app's left rail — workspace identity and the current project's view nav.
 * Project *selection* lives in the header switcher; this rail picks the view
 * (Dashboard / Graph) within the chosen project, and is inert on routes with
 * no project (the `/` home).
 *
 * "Default workspace" is org chrome only — one stub org, not a real entity yet.
 */
export function Sidebar() {
	// Loose params: `projectId` is set on project routes, undefined on `/`.
	const { projectId } = useParams({ strict: false })

	return (
		<aside className="bg-card flex h-full w-52 shrink-0 flex-col border-r">
			<div className="border-b px-4 py-3">
				<div className="font-display text-sm font-bold tracking-tight">Project X</div>
				<div className="text-muted-foreground text-[11px]">Default workspace</div>
			</div>

			<nav className="flex flex-1 flex-col gap-0.5 p-2">
				{projectId ? (
					<>
						<Link
							to="/projects/$projectId"
							params={{ projectId }}
							activeOptions={{ exact: true }}
							className={LINK}
						>
							<LayoutDashboard className="size-4 shrink-0" />
							Dashboard
						</Link>
						<Link to="/projects/$projectId/graph" params={{ projectId }} className={LINK}>
							<Workflow className="size-4 shrink-0" />
							Graph
						</Link>
					</>
				) : (
					<div className={cn(ITEM, "text-muted-foreground/50")}>Select a project to begin</div>
				)}
			</nav>
		</aside>
	)
}
