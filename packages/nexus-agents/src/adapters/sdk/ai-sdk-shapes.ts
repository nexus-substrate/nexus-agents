/**
 * Duck-typed shapes for the optional `ai` peer dependency, which the SDK
 * adapter loads dynamically and therefore cannot import types from.
 *
 * @module adapters/sdk/ai-sdk-shapes
 */

/** Minimal AI SDK model interface (duck-typed for optional dependency). */
export interface AiSdkModel {
  readonly modelId: string;
}

/** AI SDK generateText result shape (duck-typed). */
export interface GenerateTextResult {
  text: string;
  finishReason: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  response: { modelId: string };
}

/** AI SDK streamText result shape (duck-typed). */
export interface StreamTextResult {
  textStream: AsyncIterable<string>;
  finishReason?: Promise<string> | string | undefined;
}

/**
 * AI SDK generateObject result shape (duck-typed).
 * @deprecated ai 7 deprecates generateObject; the adapter now uses generateText + Output.object.
 */
interface GenerateObjectResult {
  object: unknown;
  finishReason: string;
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  response: { modelId: string };
}

/** AI SDK generateText structured result shape (duck-typed). */
export interface StructuredTextResult extends GenerateTextResult {
  output: unknown;
}

/** Opaque schema handle returned by the AI SDK `jsonSchema` helper. */
type AiSdkSchema = unknown;

/** Function signatures for AI SDK entry points (loaded dynamically). */
export interface AiSdkFunctions {
  generateText: (options: Record<string, unknown>) => Promise<GenerateTextResult>;
  streamText: (options: Record<string, unknown>) => StreamTextResult;
  /** @deprecated ai 7 deprecates generateObject; the adapter now uses generateText + Output.object. */
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- public API; removal is breaking
  generateObject: (options: Record<string, unknown>) => Promise<GenerateObjectResult>;
  objectOutput: (options: { schema: AiSdkSchema }) => unknown;
  jsonSchema: (schema: Record<string, unknown>) => AiSdkSchema;
}
