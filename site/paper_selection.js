import { readLikes, toggleLike } from "./likes.js?v=20260319-5";
import { addToQueue, readQueue, removeFromQueue } from "./paper_queue.js?v=20260319-5";

function getRecordTime(record) {
  return (
    (typeof record?.updated_at === "string" && record.updated_at) ||
    (typeof record?.client_updated_at === "string" && record.client_updated_at) ||
    (typeof record?.saved_at === "string" && record.saved_at) ||
    ""
  );
}

export function repairLikeLaterConflicts() {
  const likes = readLikes();
  const laterQueue = readQueue("later");
  const laterById = new Map(laterQueue.map((item) => [item.like_id, item]));
  const conflicts = likes.filter((item) => laterById.has(item.like_id));

  conflicts.forEach((likeRecord) => {
    const laterRecord = laterById.get(likeRecord.like_id);
    if (!laterRecord) {
      return;
    }

    const likeTime = getRecordTime(likeRecord);
    const laterTime = getRecordTime(laterRecord);

    if (likeTime >= laterTime) {
      removeFromQueue(likeRecord.like_id);
      return;
    }

    toggleLike(likeRecord);
  });
}

export function movePaperToLikes(record) {
  if (!record?.like_id) {
    return;
  }
  toggleLike(record);
  removeFromQueue(record.like_id);
}

export function movePaperToLater(paper, context = {}) {
  const record = paper?.like_id ? paper : null;
  const source = record || paper;
  if (!source) {
    return;
  }
  const likeId = source.like_id || "";
  addToQueue(source, context);
  if (likeId && readLikes().some((item) => item.like_id === likeId)) {
    toggleLike(source);
  }
}
