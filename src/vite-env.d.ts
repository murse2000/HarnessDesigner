/// <reference types="vite/client" />

declare module "occt-import-js" {
  interface OcctApi {
    ReadStepFile(content: Uint8Array, params: Record<string, unknown>): unknown;
  }
  export default function occtImportJs(options?: { locateFile?: (path: string) => string }): Promise<OcctApi>;
}
