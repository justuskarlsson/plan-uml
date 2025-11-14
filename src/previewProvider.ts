import * as vscode from 'vscode';
import { GraphvizRenderer } from './graphvizRenderer';
import { LineMapper, NodeMapping } from './lineMapper';
import * as path from 'path';
import * as fs from 'fs';

export class GraphvizPreviewProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'graphviz.preview';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new GraphvizPreviewProvider(context);
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            GraphvizPreviewProvider.viewType,
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

        // Watch for file system changes
        const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
        const changeFileSubscription = watcher.onDidChange(async () => {
            await this.updatePreview(document, webviewPanel);
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            changeFileSubscription.dispose();
            watcher.dispose();
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
                    vscode.window.showErrorMessage(`Graphviz Preview: ${message.message}`);
                    break;
            }
        });
    }

    private async updatePreview(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {
        // Render Graphviz to SVG
        const renderResult = await GraphvizRenderer.renderFile(document.uri);
        
        // Get node mappings
        const nodeMapping = await LineMapper.mapNodesToLines(document.uri);

        if (renderResult.error) {
            webviewPanel.webview.html = this.getErrorHtml(renderResult.error, webviewPanel.webview);
            return;
        }

        // Update webview content
        webviewPanel.webview.html = this.getWebviewContent(
            renderResult.svg,
            nodeMapping,
            webviewPanel.webview
        );
    }

    private getWebviewContent(svg: string, nodeMapping: NodeMapping, webview: vscode.Webview): string {
        // Inject node mapping into SVG for click handling
        // We'll enhance the SVG with data attributes for node IDs
        let enhancedSvg = this.enhanceSvgWithNodeIds(svg, nodeMapping);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Graphviz Preview</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            overflow: auto;
        }
        .container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        svg {
            max-width: 100%;
            height: auto;
            cursor: pointer;
        }
        .node:hover {
            opacity: 0.8;
        }
        .error {
            color: var(--vscode-errorForeground);
            padding: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        ${enhancedSvg}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const nodeMapping = ${JSON.stringify(nodeMapping)};
        
        // Add click handlers to SVG elements
        document.addEventListener('DOMContentLoaded', () => {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            // Find all node elements (g elements with class containing 'node')
            const nodeElements = svg.querySelectorAll('g[class*="node"], g[id^="node_"]');
            
            nodeElements.forEach(element => {
                element.style.cursor = 'pointer';
                element.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nodeId = extractNodeId(element);
                    if (nodeId && nodeMapping[nodeId]) {
                        const line = nodeMapping[nodeId][0];
                        vscode.postMessage({
                            type: 'selectLine',
                            line: line
                        });
                    }
                });
            });
            
            // Also handle clicks on text and other child elements
            const textElements = svg.querySelectorAll('text');
            textElements.forEach(text => {
                text.style.cursor = 'pointer';
                text.addEventListener('click', (e) => {
                    e.stopPropagation();
                    let parent = text.parentElement;
                    while (parent && parent !== svg) {
                        const nodeId = extractNodeId(parent);
                        if (nodeId && nodeMapping[nodeId]) {
                            const line = nodeMapping[nodeId][0];
                            vscode.postMessage({
                                type: 'selectLine',
                                line: line
                            });
                            return;
                        }
                        parent = parent.parentElement;
                    }
                });
            });
        });
        
        function extractNodeId(element) {
            // Try ID first
            const id = element.getAttribute('id');
            if (id) {
                // Graphviz format: node_<nodeId> or cluster_<nodeId>
                const match = id.match(/^(?:node|cluster)_(.+)$/);
                if (match) {
                    return match[1];
                }
                return id;
            }
            
            // Try data attribute
            return element.getAttribute('data-node-id');
        }
    </script>
</body>
</html>`;
    }

    private enhanceSvgWithNodeIds(svg: string, nodeMapping: NodeMapping): string {
        // Graphviz SVG typically has structure like:
        // <g id="node1" class="node">
        // We need to extract the node ID from the title or label
        // For now, we'll rely on the ID pattern matching in the JavaScript
        
        // Try to add data attributes to help with mapping
        // This is a best-effort enhancement
        let enhanced = svg;
        
        // Find all node groups and try to extract node IDs
        const nodeIdPattern = /<g\s+id="(node\d+)"[^>]*class="node"[^>]*>/g;
        enhanced = enhanced.replace(nodeIdPattern, (match, nodeId) => {
            // Try to find the actual node name from the title or label
            // This is approximate - the JavaScript will handle the actual mapping
            return match.replace('>', ` data-node-id="${nodeId}">`);
        });
        
        return enhanced;
    }

    private getErrorHtml(error: string, webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Graphviz Preview - Error</title>
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
        <h2>Graphviz Rendering Error</h2>
        <p>${this.escapeHtml(error)}</p>
        <p><strong>Tip:</strong> Make sure Graphviz is installed and the 'dot' command is available in your PATH.</p>
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

