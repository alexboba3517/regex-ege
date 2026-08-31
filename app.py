# Точка входа Flask-приложения.
#
# Теория и практика разбиты на блоки (см. content/theory.json и
# content/exercises.json). У каждого блока есть свой id — один и тот же
# id используется в обоих файлах, чтобы со страницы теории можно было
# перейти на практику по той же теме, и наоборот.
#
# Маршруты:
#   /                       -> редирект на /theory
#   /theory                 -> список блоков теории
#   /theory/<block_id>      -> темы одного блока теории
#   /practice                -> список блоков практики
#   /practice/<block_id>    -> упражнения одного блока практики
#   /check (POST)            -> re.fullmatch: подходит ли КАЖДАЯ строка целиком
#   /check-find (POST)       -> re.finditer: какие фрагменты найдутся в строке
#   /check-code (POST)       -> текстовый анализ программы (без выполнения!)

import json
import re
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, url_for

app = Flask(__name__)

CONTENT_DIR = Path(__file__).parent / "content"


def load_exercises():
    with open(CONTENT_DIR / "exercises.json", encoding="utf-8") as f:
        return json.load(f)["blocks"]


def load_theory():
    with open(CONTENT_DIR / "theory.json", encoding="utf-8") as f:
        return json.load(f)["blocks"]


def find_block(blocks, block_id):
    for block in blocks:
        if block["id"] == block_id:
            return block
    abort(404)


def neighbors(blocks, block_id):
    # Соседние блоки по порядку в JSON — для ссылок "предыдущий/следующий"
    # на страницах теории и практики.
    ids = [b["id"] for b in blocks]
    index = ids.index(block_id)
    prev_block = blocks[index - 1] if index > 0 else None
    next_block = blocks[index + 1] if index < len(blocks) - 1 else None
    return prev_block, next_block


@app.context_processor
def inject_exercise_map():
    # {block_id: [exercise_id, ...]} нужен на каждой странице, чтобы
    # JS (static/progress.js) знал, сколько всего упражнений существует,
    # и мог посчитать прогресс по localStorage. Инжектируется через
    # context_processor, чтобы не передавать вручную в каждый render_template.
    exercise_map = {b["id"]: [e["id"] for e in b["exercises"]] for b in load_exercises()}
    return {"exercise_map": exercise_map}


@app.route("/")
def index():
    return redirect(url_for("theory_index"))


@app.route("/theory")
def theory_index():
    return render_template("theory_index.html", blocks=load_theory(), active="theory")


@app.route("/theory/<block_id>")
def theory_block(block_id):
    blocks = load_theory()
    content_block = find_block(blocks, block_id)
    prev_block, next_block = neighbors(blocks, block_id)
    return render_template(
        "theory_block.html",
        content_block=content_block,
        prev_block=prev_block,
        next_block=next_block,
        active="theory",
    )


@app.route("/practice")
def practice_index():
    return render_template("practice_index.html", blocks=load_exercises(), active="practice")


@app.route("/practice/<block_id>")
def practice_block(block_id):
    blocks = load_exercises()
    content_block = find_block(blocks, block_id)
    prev_block, next_block = neighbors(blocks, block_id)
    return render_template(
        "practice_block.html",
        content_block=content_block,
        prev_block=prev_block,
        next_block=next_block,
        active="practice",
    )


@app.route("/check", methods=["POST"])
def check():
    data = request.get_json(silent=True) or {}
    pattern = data.get("pattern", "")
    test_strings = data.get("test_strings", [])

    try:
        compiled = re.compile(pattern)
    except re.error as e:
        # Некорректный regex (например, несбалансированные скобки) —
        # возвращаем текст ошибки вместо результатов сравнения.
        return jsonify({"ok": False, "error": str(e)})

    results = [
        {"string": s, "matched": compiled.fullmatch(s) is not None}
        for s in test_strings
    ]
    return jsonify({"ok": True, "results": results})


