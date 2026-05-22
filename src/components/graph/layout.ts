import type { Graph, GraphNode, Position, Size } from "@shared/schemas/graph"

/**
 * View-aware grid layout.
 *
 * Each detail view lays out only its visible nodes: a node with no visible
 * children renders at a content-fitted box (consistent width per kind, height
 * from content), and a container packs its visible children into a grid (~√n
 * columns, capped) sized to fit. So every view is a compact picture rather than
 * boxes stretched around hidden content. Switching views re-runs this —
 * positions are deliberately not stable across views; conserving space is the
 * point.
 */

export interface NodeBox {
	position: Position
	size: Size
}

const HEADER = 44 // container header strip — where the child grid starts
const PAD = 14 // inner padding around a container's grid
const GAP = 12 // gap between grid cells
const TOP_GAP = 36 // horizontal gap between top-level nodes
const MAX_COLS = 5 // column cap — bounds a container's horizontal growth

// Leaf-box sizes — width is consistent per kind so grid columns stay tidy;
// height follows content (a primitive carrying a signature is taller).
const MODULE_LEAF: Size = { width: 220, height: 46 }
const FILE_LEAF: Size = { width: 210, height: 38 }
const SYMBOL_WIDTH = 230
const SYMBOL_BASE_HEIGHT = 36 // a primitive showing just its label row
const SYMBOL_DETAIL_HEIGHT = 52 // label row plus a signature / description line

/** A leaf node's box — consistent width per kind, height fitted to content. */
function leafBox(node: GraphNode): Size {
	if (node.kind === "module") return MODULE_LEAF
	if (node.kind === "file") return FILE_LEAF
	const height =
		node.signature || node.description ? SYMBOL_DETAIL_HEIGHT : SYMBOL_BASE_HEIGHT
	return { width: SYMBOL_WIDTH, height }
}

/**
 * Lay out the visible subgraph. Returns a box (position + size) for every
 * visible node; child positions are relative to their parent, matching
 * ReactFlow's `parentId` model.
 */
export function layoutGraph(graph: Graph, visible: Set<string>): Map<string, NodeBox> {
	// Children that are themselves visible, grouped by visible parent.
	const visibleChildren = new Map<string, GraphNode[]>()
	for (const node of graph.nodes) {
		const parent = node.parentId
		if (!visible.has(node.id) || parent === null || !visible.has(parent)) continue
		const siblings = visibleChildren.get(parent)
		if (siblings) siblings.push(node)
		else visibleChildren.set(parent, [node])
	}

	const boxes = new Map<string, NodeBox>()

	/** Lay out a node's visible descendants; return the node's own size. */
	function layout(node: GraphNode): Size {
		const children = visibleChildren.get(node.id) ?? []
		if (children.length === 0) return leafBox(node)

		const laid = children.map((child) => ({ child, size: layout(child) }))
		const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(children.length))))
		const rows = Math.ceil(children.length / cols)

		// Size each column / row to its own content — a leaf is never stretched
		// to the width of a container sibling in another column.
		const colWidths = new Array<number>(cols).fill(0)
		const rowHeights = new Array<number>(rows).fill(0)
		laid.forEach(({ size }, i) => {
			const col = i % cols
			const row = Math.floor(i / cols)
			colWidths[col] = Math.max(colWidths[col] ?? 0, size.width)
			rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height)
		})

		const colX = new Array<number>(cols)
		let x = PAD
		for (let col = 0; col < cols; col++) {
			colX[col] = x
			x += (colWidths[col] ?? 0) + GAP
		}
		const rowY = new Array<number>(rows)
		let y = HEADER
		for (let row = 0; row < rows; row++) {
			rowY[row] = y
			y += (rowHeights[row] ?? 0) + GAP
		}

		laid.forEach(({ child, size }, i) => {
			boxes.set(child.id, {
				position: {
					x: colX[i % cols] ?? PAD,
					y: rowY[Math.floor(i / cols)] ?? HEADER
				},
				size
			})
		})

		return { width: x - GAP + PAD, height: y - GAP + PAD }
	}

	// Top-level visible nodes — laid out left to right.
	let x = 0
	for (const node of graph.nodes) {
		const parent = node.parentId
		if (!visible.has(node.id)) continue
		if (parent !== null && visible.has(parent)) continue // not a visible root
		const size = layout(node)
		boxes.set(node.id, { position: { x, y: 0 }, size })
		x += size.width + TOP_GAP
	}

	return boxes
}
