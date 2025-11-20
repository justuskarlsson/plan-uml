import * as vscode from 'vscode';
import { PlantUMLRenderer } from './plantumlRenderer';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

export class PlantUMLPreviewProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'plantuml.preview';
    private webviewPanels = new Map<vscode.WebviewPanel, vscode.TextDocument>();
    private templateCache: string | null = null;
    private static instance: PlantUMLPreviewProvider | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {
        PlantUMLPreviewProvider.instance = this;
    }

    public static getInstance(): PlantUMLPreviewProvider | null {
        return PlantUMLPreviewProvider.instance;
    }

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
        // Track webview panel with its document
        this.webviewPanels.set(webviewPanel, document);

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
            this.webviewPanels.delete(webviewPanel);
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
                case 'closePreview':
                    webviewPanel.dispose();
                    break;
            }
        });
    }

    private async updatePreview(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {
        // Render PlantUML to SVG (pass extension context)
        const renderResult = await PlantUMLRenderer.renderFile(document.uri, this.context);

        if (renderResult.error) {
            webviewPanel.webview.html = this.getErrorHtml(renderResult.error, webviewPanel.webview);
            return;
        }

        // Update webview content
        webviewPanel.webview.html = await this.getWebviewContent(
            renderResult.svg,
            document.getText(),
            webviewPanel.webview
        );
    }

    /**
     * Load webview template from file
     */
    private async loadWebviewTemplate(): Promise<string> {
        if (this.templateCache) {
            return this.templateCache;
        }

        const templatePath = path.join(this.context.extensionPath, 'media', 'webviewTemplate.html');
        try {
            const template = await fsPromises.readFile(templatePath, 'utf-8');
            this.templateCache = template;
            return template;
        } catch (error) {
            console.error('[PreviewProvider] Failed to load webview template:', error);
            throw new Error(`Failed to load webview template: ${error}`);
        }
    }

    /**
     * Replace tokens in template with actual values
     */
    private replaceTemplateTokens(
        template: string,
        svg: string,
        sourceCode: string
    ): string {
        const escapedSource = this.escapeHtml(sourceCode);
        return template
            .replace(/\$\$\$___SVG___\$\$\$/g, svg)
            .replace(/\$\$\$___SOURCE_CODE___\$\$\$/g, escapedSource);
    }

    private async getWebviewContent(
        svg: string,
        sourceCode: string,
        webview: vscode.Webview
    ): Promise<string> {
        const template = await this.loadWebviewTemplate();
        return this.replaceTemplateTokens(template, svg, sourceCode);
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

    /**
     * Close all open preview webviews
     */
    public closeAllPreviews(): number {
        const count = this.webviewPanels.size;
        for (const [panel] of this.webviewPanels) {
            panel.dispose();
        }
        this.webviewPanels.clear();
        return count;
    }

    /**
     * Reload all open preview webviews
     */
    public async reloadAllPreviews(): Promise<number> {
        const panels = Array.from(this.webviewPanels.entries());
        let reloaded = 0;

        for (const [panel, document] of panels) {
            if (panel.visible) {
                try {
                    await this.updatePreview(document, panel);
                    reloaded++;
                } catch (error) {
                    console.error('[PreviewProvider] Failed to reload preview:', error);
                }
            }
        }

        return reloaded;
    }
}
