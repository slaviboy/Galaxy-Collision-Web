import { VertexColor } from '../entities/VertexColor'
import { VertexBufferBase } from './VertexBufferBase'
import { AttributeDefinition } from '../core/AttributeDefinition'
import { FLOATS_PER_VISUAL } from '../core/GalaxyAppearance'

/**
 * WebGL2 port of Galaxy-Renderer-master `VertexBufferStars` shaders, using
 * n-body world positions instead of density-wave ellipses.
 *
 * Type 0 star, 1 dust, 2 filament, 3 H2 halo, 4 H2 core.
 * Blend is SRC_ALPHA / ONE (additive), same as the C++ renderer.
 */
export class VertexBufferGalaxyStars extends VertexBufferBase<VertexColor>
{
    private time: number = 0
    /** C++ `dustRenderSize`, typically 70–90 px. */
    private dustSize: number = 70
    /** C++ `_h2SizeMax`, typically 100 px. */
    private h2SizeMax: number = 100
    private sizeFactor: number = 1
    private maxPointSize: number = 256
    /** Bit0 stars, bit1 dust, bit2 filaments, bit3 H2. */
    private displayFeatures: number = 1 | 2 | 4 | 8
    private indexArray: Uint32Array | null = null

    constructor(gl: WebGL2RenderingContext) {
        super(gl, gl.DYNAMIC_DRAW)
        this.blendSrc = gl.SRC_ALPHA
        this.blendDst = gl.ONE

        this.defineAttributes([
            new AttributeDefinition(0, 3, 0),
            new AttributeDefinition(1, 4, 3 * 4),
            new AttributeDefinition(2, 1, 7 * 4),
            new AttributeDefinition(3, 1, 8 * 4),
            new AttributeDefinition(4, 1, 9 * 4),
            new AttributeDefinition(5, 1, 10 * 4)
        ])
    }

    public initialize(): void {
        super.initialize()
        const range = this.gl.getParameter(this.gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | number[]
        if (range && range.length >= 2) {
            this.maxPointSize = range[1]
        }
    }

    public setShaderVariables(time: number, dustSize: number, h2SizeMax: number, sizeFactor: number): void {
        this.time = time
        this.dustSize = dustSize
        this.h2SizeMax = h2SizeMax
        this.sizeFactor = sizeFactor
    }

    public updatePacked(floatArray: Float32Array, count: number): void {
        if (this.indexArray == null || this.indexArray.length !== count) {
            this.indexArray = new Uint32Array(count)
            for (let i = 0; i < count; ++i) {
                this.indexArray[i] = i
            }
        }
        this.uploadDynamic(floatArray, this.indexArray, FLOATS_PER_VISUAL, this.gl.POINTS)
    }

    protected onSetCustomShaderVariables(): void {
        if (this.shaderProgram == null) {
            throw new Error("VertexBufferGalaxyStars: shader program is null")
        }
        const gl = this.gl
        const p = this.shaderProgram
        gl.uniform1f(gl.getUniformLocation(p, "time"), this.time)
        gl.uniform1f(gl.getUniformLocation(p, "dustSize"), this.dustSize)
        gl.uniform1f(gl.getUniformLocation(p, "h2SizeMax"), this.h2SizeMax)
        gl.uniform1f(gl.getUniformLocation(p, "sizeFactor"), this.sizeFactor)
        gl.uniform1f(gl.getUniformLocation(p, "maxPointSize"), this.maxPointSize)
        gl.uniform1i(gl.getUniformLocation(p, "displayFeatures"), this.displayFeatures)
    }

    protected getVertexShaderSource(): string {
        // Point-size and colour math copied from Galaxy-Renderer-master
        // VertexBufferStars.hpp (type 0..4). Positions are already in world space.
        return `#version 300 es
            precision mediump float;
            uniform mat4 projMat;
            uniform mat4 viewMat;
            uniform float time;
            uniform float dustSize;
            uniform float h2SizeMax;
            uniform float sizeFactor;
            uniform float maxPointSize;
            uniform int displayFeatures;

            layout(location = 0) in vec3 position;
            layout(location = 1) in vec4 color;
            layout(location = 2) in float mag;
            layout(location = 3) in float type;
            layout(location = 4) in float flickerPhase;
            layout(location = 5) in float flickerAmp;

            out vec4 vertexColor;
            flat out int vertexType;
            flat out int features;

            void main()
            {
                int t = int(type + 0.5);
                float m = mag;

                if (t == 0) {
                    m *= 1.0 + flickerAmp * sin(time * 7.0 + flickerPhase);
                    gl_PointSize = m * 4.0;
                    vertexColor = color * m;
                } else if (t == 1) {
                    gl_PointSize = mag * 5.0 * dustSize;
                    vertexColor = color * mag;
                } else if (t == 2) {
                    gl_PointSize = mag * 2.0 * dustSize;
                    vertexColor = color * mag;
                } else if (t == 3 || t == 4) {
                    float ignite = clamp(0.35 + flickerAmp * sin(time * 0.65 + flickerPhase), 0.0, 1.0);
                    if (t == 3) {
                        gl_PointSize = h2SizeMax * ignite;
                        vertexColor = color * mag * vec4(2.0, 0.5, 0.5, 1.0) * ignite;
                    } else {
                        gl_PointSize = h2SizeMax * ignite / 10.0;
                        vertexColor = vec4(1.0, 1.0, 1.0, 1.0) * ignite;
                    }
                }

                gl_Position = projMat * vec4(position, 1.0);
                gl_PointSize = clamp(max(gl_PointSize * sizeFactor, 0.0), 0.0, maxPointSize);
                vertexType = t;
                features = displayFeatures;
            }`
    }

    protected getFragmentShaderSource(): string {
        // Copied from Galaxy-Renderer-master VertexBufferStars.hpp fragment shader.
        return `#version 300 es
            precision mediump float;
            in vec4 vertexColor;
            flat in int vertexType;
            flat in int features;
            out vec4 FragColor;

            void main()
            {
                vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
                float radial = 1.0 - length(circCoord);
                if (radial <= 0.0) {
                    discard;
                }

                if (vertexType == 0) {
                    if ((features & 1) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, radial);
                } else if (vertexType == 1) {
                    if ((features & 2) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, 0.05 * radial);
                } else if (vertexType == 2) {
                    if ((features & 4) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, 0.07 * radial);
                } else if (vertexType == 3) {
                    if ((features & 8) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, radial);
                } else if (vertexType == 4) {
                    if ((features & 8) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, radial);
                } else {
                    discard;
                }
            }`
    }
}
