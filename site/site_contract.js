function requireObject(label, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(payload, key, options = {}) {
  const { allowEmpty = false, expected } = options;
  const value = payload?.[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  if (!allowEmpty && !value.trim()) {
    throw new Error(`${key} must not be empty`);
  }
  if (expected !== undefined && value !== expected) {
    throw new Error(`${key} must be ${JSON.stringify(expected)}`);
  }
  return value;
}

function requireNumber(payload, key) {
  const value = payload?.[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${key} must be a number`);
  }
  return value;
}

function requireBoolean(payload, key) {
  const value = payload?.[key];
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function requireArray(payload, key) {
  const value = payload?.[key];
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  return value;
}

function validateBranchManifest(manifest, options) {
  const { branchKey, branchLabel, requiredReportKeys } = options;
  requireObject(`${branchLabel} manifest`, manifest);
  requireString(manifest, "branch_key", { expected: branchKey });
  requireString(manifest, "branch_label", { expected: branchLabel });
  requireString(manifest, "generated_at");
  requireNumber(manifest, "reports_count");
  requireString(manifest, "default_report_path", { allowEmpty: true });
  const reports = requireArray(manifest, "reports");
  if (manifest.reports_count !== reports.length) {
    throw new Error(`${branchLabel} manifest reports_count mismatch`);
  }

  reports.forEach((report) => {
    requireObject(`${branchLabel} manifest report`, report);
    requireString(report, "branch_key", { expected: branchKey });
    requireString(report, "branch_label", { expected: branchLabel });
    requireString(report, "data_path");
    requiredReportKeys.forEach((entry) => {
      if (entry.type === "string") {
        requireString(report, entry.key, { allowEmpty: entry.allowEmpty });
      } else if (entry.type === "number") {
        requireNumber(report, entry.key);
      } else if (entry.type === "array") {
        requireArray(report, entry.key);
      } else if (entry.type === "boolean") {
        requireBoolean(report, entry.key);
      }
    });
  });

  return manifest;
}

function validateBranchReport(report, requiredEntries) {
  requireObject("branch report", report);
  requireString(report, "generated_at");
  requireString(report, "source_url");
  requiredEntries.forEach((entry) => {
    if (entry.type === "string") {
      requireString(report, entry.key, { allowEmpty: entry.allowEmpty });
    } else if (entry.type === "number") {
      requireNumber(report, entry.key);
    } else if (entry.type === "array") {
      requireArray(report, entry.key);
    } else if (entry.type === "boolean") {
      requireBoolean(report, entry.key);
    }
  });
  return report;
}

export function validateDailyManifest(manifest) {
  validateBranchManifest(manifest, {
    branchKey: "daily",
    branchLabel: "Cool Daily",
    requiredReportKeys: [
      { key: "slug", type: "string" },
      { key: "report_date", type: "string" },
      { key: "category", type: "string" },
      { key: "total_papers", type: "number" },
      { key: "classifier", type: "string" },
      { key: "generated_at", type: "string" },
      { key: "source_url", type: "string" },
      { key: "focus_topics", type: "array" },
      { key: "top_topics", type: "array" },
    ],
  });
  requireArray(manifest, "category_order");
  requireArray(manifest, "latest_by_category");
  return manifest;
}

export function validateDailyReport(report) {
  return validateBranchReport(report, [
    { key: "report_date", type: "string" },
    { key: "category", type: "string" },
    { key: "classifier", type: "string" },
    { key: "total_papers", type: "number" },
    { key: "focus_topics", type: "array" },
    { key: "topic_distribution", type: "array" },
    { key: "papers", type: "array" },
  ]);
}

export function validateHfManifest(manifest) {
  return validateBranchManifest(manifest, {
    branchKey: "hf-daily",
    branchLabel: "HF Daily",
    requiredReportKeys: [
      { key: "slug", type: "string" },
      { key: "report_date", type: "string" },
      { key: "total_papers", type: "number" },
      { key: "classifier", type: "string" },
      { key: "generated_at", type: "string" },
      { key: "source_url", type: "string" },
      { key: "focus_topics", type: "array" },
      { key: "top_topics", type: "array" },
      { key: "top_submitters", type: "array" },
    ],
  });
}

export function validateHfReport(report) {
  return validateBranchReport(report, [
    { key: "report_date", type: "string" },
    { key: "classifier", type: "string" },
    { key: "total_papers", type: "number" },
    { key: "topic_distribution", type: "array" },
    { key: "top_submitters", type: "array" },
    { key: "papers", type: "array" },
  ]);
}

export function validateConferenceManifest(manifest) {
  return validateBranchManifest(manifest, {
    branchKey: "conference",
    branchLabel: "Conference",
    requiredReportKeys: [
      { key: "slug", type: "string" },
      { key: "venue", type: "string" },
      { key: "venue_series", type: "string" },
      { key: "venue_year", type: "string" },
      { key: "total_papers", type: "number" },
      { key: "classifier", type: "string" },
      { key: "generated_at", type: "string" },
      { key: "source_url", type: "string" },
      { key: "subject_distribution", type: "array" },
      { key: "top_topics", type: "array" },
    ],
  });
}

export function validateConferenceReport(report) {
  return validateBranchReport(report, [
    { key: "venue", type: "string" },
    { key: "venue_series", type: "string" },
    { key: "venue_year", type: "string" },
    { key: "classifier", type: "string" },
    { key: "total_papers", type: "number" },
    { key: "is_complete", type: "boolean" },
    { key: "subject_distribution", type: "array" },
    { key: "topic_distribution", type: "array" },
    { key: "papers", type: "array" },
  ]);
}

export function validateTrendingManifest(manifest) {
  return validateBranchManifest(manifest, {
    branchKey: "trending",
    branchLabel: "Trending",
    requiredReportKeys: [
      { key: "slug", type: "string" },
      { key: "snapshot_date", type: "string" },
      { key: "since", type: "string" },
      { key: "total_repositories", type: "number" },
      { key: "generated_at", type: "string" },
      { key: "source_url", type: "string" },
      { key: "top_languages", type: "array" },
      { key: "top_repositories", type: "array" },
    ],
  });
}

export function validateTrendingReport(report) {
  return validateBranchReport(report, [
    { key: "snapshot_date", type: "string" },
    { key: "since", type: "string" },
    { key: "total_repositories", type: "number" },
    { key: "language_distribution", type: "array" },
    { key: "top_repositories", type: "array" },
    { key: "repositories", type: "array" },
  ]);
}

export function validateMagazineManifest(manifest) {
  return validateBranchManifest(manifest, {
    branchKey: "magazine",
    branchLabel: "Magazine",
    requiredReportKeys: [
      { key: "slug", type: "string" },
      { key: "issue_number", type: "number" },
      { key: "issue_title", type: "string" },
      { key: "sync_date", type: "string" },
      { key: "sections_count", type: "number" },
      { key: "generated_at", type: "string" },
      { key: "source_url", type: "string" },
      { key: "cover_image_url", type: "string", allowEmpty: true },
      { key: "excerpt", type: "string", allowEmpty: true },
      { key: "headings", type: "array" },
    ],
  });
}

export function validateMagazineReport(report) {
  validateBranchReport(report, [
    { key: "report_kind", type: "string" },
    { key: "sync_date", type: "string" },
    { key: "issue_number", type: "number" },
    { key: "issue_slug", type: "string" },
    { key: "issue_title", type: "string" },
    { key: "raw_url", type: "string" },
    { key: "cover_image_url", type: "string", allowEmpty: true },
    { key: "excerpt", type: "string", allowEmpty: true },
    { key: "lead_markdown", type: "string", allowEmpty: true },
    { key: "sections_count", type: "number" },
    { key: "headings", type: "array" },
    { key: "sections", type: "array" },
  ]);
  requireString(report, "report_kind", { expected: "magazine" });
  return report;
}

export function validateBranchCatalogManifest(manifest) {
  requireObject("branch catalog manifest", manifest);
  requireString(manifest, "generated_at");
  requireNumber(manifest, "reports_count");
  const branches = requireArray(manifest, "branches");
  const reports = requireArray(manifest, "reports");
  if (manifest.reports_count !== reports.length) {
    throw new Error("branch catalog reports_count mismatch");
  }

  branches.forEach((branch) => {
    requireObject("branch catalog branch", branch);
    requireString(branch, "branch_key");
    requireString(branch, "branch_label");
    requireString(branch, "default_report_path", { allowEmpty: true });
    requireString(branch, "manifest_path");
    requireNumber(branch, "reports_count");
  });

  reports.forEach((report) => {
    requireObject("branch catalog report", report);
    requireString(report, "branch_key");
    requireString(report, "branch_label");
    requireString(report, "data_path");
    requireString(report, "search_text");
  });

  return manifest;
}
