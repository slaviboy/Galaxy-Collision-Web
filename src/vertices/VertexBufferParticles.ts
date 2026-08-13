import { VertexColor } from '../entities/VertexColor'
import { VertexBufferBase } from './VertexBufferBase'
import { AttributeDefinition } from '../core/AttributeDefinition'

export class VertexBufferParticles extends VertexBufferBase<VertexColor>
{
	private readonly attPosition: number = 0;
	private readonly attColor: number = 1;
	private pointSize: number = 2;
	private floatArray: Float32Array | null = null;
	private indexArray: Uint32Array | null = null;

	constructor(gl: WebGL2RenderingContext) {
		super(gl, gl.DYNAMIC_DRAW);
		this.blendDst = gl.ONE_MINUS_SRC_ALPHA;

		this.defineAttributes([
			new AttributeDefinition(this.attPosition, 3, 0),
			new AttributeDefinition(this.attColor, 4, 3 * 4)
		]);
	}

	public updateFromState(state: Float64Array, count: number): void {
		const floatsPerVertex = 7;
		if (this.floatArray == null || this.floatArray.length !== count * floatsPerVertex) {
			this.floatArray = new Float32Array(count * floatsPerVertex);
			this.indexArray = new Uint32Array(count);
			for (let i = 0; i < count; ++i) {
				this.indexArray[i] = i;
			}
		}

		for (let i = 0; i < count; ++i) {
			const o = i * floatsPerVertex;
			this.floatArray[o + 0] = state[i * 4];
			this.floatArray[o + 1] = state[i * 4 + 1];
			this.floatArray[o + 2] = 0;
			this.floatArray[o + 3] = 1;
			this.floatArray[o + 4] = 1;
			this.floatArray[o + 5] = 1;
			this.floatArray[o + 6] = 1;
		}

		this.uploadDynamic(this.floatArray, this.indexArray as Uint32Array, floatsPerVertex, this.gl.POINTS);
	}

	protected onSetCustomShaderVariables(): void {
		if (this.shaderProgram == null)
			throw new Error("onSetCustomShaderVariables(): Shader program is null!");

		let varPointSize = this.gl.getUniformLocation(this.shaderProgram, "pointSize");
		this.gl.uniform1f(varPointSize, this.pointSize);
	}

	protected getVertexShaderSource(): string {
		return `#version 300 es
				precision mediump float;
				uniform mat4 projMat;
				uniform mat4 viewMat;
				uniform float pointSize;
				layout(location = 0) in vec3 position;
				layout(location = 1) in vec4 color;
				out vec4 vertexColor;

				void main()
				{
					gl_Position = projMat * vec4(position, 1.0);
					gl_PointSize = pointSize;
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
