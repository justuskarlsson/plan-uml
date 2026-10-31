import * as path from 'path';

/**
 * Resolve the SVG filenames PlantUML may write for a source file.
 *
 * PlantUML names the generated file after the diagram when the source opens
 * with `@startuml <name>` (for example `@startmindmap architecture` produces
 * `architecture.svg`), and after the input file when the diagram is unnamed
 * (`arch.puml` produces `arch.svg`). Return every candidate, best guess first.
 *
 * @param fileContent - the full `.puml` source text.
 * @param outputDir - the directory PlantUML was told to write to (`-o`).
 * @param inputBasename - the input file name without its `.puml` extension.
 * @returns candidate output paths, diagram-name candidate first.
 */
export function resolveSvgOutputPaths(fileContent: string, outputDir: string, inputBasename: string): string[] {
    const candidates: string[] = [];

    // Stay on a single line: `[ \t]` instead of `\s` so a `title` line after an
    // unnamed `@startuml` is never mistaken for the diagram name.
    const namedDiagram = fileContent.match(/^[ \t]*@start\w+[ \t]+(.+?)[ \t]*$/m);
    if (namedDiagram) {
        const diagramName = namedDiagram[1];
        // A name may carry its own extension (`@startuml arch.svg` writes
        // `arch.svg`, not `arch.svg.svg`); append `.svg` only when missing.
        candidates.push(path.join(outputDir, /.svg$/i.test(diagramName) ? diagramName : `${diagramName}.svg`));
    }

    candidates.push(path.join(outputDir, `${inputBasename}.svg`));
    return candidates;
}
