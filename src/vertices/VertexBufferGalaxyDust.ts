import { VertexColor } from '../entities/VertexColor'
import { VertexBufferBase } from './VertexBufferBase'
import { AttributeDefinition } from '../core/AttributeDefinition'
import { FLOATS_PER_GLOW_VERT } from '../core/GalaxyAppearance'

/**
 * Dust, filaments and H2 as screen-aligned quads.
 *
 * Large `gl.POINTS` often rasterize as horizontal/vertical bars in WebGL.
 * Quads with a circular falloff match Galaxy-Renderer-master sprites without
 * that artifact. Pixel sizes still use the C++ formulas (mag * 5 * dustSize, …).
 */
export class VertexBufferGalaxyDust extends VertexBufferBase<VertexColor>
{
    private time: number = 0
    private dustSize: number = 70
    private h2SizeMax: number = 100
    private sizeFactor: number = 1
    private worldPerPixel: number = 0.03
    private displayFeatures: number = 2 | 4 | 8
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
            new AttributeDefinition(5, 1, 10 * 4),
            new AttributeDefinition(6, 2, 11 * 4)
        ])
    }

    public setShaderVariables(
        time: number,
        dustSize: number,
        h2SizeMax: number,
        sizeFactor: number,
        worldPerPixel: number): void {
        this.time = time
        this.dustSize = dustSize
        this.h2SizeMax = h2SizeMax
        this.sizeFactor = sizeFactor
        this.worldPerPixel = worldPerPixel
    }

    public updatePacked(floatArray: Float32Array, vertexCount: number): void {
        if (this.indexArray == null || this.indexArray.length !== vertexCount) {
            this.indexArray = new Uint32Array(vertexCount)
            for (let i = 0; i < vertexCount; ++i) {
                this.indexArray[i] = i
            }
        }
        this.uploadDynamic(floatArray, this.indexArray, FLOATS_PER_GLOW_VERT, this.gl.TRIANGLES)
    }

    protected onSetCustomShaderVariables(): void {
        if (this.shaderProgram == null) {
            throw new Error("VertexBufferGalaxyDust: shader program is null")
        }
        const gl = this.gl
        const p = this.shaderProgram
        gl.uniform1f(gl.getUniformLocation(p, "time"), this.time)
        gl.uniform1f(gl.getUniformLocation(p, "dustSize"), this.dustSize)
        gl.uniform1f(gl.getUniformLocation(p, "h2SizeMax"), this.h2SizeMax)
        gl.uniform1f(gl.getUniformLocation(p, "sizeFactor"), this.sizeFactor)
        gl.uniform1f(gl.getUniformLocation(p, "worldPerPixel"), this.worldPerPixel)
        gl.uniform1i(gl.getUniformLocation(p, "displayFeatures"), this.displayFeatures)
    }

    protected getVertexShaderSource(): string {
        return `#version 300 es
            precision mediump float;
            uniform mat4 projMat;
            uniform mat4 viewMat;
            uniform float time;
            uniform float dustSize;
            uniform float h2SizeMax;
            uniform float sizeFactor;
            uniform float worldPerPixel;
            uniform int displayFeatures;

            layout(location = 0) in vec3 position;
            layout(location = 1) in vec4 color;
            layout(location = 2) in float mag;
            layout(location = 3) in float type;
            layout(location = 4) in float flickerPhase;
            layout(location = 5) in float flickerAmp;
            layout(location = 6) in vec2 corner;

            out vec4 vertexColor;
            out vec2 spriteCoord;
            flat out int vertexType;
            flat out int features;

            void main()
            {
                int t = int(type + 0.5);
                float px = 1.0;

                if (t == 1) {
                    px = mag * 5.0 * dustSize;
                    vertexColor = color * mag;
                } else if (t == 2) {
                    px = mag * 2.0 * dustSize;
                    vertexColor = color * mag;
                } else if (t == 3 || t == 4) {
                    float ignite = clamp(0.35 + flickerAmp * sin(time * 0.65 + flickerPhase), 0.0, 1.0);
                    if (t == 3) {
                        px = h2SizeMax * ignite;
                        vertexColor = color * mag * vec4(2.0, 0.5, 0.5, 1.0) * ignite;
                    } else {
                        px = h2SizeMax * ignite / 10.0;
                        vertexColor = vec4(1.0, 1.0, 1.0, 1.0) * ignite;
                    }
                }

                px = max(px * sizeFactor, 0.0);
                vec2 offset = corner * (px * 0.5) * worldPerPixel;
                gl_Position = projMat * vec4(position.xy + offset, 0.0, 1.0);
                spriteCoord = corner;
                vertexType = t;
                features = displayFeatures;
            }`
    }

    protected getFragmentShaderSource(): string {
        return `#version 300 es
            precision mediump float;
            in vec4 vertexColor;
            in vec2 spriteCoord;
            flat in int vertexType;
            flat in int features;
            out vec4 FragColor;

            void main()
            {
                // Same falloff as Galaxy-Renderer-master VertexBufferStars:
                // alpha = k * (1 - length(coord)), additive SRC_ALPHA / ONE.
                float radial = 1.0 - length(spriteCoord);
                if (radial <= 0.0) {
                    discard;
                }
                // Quadratic fade: the rim goes to black instead of leaving a
                // hard brown circle against the background.
                float fade = radial * radial;

                if (vertexType == 1) {
                    if ((features & 2) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, 0.07 * fade);
                } else if (vertexType == 2) {
                    if ((features & 4) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, 0.08 * fade);
                } else if (vertexType == 3) {
                    if ((features & 8) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, 0.35 * fade);
                } else if (vertexType == 4) {
                    if ((features & 8) == 0) discard;
                    FragColor = vec4(vertexColor.xyz, 0.55 * fade);
                } else {
                    discard;
                }
            }`
    }
}
