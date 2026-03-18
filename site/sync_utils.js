const DEVICE_ID_STORAGE_KEY = "cool-paper-sync-device-id-v1";

function normalizeSyncId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getSyncDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const next =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, next);
    return next;
  } catch (_error) {
    return "device-unknown";
  }
}

export function createSyncTimestamp() {
  return new Date().toISOString();
}

export function compareSyncTimestamps(left, right) {
  const normalizedLeft = typeof left === "string" ? left : "";
  const normalizedRight = typeof right === "string" ? right : "";
  if (!normalizedLeft && !normalizedRight) {
    return 0;
  }
  if (!normalizedLeft) {
    return -1;
  }
  if (!normalizedRight) {
    return 1;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

export function getRecordUpdatedAt(record) {
  return (
    record?.updated_at ||
    record?.client_updated_at ||
    record?.deleted_at ||
    record?.saved_at ||
    record?.reviewed_at ||
    ""
  );
}

export function getLatestTimestamp(...values) {
  return values
    .flat()
    .filter((value) => typeof value === "string" && value)
    .sort(compareSyncTimestamps)
    .pop() || "";
}

export function getPendingSyncRecords(records, lastSyncedAt) {
  return (records || []).filter((record) => compareSyncTimestamps(record?.client_updated_at || "", lastSyncedAt || "") > 0);
}

export function getInitialSyncRecords(localRecords, remoteRecords, idKey) {
  const remoteById = new Map((remoteRecords || []).map((item) => [item?.[idKey], item]));
  return (localRecords || []).filter((item) => {
    const remoteItem = remoteById.get(item?.[idKey]);
    if (!remoteItem) {
      return true;
    }
    return compareSyncTimestamps(getRecordUpdatedAt(item), getRecordUpdatedAt(remoteItem)) > 0;
  });
}

export function mergeSyncRecords(localRecords, remoteRecords, idKey) {
  const merged = new Map();

  for (const record of [...(localRecords || []), ...(remoteRecords || [])]) {
    const recordId = normalizeSyncId(record?.[idKey]);
    if (!recordId) {
      continue;
    }

    const normalizedRecord = {
      ...record,
      [idKey]: recordId,
    };

    const existing = merged.get(recordId);
    if (!existing) {
      merged.set(recordId, normalizedRecord);
      continue;
    }

    const timestampComparison = compareSyncTimestamps(getRecordUpdatedAt(normalizedRecord), getRecordUpdatedAt(existing));
    if (timestampComparison > 0) {
      merged.set(recordId, normalizedRecord);
      continue;
    }
    if (timestampComparison < 0) {
      continue;
    }

    const clientComparison = compareSyncTimestamps(normalizedRecord?.client_updated_at || "", existing?.client_updated_at || "");
    if (clientComparison >= 0) {
      merged.set(recordId, normalizedRecord);
    }
  }

  return [...merged.values()];
}
