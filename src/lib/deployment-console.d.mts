export const ACTIVE_WORKFLOW_STATES: ReadonlySet<string>;
export function isWorkflowActive(status: unknown): boolean;
export function tailConsoleOutput(value: unknown, maxLines?: number, maxChars?: number): string;
export function extractConsoleErrors(value: unknown, maxErrors?: number): string[];
export function extractZipText(input: ArrayBuffer | Uint8Array): string;
