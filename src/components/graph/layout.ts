import type { Graph, GraphNode, Position, Size } from "@shared/schemas/graph"

/**
 * Recursive tree layout for a parsed graph (no positions).
 *
 * The graph is a strict containment tree — modules nest modules, files nest
 * primitives — so layout is a simple recursive pack: lay out each child, stack
 * children vertically inside the parent, size the parent to fit. Cross-edges
 * route over the result. No edge-crossing optimization — that's a later swap
 * (elk/dagre) when layout quality matters.
 */

const LEAF_WIDTH = 230
// Leaf-height estimates — symbol nodes auto-size, so these only drive the
// parent's stacking math. A signed leaf (a function) carries a possibly-wrapped
// signature line; a plain leaf (class, type, constant…) is just its label row.
const LEAF_HEIGHT_PLAIN = 36
const LEAF_HEIGHT_SIGNED = 62
const HEADER = 48 // module/file header strip
const PAD = 16 // inner padding around a container's children
const GAP = 14 // vertical gap between module/file siblings
const LEAF_GAP = 8 // tighter gap between leaf primitives
const TOP_GAP = 120 // horizontal gap between top-level modules

export function layoutGraph(graph: Graph): Graph {
	const childrenOf = new Map<string, GraphNode[]>()
	for (const node of graph.nodes) {
		if (!node.parentId) continue
		const siblings = childrenOf.get(node.parentId) ?? []
		siblings.push(node)
		childrenOf.set(node.parentId, siblings)
	}

	const positions = new Map<string, Position>()
	const sizes = new Map<string, Size>()

	/** Lay out a node's descendants; return the node's own size. */
	function layout(node: GraphNode): Size {
		const children = childrenOf.get(node.id) ?? []
		if (children.length === 0) {
			// Leaf — return an estimate for the parent's stacking math, but
			// don't pin a size (leaf nodes auto-size to their content).
			const height = node.signature ? LEAF_HEIGHT_SIGNED : LEAF_HEIGHT_PLAIN
			return { width: LEAF_WIDTH, height }
		}

		// Pack a container whose children are all leaves (a file of primitives)
		// with the tighter leaf gap; modules of files/modules use the normal gap.
		const childrenAreLeaves = children.every((child) => !childrenOf.has(child.id))
		const gap = childrenAreLeaves ? LEAF_GAP : GAP

		let y = HEADER
		let maxWidth = 0
		for (const child of children) {
			const childSize = layout(child)
			positions.set(child.id, { x: PAD, y })
			y += childSize.height + gap
			maxWidth = Math.max(maxWidth, childSize.width)
		}

		const size: Size = { width: maxWidth + PAD * 2, height: y + PAD }
		sizes.set(node.id, size)
		return size
	}

	let x = 0
	for (const root of graph.nodes.filter((n) => !n.parentId)) {
		const size = layout(root)
		positions.set(root.id, { x, y: 0 })
		x += size.width + TOP_GAP
	}

	return {
		...graph,
		nodes: graph.nodes.map((node) => ({
			...node,
			position: positions.get(node.id) ?? { x: 0, y: 0 },
			size: sizes.get(node.id) ?? node.size
		}))
	}
}
