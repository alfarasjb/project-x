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
	entrypoint: "border-amber-500/50",
	route: "border-sky-500/50",
	service: "border-violet-500/50",
	data: "border-emerald-500/50",
	ui: "border-pink-500/50",
	shared: "border-slate-500/50",
	external: "border-zinc-500/50"
}

/** Box body fill — a faint layer wash so each node reads in colour, not grey. */
export const LAYER_BG: Record<NodeLayer, string> = {
	entrypoint: "bg-amber-500/10",
	route: "bg-sky-500/10",
	service: "bg-violet-500/10",
	data: "bg-emerald-500/10",
	ui: "bg-pink-500/10",
	shared: "bg-slate-500/10",
	external: "bg-zinc-500/10"
}

/** Module header strip — a stronger tint than the body, to anchor the eye. */
export const LAYER_HEADER: Record<NodeLayer, string> = {
	entrypoint: "bg-amber-500/20",
	route: "bg-sky-500/20",
	service: "bg-violet-500/20",
	data: "bg-emerald-500/20",
	ui: "bg-pink-500/20",
	shared: "bg-slate-500/20",
	external: "bg-zinc-500/20"
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
