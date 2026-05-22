import { createContext, useContext } from "react"
import type { Edge } from "@xyflow/react"

/**
 * Click-to-spotlight. Selecting a node highlights its connected subgraph —
 * callers upstream, callees downstream — and dims everything else.
 *
 * `computeSpotlight` is a pure function of `(nodes, edges, selectedId)`, so it
 * is trivially memoizable. The result is published through `SpotlightContext`
 * and read by node / edge components to derive their own visual role.
 */

/** Minimal node shape the spotlight needs — identity + containment parent. */
export interface SpotlightNode {
	id: string
	parentId: string | null
}

export interface SpotlightState {
	selectedId: string
	/** Nodes reachable by following edges INTO the selected node (callers). */
	upstream: Set<string>
	/** Nodes reachable by following edges OUT of the selected node (callees). */
	downstream: Set<string>
	upstreamEdges: Set<string>
	downstreamEdges: Set<string>
}

/** A node's visual role under the current spotlight. */
export type NodeSpotlightRole = "none" | "selected" | "upstream" | "downstream" | "dimmed"

/** An edge's visual role under the current spotlight. */
export type EdgeSpotlightRole = "idle" | "upstream" | "downstream" | "muted"

interface Link {
	edgeId: string
	node: string
}

/** Directional reachability from `start` over an adjacency map — DFS, cycle-safe. */
function traverse(
	adjacency: Map<string, Link[]>,
	start: string
): { nodes: Set<string>; edges: Set<string> } {
	const nodes = new Set<string>()
	const edges = new Set<string>()
	const stack: string[] = [start]
	while (stack.length > 0) {
		const current = stack.pop()
		if (current === undefined) continue
		for (const link of adjacency.get(current) ?? []) {
			edges.add(link.edgeId)
			if (link.node !== start && !nodes.has(link.node)) {
				nodes.add(link.node)
				stack.push(link.node)
			}
		}
	}
	return { nodes, edges }
}

/**
 * Compute the connected subgraph for `selectedId`. Pure — memoize on
 * `[nodes, edges, selectedId]`. Returns `null` when nothing is selected.
 *
 * Two things feed the downstream set: edges OUT of the selected node (callees),
 * and — for a container — everything nested inside it via `parentId`. Selecting
 * a module therefore spotlights its whole subtree, not just an empty box. The
 * selected node itself is in neither the upstream nor the downstream set.
 */
export function computeSpotlight(
	nodes: SpotlightNode[],
	edges: Edge[],
	selectedId: string | null
): SpotlightState | null {
	if (selectedId === null) return null

	const forward = new Map<string, Link[]>() // source → targets (downstream)
	const reverse = new Map<string, Link[]>() // target → sources (upstream)
	for (const edge of edges) {
		const out = forward.get(edge.source)
		if (out) out.push({ edgeId: edge.id, node: edge.target })
		else forward.set(edge.source, [{ edgeId: edge.id, node: edge.target }])

		const inc = reverse.get(edge.target)
		if (inc) inc.push({ edgeId: edge.id, node: edge.source })
		else reverse.set(edge.target, [{ edgeId: edge.id, node: edge.source }])
	}

	const down = traverse(forward, selectedId)
	const up = traverse(reverse, selectedId)

	// Fold the selected node's containment subtree into the downstream set.
	const childrenOf = new Map<string, string[]>()
	for (const node of nodes) {
		if (node.parentId === null) continue
		const siblings = childrenOf.get(node.parentId)
		if (siblings) siblings.push(node.id)
		else childrenOf.set(node.parentId, [node.id])
	}
	const stack = [...(childrenOf.get(selectedId) ?? [])]
	const seen = new Set<string>()
	while (stack.length > 0) {
		const id = stack.pop()
		if (id === undefined || seen.has(id)) continue
		seen.add(id)
		down.nodes.add(id)
		stack.push(...(childrenOf.get(id) ?? []))
	}

	return {
		selectedId,
		upstream: up.nodes,
		downstream: down.nodes,
		upstreamEdges: up.edges,
		downstreamEdges: down.edges
	}
}

/** The active spotlight, or `null` when no node is selected. */
export const SpotlightContext = createContext<SpotlightState | null>(null)

function nodeRole(state: SpotlightState | null, id: string): NodeSpotlightRole {
	if (!state) return "none"
	if (id === state.selectedId) return "selected"
	if (state.upstream.has(id)) return "upstream"
	if (state.downstream.has(id)) return "downstream"
	return "dimmed"
}

function edgeRole(state: SpotlightState | null, id: string): EdgeSpotlightRole {
	if (!state) return "idle"
	if (state.upstreamEdges.has(id)) return "upstream"
	if (state.downstreamEdges.has(id)) return "downstream"
	return "muted"
}

/** A node's current spotlight role. */
export function useNodeSpotlight(id: string): NodeSpotlightRole {
	return nodeRole(useContext(SpotlightContext), id)
}

/** An edge's current spotlight role. */
export function useEdgeSpotlight(id: string): EdgeSpotlightRole {
	return edgeRole(useContext(SpotlightContext), id)
}
