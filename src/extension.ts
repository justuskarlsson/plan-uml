import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PlantUMLPreviewProvider } from './previewProvider';
import { PlantUMLRenderer } from './plantumlRenderer';

export async function activate(context: vscode.ExtensionContext) {
    console.log('PlantUML Preview extension is now active');

    // Download PlantUML JAR file if it doesn't exist
    if (context.globalStorageUri) {
        const globalStoragePath = context.globalStorageUri.fsPath;
        const jarPath = path.join(globalStoragePath, 'plantuml-1.2025.10.jar');
        
        try {
            // Check if jar already exists
            await fs.access(jarPath);
            console.log('[Extension] PlantUML JAR file already exists in global storage');
        } catch {
            // Jar doesn't exist, download it
            console.log('[Extension] PlantUML JAR file not found, downloading...');
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading PlantUML JAR file',
                cancellable: false
            };
            
            try {
                await vscode.window.withProgress(progressOptions, async () => {
                    // Ensure directory exists
                    await fs.mkdir(globalStoragePath, { recursive: true });
                    // Download the jar file
                    await PlantUMLRenderer.downloadJarFile(
                        'https://github.com/justuskarlsson/plan-uml/releases/download/plantuml-1.2025.10/plantuml-1.2025.10.jar',
                        jarPath
                    );
                    console.log('[Extension] PlantUML JAR file downloaded successfully');
                });
                vscode.window.showInformationMessage('PlantUML JAR file downloaded successfully');
            } catch (error: any) {
                console.error('[Extension] Failed to download PlantUML JAR file:', error);
                vscode.window.showErrorMessage(
                    `Failed to download PlantUML JAR file: ${error.message}. The extension may not work properly.`
                );
            }
        }
    }

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
