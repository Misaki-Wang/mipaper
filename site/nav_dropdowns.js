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
  for (const dropdown of registeredDropdowns) {
    dropdown.close();
  }
}
