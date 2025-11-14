import * as vscode from 'vscode';
import { PlantUMLRenderer } from './plantumlRenderer';
import { LineMapper, NodeMapping, EdgeMapping } from './lineMapper';
import * as path from 'path';
import * as fs from 'fs';

export class PlantUMLPreviewProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'plantuml.preview';

    constructor(private readonly context: vscode.ExtensionContext) {}

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
            webviewPanel.webview
        );
    }

    private getWebviewContent(
        svg: string, 
        entityMapping: NodeMapping, 
        edgeMapping: EdgeMapping,
        webview: vscode.Webview
    ): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlantUML Preview</title>
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
        .error {
            color: var(--vscode-errorForeground);
            padding: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        ${svg}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const entityMapping = ${JSON.stringify(entityMapping)};
        const edgeMapping = ${JSON.stringify(edgeMapping)};
        
        // Add click handlers to SVG elements
        document.addEventListener('DOMContentLoaded', () => {
            const svg = document.querySelector('svg');
            if (!svg) return;
            
            // Get all entities (nodes)
            const entities = [...svg.querySelectorAll('g.entity')].map(g => ({
                id: g.id,
                name: g.dataset.entity,     // from data-entity
                sourceLine: g.dataset.sourceLine ? parseInt(g.dataset.sourceLine) : null,
            }));
            
            // Get all links (edges)
            const links = [...svg.querySelectorAll('g.link')].map(g => ({
                id: g.id,
                from: g.dataset.entity1,    // data-entity-1
                to: g.dataset.entity2,      // data-entity-2
            }));
            
            // Click handler for entities
            svg.querySelectorAll('g.entity').forEach(g => {
                g.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const entityName = g.dataset.entity;
                    const sourceLine = g.dataset.sourceLine ? parseInt(g.dataset.sourceLine) : null;
                    
                    if (entityName) {
                        let line = sourceLine;
                        
                        // If no sourceLine in data attribute, look up in mapping
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
                    e.stopPropagation();
                    const from = g.dataset.entity1;
                    const to = g.dataset.entity2;
                    
                    if (from && to) {
                        // Look up edge in mapping
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
        });
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
