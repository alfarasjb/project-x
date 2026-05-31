import type { Edge, Node } from "@xyflow/react"

/**
 * Hand-authored PromptWise video-dispatch feature flow — the ARG-25 acceptance
 * fixture. Mirrors `.internal/architecture-sketch/promptwise-dispatch-example.md`
 * (PromptWise PRO-1066) as a static render target so the Feature Flows canvas
 * can be validated before any AI / parser / schema work lands.
 *
 * Reuses the existing project-graph `module` / `file` / `symbol` node types
 * (handles oriented left ⇢ right) — the fixture flows L→R, which is a 90°
 * rotation of the source Mermaid's TD direction. Topology, not orientation, is
 * the bar per ARG-25's acceptance criteria. Decision/branch styling and dashed
 * edges are intentionally NOT applied here — they belong to the sibling sub-
 * issue. FLAG / ROUTE render as regular file nodes; OVL → P1 renders as a
 * normal solid edge with its label.
 */

/**
 * Identifier prefix — keeps fixture ids out of the namespace of any real
 * parsed-graph node id ("src/...") so the two can coexist in one canvas
 * without collisions.
 */
const ID = "promptwise"

const id = (suffix: string): string => `${ID}/${suffix}`

const SURFACES_ID = id("surfaces")
const SVC_ID = id("svc")

/**
 * Container child rows — height of each surface entry and each symbol step
 * inside `SVC`. Kept as constants so the parent's `height` stays in sync.
 */
const ROW_HEIGHT = 30
const SYMBOL_ROW_HEIGHT = 58
const SYMBOL_ROW_GAP = 8

export const promptwiseFeatureFlowNodes: Node[] = [
	// --- Top entry path: the Stage-2 reconciler ----------------------------
	{
		id: id("recon"),
		type: "file",
		position: { x: 40, y: 20 },
		style: { width: 260, height: 56 },
		data: {
			label: "Stage 2 / reconciler",
			path: "feature/video-dispatch/reconciler",
			layer: "service"
		}
	},
	{
		id: id("load"),
		type: "file",
		position: { x: 360, y: 20 },
		style: { width: 260, height: 56 },
		data: {
			label: "Load Generation by id",
			path: "feature/video-dispatch/load-generation",
			layer: "service"
		}
	},

	// --- Surfaces container (entry anchors for live-request path) ----------
	// ReactFlow requires parent BEFORE children in the array.
	{
		id: SURFACES_ID,
		type: "module",
		position: { x: 40, y: 120 },
		style: { width: 280, height: 320 },
		data: {
			label: "Surfaces",
			path: "feature/video-dispatch/surfaces",
			layer: "route",
			statsLabel: "7 entry points"
		}
	},
	...[
		{ idSuffix: "surfaces/studio", label: "Studio video — now" },
		{ idSuffix: "surfaces/wise-animate", label: "Wise animate — now" },
		{ idSuffix: "surfaces/ugc", label: "UGC generate — fan-out" },
		{ idSuffix: "surfaces/seedance", label: "Seedance UGC — fan-out" },
		{ idSuffix: "surfaces/ugc-extend", label: "UGC extend — fan-out" },
		{ idSuffix: "surfaces/wise-video", label: "Wise video — fan-out" },
		{ idSuffix: "surfaces/flow-video", label: "Flow video — fan-out" }
	].map<Node>((surface, index) => ({
		id: id(surface.idSuffix),
		type: "file",
		parentId: SURFACES_ID,
		extent: "parent",
		position: { x: 14, y: 44 + index * (ROW_HEIGHT + 6) },
		style: { width: 252, height: ROW_HEIGHT },
		data: {
			label: surface.label,
			path: `feature/video-dispatch/${surface.idSuffix}`,
			layer: "route"
		}
	})),

	// --- Main flow continuation: CREATE → FLAG → (fork) --------------------
	{
		id: id("create"),
		type: "file",
		position: { x: 380, y: 260 },
		style: { width: 280, height: 70 },
		data: {
			label: "Create / load Generation row",
			path: "feature/video-dispatch/create-or-load-row",
			layer: "service"
		}
	},
	{
		id: id("flag"),
		type: "file",
		position: { x: 720, y: 260 },
		style: { width: 280, height: 70 },
		data: {
			label: 'VIDEO_START_SERVICE_ENABLED === "1"?',
			path: "feature/video-dispatch/start-service-flag",
			layer: "service"
		}
	},
	// Off-branch — feature flag off OR surface not yet adopted.
	{
		id: id("inline"),
		type: "file",
		position: { x: 720, y: 120 },
		style: { width: 280, height: 60 },
		data: {
			label: "Existing inline dispatch — unchanged",
			path: "feature/video-dispatch/inline-dispatch",
			layer: "service"
		}
	},

	// --- Service subgraph + symbol-tier chain ------------------------------
	{
		id: SVC_ID,
		type: "module",
		position: { x: 1060, y: 140 },
		style: { width: 340, height: 460 },
		data: {
			label: "startVideoGeneration(generation, overlay?)",
			path: "feature/video-dispatch/svc",
			layer: "service",
			statsLabel: "row-only"
		}
	},
	...[
		{
			idSuffix: "svc/parse-params",
			label: "Parse generationParams → discriminatedUnion(surface)"
		},
		{ idSuffix: "svc/parse-input", label: "Parse Generation.input → per-surface schema" },
		{
			idSuffix: "svc/build-dispatch",
			label: "buildVideoTriggerDispatch({ generation, surface, ctx })"
		},
		{ idSuffix: "svc/idempotency", label: "idempotencyKeys.create — global scope" },
		{ idSuffix: "svc/trigger", label: "triggerWithQueueSpan(taskId, payload, options)" },
		{ idSuffix: "svc/persist-run-id", label: "persist triggerRunId — best-effort" }
	].map<Node>((step, index) => ({
		id: id(step.idSuffix),
		type: "symbol",
		parentId: SVC_ID,
		extent: "parent",
		position: { x: 16, y: 44 + index * (SYMBOL_ROW_HEIGHT + SYMBOL_ROW_GAP) },
		style: { width: 308, height: SYMBOL_ROW_HEIGHT },
		data: {
			label: step.label,
			kind: "function",
			path: `feature/video-dispatch/${step.idSuffix}`
		}
	})),

	// --- Overlay (live-only input merged into ctx) -------------------------
	{
		id: id("overlay"),
		type: "file",
		position: { x: 720, y: 660 },
		style: { width: 320, height: 80 },
		data: {
			label: "overlay: forceProvider? / loadtestRunId?",
			path: "feature/video-dispatch/overlay",
			layer: "shared"
		}
	},

	// --- Route fanout to worker tasks --------------------------------------
	{
		id: id("route"),
		type: "file",
		position: { x: 1460, y: 320 },
		style: { width: 260, height: 70 },
		data: {
			label: "taskId from builder",
			path: "feature/video-dispatch/route-by-task-id",
			layer: "service"
		}
	},
	...[
		{ idSuffix: "task/video", label: "generation.process.video" },
		{ idSuffix: "task/ugc", label: "generation.process.ugc" },
		{ idSuffix: "task/ugc-seedance", label: "generation.process.ugc-seedance" },
		{ idSuffix: "task/ugc-extend", label: "generation.process.ugc-extend" }
	].map<Node>((task, index) => ({
		id: id(task.idSuffix),
		type: "file",
		position: { x: 1780, y: 200 + index * 70 },
		style: { width: 320, height: 56 },
		data: {
			label: task.label,
			path: `trigger/${task.label}`,
			layer: "external"
		}
	}))
]

