import * as vscode from 'vscode';
import { PlantUMLPreviewProvider } from './previewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('PlantUML Preview extension is now active');

    // Register custom editor provider
    const provider = new PlantUMLPreviewProvider(context);
    const registration = vscode.window.registerCustomEditorProvider(
        'plantuml.preview',
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
    const openPreviewCommand = vscode.commands.registerCommand('plantuml.openPreview', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.fileName.endsWith('.puml')) {
            await vscode.commands.executeCommand('vscode.openWith', activeEditor.document.uri, 'plantuml.preview');
        } else {
            vscode.window.showWarningMessage('Please open a .puml file first');
        }
    });
    context.subscriptions.push(openPreviewCommand);
}

export function deactivate() {
    // Cleanup if needed
}
