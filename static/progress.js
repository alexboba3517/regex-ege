// Прогресс хранится в localStorage браузера — без сервера и без БД,
// как и весь остальной проект на этом этапе. Формат: объект вида
// {"escaping:1": true, "numbers:2": true, ...}, ключ — "blockId:exerciseId".

const PROGRESS_STORAGE_KEY = "regex-ege-progress";

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

function markExerciseSolved(blockId, exerciseId) {
  const progress = loadProgress();
  progress[`${blockId}:${exerciseId}`] = true;
  saveProgress(progress);
  updateProgressUI();
}

function isExerciseSolved(blockId, exerciseId) {
  return Boolean(loadProgress()[`${blockId}:${exerciseId}`]);
}

// Сколько упражнений решено в блоке / всего на сайте.
// exerciseMap — {blockId: [exerciseId, ...]}, зашит на каждой странице
// в <script id="exercise-map"> (см. templates/base.html).
function getExerciseMap() {
  const el = document.getElementById("exercise-map");
  return el ? JSON.parse(el.textContent) : {};
}

function countBlockProgress(blockId, exerciseMap) {
  const ids = exerciseMap[blockId] || [];
  const solved = ids.filter((id) => isExerciseSolved(blockId, id)).length;
  return { solved, total: ids.length };
}

function countTotalProgress(exerciseMap) {
  let solved = 0;
  let total = 0;
  for (const blockId in exerciseMap) {
    const counts = countBlockProgress(blockId, exerciseMap);
    solved += counts.solved;
    total += counts.total;
  }
  return { solved, total };
}

// Обновляет пилюлю в навбаре, общий прогресс-бар (#overall-progress, если
// есть на странице) и бейджи блоков (.block-progress-badge[data-block-id]).
function updateProgressUI() {
  const exerciseMap = getExerciseMap();
  const { solved: totalSolved, total: totalCount } = countTotalProgress(exerciseMap);

  const pill = document.getElementById("nav-progress-pill");
  if (pill) {
    pill.textContent = `${totalSolved} / ${totalCount}`;
  }

  const overallBar = document.getElementById("overall-progress");
  if (overallBar) {
    const fill = overallBar.querySelector(".progress-fill");
    const label = overallBar.querySelector(".progress-label");
    const percent = totalCount === 0 ? 0 : Math.round((totalSolved / totalCount) * 100);
    if (fill) fill.style.width = `${percent}%`;
    if (label) label.textContent = `Решено ${totalSolved} из ${totalCount} упражнений`;
  }

  document.querySelectorAll(".block-progress-badge[data-block-id]").forEach((badge) => {
    const blockId = badge.dataset.blockId;
    const { solved, total } = countBlockProgress(blockId, exerciseMap);
    if (total === 0) {
      badge.textContent = "";
      return;
    }
    badge.textContent = solved === total ? "✓ пройдено" : `${solved} / ${total}`;
    badge.classList.toggle("badge-done", solved === total);
  });
}

document.addEventListener("DOMContentLoaded", updateProgressUI);
