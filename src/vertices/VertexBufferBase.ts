import { mat4 } from 'gl-matrix'
import { VertexBase } from '../entities/VertexBase'
import { AttributeDefinition } from '../core/AttributeDefinition'

/**
 * Generic WebGL2 geometry helper: owns a VAO, VBO, IBO, and a shader program.
 * Subclasses supply shaders and optional draw-time uniforms.
 *
 * Vertices are interleaved according to `defineAttributes`. Drawing uses
 * `drawElements` with the current primitive type (LINES, POINTS, ...).
 */
export abstract class VertexBufferBase<TVertex extends VertexBase>
{
	/** Vertex buffer object (ARRAY_BUFFER). */
	protected vbo: WebGLBuffer | null = null;
	/** Index buffer object (ELEMENT_ARRAY_BUFFER). */
	protected ibo: WebGLBuffer | null = null;
	/** Vertex array object that captures attribute + index bindings. */
	protected vao: WebGLVertexArrayObject | null = null;

	protected vert: TVertex[] = [];
	protected idx: number[] = [];
	/** Number of indices passed to `drawElements`. */
	protected elementCount: number = 0;

	protected shaderProgram?: WebGLProgram | null = null;
	private _primitiveType: number = 0;

	/** gl.STATIC_DRAW or gl.DYNAMIC_DRAW. */
	protected bufferMode: number = 0;
	protected readonly gl: WebGL2RenderingContext;

	private attributes: AttributeDefinition[] = [];

	/** Blend-function source factor (default SRC_ALPHA). */
	protected blendSrc: number;
	/** Blend-function dest factor (default ONE = additive). */
	protected blendDst: number;

	/**
	 * @param gl WebGL2 context from the canvas.
	 * @param bufferMode Usage hint for `bufferData`.
	 */
	public constructor(gl: WebGL2RenderingContext, bufferMode: number) {
		this.gl = gl;
		this.bufferMode = bufferMode;
		this.blendSrc = gl.SRC_ALPHA;
		this.blendDst = gl.ONE;
	}

	/** Records the interleaved attribute layout used by `vertexAttribPointer`. */
	protected defineAttributes(attribList: AttributeDefinition[]): void {
		this.attributes = [];

		for (let i = 0; i < attribList.length; ++i) {
			this.attributes.push(attribList[i]);
		}
	}

	protected get primitiveType(): number {
		return this._primitiveType;
	}

	protected set primitiveType(value: number) {
		this._primitiveType = value;
	}

	protected get arrayElementCount(): number {
		return this.elementCount;
	}

	protected get vertexArrayObject(): WebGLBuffer {
		if (this.vao == null) {
			throw Error("VertexBufferBase.vertexArrayObject(): vertex array object is null!");
		}
		return this.vao;
	}

	protected abstract getVertexShaderSource(): string;

	protected abstract getFragmentShaderSource(): string;

	/**
	 * Compiles a vertex or fragment shader and throws with the info log on failure.
	 */
	private createShader(shaderType: number, shaderSource: string): WebGLShader {
		let shader: WebGLShader = this.gl.createShader(shaderType) as WebGLShader;
		this.gl.shaderSource(shader, shaderSource);
		this.gl.compileShader(shader);

		let isCompiled: number = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
		if (!isCompiled) {
			let msg = this.gl.getShaderInfoLog(shader);

			this.gl.deleteShader(shader);

			if (shaderType == this.gl.VERTEX_SHADER) {
				throw new Error("VertexBuffer: Vertex shader compilation failed: " + msg);
			} else {
				throw new Error("VertexBuffer: Fragment shader compilation failed: " + msg);
			}
		}

		return shader;
	}

	/**
	 * Creates GPU buffers and links the shader program.
	 * Must be called once before `createBuffer` / `draw`.
	 */
	public initialize(): void {
		this.vbo = this.gl.createBuffer();
		this.ibo = this.gl.createBuffer();
		this.vao = this.gl.createVertexArray();

		let srcVertex: string = this.getVertexShaderSource();
		let vertexShader: WebGLShader = this.createShader(this.gl.VERTEX_SHADER, srcVertex);

		let srcFragment: string = this.getFragmentShaderSource();
		let fragmentShader: WebGLShader = this.createShader(this.gl.FRAGMENT_SHADER, srcFragment);

		this.shaderProgram = this.gl.createProgram();
		if (this.shaderProgram == null)
			throw new Error("VertexBufferBase.initialize(): shaderProgram cannot be created!");

		this.gl.attachShader(this.shaderProgram, vertexShader);
		this.gl.attachShader(this.shaderProgram, fragmentShader);
		this.gl.linkProgram(this.shaderProgram);

		var linked: any = this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS);
		if (!linked) {
			let infoLog: string | null = this.gl.getProgramInfoLog(this.shaderProgram);

			this.gl.deleteProgram(this.shaderProgram);
			this.gl.deleteShader(vertexShader);
			this.gl.deleteShader(fragmentShader);

			throw new Error("VertexBufferBase.initialize():: shader program linking failed!\r\n" + infoLog);
		}

