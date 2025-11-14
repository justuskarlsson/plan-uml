import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    Tool,
    Resource,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

let server: Server | null = null;

// Standalone functions that don't require VS Code APIs
async function renderGraphvizFile(filePath: string): Promise<{ svg: string; error?: string }> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return await renderGraphvizContent(content);
    } catch (error: any) {
        return {
            svg: '',
            error: `Failed to read file: ${error.message}`
        };
    }
}

async function renderGraphvizContent(dotContent: string): Promise<{ svg: string; error?: string }> {
    try {
        const { stdout, stderr } = await exec('dot -Tsvg', {
            input: dotContent,
            maxBuffer: 10 * 1024 * 1024,
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

async function mapNodesToLines(filePath: string): Promise<{ [nodeId: string]: number[] }> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const mapping: { [nodeId: string]: number[] } = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim() === '') {
                continue;
            }

            const nodePattern = /(?:^|\s)(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))(?:\s*\[[^\]]*\])?/g;
            let match;

            while ((match = nodePattern.exec(line)) !== null) {
                const nodeId = match[1] || match[2];
                if (nodeId) {
                    if (!mapping[nodeId]) {
                        mapping[nodeId] = [];
                    }
                    if (!mapping[nodeId].includes(lineNum)) {
                        mapping[nodeId].push(lineNum);
                    }
                }
            }

            const edgePattern = /(?:^|\s)(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))(?:\s*(?:->|--)\s*)(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))/g;
            let edgeMatch;

            while ((edgeMatch = edgePattern.exec(line)) !== null) {
                const sourceId = edgeMatch[1] || edgeMatch[2];
                const targetId = edgeMatch[3] || edgeMatch[4];
                if (sourceId && targetId) {
                    if (!mapping[sourceId]) {
                        mapping[sourceId] = [];
                    }
                    if (!mapping[targetId]) {
                        mapping[targetId] = [];
                    }
                    if (!mapping[sourceId].includes(lineNum)) {
                        mapping[sourceId].push(lineNum);
                    }
                    if (!mapping[targetId].includes(lineNum)) {
                        mapping[targetId].push(lineNum);
                    }
                }
            }
        }

        return mapping;
    } catch (error: any) {
        return {};
    }
}

function resolveFilePath(filePath: string, workspaceRoot?: string): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }

    if (workspaceRoot) {
        return path.join(workspaceRoot, filePath);
    }

    // Try current working directory
    return path.resolve(filePath);
}

