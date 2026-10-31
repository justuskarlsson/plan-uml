import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { resolveSvgOutputPaths } from '../out/svgOutputResolver.js';

const join = path.join;

test('named diagram: diagram-name candidate first, input-file candidate second', () => {
    const source = '@startuml order flow\nalice -> bob: hi\n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'orders'), [
        join('/tmp/out', 'order flow.svg'),
        join('/tmp/out', 'orders.svg'),
    ]);
});

test('unnamed diagram: resolves to the input file only', () => {
    const source = '@startuml\ntitle order flow\nalice -> bob: hi\n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'orders'), [
        join('/tmp/out', 'orders.svg'),
    ]);
});

test('non-ascii diagram names are preserved (the reported failure mode)', () => {
    const source = '@startmindmap 中文图名\ntitle architecture\n@endmindmap\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'named-diagram'), [
        join('/tmp/out', '中文图名.svg'),
        join('/tmp/out', 'named-diagram.svg'),
    ]);
});

test('diagram name containing dots keeps it before the .svg suffix', () => {
    const source = '@startuml arch.v2\n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'arch'), [
        join('/tmp/out', 'arch.v2.svg'),
        join('/tmp/out', 'arch.svg'),
    ]);
});

test('indented @startuml is still recognized', () => {
    const source = '  @startuml orders\n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'arch'), [
        join('/tmp/out', 'orders.svg'),
        join('/tmp/out', 'arch.svg'),
    ]);
});

test('trailing whitespace after the diagram name is trimmed', () => {
    const source = '@startuml orders  \n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'arch'), [
        join('/tmp/out', 'orders.svg'),
        join('/tmp/out', 'arch.svg'),
    ]);
});

test('empty source falls back to the input file only', () => {
    assert.deepStrictEqual(resolveSvgOutputPaths('', '/tmp/out', 'orders'), [
        join('/tmp/out', 'orders.svg'),
    ]);
});

test('diagram name already carrying .svg is kept verbatim', () => {
    const source = '@startuml image.svg\n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'arch'), [
        join('/tmp/out', 'image.svg'),
        join('/tmp/out', 'arch.svg'),
    ]);
});

test('diagram name carrying uppercase .SVG is kept verbatim (case-insensitive)', () => {
    const source = '@startuml image.SVG\n@enduml\n';
    assert.deepStrictEqual(resolveSvgOutputPaths(source, '/tmp/out', 'arch'), [
        join('/tmp/out', 'image.SVG'),
        join('/tmp/out', 'arch.svg'),
    ]);
});
