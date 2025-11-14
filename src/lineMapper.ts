import * as vscode from 'vscode';

export interface NodeMapping {
    [entityId: string]: number[]; // entityId -> array of line numbers
}

export interface EdgeMapping {
    [edgeKey: string]: number[]; // "source->target" -> array of line numbers
}

export class LineMapper {
    /**
     * Parse .puml file and map entity IDs and edges to line numbers
     */
    static async mapNodesToLines(uri: vscode.Uri): Promise<NodeMapping> {
        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();
        const lines = text.split('\n');
        
        const mapping: NodeMapping = {};
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            const trimmedLine = line.trim();
            
            // Skip comments and empty lines
            if (trimmedLine.startsWith("'") || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine === '') {
                continue;
            }

            // Match entity definitions:
            // - [Component] or [Component\nLabel]
            // - actor User
            // - package "Name" { ... }
            // - class ClassName
            // - interface InterfaceName
            // - component ComponentName
            // - node NodeName
            // - database DatabaseName
            // - queue QueueName
            // - rectangle "Name"
            // - etc.

            // Pattern for [Component] or [Component\nLabel] or [Component as Alias]
            const bracketEntityPattern = /\[([^\]]+?)(?:\s+as\s+(\w+))?\]/g;
            let match;
            while ((match = bracketEntityPattern.exec(line)) !== null) {
                const entityName = match[1].split('\\n')[0].trim(); // Get first part before \n
                const alias = match[2];
                
                // Add both the entity name and alias if present
                if (entityName) {
                    if (!mapping[entityName]) {
                        mapping[entityName] = [];
                    }
                    if (!mapping[entityName].includes(lineNum)) {
                        mapping[entityName].push(lineNum);
                    }
                }
                
                if (alias) {
                    if (!mapping[alias]) {
                        mapping[alias] = [];
                    }
                    if (!mapping[alias].includes(lineNum)) {
                        mapping[alias].push(lineNum);
                    }
                }
            }

            // Pattern for actor, package, class, interface, component, node, database, queue, etc.
            // Format: keyword Name or keyword "Name"
            const keywordEntityPattern = /^(actor|package|class|interface|component|node|database|queue|rectangle|usecase|agent|boundary|control|entity|collections|participant|actor|boundary|control|entity|collections)\s+(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_.]*))/i;
            const keywordMatch = trimmedLine.match(keywordEntityPattern);
            if (keywordMatch) {
                const entityName = keywordMatch[2] || keywordMatch[3] || keywordMatch[4]; // Quoted or unquoted
                if (entityName) {
                    if (!mapping[entityName]) {
                        mapping[entityName] = [];
                    }
                    if (!mapping[entityName].includes(lineNum)) {
                        mapping[entityName].push(lineNum);
                    }
                }
            }

            // Pattern for package "Name" { (package with braces on same line)
            const packagePattern = /package\s+(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*\{/i;
            const packageMatch = trimmedLine.match(packagePattern);
            if (packageMatch) {
                const packageName = packageMatch[1] || packageMatch[2];
                if (packageName) {
                    if (!mapping[packageName]) {
                        mapping[packageName] = [];
                    }
                    if (!mapping[packageName].includes(lineNum)) {
                        mapping[packageName].push(lineNum);
                    }
                }
            }
        }
        
        return mapping;
    }

    /**
     * Parse .puml file and map edges to line numbers
     */
    static async mapEdgesToLines(uri: vscode.Uri): Promise<EdgeMapping> {
        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();
        const lines = text.split('\n');
        
        const mapping: EdgeMapping = {};
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;
            const trimmedLine = line.trim();
            
            // Skip comments and empty lines
            if (trimmedLine.startsWith("'") || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine === '') {
                continue;
            }

            // Match edge/relationship definitions:
            // - A --> B
            // - A -> B
            // - A -- B
            // - A - B
            // - A -->> B (async)
            // - A ..> B (dotted)
            // - A <--> B (bidirectional)
            // - "A" --> "B"
            // - A -[#red]-> B (with styling)
            // - User --> Component : label
            // - A --> B : "label"
            
            // Pattern for edges: source --> target or source -> target, etc.
            // This regex matches: optional quotes, identifier, arrow (various types), optional quotes, identifier
            const edgePattern = /(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_.]*)|([a-zA-Z_][a-zA-Z0-9_]*))\s*(?:--?>>?|\.\.>|<-+>|->|--|\.\.|:)\s*(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_.]*)|([a-zA-Z_][a-zA-Z0-9_]*))/g;
            let edgeMatch;
            
            while ((edgeMatch = edgePattern.exec(line)) !== null) {
                const sourceId = edgeMatch[1] || edgeMatch[2] || edgeMatch[3];
                const targetId = edgeMatch[4] || edgeMatch[5] || edgeMatch[6];
                
                if (sourceId && targetId) {
                    const edgeKey = `${sourceId}->${targetId}`;
                    if (!mapping[edgeKey]) {
                        mapping[edgeKey] = [];
                    }
                    if (!mapping[edgeKey].includes(lineNum)) {
                        mapping[edgeKey].push(lineNum);
                    }
                }
            }
        }
        
        return mapping;
    }

    /**
     * Find line number for a specific entity ID
     */
    static async getEntityLine(uri: vscode.Uri, entityId: string): Promise<number | null> {
        const mapping = await this.mapNodesToLines(uri);
        const lines = mapping[entityId];
        if (lines && lines.length > 0) {
            return lines[0]; // Return first occurrence
        }
        return null;
    }

    /**
     * Find line number for a specific edge
     */
    static async getEdgeLine(uri: vscode.Uri, sourceId: string, targetId: string): Promise<number | null> {
        const mapping = await this.mapEdgesToLines(uri);
        const edgeKey = `${sourceId}->${targetId}`;
        const lines = mapping[edgeKey];
        if (lines && lines.length > 0) {
            return lines[0]; // Return first occurrence
        }
        return null;
    }

}
