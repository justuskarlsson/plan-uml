import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

export interface RenderResult {
    svg: string;
    error?: string;
}

export class GraphvizRenderer {
    /**
     * Check if Graphviz dot command is available
     */
    static async checkDotAvailable(): Promise<boolean> {
        try {
            await exec('dot -V');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Render .dot content to SVG using Graphviz dot command
     */
    static async renderToSvg(dotContent: string): Promise<RenderResult> {
        const dotAvailable = await this.checkDotAvailable();
        
        if (!dotAvailable) {
            return {
                svg: '',
                error: 'Graphviz dot command not found. Please install Graphviz (https://graphviz.org/download/)'
            };
        }

        try {
            // Use dot command to render to SVG
            const { stdout, stderr } = await exec('dot -Tsvg', {
                input: dotContent,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            if (stderr && !stdout) {
                return {
                    svg: '',
                    error: stderr
                };
            }

            return {
                svg: stdout
            };
        } catch (error: any) {
            return {
                svg: '',
                error: error.message || 'Failed to render Graphviz file'
            };
        }
    }

    /**
     * Render .dot file to SVG
     */
    static async renderFile(uri: vscode.Uri): Promise<RenderResult> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const content = document.getText();
            return await this.renderToSvg(content);
        } catch (error: any) {
            return {
                svg: '',
                error: error.message || 'Failed to read file'
            };
        }
    }
}

