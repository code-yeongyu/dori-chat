export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
