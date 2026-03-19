export const TOPIC_LABEL_TRANSLATIONS = new Map([
  ["多模态理解与视觉", "Multimodal Understanding and Vision"],
  ["多模态理解和视觉", "Multimodal Understanding and Vision"],
  ["多模态生成建模", "Multimodal Generative Modeling"],
  ["多模态生成与建模", "Multimodal Generative Modeling"],
  ["多模态代理", "Multimodal Agents"],
  ["代理与规划", "Agents and Planning"],
  ["生成基础", "Generative Foundations"],
  ["领域应用", "Domain Applications"],
  ["数据集与基准", "Datasets and Benchmarks"],
  ["推理、对齐与评估", "Reasoning, Alignment, and Evaluation"],
  ["LLMs与语言", "LLMs and Language"],
  ["LLM与语言", "LLMs and Language"],
  ["机器人与具身AI", "Robotics and Embodied AI"],
]);

export const WORKFLOW_STATUS_OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "reading", label: "Reading" },
  { value: "digesting", label: "Digesting" },
  { value: "synthesized", label: "Synthesized" },
  { value: "archived", label: "Archived" },
];

export const PRIORITY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const LIKE_TIME_FORMAT = {
  locale: "en-US",
  emptyValue: "-",
  fallbackToOriginal: false,
  formatOptions: {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
};

export function getLibraryGroupKey(sourceKind) {
  return sourceKind === "trending" ? "trending" : "papers";
}

export function getLibraryGroupLabel(groupKey) {
  return groupKey === "trending" ? "Trending" : "Papers";
}

export function displayTopicLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "Other AI";
  }
  return TOPIC_LABEL_TRANSLATIONS.get(label) || label;
}

export function getWorkflowStatusValue(value) {
  return WORKFLOW_STATUS_OPTIONS.some((item) => item.value === value) ? value : "inbox";
}

export function getWorkflowStatusLabel(value) {
  return WORKFLOW_STATUS_OPTIONS.find((item) => item.value === getWorkflowStatusValue(value))?.label || "";
}

export function getPriorityValue(value) {
  return PRIORITY_OPTIONS.some((item) => item.value === value) ? value : "medium";
}

export function getPriorityLabel(value) {
  return PRIORITY_OPTIONS.find((item) => item.value === getPriorityValue(value))?.label || "";
}
