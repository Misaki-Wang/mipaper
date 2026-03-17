export function getStaleRemoteIds(localIds, remoteRows, rowIdKey) {
  const localSet = new Set(
    (localIds || [])
      .filter((value) => typeof value === "string" && value)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const staleIds = new Set();

  for (const row of remoteRows || []) {
    const remoteId = typeof row?.[rowIdKey] === "string" ? row[rowIdKey].trim() : "";
    if (remoteId && !localSet.has(remoteId)) {
      staleIds.add(remoteId);
    }
  }

  return [...staleIds];
}