export function startMcpServer(context?: any): void {
    server = new Server(
        {
            name: 'graphviz-preview',
            version: '0.0.1',
        },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: 'render_graphviz',
                    description: 'Render a Graphviz (.dot) file to SVG',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            file_path: {
                                type: 'string',
                                description: 'Path to the .dot file to render (absolute or relative to workspace)',
                            },
                        },
                        required: ['file_path'],
                    },
                },
                {
                    name: 'get_node_line',
                    description: 'Get the line number(s) where a node is defined in a .dot file',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            file_path: {
                                type: 'string',
                                description: 'Path to the .dot file (absolute or relative to workspace)',
                            },
                            node_id: {
                                type: 'string',
                                description: 'The node ID to find',
                            },
                        },
                        required: ['file_path', 'node_id'],
                    },
                },
                {
                    name: 'open_preview',
                    description: 'Get instructions to open the preview for a .dot file (returns a message for the user)',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            file_path: {
                                type: 'string',
                                description: 'Path to the .dot file to preview (absolute or relative to workspace)',
                            },
                        },
                        required: ['file_path'],
                    },
                },
            ],
        };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            switch (name) {
                case 'render_graphviz': {
                    const filePath = args?.file_path as string;
                    if (!filePath) {
                        throw new Error('file_path is required');
                    }

                    // Try to resolve workspace root from environment or use current directory
                    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
                    const resolvedPath = resolveFilePath(filePath, workspaceRoot);
                    
                    const result = await renderGraphvizFile(resolvedPath);

                    if (result.error) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify({ error: result.error }, null, 2),
                                },
                            ],
                            isError: true,
                        };
                    }

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    svg: result.svg,
                                    success: true,
                                    file_path: resolvedPath,
                                }, null, 2),
                            },
                        ],
                    };
                }

                case 'get_node_line': {
                    const filePath = args?.file_path as string;
                    const nodeId = args?.node_id as string;

                    if (!filePath || !nodeId) {
                        throw new Error('file_path and node_id are required');
                    }

                    const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
                    const resolvedPath = resolveFilePath(filePath, workspaceRoot);
                    const mapping = await mapNodesToLines(resolvedPath);
                    const lines = mapping[nodeId];

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    node_id: nodeId,
                                    lines: lines || [],
                                    found: lines !== undefined && lines.length > 0,
                                    file_path: resolvedPath,
                                }, null, 2),
                            },
                        ],
                    };
                }

                case 'open_preview': {
                    const filePath = args?.file_path as string;
                    if (!filePath) {
                        throw new Error('file_path is required');
                    }

                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({
                                    success: true,
                                    message: `To open the preview for ${filePath}, use the command: "Graphviz: Open Graphviz Preview" or right-click the file and select "Open With" → "Graphviz Preview"`,
                                    file_path: filePath,
                                }, null, 2),
                            },
                        ],
                    };
                }

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error: any) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: error.message || 'Unknown error',
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });

    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        // For resources, we'd need to know about open files
        // Since we're in a standalone process, we'll return an empty list
        // or try to find .dot files in the workspace
        const resources: Resource[] = [];
        
        try {
            const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
            // This is a simplified version - in practice, you might want to scan the workspace
            // For now, return empty and let tools handle file access
        } catch (error) {
            // Ignore errors
        }

        return { resources };
    });

    // Handle resource reads
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const uri = request.params.uri;

        if (uri.startsWith('graphviz://file/')) {
            const filePath = uri.replace('graphviz://file/', '');
            const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
            const resolvedPath = resolveFilePath(filePath, workspaceRoot);
            
            try {
                const content = await fs.readFile(resolvedPath, 'utf-8');
                
                return {
                    contents: [
                        {
                            uri: uri,
                            mimeType: 'text/plain',
                            text: content,
                        },
                    ],
                };
            } catch (error: any) {
                throw new Error(`Failed to read file: ${error.message}`);
            }
        } else if (uri.startsWith('graphviz://preview/')) {
            const filePath = uri.replace('graphviz://preview/', '');
            const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
            const resolvedPath = resolveFilePath(filePath, workspaceRoot);
            
            try {
                const result = await renderGraphvizFile(resolvedPath);
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                return {
                    contents: [
                        {
                            uri: uri,
                            mimeType: 'image/svg+xml',
                            text: result.svg,
                        },
                    ],
                };
            } catch (error: any) {
                throw new Error(`Failed to render preview: ${error.message}`);
            }
        } else if (uri.startsWith('graphviz://mapping/')) {
            const filePath = uri.replace('graphviz://mapping/', '');
            const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
            const resolvedPath = resolveFilePath(filePath, workspaceRoot);
            
            try {
                const mapping = await mapNodesToLines(resolvedPath);
                
                return {
                    contents: [
                        {
                            uri: uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(mapping, null, 2),
                        },
                    ],
                };
            } catch (error: any) {
                throw new Error(`Failed to get mapping: ${error.message}`);
            }
        }

        throw new Error(`Unknown resource: ${uri}`);
    });

    // Start the server with stdio transport
    const transport = new StdioServerTransport();
    server.connect(transport).catch((error) => {
        console.error('MCP server connection error:', error);
        process.exit(1);
    });
}

// Entry point check - if this file is run directly
// Note: This will be handled by mcpServerEntry.ts
