// Изолированная eval-страница — не часть пользовательского reader. Подсветка
// текущего токена идёт через requestAnimationFrame + бинарный поиск по
// startTime (не через 'timeupdate'), чтобы точность подсветки отражала само
// качество alignment, а не частоту браузерного события.

const audio = document.getElementById('audio');
const articleEl = document.getElementById('article');
const selectedWordEl = document.getElementById('selectedWord');
const top15Body = document.getElementById('top15Body');
const statusText = document.getElementById('statusText');

const [snapshot, whisperTimestamps, elevenlabsTimestamps, comparison] = await Promise.all([
  fetchJson('/lesson-snapshot.json'),
  fetchJson('/whisper-timestamps.json'),
  fetchJson('/elevenlabs-timestamps.json'),
  fetchJson('/comparison.json'),
]);

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Не удалось загрузить ${path}: ${res.status}`);
  return res.json();
}

const tokensById = new Map(snapshot.tokens.map((t) => [t.id, t]));

// { whisper: [{tokenId,startTime,endTime}, ...] sorted by startTime, elevenlabs: [...] }
const sourcesData = {
  whisper: buildSortedTimeline(whisperTimestamps),
  elevenlabs: buildSortedTimeline(elevenlabsTimestamps),
};
const missingBySource = {
  whisper: computeMissing(whisperTimestamps),
  elevenlabs: computeMissing(elevenlabsTimestamps),
};

function buildSortedTimeline(timestampsById) {
  return Object.entries(timestampsById)
    .map(([tokenId, t]) => ({ tokenId, startTime: t.startTime, endTime: t.endTime }))
    .sort((a, b) => a.startTime - b.startTime);
}

function computeMissing(timestampsById) {
  const missing = new Set();
  for (const token of snapshot.tokens) {
    if (token.type !== 'word') continue;
    if (!(token.id in timestampsById)) missing.add(token.id);
  }
  return missing;
}

// Первый индекс i такой, что arr[i].startTime <= t (последний старт <= t).
function binarySearchActive(sortedTimeline, t) {
  let lo = 0;
  let hi = sortedTimeline.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTimeline[mid].startTime <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? sortedTimeline[ans] : null;
}

// ---------- рендер текста ----------

function renderArticle() {
  const { text, spans } = snapshot;
  const spanByStart = new Map(spans.map((s) => [s.start, s]));
  let html = '';
  let i = 0;
  while (i < text.length) {
    const span = spanByStart.get(i);
    if (span) {
      const token = tokensById.get(span.tokenId);
      const chunk = escapeHtml(text.slice(span.start, span.end));
      if (token && token.type === 'word') {
        html += `<span class="tok" data-token-id="${span.tokenId}">${chunk}</span>`;
      } else {
        html += chunk;
      }
      i = span.end;
    } else {
      html += escapeHtml(text[i]);
      i += 1;
    }
  }
  articleEl.innerHTML = html;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyMissingIndicators() {
  const missing = missingBySource[state.source];
  articleEl.querySelectorAll('.tok').forEach((el) => {
    el.classList.toggle('missing-timing', missing.has(el.dataset.tokenId));
  });
}

// ---------- состояние ----------

const state = { source: 'whisper', rate: 1, activeTokenId: null };

function setActiveToken(tokenId) {
  if (tokenId === state.activeTokenId) return;
  if (state.activeTokenId) {
    articleEl.querySelector(`[data-token-id="${state.activeTokenId}"]`)?.classList.remove('active');
  }
  if (tokenId) {
    articleEl.querySelector(`[data-token-id="${tokenId}"]`)?.classList.add('active');
  }
  state.activeTokenId = tokenId;
  renderSelectedWord(tokenId);
}

function renderSelectedWord(tokenId) {
  if (!tokenId) {
    selectedWordEl.textContent = 'Кликни по слову в тексте или в списке ниже.';
    return;
  }
  const token = tokensById.get(tokenId);
  const w = whisperTimestamps[tokenId];
  const e = elevenlabsTimestamps[tokenId];
  const diffEntry = comparison.diffs.all.find((d) => d.tokenId === tokenId);
  const parts = [`<strong>${escapeHtml(token?.text ?? tokenId)}</strong> (${tokenId})`];
  parts.push(w ? `Whisper: ${w.startTime.toFixed(3)}–${w.endTime.toFixed(3)}s` : '<span class="missing-badge">Whisper: нет таймкода</span>');
  parts.push(e ? `ElevenLabs: ${e.startTime.toFixed(3)}–${e.endTime.toFixed(3)}s` : '<span class="missing-badge">ElevenLabs: нет таймкода</span>');
  if (diffEntry) parts.push(`Разница: start ${diffEntry.startDiff}s / end ${diffEntry.endDiff}s`);
  selectedWordEl.innerHTML = parts.join(' &nbsp;·&nbsp; ');
}

function seekAndPlayToken(tokenId) {
  const timeline = sourcesData[state.source];
  const entry = timeline.find((t) => t.tokenId === tokenId);
  if (!entry) {
    setActiveToken(tokenId);
    return;
  }
  audio.currentTime = entry.startTime;
  audio.play();
  setActiveToken(tokenId);
}

// ---------- controls ----------

document.getElementById('playBtn').addEventListener('click', () => {
  if (audio.paused) audio.play();
  else audio.pause();
});
audio.addEventListener('play', () => (document.getElementById('playBtn').textContent = '⏸ Pause'));
audio.addEventListener('pause', () => (document.getElementById('playBtn').textContent = '▶ Play'));

document.getElementById('rateSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-rate]');
  if (!btn) return;
  state.rate = Number(btn.dataset.rate);
  audio.playbackRate = state.rate;
  document.querySelectorAll('#rateSeg button').forEach((b) => b.classList.toggle('active', b === btn));
});

document.getElementById('sourceSeg').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-source]');
  if (!btn) return;
  // Переключение источника НЕ трогает audio.currentTime/play-state — только
  // меняет, какой набор таймкодов используется для подсветки на следующем тике.
  state.source = btn.dataset.source;
  document.querySelectorAll('#sourceSeg button').forEach((b) => b.classList.toggle('active', b === btn));
  applyMissingIndicators();
  statusText.textContent = `Источник: ${btn.textContent}`;
});

articleEl.addEventListener('click', (e) => {
  const el = e.target.closest('.tok[data-token-id]');
  if (!el) return;
  seekAndPlayToken(el.dataset.tokenId);
});

function renderTop15() {
  top15Body.innerHTML = '';
  for (const d of comparison.diffs.top15) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `<td>${escapeHtml(d.displayText)}</td><td>${d.whisperStart}–${d.whisperEnd}</td><td>${d.elevenStart}–${d.elevenEnd}</td><td>${d.maxDiff}s</td>`;
    tr.addEventListener('click', () => {
      const el = articleEl.querySelector(`[data-token-id="${d.tokenId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      seekAndPlayToken(d.tokenId);
    });
    top15Body.appendChild(tr);
  }
}

// ---------- rAF highlight loop ----------

function tick() {
  const timeline = sourcesData[state.source];
  const active = binarySearchActive(timeline, audio.currentTime);
  setActiveToken(active ? active.tokenId : null);
  requestAnimationFrame(tick);
}

renderArticle();
applyMissingIndicators();
renderTop15();
requestAnimationFrame(tick);
