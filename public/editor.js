// Dependency-free document editor. Sanitization is also applied to pasted HTML,
// previews and saved content. Only explicit presentational styles are retained.
const allowed = new Set(
  "P DIV BR H1 H2 H3 H4 UL OL LI BLOCKQUOTE STRONG B EM I U S STRIKE A SPAN FONT IMG TABLE THEAD TBODY TR TD TH HR".split(
    " ",
  ),
);
const safeUrl = (value) => /^(https?:\/\/|\/(?!\/)|mailto:)/i.test(value || "");
const safeStyle = (style) => {
  const result = [];
  for (const part of String(style || "").split(";")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const key = part.slice(0, index).trim().toLowerCase(),
      val = part.slice(index + 1).trim();
    // Strip default paper/ink colors from pasted documents; preserve deliberate accents.
    const compact = val.toLowerCase().replace(/\s/g, "");
    if (key === "background-color" && /^(white|#fff|#ffffff|#fffdf8|rgb\(255,255,255\)|rgba\(255,255,255,1\))$/.test(compact)) continue;
    if (key === "color" && /^(black|#000|#000000|#292b28|rgb\(0,0,0\)|rgba\(0,0,0,1\))$/.test(compact)) continue;
    if (
      (key === "text-align" && /^(left|center|right|justify)$/.test(val)) ||
      (key === "font-weight" && /^(bold|normal|[1-9]00)$/.test(val)) ||
      (key === "font-style" && /^(italic|normal)$/.test(val)) ||
      (key === "text-decoration" &&
        /^(underline|line-through|none)( (underline|line-through))?$/.test(
          val,
        )) ||
      (["color", "background-color"].includes(key) &&
        /^(#[a-f0-9]{3,8}|[a-z]{1,20}|rgba?\([\d.,%\s]+\))$/i.test(val)) ||
      (key === "font-size" &&
        /^(\d{1,2}(\.\d{1,2})?(px|pt)|small|medium|large|x-large|xx-large)$/.test(
          val,
        )) ||
      (key === "font-family" && /^[a-zA-Z\s,'"-]{1,100}$/.test(val))
    )
      result.push(`${key}:${val}`);
  }
  return result.join(";");
};
export function sanitizeRich(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  for (const el of [...doc.body.querySelectorAll("*")]) {
    if (
      [
        "SCRIPT",
        "STYLE",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "SVG",
        "MATH",
        "FORM",
        "INPUT",
        "BUTTON",
        "TEMPLATE",
      ].includes(el.tagName)
    ) {
      el.remove();
      continue;
    }
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    const style = safeStyle(el.getAttribute("style"));
    const attrs = Object.fromEntries(
      [...el.attributes].map((a) => [a.name, a.value]),
    );
    for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
    if (style) el.setAttribute("style", style);
    if (el.tagName === "A" && safeUrl(attrs.href)) {
      el.setAttribute("href", attrs.href);
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (el.tagName === "IMG") {
      if (
        !/^(\/uploads\/[^/]+|https?:\/\/|\/assets\/)/i.test(attrs.src || "")
      ) {
        el.remove();
        continue;
      }
      el.setAttribute("src", attrs.src);
      el.setAttribute("alt", attrs.alt || "");
    }
    if (el.tagName === "SPAN" && attrs.class === "mention")
      el.className = "mention";
    if (el.tagName === "FONT") {
      if (/^[1-7]$/.test(attrs.size || "")) el.setAttribute("size", attrs.size);
      if (/^[a-zA-Z\s,'"-]{1,100}$/.test(attrs.face || ""))
        el.setAttribute("face", attrs.face);
      if (/^(#[a-f0-9]{3,8}|[a-z]{1,20})$/i.test(attrs.color || "") && !/^(black|#000|#000000|#292b28)$/i.test(attrs.color || ""))
        el.setAttribute("color", attrs.color);
    }
  }
  return doc.body.innerHTML;
}
export function richToolbar() {
  return `<div class="rich-toolbar document-toolbar" role="toolbar" aria-label="Форматирование документа">
    <button type="button" data-cmd="undo" title="Отменить (Ctrl+Z)">Отменить</button><button type="button" data-cmd="redo" title="Повторить (Ctrl+Y)">Повторить</button>
    <label>Стиль<select data-command="formatBlock" aria-label="Стиль абзаца"><option value="p">Обычный текст</option><option value="h1">Заголовок 1</option><option value="h2">Заголовок 2</option><option value="h3">Заголовок 3</option><option value="blockquote">Цитата</option></select></label>
    <label>Шрифт<select data-command="fontName" aria-label="Шрифт"><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option></select></label>
    <label>Размер<select data-command="fontSize" aria-label="Размер текста"><option value="2">10</option><option value="3" selected>12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option></select></label>
    <button type="button" data-cmd="bold" title="Полужирный (Ctrl+B)"><b>B</b></button><button type="button" data-cmd="italic" title="Курсив (Ctrl+I)"><i>I</i></button><button type="button" data-cmd="underline" title="Подчёркнутый (Ctrl+U)"><u>U</u></button><button type="button" data-cmd="strikeThrough" title="Зачёркнутый"><s>S</s></button>
    <label>Цвет<input type="color" data-command="foreColor" aria-label="Цвет текста" value="#d9d1c2"></label><label>Выделение<input type="color" data-command="hiliteColor" aria-label="Цвет выделения" value="#fff2a8"></label>
    <button type="button" data-cmd="justifyLeft" title="По левому краю">Слева</button><button type="button" data-cmd="justifyCenter" title="По центру">Центр</button><button type="button" data-cmd="justifyRight" title="По правому краю">Справа</button><button type="button" data-cmd="justifyFull" title="По ширине">По ширине</button>
    <button type="button" data-cmd="insertUnorderedList">• Список</button><button type="button" data-cmd="insertOrderedList">1. Список</button><button type="button" data-cmd="outdent" title="Уменьшить отступ">− Отступ</button><button type="button" data-cmd="indent" title="Увеличить отступ">+ Отступ</button>
    <button type="button" id="insertLink">Ссылка</button><button type="button" data-cmd="unlink">Без ссылки</button><button type="button" id="insertTable">Таблица</button><button type="button" id="insertMention">@ Упоминание</button><button type="button" data-cmd="removeFormat">Сброс формата</button>
    <label class="rich-upload" title="Загрузить изображение">Изображение<input id="richImageUpload" class="hidden-field" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
  </div>`;
}
export function bindRichEditor(rich, content) {
  let selection;
  const saveSelection = () => {
    const s = window.getSelection();
    if (
      s?.rangeCount &&
      rich.contains(s.anchorNode) &&
      rich.contains(s.focusNode)
    )
      selection = s.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    rich.focus();
    const s = window.getSelection();
    if (selection && rich.contains(selection.commonAncestorContainer)) {
      s.removeAllRanges();
      s.addRange(selection);
    } else {
      const range = document.createRange();
      range.selectNodeContents(rich);
      range.collapse(false);
      s.removeAllRanges();
      s.addRange(range);
    }
  };
  const sync = () => {
    content.value = sanitizeRich(rich.innerHTML);
    const words = rich.innerText.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById("editorStatus").textContent =
      `Слов: ${words} · Символов: ${rich.innerText.length} · Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Z`;
  };
  const command = (cmd, value = null) => {
    restore();
    document.execCommand(cmd, false, value);
    saveSelection();
    sync();
    rich.dispatchEvent(new Event("input", { bubbles: true }));
  };
  rich.addEventListener("input", sync);
  rich.addEventListener("keyup", saveSelection);
  rich.addEventListener("mouseup", saveSelection);
  rich.addEventListener("blur", saveSelection);
  const toolbar = document.querySelector(".document-toolbar");
  toolbar.addEventListener("mousedown", (e) => {
    saveSelection();
    if (e.target.closest("button")) e.preventDefault();
  });
  toolbar
    .querySelectorAll("[data-cmd]")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        command(btn.dataset.cmd, btn.dataset.value || null),
      ),
    );
  toolbar
    .querySelectorAll("[data-command]")
    .forEach((input) =>
      input.addEventListener("change", () =>
        command(input.dataset.command, input.value),
      ),
    );
  document.getElementById("insertLink").addEventListener("click", () => {
    const url = prompt("Адрес ссылки (https://… или /…)");
    if (!url) return;
    if (!safeUrl(url)) {
      alert("Нужен безопасный адрес: https://, http://, / или mailto:");
      return;
    }
    command("createLink", url);
  });
  document.getElementById("insertTable").addEventListener("click", () => {
    const size = prompt(
      "Размер таблицы: строки x столбцы (например, 3x3)",
      "3x3",
    );
    const match = size?.match(/^\s*(\d{1,2})\s*[xх×]\s*(\d{1,2})\s*$/i);
    if (!match) return;
    const rows = Number(match[1]),
      cols = Number(match[2]);
    if (rows < 1 || rows > 20 || cols < 1 || cols > 10) {
      alert("Допустимо 1–20 строк и 1–10 столбцов");
      return;
    }
    command(
      "insertHTML",
      `<table><tbody>${Array.from({ length: rows }, () => `<tr>${"<td><br></td>".repeat(cols)}</tr>`).join("")}</tbody></table><p><br></p>`,
    );
  });
  document.getElementById("insertMention").addEventListener("click", () => {
    const name = prompt("Ник пользователя без @");
    if (/^[a-zа-яё0-9_-]{3,32}$/i.test(name || ""))
      command("insertHTML", `<span class="mention">@${name}</span>&nbsp;`);
  });
  rich.addEventListener("paste", (e) => {
    e.preventDefault();
    const data = e.clipboardData;
    const html = data.getData("text/html");
    if (html) command("insertHTML", sanitizeRich(html));
    else command("insertText", data.getData("text/plain"));
  });
  // Do not allow dropped HTML/files to bypass sanitized paste/upload paths.
  rich.addEventListener("drop", (e) => e.preventDefault());
  sync();
  return { insert: (html) => command("insertHTML", sanitizeRich(html)) };
}
