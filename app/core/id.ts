/** A new id for a document, a folder or a step. */
export function generateId(): string {
  return crypto.randomUUID();
}
