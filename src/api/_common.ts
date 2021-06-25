import { Library } from "../library/model";
import { ApiOutput, Json } from "../server/response";

export type ApiCtx = {
  library: Library;
  // Path to scratch directory if available.
  scratch?: string;
};

export type ApiFn = (ctx: ApiCtx, input: any) => Promise<ApiOutput>;

export type ApiInput<A extends ApiFn> = Parameters<A>[1];

export type JsonApiOutput<A extends ApiFn> = ReturnType<A> extends Promise<
  Json<infer V> | undefined
>
  ? V
  : never;