		this.gl.detachShader(this.shaderProgram, vertexShader);
		this.gl.detachShader(this.shaderProgram, fragmentShader);
	}

	/** Disables all vertex attribute arrays owned by this buffer. */
	protected releaseAttribArray(): void {
		for (let i = 0; i < this.attributes.length; ++i) {
			let attribIdx = this.attributes[i].attribIdx;
			this.gl.disableVertexAttribArray(attribIdx);
		}
	}

	/** Frees VAO/VBO/IBO. The shader program is left for GC / context teardown. */
	public release(): void {
		this.releaseAttribArray();

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, 0);
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, 0);
		this.gl.bindVertexArray(null);

		if (this.vbo != null)
			this.gl.deleteBuffer(this.vbo);

		if (this.ibo != null)
			this.gl.deleteBuffer(this.ibo);

		if (this.vao != null)
			this.gl.deleteVertexArray(this.vao);
	}

	/** Hook for subclass uniforms (point size, time, ...). */
	protected onSetCustomShaderVariables(): void {
	}

	/** Hook called after blend is enabled, before `drawElements` (e.g. lineWidth). */
	protected onBeforeDraw(): void {
	}

	public get hasGeometry(): boolean {
		return this.elementCount > 0;
	}

	/**
	 * Binds the program, uploads view/projection, and draws indexed geometry.
	 * No-op when the buffer is empty.
	 */
	public draw(matView: mat4, matProjection: mat4): void {
		if (this.shaderProgram == null) {
			throw new Error("VertexBufferBase.draw(): shader program is null!");
		}

		if (this.elementCount == 0) {
			return;
		}

		this.gl.useProgram(this.shaderProgram);

		let viewMatIdx = this.gl.getUniformLocation(this.shaderProgram, "viewMat");
		this.gl.uniformMatrix4fv(viewMatIdx, false, matView);

		let projMatIdx = this.gl.getUniformLocation(this.shaderProgram, "projMat");
		this.gl.uniformMatrix4fv(projMatIdx, false, matProjection);

		this.onSetCustomShaderVariables();

		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.blendSrc, this.blendDst);
		this.gl.blendEquation(this.gl.FUNC_ADD);

		this.onBeforeDraw();

		this.gl.bindVertexArray(this.vao);
		this.gl.drawElements(this.primitiveType, this.elementCount, this.gl.UNSIGNED_INT, 0);
		this.gl.bindVertexArray(null);

		this.gl.disable(this.gl.BLEND);
		this.gl.useProgram(null);
	}

	/**
	 * Packs `vert` into a Float32Array, uploads VBO + IBO, and configures attributes.
	 * Empty arrays clear the geometry instead of throwing (overlays can be optional).
	 */
	public createBuffer(vert: TVertex[], idx: number[], type: number): void {
		if (vert.length == 0) {
			this.elementCount = 0;
			return;
		}

		if (idx.length == 0) {
			this.elementCount = 0;
			return;
		}

		this.vert = vert;
		this.idx = idx;
		this.elementCount = idx.length;
		this.primitiveType = type;

		let numberOfFloats: number = vert[0].numberOfFloats();
		let floatArray = new Float32Array(vert.length * numberOfFloats);
		for (let i = 0; i < vert.length; ++i) {
			vert[i].writeTo(floatArray, i * numberOfFloats);
		}

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, floatArray, this.bufferMode);

		this.gl.bindVertexArray(this.vao);
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibo);

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);

		this.attributes.forEach((attrib) => {
			this.gl.enableVertexAttribArray(attrib.attribIdx);
			this.gl.vertexAttribPointer(attrib.attribIdx, attrib.size, this.gl.FLOAT, false, numberOfFloats * 4, attrib.offset);
		});

		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibo);

		let intArray = new Uint32Array(idx.length);
		for (let i = 0; i < idx.length; ++i) {
			intArray[i] = idx[i];
		}
		this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, intArray, this.gl.STATIC_DRAW);

		let errc = this.gl.getError();
		if (errc != this.gl.NO_ERROR) {
			throw Error("VertexBufferBase: Cannot create vbo! (Error " + errc + ")");
		}
		this.gl.bindVertexArray(null);
	}

	/**
	 * Fast path for per-frame uploads (particles): caller already packed floats.
	 */
	public uploadDynamic(floatArray: Float32Array, indices: Uint32Array, floatsPerVertex: number, type: number): void {
		if (floatArray.length == 0 || indices.length == 0) {
			this.elementCount = 0;
			return;
		}

		this.elementCount = indices.length;
		this.primitiveType = type;

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, floatArray, this.bufferMode);

		this.gl.bindVertexArray(this.vao);
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);

		this.attributes.forEach((attrib) => {
			this.gl.enableVertexAttribArray(attrib.attribIdx);
			this.gl.vertexAttribPointer(attrib.attribIdx, attrib.size, this.gl.FLOAT, false, floatsPerVertex * 4, attrib.offset);
		});

		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibo);
		this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.bufferMode);

		this.gl.bindVertexArray(null);
	}
}
