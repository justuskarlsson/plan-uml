# Plan UML

An interactive PlantUML preview extension for VS Code that brings your diagrams to life with powerful visualization, navigation, and collaboration features.

## ✨ Features

### 🎯 Interactive Preview
- **Live Preview**: Automatically opens when you open a `.puml` file
- **Real-time Updates**: Preview refreshes automatically as you edit your PlantUML files
- **Dual View**: Toggle between preview and source code views instantly

### 🔍 Navigation & Zoom
- **Zoom Controls**: Zoom in, zoom out, fit to window, or view at actual size (1:1)
- **Mouse Wheel Zoom**: Scroll to zoom in and out smoothly
- **Pan & Drag**: Click and drag to pan around large diagrams
- **Zoom Level Display**: Always see your current zoom percentage

### 🎨 Entity Selection
- **Click to Select**: Click any entity (node, component, or relationship) in the diagram to select it
- **Multi-Selection**: Select multiple entities by clicking them individually
- **Rectangle Selection**: Hold Shift and drag to select multiple entities at once
- **Visual Feedback**: Selected entities are highlighted so you can see what you've chosen

### 📝 Journey System
Create and manage instructions or comments about selected diagram entities:

- **Create Instructions**: Select entities and type to create instructions about them
- **Create New Nodes**: Ctrl/Cmd+Click anywhere to create instructions for new entities
- **Journey Sidebar**: View all your journeys in a convenient sidebar
- **Copy to Clipboard**: Export all journeys with one click for use with AI assistants or documentation
- **Reset**: Clear all journeys when starting fresh

### ⚡ Performance & Convenience
- **Smart Caching**: Diagrams are cached for instant re-rendering
- **Auto-Download**: PlantUML JAR file downloads automatically on first use
- **Clean Workspace**: Temporary files are stored outside your project directory
- **Reload Button**: Manually refresh the preview anytime

## 📋 Requirements

- **Java**: Java must be installed and available in your PATH
  - The PlantUML JAR file is automatically downloaded by the extension (no manual setup needed)
  - Install Java from: https://www.java.com/download/ or use your system's package manager

## 🚀 Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Plan UML"
4. Click Install

### Manual Installation

1. Download the `.vsix` file from the [releases page](https://github.com/justuskarlsson/plan-uml/releases)
2. Open VS Code
3. Go to Extensions view
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded `.vsix` file

## 💡 Usage

### Opening a Preview

1. **Automatic**: Simply open any `.puml` file and the preview opens automatically
2. **Manual**: Right-click a `.puml` file and select "Open With" → "Plan UML Preview"
3. **Command Palette**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run "Plan UML: Open Plan UML Preview"

### Working with Diagrams

- **Zoom**: Use the toolbar buttons (`+`, `-`, `Fit`, `1:1`) or scroll with your mouse wheel
- **Pan**: Click and drag anywhere on the diagram
- **Select Entities**: Click on any entity in the diagram to select it
- **Select Multiple**: Hold Shift and drag to create a selection rectangle
- **View Source**: Click "View Source" to switch to the PlantUML source code

### Creating Journeys

1. **Select Entities**: Click on one or more entities in the diagram
2. **Type Instructions**: Start typing to create a journey about the selected entities
3. **Create New Nodes**: Press Ctrl/Cmd and click anywhere to create instructions for new entities
4. **View Journeys**: All journeys appear in the sidebar on the right
5. **Copy All**: Click the "clipboard" button to copy all journeys to your clipboard
6. **Reset**: Click "reset" to clear all journeys

### Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Plan UML: Open Plan UML Preview** - Open preview for the current `.puml` file
- **Plan UML: Close All Previews** - Close all open preview panels
- **Plan UML: Reload All Previews** - Refresh all open preview panels
- **Plan UML: Write plan-uml cursor rules** - Write Cursor AI rules for working with PlantUML files

## 🎯 Use Cases

- **Documentation**: Create visual documentation of system architectures, workflows, and relationships
- **Design Reviews**: Share diagrams with team members and collect feedback using journeys
- **AI Collaboration**: Use journeys to provide context to AI assistants about your system design
- **Code Navigation**: Understand complex systems by visualizing relationships and dependencies
- **Planning**: Create and iterate on system designs before implementation

## 🔧 Troubleshooting

### Preview Not Showing

- Ensure Java is installed and available in your PATH
- Check that the PlantUML JAR file downloaded successfully (you'll see a notification on first use)
- Try reloading the preview using the "Reload" button or the command palette

### Diagram Not Rendering

- Verify your PlantUML syntax is correct
- Check the error message displayed in the preview for specific issues
- Ensure Java is properly installed: run `java -version` in your terminal

### Performance Issues

- Large diagrams may take a moment to render initially
- The extension caches rendered diagrams for faster subsequent views
- Try closing and reopening the preview if it becomes unresponsive

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
