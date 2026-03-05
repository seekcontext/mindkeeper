export function generateTemplateMessage(
  changedFiles: string[],
  options?: { isRollback?: boolean; rollbackTarget?: string },
): string {
  if (options?.isRollback) {
    const target = options.rollbackTarget ?? "unknown";
    const files = changedFiles.join(", ");
    return `[rollback] ${files} reverted to ${target}`;
  }

  if (changedFiles.length === 0) {
    return "[auto] Empty snapshot";
  }

  const files = changedFiles.join(", ");
  return `[auto] Update ${files}`;
}
