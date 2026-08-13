export class AttributeDefinition {
	constructor(
		attribIdx: number = 0,
		size: number = 0,
		offset: number = 0) {
		this.attribIdx = attribIdx;
		this.size = size;
		this.offset = offset;
	}

	attribIdx: number = 0;
	size: number = 0;
	offset: number = 0;
}
