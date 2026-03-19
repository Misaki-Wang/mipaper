export function buildCadenceSummary(rows, currentDomain, cadenceMode = "daily") {
  const reports = rows
    .map((row) => {
      const entry = row.entries.find((item) => item?.category === currentDomain);
      if (!entry) {
        return null;
      }
      return {
        ...entry,
        rowKey: row.rowKey,
        rowLabel: row.label,
      };
    })
    .filter(Boolean);

  if (!reports.length) {
    return cadenceMode === "weekly" ? "No weekly aggregates are available yet." : "No daily reports are available yet.";
  }
  if (reports.length === 1) {
    return cadenceMode === "weekly"
      ? "Only one weekly aggregate is available so far. The cadence chart will expand automatically as more reports accumulate."
      : "Only one report is available so far. The cadence chart will expand automatically as more reports accumulate.";
  }

  const [latest, previous] = reports;
  const delta = latest.total_papers - previous.total_papers;
  const direction = delta === 0 ? "unchanged" : delta > 0 ? `increased by ${delta}` : `decreased by ${Math.abs(delta)}`;
  const label = cadenceMode === "weekly" ? latest.rowKey : latest.rowLabel || latest.rowKey;
  const unit = cadenceMode === "weekly" ? "week" : "day";
  return `${label} has ${latest.total_papers} papers, ${direction} from the previous ${unit}.`;
}
