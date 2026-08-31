// Тестер под каждой темой в /theory/<block_id>. В отличие от практики
// (script.js), тут нет "правильного" ответа — просто показываем, что
// введённый пользователем regex совпадает со строками из примеров темы,
// а что нет. Использует тот же /check, что и практика.

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tester").forEach((tester) => {
    const form = tester.querySelector(".tester-form");
    const patternInput = tester.querySelector(".pattern-input");
    const errorBox = tester.querySelector(".error");
    const resultsList = tester.querySelector(".tester-results");
    const testStrings = JSON.parse(tester.querySelector(".tester-strings").textContent);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      errorBox.textContent = "";
      resultsList.innerHTML = "";

      const pattern = patternInput.value;
      if (!pattern) {
        return;
      }

      let response;
      try {
        response = await fetch("/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: pattern, test_strings: testStrings }),
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

      data.results.forEach((result) => {
        const shown = result.string === "" ? "(пусто)" : result.string;
        const li = document.createElement("li");
        li.className = "chip " + (result.matched ? "chip-yes" : "chip-no");
        li.textContent = shown;
        resultsList.appendChild(li);
      });
    });
  });
});
