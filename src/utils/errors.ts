export interface ErrorResult {
  error: string;
  code?: string;
  hint?: string;
}

export function formatError(error: string, code?: string, hint?: string): string {
  const result: ErrorResult = { error };
  if (code) result.code = code;
  if (hint) result.hint = hint;
  return JSON.stringify(result, null, 2);
}
