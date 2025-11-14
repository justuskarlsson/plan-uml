# MCP Server Configuration for Cursor

To use the Graphviz Preview MCP server with Cursor, you need to register it in Cursor's MCP configuration.

## Configuration

Add the following to your Cursor MCP configuration file (typically located at `~/.cursor/mcp.json` or in your workspace settings):

```json
{
  "mcpServers": {
    "graphviz-preview": {
      "command": "node",
      "args": [
        "/path/to/ai-revisor/graphviz-extension/out/mcpServerEntry.js"
      ],
      "env": {
        "WORKSPACE_ROOT": "/path/to/your/workspace"
      }
    }
  }
}
```

## Alternative: Using Extension Context

If you prefer to have the extension manage the MCP server, you can modify the extension to start it as a child process. However, the standalone approach (above) is recommended for better isolation.

## Testing the MCP Server

You can test the MCP server directly:

```bash
cd graphviz-extension
npm run compile
node out/mcpServerEntry.js
```

The server will communicate via stdio, so you can interact with it using MCP client tools.

