import { useState } from "react"
import { ChevronDown, FolderOpen, Plus } from "lucide-react"
import { GitHubMark } from "@/components/icons/github-mark"
import { ImportFromGithubDialog } from "@/components/project/import-from-github-dialog"
import { NewProjectDialog } from "@/components/project/new-project-dialog"

type OpenDialog = "none" | "local" | "github"

/**
 * Top-of-page CTA for creating a new project. Single button opens a menu
 * with two project sources:
 *
 *   - Local path — dev/dogfood form; goes away when crawl-from-GH lands.
 *   - From GitHub — opens the import dialog, list/search of the user's repos.
 *
 * Mirrors `AnalyzeButton`'s click-catcher pattern instead of pulling in
 * shadcn's `dropdown-menu`: one fewer dep, same UX, dismiss-on-outside-click
 * works without effects or refs.
 */
export function AddProjectMenu({ orgSlug }: { orgSlug: string }) {
	const [menuOpen, setMenuOpen] = useState(false)
	const [openDialog, setOpenDialog] = useState<OpenDialog>("none")

	const choose = (source: Exclude<OpenDialog, "none">): void => {
		setMenuOpen(false)
		setOpenDialog(source)
	}

	return (
		<>
			<div className="relative inline-flex">
				<button
					type="button"
					onClick={() => setMenuOpen((open) => !open)}
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					className="bg-primary text-primary-foreground hover:opacity-90 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity"
				>
					<Plus className="size-3.5" />
					New project
					<ChevronDown className="size-3.5 opacity-80" />
				</button>

				{menuOpen && (
					<>
						{/* Click-catcher closes the menu without needing a ref/effect. */}
						<div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
						<div
							role="menu"
							className="bg-card absolute right-0 top-full z-30 mt-1 w-56 rounded-md border p-1 shadow-md"
						>
							<button
								type="button"
								role="menuitem"
								onClick={() => choose("github")}
								className="hover:bg-muted flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
							>
								<GitHubMark className="mt-0.5 size-3.5 shrink-0" />
								<span className="min-w-0">
									<div className="font-medium">From GitHub</div>
									<div className="text-muted-foreground text-[10px] leading-snug">
										List + search your repos. Cloned at crawl time.
									</div>
								</span>
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={() => choose("local")}
								className="hover:bg-muted flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
							>
								<FolderOpen className="mt-0.5 size-3.5 shrink-0" />
								<span className="min-w-0">
									<div className="font-medium">Local path</div>
									<div className="text-muted-foreground text-[10px] leading-snug">
										Absolute path on this machine. Dev/dogfood only.
									</div>
								</span>
							</button>
						</div>
					</>
				)}
			</div>

			<NewProjectDialog
				orgSlug={orgSlug}
				open={openDialog === "local"}
				onOpenChange={(open) => setOpenDialog(open ? "local" : "none")}
			/>
			<ImportFromGithubDialog
				orgSlug={orgSlug}
				open={openDialog === "github"}
				onOpenChange={(open) => setOpenDialog(open ? "github" : "none")}
			/>
		</>
	)
}
