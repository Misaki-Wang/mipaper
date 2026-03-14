import { readQueue, removeFromQueue, moveToLike, subscribeQueue, initQueue } from './paper_queue.js';
import { getSupabaseClient } from './supabase.js';

function renderPaper(paper, status) {
  const div = document.createElement('div');
  div.className = 'paper-item';

  const authors = Array.isArray(paper.authors) ? paper.authors.slice(0, 3).join(', ') : '';
  const moreAuthors = paper.authors?.length > 3 ? ` +${paper.authors.length - 3}` : '';

  div.innerHTML = `
    <div class="paper-header">
      <h3 class="paper-title">${escapeHtml(paper.title)}</h3>
      <span class="paper-topic">${escapeHtml(paper.topic_label || '')}</span>
    </div>
    <p class="paper-authors">${escapeHtml(authors)}${moreAuthors}</p>
    <p class="paper-abstract">${escapeHtml((paper.abstract || '').slice(0, 200))}...</p>
    <div class="paper-links">
      ${paper.pdf_url ? `<a href="${paper.pdf_url}" target="_blank">PDF</a>` : ''}
      ${paper.abs_url ? `<a href="${paper.abs_url}" target="_blank">Abstract</a>` : ''}
    </div>
    <div class="paper-actions">
      ${status === 'later' ? `<button class="btn-like" data-id="${paper.like_id}">Move to Like</button>` : ''}
      <button class="btn-remove" data-id="${paper.like_id}">Remove</button>
    </div>
  `;

  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderLaterList() {
  const laterList = document.getElementById('later-list');
  const papers = readQueue('later');

  laterList.innerHTML = '';

  if (papers.length === 0) {
    laterList.innerHTML = '<p class="empty-message">No papers in Later queue</p>';
    return;
  }

  papers.forEach(paper => {
    const elem = renderPaper(paper, 'later');
    laterList.appendChild(elem);
  });

  // Bind events
  laterList.querySelectorAll('.btn-like').forEach(btn => {
    btn.addEventListener('click', () => moveToLike(btn.dataset.id));
  });

  laterList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromQueue(btn.dataset.id));
  });
}

function renderLikeList() {
  const likeList = document.getElementById('like-list');
  const papers = readQueue('like');

  likeList.innerHTML = '';

  if (papers.length === 0) {
    likeList.innerHTML = '<p class="empty-message">No papers in Like collection</p>';
    return;
  }

  papers.forEach(paper => {
    const elem = renderPaper(paper, 'like');
    likeList.appendChild(elem);
  });

  // Bind events
  likeList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromQueue(btn.dataset.id));
  });
}

subscribeQueue(() => {
  renderLaterList();
  renderLikeList();
});

async function init() {
  const client = await getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();

  if (session) {
    await initQueue();
  }

  renderLaterList();
  renderLikeList();
}

init();
