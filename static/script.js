// Логика страницы practice_block.html. На странице может быть несколько
// упражнений (секций .exercise), у каждого своя форма. Есть три типа
// упражнений (см. содержимое .exercise-data):
//   - {test_strings: [...]} — проверяется через /check (re.fullmatch);
//   - {source, expected_matches: [...]} — проверяется через /check-find
//     (re.finditer): пользователь ищет фрагменты внутри строки source;
//   - {kind: "code", source, metric, expected_answer, required_calls} —
//     проверяется через /check-code: пользователь пишет ПОЛНУЮ программу,
//     код анализируется как текст (никогда не выполняется), см. app.py.
// При полностью верном решении упражнение отмечается решённым через
// markExerciseSolved (см. static/progress.js).

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".exercise").forEach((section) => {
    const blockId = section.dataset.blockId;
    const exerciseId = section.dataset.exerciseId;
    const solvedBadge = section.querySelector(".exercise-solved-badge");
    const form = section.querySelector(".check-form");
    const errorBox = section.querySelector(".error");
    const resultsList = section.querySelector(".results");
    const exercise = JSON.parse(section.querySelector(".exercise-data").textContent);

    if (isExerciseSolved(blockId, exerciseId)) {
      solvedBadge.textContent = "✓ решено";
    }

    const markSolved = () => {
      solvedBadge.textContent = "✓ решено";
      markExerciseSolved(blockId, exerciseId);
    };

    const isCodeExercise = exercise.kind === "code";
    const isFindExercise = !isCodeExercise && exercise.source !== undefined;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorBox.textContent = "";
      resultsList.innerHTML = "";

      let endpoint = "/check";
      let body = {};
      if (isCodeExercise) {
        endpoint = "/check-code";
        body = {
          code: section.querySelector(".code-input").value,
          source: exercise.source,
          metric: exercise.metric,
          expected_answer: exercise.expected_answer,
          required_calls: exercise.required_calls,
        };
      } else if (isFindExercise) {
        endpoint = "/check-find";
        body = { pattern: section.querySelector(".pattern-input").value, source: exercise.source };
      } else {
        body = {
          pattern: section.querySelector(".pattern-input").value,
          test_strings: exercise.test_strings.map((t) => t.value),
        };
      }

      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (networkError) {
        errorBox.textContent = "Не удалось связаться с сервером: " + networkError;
        return;
      }

      const data = await response.json();

      if (!data.ok) {
        errorBox.textContent = "Ошибка в регулярном выражении: " + data.error;
        return;
      }

      if (isCodeExercise) {
        renderCodeResult(data.checks, data.regex_check, resultsList, markSolved);
      } else if (isFindExercise) {
        renderFindResult(data.matches, exercise.expected_matches, resultsList, markSolved);
      } else {
        renderFullmatchResult(data.results, exercise.test_strings, resultsList, markSolved);
      }
    });
  });
});

function renderFullmatchResult(results, testStrings, resultsList, markSolved) {
  let allCorrect = true;

  results.forEach((result, index) => {
    const expected = testStrings[index].expected;
    const correct = result.matched === expected;
    if (!correct) allCorrect = false;

    const shown = result.string === "" ? "(пустая строка)" : result.string;

    const li = document.createElement("li");
    li.className = correct ? "result-correct" : "result-wrong";
    li.textContent =
      `"${shown}" — ${result.matched ? "совпадает" : "не совпадает"} ` +
      `(ожидалось: ${expected ? "совпадает" : "не совпадает"}) ` +
      (correct ? "✓" : "✗");
    resultsList.appendChild(li);
  });

  appendSummary(resultsList, allCorrect);
  if (allCorrect) markSolved();
}

function renderFindResult(matches, expectedMatches, resultsList, markSolved) {
  const correct = JSON.stringify(matches) === JSON.stringify(expectedMatches);

  const foundLine = document.createElement("li");
  foundLine.className = correct ? "result-correct" : "result-wrong";
  foundLine.appendChild(document.createTextNode("Найдено: "));
  appendChips(foundLine, matches, correct ? "chip-yes" : "chip-no");
  resultsList.appendChild(foundLine);

  if (!correct) {
    const expectedLine = document.createElement("li");
    expectedLine.className = "result-wrong";
    expectedLine.appendChild(document.createTextNode("Ожидалось: "));
    appendChips(expectedLine, expectedMatches, "chip-neutral");
    resultsList.appendChild(expectedLine);
  }

  appendSummary(resultsList, correct);
  if (correct) markSolved();
}

function renderCodeResult(checks, regexCheck, resultsList, markSolved) {
  const checklist = [
    [checks.has_import, "подключён модуль re (import re)"],
    [checks.has_call, "используется finditer или findall"],
    [checks.has_print, "результат выводится через print(...)"],
    [checks.has_source, "в коде используется данная строка"],
  ];

  checklist.forEach(([ok, label]) => {
    const li = document.createElement("li");
    li.className = ok ? "result-correct" : "result-wrong";
    li.textContent = (ok ? "✓ " : "✗ ") + label;
    resultsList.appendChild(li);
  });

  const structuralOk = checklist.every(([ok]) => ok);

  if (regexCheck.error) {
    const li = document.createElement("li");
    li.className = "result-wrong";
    li.textContent = `Найденный шаблон "${regexCheck.pattern}" некорректен: ${regexCheck.error}`;
    resultsList.appendChild(li);
  } else if (regexCheck.found) {
    const correct = regexCheck.correct === true;
    const li = document.createElement("li");
    li.className = correct ? "result-correct" : "result-wrong";
    li.textContent =
      `Шаблон "${regexCheck.pattern}" даёт ответ ${regexCheck.computed} ` +
      (correct ? "— совпадает с ожидаемым ✓" : "— это не тот ответ ✗");
    resultsList.appendChild(li);
  } else {
    const li = document.createElement("li");
    li.className = "result-wrong";
    li.textContent =
      "Не удалось автоматически найти шаблон прямо в вызове finditer/findall " +
      "(например, он хранится в переменной) — сам ответ не проверен, только структура кода.";
    resultsList.appendChild(li);
  }

  const regexOk = !regexCheck.found || regexCheck.correct === true;
  const allCorrect = structuralOk && regexOk;

  appendSummary(resultsList, allCorrect);
  if (allCorrect) markSolved();
}

function appendChips(container, values, chipClass) {
  if (values.length === 0) {
    container.appendChild(document.createTextNode("(ничего не найдено)"));
    return;
  }
  values.forEach((value) => {
    const chip = document.createElement("code");
    chip.className = "chip " + chipClass;
    chip.textContent = value === "" ? "(пусто)" : value;
    container.appendChild(chip);
  });
}

function appendSummary(resultsList, allCorrect) {
  const summary = document.createElement("li");
  summary.className = allCorrect ? "result-correct" : "result-wrong";
  summary.textContent = allCorrect
    ? "Упражнение выполнено верно!"
    : "Пока не всё верно, попробуйте ещё раз.";
  resultsList.appendChild(summary);
}
