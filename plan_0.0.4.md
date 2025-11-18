# Update Architecture Diagram and Add Features

## 1. Update ExtensionArchitecture.puml

### Remove deprecated API methods

- Remove `getEntityLine()` and `getEdgeLine()` from LineMapper API rectangle (lines 98-99, 103-104)
- Keep `mapNodesToLines()` and `mapEdgesToLines()` as they are actively used (confirmed still in use)

### Fix naming

- Verify UC_Cmd references are correct (currently shows "Run Open Preview Command" which matches `plantuml.openPreview`)
- Check for any remaining "graphviz" references and replace with "plantuml"

## 2. Add Edge Selection Feature

### Update previewProvider.ts

- In `getWebviewContent()`, add click handlers for `g.link` elements (similar to `g.entity` handlers around line 993)
- Extend `selectionState` object to track `selectedEdges` array (around line 456)
- Add `toggleEdgeSelection()` method similar to `toggleNodeSelection()`
- Update `selectNodesInRectangle()` to also select edges within rectangle
- Add edge highlighting CSS (similar to `g.entity.selected` around line 361)
- Use `edgeMapping` data (already passed to webview) to identify edges by source->target key
- Update selection counter to show both nodes and edges

### SVG edge identification

- PlantUML SVG `g.link` elements have `data-entity-1` and `data-entity-2` attributes (confirmed from ExtensionArchitecture.svg)
- Construct edge key as `{data-entity-1}->{data-entity-2}` to match edgeMapping format
- Add click handlers for `g.link` elements to extract these attributes and toggle selection

## 3. Implement Hash-Based Caching

### Update plantumlRenderer.ts

- Add hash computation function using crypto.createHash('sha256') on file content
- Modify `renderFile()` method:
- Read source file content
- Compute hash of content (first 8-16 chars of hex hash for filename)
- Check if cached SVG exists: `{inputBasename}.{hash}.svg` in outputDir
- If cached file exists and is readable, return cached SVG
- If not, proceed with normal rendering
- After rendering, rename/move output to `{inputBasename}.{hash}.svg`
- Clean up old cached files: when hash miss occurs, delete all `{inputBasename}.*.svg` files except the new one

### Update output path logic

- Change from `{inputBasename}.svg` to `{inputBasename}.{hash}.svg` (around line 262)
- Ensure hash is computed before checking cache
- Add cleanup function to remove old cached files matching `{inputBasename}.*.svg` pattern

## Files to modify:

- `ExtensionArchitecture.puml` - Remove deprecated methods, verify naming
- `src/previewProvider.ts` - Add edge selection handlers and state management
- `src/plantumlRenderer.ts` - Add hash-based caching logic