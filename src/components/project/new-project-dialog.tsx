import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { NewProjectForm } from "@/components/project/new-project-form"

interface Props {
	orgSlug: string
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled wrapper around the legacy local-path form. The form's success
 * navigation closes the dialog implicitly by leaving the page; if the user
 * cancels, the X / overlay click closes via `onOpenChange`.
 *
 * Local-path projects are a dev/dogfood path that goes away once
 * crawl-from-GitHub lands. Keeping the form behind a dialog (instead of
 * inline) keeps the projects page focused on the cards.
 */
export function NewProjectDialog({ orgSlug, open, onOpenChange }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New project (local path)</DialogTitle>
					<DialogDescription>
						Point Project X at an absolute path on this machine. Dev/dogfood path — the
						import-from-GitHub flow is the long-term default.
					</DialogDescription>
				</DialogHeader>
				<NewProjectForm orgSlug={orgSlug} />
			</DialogContent>
		</Dialog>
	)
}
