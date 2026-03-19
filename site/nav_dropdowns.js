const registeredDropdowns = new Set();

export function registerExclusiveDropdown(dropdown) {
  registeredDropdowns.add(dropdown);
  return () => {
    registeredDropdowns.delete(dropdown);
  };
}

export function openExclusiveDropdown(dropdown) {
  for (const other of registeredDropdowns) {
    if (other !== dropdown) {
      other.close();
    }
  }
}

export function closeExclusiveDropdown() {
  // No-op: kept for backward compatibility with existing imports.
}
