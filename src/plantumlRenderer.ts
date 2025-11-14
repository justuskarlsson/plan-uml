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
        console.log('[PlantUML Renderer] Finding JAR file, workspace root:', workspaceRoot);
        
        // Try workspace root first
        if (workspaceRoot) {
            const jarPath = path.join(workspaceRoot, 'plantuml-1.2025.10.jar');
            console.log('[PlantUML Renderer] Checking workspace root for JAR:', jarPath);
            try {
                await fs.access(jarPath);
                console.log('[PlantUML Renderer] JAR found in workspace root');
                return jarPath;
            } catch (error) {
                console.log('[PlantUML Renderer] JAR not found in workspace root');
            }
        }

        // Try current working directory
        const cwdJarPath = path.join(process.cwd(), 'plantuml-1.2025.10.jar');
        console.log('[PlantUML Renderer] Checking CWD for JAR:', cwdJarPath);
        try {
            await fs.access(cwdJarPath);
            console.log('[PlantUML Renderer] JAR found in CWD');
            return cwdJarPath;
        } catch (error) {
            console.log('[PlantUML Renderer] JAR not found in CWD');
        }

        console.log('[PlantUML Renderer] JAR file not found in any location');
        return null;
    }

    /**
     * Render .puml file to SVG using PlantUML JAR
     */
    static async renderFile(uri: vscode.Uri): Promise<RenderResult> {
        console.log('[PlantUML Renderer] Starting render for:', uri.fsPath);
        
        console.log('[PlantUML Renderer] Step 1: Checking Java availability...');
        const javaAvailable = await this.checkJavaAvailable();
        console.log('[PlantUML Renderer] Java available:', javaAvailable);
        
        if (!javaAvailable) {
            console.error('[PlantUML Renderer] Java is not available');
            return {
                svg: '',
                error: 'Java is not available. Please install Java to use PlantUML.'
            };
        }

        console.log('[PlantUML Renderer] Step 2: Getting workspace root...');
        // Get workspace root (handle case where there's no workspace)
        let workspaceRoot: string | undefined;
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            workspaceRoot = workspaceFolder?.uri.fsPath;
            console.log('[PlantUML Renderer] Workspace folder:', workspaceRoot || 'none');
        } catch (error) {
            // No workspace available, continue with file directory
            console.warn('[PlantUML Renderer] No workspace available:', error);
        }
        
        // Fallback to file's directory if no workspace
        if (!workspaceRoot) {
            workspaceRoot = path.dirname(uri.fsPath);
            console.log('[PlantUML Renderer] Using file directory as workspace root:', workspaceRoot);
        }

        console.log('[PlantUML Renderer] Step 3: Finding JAR file...');
        // Find JAR file
        const jarPath = await this.findJarFile(workspaceRoot);
        console.log('[PlantUML Renderer] JAR file path:', jarPath || 'not found');
        
        if (!jarPath) {
            console.error('[PlantUML Renderer] JAR file not found in workspace root:', workspaceRoot);
            return {
                svg: '',
                error: 'PlantUML JAR file (plantuml-1.2025.10.jar) not found. Please ensure it is in the workspace root.'
            };
        }

        try {
            console.log('[PlantUML Renderer] Step 4: Preparing file paths...');
            const inputFile = uri.fsPath;
            const inputDir = path.dirname(inputFile);
            const inputBasename = path.basename(inputFile, '.puml');
            const outputDir = path.join(inputDir, 'out');
            
            console.log('[PlantUML Renderer] Input file:', inputFile);
            console.log('[PlantUML Renderer] Input directory:', inputDir);
            console.log('[PlantUML Renderer] Input basename:', inputBasename);
            console.log('[PlantUML Renderer] Output directory:', outputDir);

            console.log('[PlantUML Renderer] Step 5: Creating output directory...');
            // Ensure output directory exists
            try {
                await fs.mkdir(outputDir, { recursive: true });
                console.log('[PlantUML Renderer] Output directory created/verified');
            } catch (error: any) {
                // Directory might already exist, ignore error
                console.log('[PlantUML Renderer] Output directory already exists or error:', error.message);
            }

            console.log('[PlantUML Renderer] Step 6: Building command...');
            // Execute PlantUML: java -jar plantuml-1.2025.10.jar arch.puml -tsvg -o out/
            // Use relative path for input file when running from inputDir
            const inputBasenameWithExt = path.basename(inputFile);
            // Try -tsvg -o format first (standard PlantUML), fallback to -f svg --output-dir if needed
            const command = `java -jar "${jarPath}" "${inputBasenameWithExt}" -tsvg -o "${outputDir}"`;
            console.log('[PlantUML Renderer] Command:', command);
            console.log('[PlantUML Renderer] Working directory:', inputDir);
            
            let stdout = '';
            let stderr = '';
            
            console.log('[PlantUML Renderer] Step 7: Executing PlantUML command...');
            try {
                const result = await exec(command, {
                    cwd: inputDir,
                    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                });
                stdout = result.stdout || '';
                stderr = result.stderr || '';
                console.log('[PlantUML Renderer] Command executed successfully');
                console.log('[PlantUML Renderer] stdout length:', stdout.length);
                console.log('[PlantUML Renderer] stderr length:', stderr.length);
                if (stdout) console.log('[PlantUML Renderer] stdout:', stdout);
                if (stderr) console.log('[PlantUML Renderer] stderr:', stderr);
            } catch (execError: any) {
                // Command execution failed
                console.error('[PlantUML Renderer] Command execution failed:', execError.message);
                stderr = execError.stderr || execError.message || 'Command execution failed';
                stdout = execError.stdout || '';
                console.log('[PlantUML Renderer] Error stdout:', stdout);
                console.log('[PlantUML Renderer] Error stderr:', stderr);
            }

            // PlantUML outputs the SVG file to outputDir/inputBasename.svg
            const outputSvgPath = path.join(outputDir, `${inputBasename}.svg`);
            console.log('[PlantUML Renderer] Step 8: Expected output SVG path:', outputSvgPath);

            try {
                console.log('[PlantUML Renderer] Step 9: Waiting for file write...');
                // Wait a bit for file to be written (PlantUML might be async)
                await new Promise(resolve => setTimeout(resolve, 100));
                
                console.log('[PlantUML Renderer] Step 10: Reading SVG file...');
                const svgContent = await fs.readFile(outputSvgPath, 'utf-8');
                console.log('[PlantUML Renderer] SVG file read successfully, size:', svgContent.length, 'bytes');
                
                if (!svgContent || svgContent.trim().length === 0) {
                    console.error('[PlantUML Renderer] SVG file is empty');
                    return {
                        svg: '',
                        error: stderr || stdout || 'Generated SVG file is empty'
                    };
                }

                console.log('[PlantUML Renderer] Render completed successfully');
                return {
                    svg: svgContent
                };
            } catch (readError: any) {
                // SVG file not found - PlantUML might have failed
                console.error('[PlantUML Renderer] Failed to read SVG file:', readError.message);
                console.error('[PlantUML Renderer] Checking if output directory exists...');
                try {
                    const dirExists = await fs.access(outputDir).then(() => true).catch(() => false);
                    console.log('[PlantUML Renderer] Output directory exists:', dirExists);
                    if (dirExists) {
                        const files = await fs.readdir(outputDir);
                        console.log('[PlantUML Renderer] Files in output directory:', files);
                    }
                } catch (dirError) {
                    console.error('[PlantUML Renderer] Output directory check failed:', dirError);
                }
                
                const errorDetails = [];
                if (stderr) errorDetails.push(`stderr: ${stderr}`);
                if (stdout) errorDetails.push(`stdout: ${stdout}`);
                errorDetails.push(`Expected output: ${outputSvgPath}`);
                errorDetails.push(`Command: ${command}`);
                
                return {
                    svg: '',
                    error: `Failed to generate SVG file.\n${errorDetails.join('\n')}`
                };
            }
        } catch (error: any) {
            console.error('[PlantUML Renderer] Unexpected error:', error.message);
            console.error('[PlantUML Renderer] Error stack:', error.stack);
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

