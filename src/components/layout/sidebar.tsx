import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { LayoutDashboard, LogOut, Workflow } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

const ITEM =
	"flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors"
const LINK = cn(
	ITEM,
	"text-muted-foreground hover:bg-muted hover:text-foreground",
	"data-[status=active]:bg-muted data-[status=active]:text-foreground"
)

/**
 * The app's left rail — workspace identity (the active org), the current
 * project's view nav, and the signed-in user / sign-out at the foot.
 *
 * Project *selection* lives in the header switcher; this rail picks the view
 * (Dashboard / Graph) within the chosen project, and is inert on routes with
 * no project (the `/` home).
 */
export function Sidebar() {
	// Loose params: `projectId` is set on project routes, undefined on `/`.
	const { projectId } = useParams({ strict: false })
	const { data: session } = authClient.useSession()
	const { data: activeOrg } = authClient.useActiveOrganization()
	const navigate = useNavigate()
	const queryClient = useQueryClient()

	async function handleSignOut() {
		try {
			const result = await authClient.signOut()
			if (result.error) console.warn("[signout] error", result.error)
		} catch (cause) {
			console.warn("[signout] threw", cause)
		}
		// Optimistically clear cached state — don't rely on a refetch hitting a
		// cookieCache-stale getSession(). Setting the session query to null
		// directly means the root beforeLoad sees "no session" immediately and
		// lets the user through to /signin instead of bouncing them back to /.
		queryClient.setQueryData(["auth", "session"], null)
		queryClient.removeQueries({ queryKey: ["projects"] })
		queryClient.removeQueries({ queryKey: ["project"] })
		await navigate({ to: "/signin" })
	}

	return (
		<aside className="bg-card flex h-full w-52 shrink-0 flex-col border-r">
			<div className="border-b px-4 py-3">
				<div className="font-display text-sm font-bold tracking-tight">Project X</div>
				<div className="text-muted-foreground truncate text-[11px]">
					{activeOrg?.name ?? "Loading workspace…"}
				</div>
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

			{session && (
				<div className="border-t px-3 py-2.5">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0 flex-1">
							<div className="truncate text-[11px] font-medium">{session.user.name}</div>
							<div className="text-muted-foreground truncate text-[10px]">{session.user.email}</div>
						</div>
						<button
							type="button"
							onClick={handleSignOut}
							className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5 transition-colors"
							title="Sign out"
							aria-label="Sign out"
						>
							<LogOut className="size-3.5" />
						</button>
					</div>
				</div>
			)}
		</aside>
	)
}
