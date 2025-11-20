import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PlantUMLPreviewProvider } from './previewProvider';
import { PlantUMLRenderer } from './plantumlRenderer';

// Export provider instance for commands
export { PlantUMLPreviewProvider };

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

    // Register command to close all previews
    const closePreviewCommand = vscode.commands.registerCommand('plantuml.closePreview', () => {
        const provider = PlantUMLPreviewProvider.getInstance();
        if (provider) {
            const count = provider.closeAllPreviews();
            if (count > 0) {
                vscode.window.showInformationMessage(`Closed ${count} preview${count !== 1 ? 's' : ''}`);
            } else {
                vscode.window.showInformationMessage('No previews are currently open');
            }
        } else {
            vscode.window.showWarningMessage('Preview provider not available');
        }
    });
    context.subscriptions.push(closePreviewCommand);

    // Register command to reload all webviews
    const reloadWebviewsCommand = vscode.commands.registerCommand('plantuml.reloadWebviews', async () => {
        const provider = PlantUMLPreviewProvider.getInstance();
        if (provider) {
            const count = await provider.reloadAllPreviews();
            if (count > 0) {
                vscode.window.showInformationMessage(`Reloaded ${count} preview${count !== 1 ? 's' : ''}`);
            } else {
                vscode.window.showInformationMessage('No active previews to reload');
            }
        } else {
            vscode.window.showWarningMessage('Preview provider not available');
        }
    });
    context.subscriptions.push(reloadWebviewsCommand);

    // Register command to write cursor rules to workspace
    const writeCursorRulesCommand = vscode.commands.registerCommand('plantuml.writeCursorRules', async () => {
        try {
            // Get the cursor rules file from extension resources
            const rulesUri = vscode.Uri.joinPath(context.extensionUri, 'resources', 'plan-uml.mdc');

            // Read the file content
            const rulesContent = await vscode.workspace.fs.readFile(rulesUri);
            const rulesText = Buffer.from(rulesContent).toString('utf-8');

            // Get workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

            // Try to write the file if workspace folder exists
            if (workspaceFolder) {
                // Create target path: .cursor/rules/plan-uml.mdc
                const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, '.cursor', 'rules', 'plan-uml.mdc');

                // Try to write the file
                try {
                    // Ensure .cursor/rules directory exists
                    const rulesDirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.cursor', 'rules');
                    try {
                        await vscode.workspace.fs.createDirectory(rulesDirUri);
                    } catch (error: any) {
                        // Directory might already exist, ignore
                        if (error.code !== 'EEXIST' && error.code !== 'FileExists') {
                            throw error;
                        }
                    }

                    // Write the file
                    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(rulesText, 'utf-8'));
                    vscode.window.showInformationMessage('Cursor rules written to .cursor/rules/plan-uml.mdc');
                    return;
                } catch (writeError: any) {
                    // If we can't write, fall through to opening in editor
                    console.log('[Extension] Could not write cursor rules file:', writeError);
                }
            }

            // Fallback: open the file in the editor (no workspace or write failed)
            const doc = await vscode.workspace.openTextDocument({
                content: rulesText,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
            if (!workspaceFolder) {
                vscode.window.showInformationMessage(
                    'No workspace folder found. File opened in editor - please copy it manually to .cursor/rules/plan-uml.mdc in your workspace',
                    { modal: false }
                );
            } else {
                vscode.window.showInformationMessage(
                    'Could not write to .cursor/rules/plan-uml.mdc. File opened in editor - please copy it manually to .cursor/rules/plan-uml.mdc',
                    { modal: false }
                );
            }
        } catch (error: any) {
            console.error('[Extension] Failed to write cursor rules:', error);
            vscode.window.showErrorMessage(`Failed to write cursor rules: ${error.message}`);
        }
    });
    context.subscriptions.push(writeCursorRulesCommand);
}

export function deactivate() {
    // Cleanup if needed
}