/**
 * Edge ids embed source → target so collisions are impossible and the id is
 * self-describing in devtools.
 */
const edge = (source: string, target: string, label?: string): Edge => ({
	id: `${source}->${target}`,
	source,
	target,
	type: "default",
	...(label !== undefined ? { label } : {})
})

export const promptwiseFeatureFlowEdges: Edge[] = [
	// Live-request path: surfaces ⇢ CREATE ⇢ FLAG ⇢ (fork)
	edge(SURFACES_ID, id("create")),
	edge(id("create"), id("flag")),
	edge(id("flag"), id("inline"), "off / not adopted"),
	edge(id("flag"), id("svc/parse-params"), "yes"),

	// Reconciler path: RECON ⇢ LOAD ⇢ P1
	edge(id("recon"), id("load")),
	edge(id("load"), id("svc/parse-params")),

	// Symbol-tier chain inside SVC: P1 → P2 → … → P6
	edge(id("svc/parse-params"), id("svc/parse-input")),
	edge(id("svc/parse-input"), id("svc/build-dispatch")),
	edge(id("svc/build-dispatch"), id("svc/idempotency")),
	edge(id("svc/idempotency"), id("svc/trigger")),
	edge(id("svc/trigger"), id("svc/persist-run-id")),

	// Overlay merged into ctx at P1 (dashed in source Mermaid — styling deferred).
	edge(id("overlay"), id("svc/parse-params"), "merged into ctx"),

	// P6 ⇢ ROUTE ⇢ worker tasks
	edge(id("svc/persist-run-id"), id("route")),
	edge(id("route"), id("task/video"), "studio · animate · wise · flow"),
	edge(id("route"), id("task/ugc"), "ugc"),
	edge(id("route"), id("task/ugc-seedance"), "seedance"),
	edge(id("route"), id("task/ugc-extend"), "ugc-extend")
]
