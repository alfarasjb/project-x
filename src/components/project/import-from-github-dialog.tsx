import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Lock, Search } from "lucide-react"
import type { GithubRepo } from "@shared/schemas/integrations"
import { useCreateProject } from "@/hooks/use-create-project"
import { githubReposQueryOptions, githubStatusQueryOptions } from "@/lib/queries"
import { routes } from "@/lib/routes"
import { toast, toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"

interface Props {
	orgSlug: string
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Import-from-GitHub flow — a controlled dialog that lists the user's
 * GitHub repos and creates a project (with `repoUrl`, no `rootPath`) on
 * selection. Triggering lives in `AddProjectMenu`; this component only
 * renders the dialog UI.
 *
 * Pagination is "load more" — each click appends the next page to the
 * accumulator so the user can keep scrolling without losing prior results.
 * Search filters across all loaded pages client-side; the search-API
 * upgrade comes in when a real user hits the page-load wall.
 */
export function ImportFromGithubDialog({ orgSlug, open, onOpenChange }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Import from GitHub</DialogTitle>
					<DialogDescription>
						Pick a repo to track. Project X will clone it at crawl time.
					</DialogDescription>
				</DialogHeader>
				<ImportBody orgSlug={orgSlug} onImported={() => onOpenChange(false)} />
			</DialogContent>
		</Dialog>
	)
}

function ImportBody({ orgSlug, onImported }: { orgSlug: string; onImported: () => void }) {
	const { data: status, isPending: statusLoading } = useQuery(githubStatusQueryOptions())

	if (statusLoading || !status) {
		return <p className="text-muted-foreground text-sm">Checking GitHub connection…</p>
	}

	if (!status.configured) {
		return (
			<div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-md border border-amber-500/30 p-3 text-xs">
				GitHub OAuth credentials are not configured on this server.
			</div>
		)
	}

	if (!status.connected) {
		return (
			<div className="space-y-3">
				<p className="text-muted-foreground text-sm">
					Connect your GitHub account first — we use it to list and clone repos.
				</p>
				<Button asChild>
					<a href={routes.settingsIntegrations.replace("$orgSlug", orgSlug)}>Go to integrations</a>
				</Button>
			</div>
		)
	}

	return <RepoPicker orgSlug={orgSlug} onImported={onImported} />
}

function RepoPicker({ orgSlug, onImported }: { orgSlug: string; onImported: () => void }) {
	const [page, setPage] = useState(1)
	const [query, setQuery] = useState("")
	const [accumulated, setAccumulated] = useState<GithubRepo[]>([])
	const navigate = useNavigate()

	const reposQuery = useQuery(githubReposQueryOptions(page))

	// Append on every successful page fetch. The dedupe-by-id is defensive:
	// if a repo was just pushed-to between page fetches it can slide between
	// pages, but the id is stable so we never render duplicates.
	useEffect(() => {
		if (!reposQuery.data) return
		setAccumulated((prev) => {
			const known = new Set(prev.map((r) => r.id))
			const next = reposQuery.data.repos.filter((r) => !known.has(r.id))
			if (next.length === 0) return prev
			return prev.concat(next)
		})
	}, [reposQuery.data])

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return accumulated
		return accumulated.filter(
			(repo) =>
				repo.fullName.toLowerCase().includes(q) ||
				(repo.description ?? "").toLowerCase().includes(q)
		)
	}, [accumulated, query])

	const { mutate: createProject, isPending: importing } = useCreateProject()
	const importRepo = (repo: GithubRepo): void => {
		createProject(
			{ source: "github", name: repo.name, repoUrl: repo.htmlUrl },
			{
				onSuccess: (project) => {
					toast.success(`Imported "${project.name}".`)
					onImported()
					void navigate({
						to: routes.project,
						params: { orgSlug, projectSlug: project.slug }
					})
				},
				onError: (cause) => toastError(cause, "Import failed.")
			}
		)
	}

	const hasMore = reposQuery.data?.hasMore ?? false

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
				<input
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search loaded repositories…"
					className="bg-background focus:border-foreground/30 w-full rounded-md border py-1.5 pr-3 pl-8 text-sm outline-none transition-colors"
				/>
			</div>

			{/*
			  Fixed-height list so the dialog doesn't snap-resize as the user
			  types and `filtered` shrinks. Status messages render inline
			  inside the same box.
			*/}
			<div className="h-80 overflow-y-auto rounded-md border">
				{reposQuery.isPending && accumulated.length === 0 && (
					<p className="text-muted-foreground p-4 text-sm">Loading repositories…</p>
				)}
				{reposQuery.error && (
					<p className="text-destructive p-4 text-sm">{reposQuery.error.message}</p>
				)}
				{filtered.length === 0 && !reposQuery.isPending && accumulated.length > 0 && (
					<p className="text-muted-foreground p-4 text-sm">No matching repositories.</p>
				)}
				<ul className="divide-y">
					{filtered.map((repo) => (
						<li key={repo.id} className="flex items-start gap-3 px-3 py-2.5">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<span className="truncate text-sm font-medium">{repo.fullName}</span>
									{repo.private && <Lock className="text-muted-foreground size-3 shrink-0" />}
								</div>
								{repo.description && (
									<p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
										{repo.description}
									</p>
								)}
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => importRepo(repo)}
								disabled={importing}
							>
								Import
							</Button>
						</li>
					))}
					{hasMore && (
						<li className="flex justify-center px-3 py-2.5">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setPage((p) => p + 1)}
								disabled={reposQuery.isFetching}
							>
								{reposQuery.isFetching ? "Loading…" : "Load more"}
							</Button>
						</li>
					)}
				</ul>
			</div>
		</div>
	)
}
