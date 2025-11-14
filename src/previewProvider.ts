import * as vscode from 'vscode';
import { PlantUMLRenderer } from './plantumlRenderer';
import { LineMapper, NodeMapping, EdgeMapping } from './lineMapper';
import * as path from 'path';
import * as fs from 'fs';

export class PlantUMLPreviewProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'plantuml.preview';

    constructor(private readonly context: vscode.ExtensionContext) { }

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new PlantUMLPreviewProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            PlantUMLPreviewProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
            }
        );
        return providerRegistration;
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        // Set initial content
        await this.updatePreview(document, webviewPanel);

        // Watch for document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.updatePreview(document, webviewPanel);
            }
        });

        // Watch for file system changes (only if we have a valid file path)
        let watcher: vscode.FileSystemWatcher | undefined;
        let changeFileSubscription: vscode.Disposable | undefined;

        try {
            watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
            changeFileSubscription = watcher.onDidChange(async () => {
                await this.updatePreview(document, webviewPanel);
            });
        } catch (error) {
            // If file system watcher creation fails (e.g., no workspace), continue without it
            console.warn('Could not create file system watcher:', error);
        }

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            if (changeFileSubscription) {
                changeFileSubscription.dispose();
            }
            if (watcher) {
                watcher.dispose();
            }
        });

        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'selectLine':
                    const line = message.line as number;
                    if (line > 0) {
                        const editor = await vscode.window.showTextDocument(document);
                        const position = new vscode.Position(line - 1, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(new vscode.Range(position, position));
                    }
                    break;
                case 'error':
                    vscode.window.showErrorMessage(`PlantUML Preview: ${message.message}`);
                    break;
            }
        });
    }

    private async updatePreview(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {
        // Render PlantUML to SVG
        const renderResult = await PlantUMLRenderer.renderFile(document.uri);

        // Get entity and edge mappings
        const entityMapping = await LineMapper.mapNodesToLines(document.uri);
        const edgeMapping = await LineMapper.mapEdgesToLines(document.uri);

        if (renderResult.error) {
            webviewPanel.webview.html = this.getErrorHtml(renderResult.error, webviewPanel.webview);
            return;
        }

        // Update webview content
        webviewPanel.webview.html = this.getWebviewContent(
            renderResult.svg,
            entityMapping,
            edgeMapping,
            document.getText(),
            webviewPanel.webview
        );
    }

    private getWebviewContent(
        svg: string,
        entityMapping: NodeMapping,
        edgeMapping: EdgeMapping,
        sourceCode: string,
        webview: vscode.Webview
    ): string {
        const escapedSource = this.escapeHtml(sourceCode);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlantUML Preview</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: hidden;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background-color: var(--vscode-titleBar-activeBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        .toolbar button {
            padding: 4px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            font-family: var(--vscode-font-family);
        }
        .toolbar button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .toolbar button:active {
            opacity: 0.8;
        }
        .toolbar .separator {
            width: 1px;
            height: 20px;
            background-color: var(--vscode-panel-border);
            margin: 0 4px;
        }
        .content-area {
            flex: 1;
            overflow: hidden;
            position: relative;
        }
        .preview-container {
            width: 100%;
            height: 100%;
            overflow: hidden;
            position: relative;
            background-color: var(--vscode-editor-background);
            display: none;
        }
        .preview-container.active {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .svg-wrapper {
            position: absolute;
            top: 0;
            left: 0;
            transform-origin: 0 0;
            transition: transform 0.1s ease-out;
        }
        .svg-wrapper svg {
            display: block;
        }
        .source-container {
            width: 100%;
            height: 100%;
            overflow: auto;
            padding: 20px;
            display: none;
            background-color: var(--vscode-editor-background);
        }
        .source-container.active {
            display: block;
        }
        .source-code {
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            line-height: 1.5;
            white-space: pre;
            color: var(--vscode-editor-foreground);
            margin: 0;
        }
        g.entity {
            cursor: pointer;
        }
        g.entity:hover {
            opacity: 0.8;
        }
        g.link {
            cursor: pointer;
        }
        g.link:hover {
            opacity: 0.8;
        }
        .panning {
            cursor: move;
        }
        .panning g.entity,
        .panning g.link {
            cursor: move;
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <button id="toggleView" title="Toggle between preview and source (Ctrl+T)">Toggle View</button>
        <div class="separator"></div>
        <button id="zoomIn" title="Zoom in">+</button>
        <button id="zoomOut" title="Zoom out">-</button>
        <button id="zoomReset" title="Fit to window">Fit</button>
        <button id="zoomActual" title="Actual size (100%)">1:1</button>
        <div class="separator"></div>
        <span id="zoomLevel" style="padding: 0 8px; font-size: 12px;">100%</span>
    </div>
    <div class="content-area">
        <div class="preview-container active" id="previewContainer">
            <div class="svg-wrapper" id="svgWrapper">
                ${svg}
            </div>
        </div>
        <div class="source-container" id="sourceContainer">
            <pre class="source-code" id="sourceCode">${escapedSource}</pre>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const entityMapping = ${JSON.stringify(entityMapping)};
        const edgeMapping = ${JSON.stringify(edgeMapping)};
        
        // View state
        let viewMode = 'preview'; // 'preview' or 'source'
        let zoom = 1.0;
        let panX = 0;
        let panY = 0;
        let isPanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let panStartPanX = 0;
        let panStartPanY = 0;
        
        const previewContainer = document.getElementById('previewContainer');
        const sourceContainer = document.getElementById('sourceContainer');
        const svgWrapper = document.getElementById('svgWrapper');
        const toggleViewBtn = document.getElementById('toggleView');
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');
        const zoomResetBtn = document.getElementById('zoomReset');
        const zoomActualBtn = document.getElementById('zoomActual');
        const zoomLevelSpan = document.getElementById('zoomLevel');
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            // Initialize to 1:1 centered
            initializeZoom();
            
            // Setup click handlers for entities and edges
            setupClickHandlers(svg);
            
            // Setup zoom controls
            zoomInBtn.addEventListener('click', () => zoomTo(zoom * 1.2));
            zoomOutBtn.addEventListener('click', () => zoomTo(zoom / 1.2));
            zoomResetBtn.addEventListener('click', fitToWindow);
            zoomActualBtn.addEventListener('click', () => centerAt1x1());
            
            // Setup toggle
            toggleViewBtn.addEventListener('click', toggleView);
            
            // Setup mouse wheel zoom (works with regular scroll or Ctrl/Cmd+scroll)
            previewContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                // Zoom rate: 5% change per scroll
                const delta = e.deltaY > 0 ? 0.95 : 1.05;
                const rect = previewContainer.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Apply zoom immediately
                zoomAtPoint(x, y, delta);
            }, { passive: false });
            
            // Setup panning
            previewContainer.addEventListener('mousedown', (e) => {
                if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                    isPanning = true;
                    panStartX = e.clientX;
                    panStartY = e.clientY;
                    panStartPanX = panX;
                    panStartPanY = panY;
                    previewContainer.classList.add('panning');
                    e.preventDefault();
                }
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isPanning) {
                    panX = panStartPanX + (e.clientX - panStartX);
                    panY = panStartPanY + (e.clientY - panStartY);
                    updateTransform();
                }
            });
            
            document.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    previewContainer.classList.remove('panning');
                }
            });
            
            // Keyboard shortcut for toggle (Ctrl+T / Cmd+T)
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey) {
                    e.preventDefault();
                    toggleView();
                }
            });
        });
        
        function initializeZoom() {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            const container = previewContainer;
            const containerRect = container.getBoundingClientRect();
            
            // Temporarily reset transform to get accurate SVG dimensions
            const savedTransform = svgWrapper.style.transform;
            svgWrapper.style.transform = 'translate(0, 0) scale(1)';
            
            // Force a reflow to ensure dimensions are accurate
            void svg.offsetHeight;
            
            // Get SVG dimensions
            const svgRect = svg.getBoundingClientRect();
            const svgWidth = svgRect.width;
            const svgHeight = svgRect.height;
            
            // Restore transform
            svgWrapper.style.transform = savedTransform;
            
            if (svgWidth === 0 || svgHeight === 0) {
                console.warn('Cannot initialize: SVG has zero dimensions');
                return;
            }
            
            // Set to 1:1 and center
            zoom = 1.0;
            panX = (containerRect.width - svgWidth) / 2;
            panY = (containerRect.height - svgHeight) / 2;
            updateTransform();
        }
        
        function centerAt1x1() {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            const container = previewContainer;
            const containerRect = container.getBoundingClientRect();
            
            // Temporarily reset transform to get accurate SVG dimensions
            const savedTransform = svgWrapper.style.transform;
            svgWrapper.style.transform = 'translate(0, 0) scale(1)';
            
            // Force a reflow to ensure dimensions are accurate
            void svg.offsetHeight;
            
            // Get SVG dimensions
            const svgRect = svg.getBoundingClientRect();
            const svgWidth = svgRect.width;
            const svgHeight = svgRect.height;
            
            // Restore transform
            svgWrapper.style.transform = savedTransform;
            
            if (svgWidth === 0 || svgHeight === 0) {
                console.warn('Cannot center: SVG has zero dimensions');
                return;
            }
            
            // Set to 1:1 and center
            zoom = 1.0;
            panX = (containerRect.width - svgWidth) / 2;
            panY = (containerRect.height - svgHeight) / 2;
            updateTransform();
        }
        
        function fitToWindow() {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            const container = previewContainer;
            const containerRect = container.getBoundingClientRect();
            
            // Temporarily reset transform to get accurate SVG dimensions
            const savedTransform = svgWrapper.style.transform;
            svgWrapper.style.transform = 'translate(0, 0) scale(1)';
            
            // Force a reflow to ensure dimensions are accurate
            void svg.offsetHeight;
            
            // Get SVG dimensions
            const svgRect = svg.getBoundingClientRect();
            const svgWidth = svgRect.width;
            const svgHeight = svgRect.height;
            
            // Restore transform
            svgWrapper.style.transform = savedTransform;
            
            if (svgWidth === 0 || svgHeight === 0) {
                console.warn('Cannot fit: SVG has zero dimensions');
                return;
            }
            
            const padding = 40;
            const scaleX = (containerRect.width - padding) / svgWidth;
            const scaleY = (containerRect.height - padding) / svgHeight;
            const newZoom = Math.min(scaleX, scaleY, 1.0);
            
            zoom = newZoom;
            // Center the SVG in the container
            panX = (containerRect.width - svgWidth * zoom) / 2;
            panY = (containerRect.height - svgHeight * zoom) / 2;
            updateTransform();
        }
        
        function zoomTo(newZoom) {
            zoom = Math.max(0.1, Math.min(5.0, newZoom));
            updateTransform();
        }
        
        function zoomAtPoint(x, y, factor) {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            // x, y are relative to the container (previewContainer)
            // We need to convert these to SVG local coordinates
            
            // Get the current SVG position in screen coordinates
            // The transform is: translate(panX, panY) scale(zoom)
            // So a point (svgX, svgY) in SVG coordinates becomes:
            // screenX = panX + svgX * zoom
            // screenY = panY + svgY * zoom
            
            // Reverse this to get SVG coordinates from screen coordinates:
            // svgX = (screenX - panX) / zoom
            // svgY = (screenY - panY) / zoom
            
            const svgX = (x - panX) / zoom;
            const svgY = (y - panY) / zoom;
            
            // Calculate new zoom
            const newZoom = Math.max(0.1, Math.min(5.0, zoom * factor));
            
            // Calculate new pan so the same SVG point stays under the cursor
            // screenX = newPanX + svgX * newZoom
            // newPanX = screenX - svgX * newZoom
            panX = x - svgX * newZoom;
            panY = y - svgY * newZoom;
            
            zoom = newZoom;
            updateTransform();
        }
        
        function updateTransform() {
            // Use transform-origin center for better centering behavior
            svgWrapper.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${zoom})\`;
            zoomLevelSpan.textContent = Math.round(zoom * 100) + '%';
        }
        
        function toggleView() {
            viewMode = viewMode === 'preview' ? 'source' : 'preview';
            
            if (viewMode === 'preview') {
                previewContainer.classList.add('active');
                sourceContainer.classList.remove('active');
                toggleViewBtn.textContent = 'Show Source';
            } else {
                previewContainer.classList.remove('active');
                sourceContainer.classList.add('active');
                toggleViewBtn.textContent = 'Show Preview';
            }
        }
        
        function setupClickHandlers(svg) {
            // Get all entities (nodes)
            const entities = [...svg.querySelectorAll('g.entity')].map(g => ({
                id: g.id,
                name: g.dataset.entity,
                sourceLine: g.dataset.sourceLine ? parseInt(g.dataset.sourceLine) : null,
            }));
            
            // Get all links (edges)
            const links = [...svg.querySelectorAll('g.link')].map(g => ({
                id: g.id,
                from: g.dataset.entity1,
                to: g.dataset.entity2,
            }));
            
            // Click handler for entities
            svg.querySelectorAll('g.entity').forEach(g => {
                g.addEventListener('click', (e) => {
                    if (isPanning) {
                        e.stopPropagation();
                        return;
                    }
                    e.stopPropagation();
                    const entityName = g.dataset.entity;
                    const sourceLine = g.dataset.sourceLine ? parseInt(g.dataset.sourceLine) : null;
                    
                    if (entityName) {
                        let line = sourceLine;
                        
                        if (!line && entityMapping[entityName]) {
                            line = entityMapping[entityName][0];
                        }
                        
                        if (line) {
                            vscode.postMessage({
                                type: 'selectLine',
                                line: line
                            });
                        }
                    }
                });
            });
            
            // Click handler for links (edges)
            svg.querySelectorAll('g.link').forEach(g => {
                g.addEventListener('click', (e) => {
                    if (isPanning) {
                        e.stopPropagation();
                        return;
                    }
                    e.stopPropagation();
                    const from = g.dataset.entity1;
                    const to = g.dataset.entity2;
                    
                    if (from && to) {
                        const edgeKey = from + '->' + to;
                        if (edgeMapping[edgeKey] && edgeMapping[edgeKey].length > 0) {
                            const line = edgeMapping[edgeKey][0];
                            vscode.postMessage({
                                type: 'selectLine',
                                line: line
                            });
                        }
                    }
                });
            });
        }
    </script>
</body>
</html>`;
    }

    private getErrorHtml(error: string, webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlantUML Preview - Error</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
        .error {
            color: var(--vscode-errorForeground);
            padding: 20px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="error">
        <h2>PlantUML Rendering Error</h2>
        <p>${this.escapeHtml(error)}</p>
        <p><strong>Tip:</strong> Make sure Java is installed and the PlantUML JAR file (plantuml-1.2025.10.jar) is available in your workspace root.</p>
    </div>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
