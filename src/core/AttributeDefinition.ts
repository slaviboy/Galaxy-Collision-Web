/**
 * Describes one vertex attribute for `vertexAttribPointer`:
 * shader location, component count, and byte offset inside the interleaved vertex.
 */
export class AttributeDefinition {
    /** `layout(location = N)` index in the vertex shader. */
    attribIdx: number = 0;
    /** Number of float components (1–4). */
    size: number = 0;
    /** Byte offset from the start of each vertex. */
    offset: number = 0;

    /**
     * @param attribIdx Shader attribute location.
     * @param size Component count.
     * @param offset Byte offset within the vertex.
     */
    constructor(
        attribIdx: number = 0,
        size: number = 0,
        offset: number = 0) {
        this.attribIdx = attribIdx;
        this.size = size;
        this.offset = offset;
    }
}
