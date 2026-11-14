export interface StringValidationOptions {
  min?: number;
  max?: number;
  optional?: boolean;
  label?: string;
}

export interface NumberValidationOptions {
  min?: number;
  max?: number;
  optional?: boolean;
  label?: string;
}

export function isUuid(value: unknown): value is string;
export function isCalendarDate(value: unknown): value is string;
export function isPlainObject(value: unknown): value is Record<string, unknown>;
export function readTrimmedString(value: unknown, options?: StringValidationOptions): string | null;
export function readFiniteNumber(value: unknown, options?: NumberValidationOptions): number | null;
