// Entry point for standalone MCP server process
import { startMcpServer } from './mcpServer';

// Set workspace root from environment if available
if (process.env.WORKSPACE_FOLDER) {
    process.env.WORKSPACE_ROOT = process.env.WORKSPACE_FOLDER;
}

startMcpServer();

