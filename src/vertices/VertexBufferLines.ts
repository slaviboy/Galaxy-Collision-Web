import { VertexColor } from '../entities/VertexColor'
import { VertexBufferBase } from './VertexBufferBase'
import { AttributeDefinition } from '../core/AttributeDefinition'

/**
 * Draws colored lines (axis, Barnes-Hut cells, ROI box) using VertexColor
 * vertices. Shader transforms by `projMat` only (view is identity in practice
 * because lookAt is baked into the same pipeline as the C++ gluLookAt setup).
 */
export class VertexBufferLines extends VertexBufferBase<VertexColor>
{
	/** Requested GL line width (often clamped to 1 on WebGL). */
	private lineWidth: number = 1;
	private readonly attPosition: number = 0;
	private readonly attColor: number = 1;

	/**
	 * @param gl WebGL2 context.
	 * @param lineWidth Passed to `gl.lineWidth` before draw.
	 * @param bufferMode STATIC_DRAW or DYNAMIC_DRAW.
	 */
	constructor(gl: WebGL2RenderingContext, lineWidth: number, bufferMode: number) {
		super(gl, bufferMode);
		this.lineWidth = lineWidth;

		this.defineAttributes([
			new AttributeDefinition(this.attPosition, 3, 0),
			new AttributeDefinition(this.attColor, 4, 3 * 4)
		]);
	}

	protected onBeforeDraw(): void {
		this.gl.lineWidth(this.lineWidth);
	}

	protected getVertexShaderSource(): string {
		return `#version 300 es
				precision mediump float;
				uniform mat4 projMat;
				uniform mat4 viewMat;
				layout(location = 0) in vec3 position;
				layout(location = 1) in vec4 color;
				out vec4 vertexColor;

				void main()
				{
					gl_Position =  projMat * vec4(position, 1);
					gl_PointSize = 2.0;
					vertexColor = color;
				}`;
	}

	protected getFragmentShaderSource(): string {
		return `#version 300 es 
				precision mediump float;
				out vec4 FragColor;
				in vec4 vertexColor;

				void main()
				{
					FragColor = vertexColor;
				}`;
	}
}
