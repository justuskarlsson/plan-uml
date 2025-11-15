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
                case 'copyJourneysToClipboard':
                    await vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('Journeys copied to clipboard');
                    break;
                case 'reload':
                    await this.updatePreview(document, webviewPanel);
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
            margin-right: 300px; /* Account for journey sidebar */
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
        /* Journey system styles */
        .journey-sidebar {
            position: fixed;
            right: 0;
            top: 41px; /* Below toolbar */
            bottom: 0;
            width: 300px;
            background-color: var(--vscode-sideBar-background);
            border-left: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            z-index: 1000;
            overflow: hidden;
        }
        .journey-header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: bold;
            font-size: 13px;
            background-color: var(--vscode-sideBarTitle-background);
            color: var(--vscode-sideBarTitle-foreground);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .journey-header-title {
            flex: 1;
        }
        .journey-header-buttons {
            display: flex;
            gap: 4px;
        }
        .journey-header-button {
            padding: 2px 8px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
            font-family: var(--vscode-font-family);
        }
        .journey-header-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .journey-header-button:active {
            opacity: 0.8;
        }
        .journey-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }
        .journey-item {
            display: flex;
            align-items: flex-start;
            padding: 8px;
            margin-bottom: 4px;
            background-color: var(--vscode-list-activeSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            font-size: 12px;
            word-wrap: break-word;
        }
        .journey-text {
            flex: 1;
            padding-right: 8px;
            color: var(--vscode-list-activeSelectionForeground);
        }
        .journey-delete {
            flex-shrink: 0;
            width: 20px;
            height: 20px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 2px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            line-height: 1;
            padding: 0;
        }
        .journey-delete:hover {
            background-color: #ff4444;
            color: white;
        }
        .input-container {
            position: fixed;
            top: 41px; /* Below toolbar */
            right: 300px;
            width: 300px;
            padding: 12px;
            background-color: var(--vscode-input-background);
            border-left: 1px solid var(--vscode-panel-border);
            border-bottom: 1px solid var(--vscode-panel-border);
            z-index: 1001;
            display: none;
        }
        .input-container.visible {
            display: block;
        }
        .input-container textarea {
            width: 100%;
            padding: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: 12px;
            resize: vertical;
        }
        .input-container textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        g.entity.selected {
            opacity: 0.8;
            filter: drop-shadow(0 0 8px var(--vscode-focusBorder)) drop-shadow(0 0 4px var(--vscode-focusBorder));
            stroke: var(--vscode-focusBorder);
            stroke-width: 3px;
        }
        g.entity.selected * {
            stroke: var(--vscode-focusBorder);
            stroke-width: 2px;
        }
        .rectangle-selection {
            position: absolute;
            border: 2px dashed var(--vscode-focusBorder);
            background-color: rgba(0, 123, 255, 0.1);
            pointer-events: none;
            z-index: 999;
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
        <span id="selectionCounter" style="padding: 0 8px; font-size: 12px; display: none;"></span>
        <button id="reloadButton" title="Reload SVG">Reload</button>
    </div>
    <div class="content-area">
        <div class="preview-container active" id="previewContainer">
            <div class="svg-wrapper" id="svgWrapper">
                ${svg}
            </div>
            <div class="rectangle-selection" id="rectangleSelection" style="display: none;"></div>
        </div>
        <div class="source-container" id="sourceContainer">
            <pre class="source-code" id="sourceCode">${escapedSource}</pre>
        </div>
    </div>
    <div class="input-container" id="inputContainer">
        <textarea id="journeyInput" placeholder="Enter rename/comment text..." rows="3"></textarea>
    </div>
    <div class="journey-sidebar" id="journeySidebar">
        <div class="journey-header">
            <span class="journey-header-title">Journeys (<span id="journeyCount">0</span>)</span>
            <div class="journey-header-buttons">
                <button class="journey-header-button" id="clipboardButton">clipboard</button>
                <button class="journey-header-button" id="resetButton">reset</button>
            </div>
        </div>
        <div class="journey-list" id="journeyList"></div>
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
        
        // Journey system elements
        const inputContainer = document.getElementById('inputContainer');
        const journeyInput = document.getElementById('journeyInput');
        const journeySidebar = document.getElementById('journeySidebar');
        const journeyList = document.getElementById('journeyList');
        const journeyCount = document.getElementById('journeyCount');
        const clipboardButton = document.getElementById('clipboardButton');
        const resetButton = document.getElementById('resetButton');
        const selectionCounter = document.getElementById('selectionCounter');
        const reloadButton = document.getElementById('reloadButton');
        const rectangleSelection = document.getElementById('rectangleSelection');
        
        // Selection-based state management
        const selectionState = {
            selectedNodes: [], // Array of {name, element}
            isCreatingNode: false,
            isRectangleSelecting: false,
            rectangleStart: {x: 0, y: 0},
            rectangleCurrent: {x: 0, y: 0},
            journeys: [],
            
            toggleNodeSelection(nodeName, nodeElement) {
                const index = this.selectedNodes.findIndex(n => n.name === nodeName);
                if (index >= 0) {
                    // Deselect
                    this.unhighlightNode(this.selectedNodes[index].element);
                    this.selectedNodes.splice(index, 1);
                } else {
                    // Select
                    this.highlightNode(nodeElement);
                    this.selectedNodes.push({name: nodeName, element: nodeElement});
                }
                this.updateSelectionCounter();
            },
            
            clearSelection() {
                this.selectedNodes.forEach(node => {
                    this.unhighlightNode(node.element);
                });
                this.selectedNodes = [];
                this.updateSelectionCounter();
            },
            
            selectNodesInRectangle(rect, svg) {
                // Get all entity nodes
                const entities = svg.querySelectorAll('g.entity');
                const selected = [];
                
                entities.forEach(entity => {
                    const bbox = entity.getBBox();
                    // Check if node bounding box intersects with selection rectangle
                    if (this.rectanglesIntersect(rect, {
                        x: bbox.x,
                        y: bbox.y,
                        width: bbox.width,
                        height: bbox.height
                    })) {
                        const entityName = entity.dataset.entity;
                        if (entityName) {
                            selected.push({name: entityName, element: entity});
                        }
                    }
                });
                
                // Replace selection with rectangle selection
                this.clearSelection();
                selected.forEach(node => {
                    this.highlightNode(node.element);
                    this.selectedNodes.push(node);
                });
                this.updateSelectionCounter();
            },
            
            rectanglesIntersect(rect1, rect2) {
                return !(rect2.x > rect1.x + rect1.width ||
                        rect2.x + rect2.width < rect1.x ||
                        rect2.y > rect1.y + rect1.height ||
                        rect2.y + rect2.height < rect1.y);
            },
            
            highlightNode(element) {
                element.classList.add('selected');
            },
            
            unhighlightNode(element) {
                element.classList.remove('selected');
            },
            
            updateSelectionCounter() {
                const count = this.selectedNodes.length;
                if (count > 0) {
                    selectionCounter.textContent = \`\${count} selected\`;
                    selectionCounter.style.display = 'inline';
                } else {
                    selectionCounter.style.display = 'none';
                }
            },
            
            reset() {
                this.clearSelection();
                this.isCreatingNode = false;
                this.isRectangleSelecting = false;
                inputContainer.classList.remove('visible');
                journeyInput.value = '';
            },
            
            addJourney(journey) {
                this.journeys.push(journey);
                this.updateJourneyList();
            },
            
            removeJourney(index) {
                this.journeys.splice(index, 1);
                this.updateJourneyList();
            },
            
            updateJourneyList() {
                journeyList.innerHTML = '';
                journeyCount.textContent = this.journeys.length;
                
                this.journeys.forEach((journey, index) => {
                    const item = document.createElement('div');
                    item.className = 'journey-item';
                    
                    const text = document.createElement('div');
                    text.className = 'journey-text';
                    text.textContent = journey;
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'journey-delete';
                    deleteBtn.textContent = '×';
                    deleteBtn.title = 'Delete journey';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectionState.removeJourney(index);
                    });
                    
                    item.appendChild(text);
                    item.appendChild(deleteBtn);
                    journeyList.appendChild(item);
                });
            },
            
            copyToClipboard() {
                if (this.journeys.length === 0) {
                    return;
                }
                const text = this.journeys.join('\\n');
                vscode.postMessage({ type: 'copyJourneysToClipboard', text });
            }
        };
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            // Initialize to 1:1 centered
            initializeZoom();
            
            // Setup click handlers for entities (toggle selection)
            setupClickHandlers(svg);
            
            // Setup clipboard button
            clipboardButton.addEventListener('click', () => {
                selectionState.copyToClipboard();
            });
            
            // Setup reset button
            resetButton.addEventListener('click', () => {
                selectionState.journeys = [];
                selectionState.updateJourneyList();
            });
            
            // Setup reload button
            reloadButton.addEventListener('click', () => {
                vscode.postMessage({ type: 'reload' });
            });
            
            // Setup CTRL+CLICK for creating node
            previewContainer.addEventListener('click', (e) => {
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !isPanning) {
                    e.preventDefault();
                    e.stopPropagation();
                    selectionState.isCreatingNode = true;
                    inputContainer.classList.add('visible');
                    journeyInput.value = '';
                    journeyInput.focus();
                }
            });
            
            // Setup Shift+Drag for rectangle selection
            let rectangleStartX = 0;
            let rectangleStartY = 0;
            let isRectangleDragging = false;
            
            previewContainer.addEventListener('mousedown', (e) => {
                if (e.shiftKey && e.button === 0 && !e.ctrlKey && !e.metaKey) {
                    isRectangleDragging = true;
                    selectionState.isRectangleSelecting = true;
                    const rect = previewContainer.getBoundingClientRect();
                    rectangleStartX = e.clientX - rect.left;
                    rectangleStartY = e.clientY - rect.top;
                    selectionState.rectangleStart = {x: rectangleStartX, y: rectangleStartY};
                    rectangleSelection.style.display = 'block';
                    rectangleSelection.style.left = rectangleStartX + 'px';
                    rectangleSelection.style.top = rectangleStartY + 'px';
                    rectangleSelection.style.width = '0px';
                    rectangleSelection.style.height = '0px';
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isRectangleDragging) {
                    const rect = previewContainer.getBoundingClientRect();
                    const currentX = e.clientX - rect.left;
                    const currentY = e.clientY - rect.top;
                    
                    const left = Math.min(rectangleStartX, currentX);
                    const top = Math.min(rectangleStartY, currentY);
                    const width = Math.abs(currentX - rectangleStartX);
                    const height = Math.abs(currentY - rectangleStartY);
                    
                    rectangleSelection.style.left = left + 'px';
                    rectangleSelection.style.top = top + 'px';
                    rectangleSelection.style.width = width + 'px';
                    rectangleSelection.style.height = height + 'px';
                }
            });
            
            document.addEventListener('mouseup', (e) => {
                if (isRectangleDragging) {
                    isRectangleDragging = false;
                    const rect = previewContainer.getBoundingClientRect();
                    const endX = e.clientX - rect.left;
                    const endY = e.clientY - rect.top;
                    
                    const selectionRect = {
                        x: Math.min(rectangleStartX, endX),
                        y: Math.min(rectangleStartY, endY),
                        width: Math.abs(endX - rectangleStartX),
                        height: Math.abs(endY - rectangleStartY)
                    };
                    
                    // Convert screen coordinates to SVG coordinates
                    // Account for pan and zoom transform
                    const svgX = (selectionRect.x - panX) / zoom;
                    const svgY = (selectionRect.y - panY) / zoom;
                    const svgWidth = selectionRect.width / zoom;
                    const svgHeight = selectionRect.height / zoom;
                    
                    selectionState.selectNodesInRectangle({
                        x: svgX,
                        y: svgY,
                        width: svgWidth,
                        height: svgHeight
                    }, svg);
                    
                    rectangleSelection.style.display = 'none';
                    selectionState.isRectangleSelecting = false;
                }
            });
            
            // Setup input field handlers
            journeyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const text = journeyInput.value.trim();
                    
                    if (selectionState.isCreatingNode) {
                        // Create node journey
                        if (text) {
                            selectionState.addJourney(\`<Create Node>: \${text}\`);
                        }
                        selectionState.isCreatingNode = false;
                        selectionState.reset();
                    } else if (selectionState.selectedNodes.length > 0) {
                        // Comment/action on selected nodes
                        if (text) {
                            const nodeNames = selectionState.selectedNodes.map(n => n.name).join(', ');
                            selectionState.addJourney(\`\${text}\\n(\${nodeNames})\`);
                        }
                        selectionState.reset();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    selectionState.reset();
                }
                // Shift+Enter allows newline (default behavior)
            });
            
            // Show input when user starts typing while nodes are selected
            document.addEventListener('keydown', (e) => {
                if (selectionState.selectedNodes.length > 0 && !selectionState.isCreatingNode && 
                    !e.ctrlKey && !e.metaKey && !e.altKey) {
                    // Show input if it's a printable character
                    const isPrintable = e.key.length === 1 && 
                                       e.key !== 'Escape' && 
                                       e.key !== 'Enter' &&
                                       !e.key.startsWith('Arrow') &&
                                       !e.key.startsWith('F') &&
                                       e.key !== 'Tab';
                    
                    if (isPrintable) {
                        if (!inputContainer.classList.contains('visible')) {
                            inputContainer.classList.add('visible');
                            journeyInput.focus();
                        }
                    }
                }
            });
            
            // Setup ESC key handler for canceling
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    // Only cancel if input is not focused (to allow ESC in input)
                    if (document.activeElement !== journeyInput) {
                        selectionState.reset();
                    }
                }
            });
            
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
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
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
            // Click handler for entities (nodes) - toggle selection
            svg.querySelectorAll('g.entity').forEach(g => {
                g.addEventListener('click', (e) => {
                    if (isPanning) {
                        return;
                    }
                    
                    // Handle CTRL+CLICK for creating node
                    if (e.ctrlKey || e.metaKey) {
                        e.stopPropagation();
                        selectionState.isCreatingNode = true;
                        inputContainer.classList.add('visible');
                        journeyInput.value = '';
                        journeyInput.focus();
                        return;
                    }
                    
                    // Don't toggle if shift key (used for rectangle selection)
                    if (e.shiftKey) {
                        return;
                    }
                    
                    e.stopPropagation();
                    const entityName = g.dataset.entity;
                    
                    if (entityName) {
                        selectionState.toggleNodeSelection(entityName, g);
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