@app.route("/check-find", methods=["POST"])
def check_find():
    # Отдельный эндпоинт (а не режим у /check), потому что вход и логика
    # реально другие: одна строка-источник вместо списка тестовых строк,
    # re.finditer вместо re.fullmatch.
    data = request.get_json(silent=True) or {}
    pattern = data.get("pattern", "")
    source = data.get("source", "")

    try:
        compiled = re.compile(pattern)
    except re.error as e:
        return jsonify({"ok": False, "error": str(e)})

    # Приём для пересекающихся совпадений — обернуть шаблон в (?=(...)) —
    # даёт совпадения нулевой длины (сам просмотр вперёд ничего не
    # "поглощает"), а найденный текст лежит в группе 1. Поэтому: если
    # весь матч пустой, а группа 1 есть — берём её, иначе как обычно group().
    matches = []
    for m in compiled.finditer(source):
        text = m.group()
        if text == "" and compiled.groups >= 1:
            text = m.group(1) or ""
        matches.append(text)

    return jsonify({"ok": True, "matches": matches})


CODE_IMPORT_RE = re.compile(r"import\s+re\b|from\s+re\s+import")
CODE_PRINT_RE = re.compile(r"\bprint\s*\(")
# Ищем шаблон, только если он передан ЯВНОЙ строкой прямо в вызов
# finditer/findall — например finditer(r'\d+', s). Если студент хранит
# шаблон в переменной (как часто делают в реальных решениях), извлечь его
# статическим анализом текста надёжно нельзя — тогда просто пропускаем
# бонусную проверку, не выдавая при этом неверный вердикт.
CODE_PATTERN_RE = re.compile(r"(?:re\.)?(?:finditer|findall)\s*\(\s*r?(['\"])(.*?)\1")


def compute_metric(matches, metric):
    if not matches:
        return 0
    if metric == "count":
        return len(matches)
    if metric == "max_run":
        return max(len(m) for m in matches)
    if metric == "min_run":
        return min(len(m) for m in matches)
    return None


@app.route("/check-code", methods=["POST"])
def check_code():
    # ВАЖНО: код студента здесь НИКОГДА не выполняется — ни exec, ни eval,
    # ни subprocess. Только текстовый анализ (есть ли import re, нужный
    # вызов, print, использована ли строка из условия). Единственное, что
    # реально прогоняется через движок re, — это сам шаблон, если его
    # получилось вытащить как строковый литерал; это не опаснее /check-find,
    # где мы точно так же компилируем regex от пользователя.
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    source = data.get("source", "")
    metric = data.get("metric", "")
    expected_answer = data.get("expected_answer")
    required_calls = data.get("required_calls", [])

    checks = {
        "has_import": bool(CODE_IMPORT_RE.search(code)),
        "has_call": any(re.search(r"\b" + re.escape(call) + r"\s*\(", code) for call in required_calls),
        "has_print": bool(CODE_PRINT_RE.search(code)),
        "has_source": bool(source) and source in code,
    }

    regex_check = {"found": False, "pattern": None, "computed": None, "correct": None, "error": None}
    match = CODE_PATTERN_RE.search(code)
    if match:
        pattern_text = match.group(2)
        regex_check["found"] = True
        regex_check["pattern"] = pattern_text
        try:
            compiled = re.compile(pattern_text)
        except re.error as e:
            regex_check["error"] = str(e)
        else:
            matches = []
            for m in compiled.finditer(source):
                text = m.group()
                if text == "" and compiled.groups >= 1:
                    text = m.group(1) or ""
                matches.append(text)
            computed = compute_metric(matches, metric)
            regex_check["computed"] = computed
            regex_check["correct"] = computed == expected_answer

    return jsonify({"ok": True, "checks": checks, "regex_check": regex_check})


@app.errorhandler(404)
def not_found(error):
    return render_template("404.html", active=None), 404


if __name__ == "__main__":
    app.run(debug=True)
