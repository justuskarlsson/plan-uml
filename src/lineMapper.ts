import * as vscode from 'vscode';

export interface NodeMapping {
    [nodeId: string]: number[]; // nodeId -> array of line numbers
}

export interface EdgeMapping {
    [edgeKey: string]: number[]; // "source->target" -> array of line numbers
}

export class LineMapper {
    /**
     * Parse .dot file and map node IDs to line numbers
     */
    static async mapNodesToLines(uri: vscode.Uri): Promise<NodeMapping> {
        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();
        const lines = text.split('\n');
        
        const mapping: NodeMapping = {};
        
        // Patterns to match:
        // - node_id [attributes]
        // - node_id -> target [attributes]
        // - node_id -> target
        // - "node_id" [attributes]
        // - "node_id" -> target
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            
            // Skip comments and empty lines
            if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim() === '') {
                continue;
            }
            
            // Match node definitions: node_id [attributes] or "node_id" [attributes]
            // This regex matches: optional quotes, node identifier, optional attributes
            const nodePattern = /(?:^|\s)(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))(?:\s*\[[^\]]*\])?/g;
            let match;
            
            while ((match = nodePattern.exec(line)) !== null) {
                const nodeId = match[1] || match[2]; // Quoted or unquoted
                if (nodeId) {
                    if (!mapping[nodeId]) {
                        mapping[nodeId] = [];
                    }
                    if (!mapping[nodeId].includes(lineNum)) {
                        mapping[nodeId].push(lineNum);
                    }
                }
            }
            
            // Match edge definitions: node1 -> node2 or node1 -- node2
            const edgePattern = /(?:^|\s)(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))(?:\s*(?:->|--)\s*)(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))/g;
            let edgeMatch;
            
            while ((edgeMatch = edgePattern.exec(line)) !== null) {
                const sourceId = edgeMatch[1] || edgeMatch[2];
                const targetId = edgeMatch[3] || edgeMatch[4];
                if (sourceId && targetId) {
                    // Also map the nodes in edges
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
    }

    /**
     * Find line number for a specific node ID
     */
    static async getNodeLine(uri: vscode.Uri, nodeId: string): Promise<number | null> {
        const mapping = await this.mapNodesToLines(uri);
        const lines = mapping[nodeId];
        if (lines && lines.length > 0) {
            return lines[0]; // Return first occurrence
        }
        return null;
    }

    /**
     * Extract node ID from SVG element
     * Graphviz typically uses the node ID as the element ID or in the title
     */
    static extractNodeIdFromSvgElement(element: Element): string | null {
        // Try to get from element ID
        const id = element.getAttribute('id');
        if (id) {
            // Graphviz often prefixes with "node" or "edge"
            const match = id.match(/^(?:node|edge|cluster)_(.+)$/);
            if (match) {
                return match[1];
            }
            return id;
        }
        
        // Try to get from title element (Graphviz often puts node ID in title)
        const title = element.querySelector('title');
        if (title && title.textContent) {
            return title.textContent.trim();
        }
        
        // Try to get from data attributes
        const dataId = element.getAttribute('data-node-id');
        if (dataId) {
            return dataId;
        }
        
        return null;
    }
}

