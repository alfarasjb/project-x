import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { EMPTY_GRAPH } from "@shared/schemas/graph"

const server = new McpServer(
	{ name: "project-x", version: "0.0.0" },
	{ capabilities: { resources: {}, tools: {} } }
)

server.registerResource(
	"graph",
	"archlens://graph",
	{
		title: "Architecture graph",
		description: "Full architecture graph JSON (intended + actual). Stub for scaffold.",
		mimeType: "application/json"
	},
	async (uri) => ({
		contents: [
			{
				uri: uri.href,
				mimeType: "application/json",
				text: JSON.stringify(EMPTY_GRAPH, null, 2)
			}
		]
	})
)

const transport = new StdioServerTransport()
await server.connect(transport)
