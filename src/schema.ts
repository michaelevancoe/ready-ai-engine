export type JsonSchema =
  | {
      type: 'object';
      properties: Readonly<Record<string, JsonSchema>>;
      required: readonly string[];
      additionalProperties: false;
    }
  | {
      type: 'string';
      minLength?: number;
      maxLength?: number;
    }
  | {
      type: 'boolean';
    }
  | {
      type: 'array';
      items: JsonSchema;
      minItems?: number;
      maxItems?: number;
    };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateJson(schema: JsonSchema, value: unknown): boolean {
  switch (schema.type) {
    case 'string':
      return (
        typeof value === 'string' &&
        (schema.minLength === undefined || value.length >= schema.minLength) &&
        (schema.maxLength === undefined || value.length <= schema.maxLength)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'array': {
      if (!Array.isArray(value)) return false;
      if (schema.minItems !== undefined && value.length < schema.minItems) return false;
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
      return value.every((item) => validateJson(schema.items, item));
    }
    case 'object': {
      if (!isRecord(value)) return false;
      for (const key of Object.keys(value)) {
        const property = schema.properties[key];
        if (property === undefined || !validateJson(property, value[key])) return false;
      }
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) return false;
      }
      return true;
    }
    default: {
      const neverSchema: never = schema;
      throw new Error(`unsupported schema ${String(neverSchema)}`);
    }
  }
}
