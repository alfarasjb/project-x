import type { NodeLayer } from "@shared/schemas/graph"

/** Static Tailwind class maps — no dynamic interpolation so Tailwind detects them. */

export const ALL_LAYERS: NodeLayer[] = [
	"entrypoint",
	"route",
	"service",
	"data",
	"ui",
	"shared",
	"external"
]

export const LAYER_BORDER: Record<NodeLayer, string> = {
	entrypoint: "border-amber-500/40",
	route: "border-sky-500/40",
	service: "border-violet-500/40",
	data: "border-emerald-500/40",
	ui: "border-pink-500/40",
	shared: "border-slate-500/40",
	external: "border-zinc-500/40"
}

export const LAYER_BADGE: Record<NodeLayer, string> = {
	entrypoint: "bg-amber-500/15 text-amber-300",
	route: "bg-sky-500/15 text-sky-300",
	service: "bg-violet-500/15 text-violet-300",
	data: "bg-emerald-500/15 text-emerald-300",
	ui: "bg-pink-500/15 text-pink-300",
	shared: "bg-slate-500/15 text-slate-300",
	external: "bg-zinc-500/15 text-zinc-300"
}

export const LAYER_DOT: Record<NodeLayer, string> = {
	entrypoint: "bg-amber-500",
	route: "bg-sky-500",
	service: "bg-violet-500",
	data: "bg-emerald-500",
	ui: "bg-pink-500",
	shared: "bg-slate-500",
	external: "bg-zinc-500"
}

/** `kind` is open-ended — unknown kinds fall back to DEFAULT_DOT. */
export const KIND_DOT: Record<string, string> = {
	function: "bg-sky-400",
	method: "bg-indigo-400",
	class: "bg-violet-400",
	interface: "bg-teal-400",
	type: "bg-cyan-400",
	constant: "bg-amber-400",
	struct: "bg-violet-400",
	enum: "bg-rose-400",
	trait: "bg-teal-400"
}

export const DEFAULT_DOT = "bg-muted-foreground"
