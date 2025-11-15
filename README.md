# PlantUML Preview Extension

A VS Code extension that provides interactive preview of PlantUML (.puml) files with click-to-select navigation, zoom controls, and entity mapping.

## Features

1. **Interactive Preview**: Visualize PlantUML files (.puml) in a preview panel
2. **Click-to-Select**: Click entities in the preview to jump to the corresponding line in the source file
3. **Auto-refresh**: Preview automatically updates when the .puml file changes
4. **Zoom Controls**: Zoom in, zoom out, fit to window, and actual size controls
5. **Pan and Zoom**: Mouse wheel zoom and drag to pan
6. **Entity Mapping**: Automatic mapping of PlantUML entities to source code lines

## Requirements

- **Java**: Java must be installed and available in your PATH
  - The PlantUML JAR file is bundled with the extension (no manual installation needed)
  - Install Java from: https://www.java.com/download/ or use your system's package manager

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "PlantUML Preview"
4. Click Install

### Manual Installation

1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Go to Extensions view
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

## Usage

1. Open a `.puml` file
2. The preview will open automatically, or right-click and select "Open With" → "PlantUML Preview"
3. Alternatively, use the command palette: "PlantUML: Open PlantUML Preview"
4. Click on any entity in the preview to jump to its definition in the source file
5. Use the toolbar buttons to zoom, pan, and toggle between preview and source views

## How It Works

The extension uses the PlantUML JAR file (bundled with the extension) to render `.puml` files to SVG. Temporary SVG files are stored in the extension's storage directory, not in your workspace, keeping your project clean.

## Development

```bash
npm install
npm run compile
```

## License

MIT

