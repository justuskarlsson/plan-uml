import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const exec = promisify(child_process.exec);

export interface RenderResult {
    svg: string;
    error?: string;
}

export class PlantUMLRenderer {
    /**
     * Check if Java is available
     */
    static async checkJavaAvailable(): Promise<boolean> {
        try {
            await exec('java -version');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Find the PlantUML JAR file in the workspace
     */
    static async findJarFile(workspaceRoot?: string): Promise<string | null> {
        // Try workspace root first
        if (workspaceRoot) {
            const jarPath = path.join(workspaceRoot, 'plantuml-1.2025.10.jar');
            try {
                await fs.access(jarPath);
                return jarPath;
            } catch {
                // JAR not found in workspace root
            }
        }

        // Try current working directory
        const cwdJarPath = path.join(process.cwd(), 'plantuml-1.2025.10.jar');
        try {
            await fs.access(cwdJarPath);
            return cwdJarPath;
        } catch {
            // JAR not found in CWD
        }

        return null;
    }

    /**
     * Render .puml file to SVG using PlantUML JAR
     */
    static async renderFile(uri: vscode.Uri): Promise<RenderResult> {
        const javaAvailable = await this.checkJavaAvailable();
        
        if (!javaAvailable) {
            return {
                svg: '',
                error: 'Java is not available. Please install Java to use PlantUML.'
            };
        }

        // Get workspace root (handle case where there's no workspace)
        let workspaceRoot: string | undefined;
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            workspaceRoot = workspaceFolder?.uri.fsPath;
        } catch (error) {
            // No workspace available, continue with file directory
            console.warn('No workspace available:', error);
        }
        
        // Fallback to file's directory if no workspace
        if (!workspaceRoot) {
            workspaceRoot = path.dirname(uri.fsPath);
        }

        // Find JAR file
        const jarPath = await this.findJarFile(workspaceRoot);
        if (!jarPath) {
            return {
                svg: '',
                error: 'PlantUML JAR file (plantuml-1.2025.10.jar) not found. Please ensure it is in the workspace root.'
            };
        }

        try {
            const inputFile = uri.fsPath;
            const inputDir = path.dirname(inputFile);
            const inputBasename = path.basename(inputFile, '.puml');
            const outputDir = path.join(inputDir, 'out');

            // Ensure output directory exists
            try {
                await fs.mkdir(outputDir, { recursive: true });
            } catch (error: any) {
                // Directory might already exist, ignore error
            }

            // Execute PlantUML: java -jar plantuml-1.2025.10.jar arch.puml -tsvg -o out/
            const command = `java -jar "${jarPath}" "${inputFile}" -tsvg -o "${outputDir}"`;
            
            const { stdout, stderr } = await exec(command, {
                cwd: inputDir,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            // PlantUML outputs the SVG file to outputDir/inputBasename.svg
            const outputSvgPath = path.join(outputDir, `${inputBasename}.svg`);

            try {
                const svgContent = await fs.readFile(outputSvgPath, 'utf-8');
                
                // Check for errors in stderr (PlantUML may output warnings to stderr)
                if (stderr && !svgContent) {
                    return {
                        svg: '',
                        error: stderr
                    };
                }

                return {
                    svg: svgContent
                };
            } catch (readError: any) {
                // SVG file not found - PlantUML might have failed
                const errorMsg = stderr || stdout || readError.message || 'Failed to generate SVG file';
                return {
                    svg: '',
                    error: errorMsg
                };
            }
        } catch (error: any) {
            return {
                svg: '',
                error: error.message || 'Failed to render PlantUML file'
            };
        }
    }

    /**
     * Render .puml content to SVG (for future use if needed)
     */
    static async renderToSvg(pumlContent: string, outputDir: string): Promise<RenderResult> {
        const javaAvailable = await this.checkJavaAvailable();
        
        if (!javaAvailable) {
            return {
                svg: '',
                error: 'Java is not available. Please install Java to use PlantUML.'
            };
        }

        // This would require writing content to a temp file first
        // For now, we'll use renderFile which works with actual files
        return {
            svg: '',
            error: 'Direct content rendering not implemented. Use renderFile() instead.'
        };
    }
}

