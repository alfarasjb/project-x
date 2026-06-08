import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { partitionGraph } from "@server/domain/graph/cluster"
import type { Graph, GraphEdge, GraphNode } from "@shared/schemas/graph"

const file = (id: string): GraphNode => ({
	id,
	path: id,
	kind: "file",
	label: id,
	parentId: null
})

const dep = (source: string, target: string): GraphEdge => ({
	id: `dep:${source}->${target}`,
	source,
	target,
	kind: "dependency"
})

describe("partitionGraph", () => {
	it("splits two dense groups joined by a single bridge into two clusters", () => {
		const nodes = ["a1", "a2", "a3", "b1", "b2", "b3"].map(file)
		const edges: GraphEdge[] = [
			dep("a1", "a2"),
			dep("a2", "a3"),
			dep("a3", "a1"),
			dep("b1", "b2"),
			dep("b2", "b3"),
			dep("b3", "b1"),
			dep("a1", "b1") // the one bridge between the two groups
		]
		const graph: Graph = { nodes, edges, clusters: [] }

		const { byNode, clusterIds } = partitionGraph(graph)

		assert.equal(clusterIds.length, 2)
		const ca = byNode.get("a1")
		assert.equal(byNode.get("a2"), ca)
		assert.equal(byNode.get("a3"), ca)
		const cb = byNode.get("b1")
		assert.equal(byNode.get("b2"), cb)
		assert.equal(byNode.get("b3"), cb)
		assert.notEqual(ca, cb)
	})

	it("ignores module nodes and module-level edges", () => {
		const nodes: GraphNode[] = [
			file("d/x.ts"),
			file("d/y.ts"),
			{ id: "d", path: "d", kind: "module", label: "d", parentId: null }
		]
		const edges: GraphEdge[] = [dep("d/x.ts", "d/y.ts"), dep("d", "d")]
		const graph: Graph = { nodes, edges, clusters: [] }

		const { byNode } = partitionGraph(graph)

		assert.ok(byNode.has("d/x.ts"))
		assert.ok(!byNode.has("d"))
	})

	it("gives each importless file its own singleton cluster", () => {
		const graph: Graph = { nodes: [file("x.ts"), file("y.ts")], edges: [], clusters: [] }

		const { byNode, clusterIds } = partitionGraph(graph)

		assert.equal(clusterIds.length, 2)
		assert.notEqual(byNode.get("x.ts"), byNode.get("y.ts"))
	})

	it("returns an empty partition when there are no files", () => {
		const graph: Graph = { nodes: [], edges: [], clusters: [] }

		assert.deepEqual(partitionGraph(graph), { byNode: new Map(), clusterIds: [] })
	})
})
