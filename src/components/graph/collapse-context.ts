import { createContext } from "react"

/** Toggles the collapsed state of a module node by id. */
export type ToggleCollapse = (moduleId: string) => void

/**
 * Carries the collapse callback from GraphCanvas down to node components.
 * Avoids baking a callback into node `data` (which would create a circular
 * dependency with `useNodesState`'s setter).
 */
export const CollapseContext = createContext<ToggleCollapse>(() => {
	/* no-op default — the real toggle is supplied by GraphCanvas's provider */
})
