import * as vscode from 'vscode';
import { GraphvizPreviewProvider } from './previewProvider';
import * as child_process from 'child_process';
import * as path from 'path';

let mcpServerProcess: child_process.ChildProcess | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Graphviz Preview extension is now active');

    // Register custom editor provider
    const provider = new GraphvizPreviewProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
        'graphviz.preview',
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        }
    );
    context.subscriptions.push(registration);

    // Register command to open preview
    const openPreviewCommand = vscode.commands.registerCommand('graphviz.openPreview', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && (activeEditor.document.fileName.endsWith('.dot') || activeEditor.document.fileName.endsWith('.gv'))) {
            await vscode.commands.executeCommand('vscode.openWith', activeEditor.document.uri, 'graphviz.preview');
        } else {
            vscode.window.showWarningMessage('Please open a .dot or .gv file first');
        }
    });
    context.subscriptions.push(openPreviewCommand);

    // Note: MCP server is started by Cursor via the package.json configuration
    // The server runs as a separate process using the mcpServer.js entry point
    console.log('MCP server will be started by Cursor via package.json configuration');
}

export function deactivate() {
    if (mcpServerProcess) {
        mcpServerProcess.kill();
        mcpServerProcess = null;
    }
}

