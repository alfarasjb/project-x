import type { GraphNode } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { LAYER_BADGE } from "./node-style"
import { formatSignature } from "./symbol-node"

/**
 * Detail of the selected node — label, kind, layer, path, signature, and the
 * `what`/`why` description. Descriptions are usually absent until the AI
 * describe pipeline exists, so an explicit placeholder stands in.
 */
export function InspectorNodeInfo({ node }: { node: GraphNode }) {
	return (
		<div className="flex flex-col gap-2">
			<div>
				<div className="flex items-center gap-2">
					<h3 className="font-display truncate text-sm font-semibold">{node.label}</h3>
					<span className="text-muted-foreground ml-auto shrink-0 font-mono text-[10px]">
						{node.kind}
					</span>
				</div>
				{node.layer && (
					<span
						className={cn(
							"mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
							LAYER_BADGE[node.layer]
						)}
					>
						{node.layer}
					</span>
				)}
			</div>

			<p className="text-muted-foreground break-all font-mono text-[10px] leading-snug">
				{node.path}
			</p>

			{node.signature && (
				<div className="bg-muted/50 rounded-md px-2 py-1.5 font-mono text-[10px] leading-snug">
					{formatSignature(node.signature)}
				</div>
			)}

			{node.description ? (
				<div className="flex flex-col gap-1">
					<p className="text-xs leading-snug">{node.description.what}</p>
					{node.description.why && (
						<p className="text-muted-foreground text-[11px] italic leading-snug">
							{node.description.why}
						</p>
					)}
				</div>
			) : (
				<p className="text-muted-foreground text-[11px] italic">No description yet.</p>
			)}
		</div>
	)
}
