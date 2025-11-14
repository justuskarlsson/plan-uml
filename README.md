# Graphviz Preview Extension

A VS Code/Cursor extension that provides interactive preview of Graphviz (.dot) files with click-to-select navigation and MCP server support for Cursor agents.

## Features

1. **Interactive Preview**: Visualize Graphviz files (.dot, .gv) in a preview panel
2. **Click-to-Select**: Click nodes in the preview to jump to the corresponding line in the source file
3. **Auto-refresh**: Preview automatically updates when the .dot file changes
4. **MCP Server**: Exposes tools and resources for Cursor agents to interact with Graphviz files

## Requirements

- Graphviz must be installed and the `dot` command must be available in your PATH
- Install Graphviz from: https://graphviz.org/download/

## Usage

1. Open a `.dot` or `.gv` file
2. Right-click and select "Open With" → "Graphviz Preview", or use the command palette: "Graphviz: Open Graphviz Preview"
3. Click on any node in the preview to jump to its definition in the source file

## MCP Server

The extension exposes an MCP server that Cursor agents can use to interact with Graphviz files. See [MCP_CONFIG.md](./MCP_CONFIG.md) for setup instructions.

### Tools

- **render_graphviz**: Render a .dot file to SVG
  - Parameters: `file_path` (string) - Path to the .dot file
  - Returns: SVG content and success status

- **get_node_line**: Get the line number(s) for a node ID
  - Parameters: `file_path` (string), `node_id` (string)
  - Returns: Line numbers where the node is defined

- **open_preview**: Get instructions to open the preview
  - Parameters: `file_path` (string)
  - Returns: Instructions message

### Resources

- **graphviz://file/{path}**: Raw .dot file content
- **graphviz://preview/{path}**: Rendered SVG preview
- **graphviz://mapping/{path}**: Node-to-line mapping JSON

## Development

```bash
npm install
npm run compile
```

## License

MIT

