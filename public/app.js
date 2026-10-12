import { rotationIndex } from "./site.js";
import { sanitizeRich, bindRichEditor, richToolbar } from "./editor.js";
const TYPE_LABELS = {
  characters: "Персонажи",
  factions: "Фракции",
  locations: "Локации",
  creatures: "Бестиарий",
  items: "Предметы",
  articles: "Лор",
  events: "События",
  quests: "Квесты",
  campaigns: "Кампании",
  magic: "Магия",
  units: "Юниты",
  sessions: "Сессии",
  religions: "Религии",
  races: "Народы",

  sheets: "Листы персонажей",
};
const TYPE_GROUPS = [
  {
    label: "Каталог",
    types: ["articles", "locations", "races", "religions", "events", "magic"],
  },
  {
    label: "Личности и силы",
    types: ["characters", "factions", "units", "creatures"],
  },
  {
    label: "Игра",
    types: ["campaigns", "quests", "sessions", "sheets", "items"],
  },
];
const TYPE_ORDER = TYPE_GROUPS.flatMap((g) => g.types);
const FIELD_SCHEMAS = {
  characters: [
    ["race", "Народ", "text"],
    ["class", "Класс", "text"],
    ["level", "Уровень", "number"],
    ["hp", "HP", "number"],
    ["maxHp", "Макс. HP", "number"],
    ["ac", "КД", "number"],
    ["initiative", "Инициатива", "text"],
    ["speed", "Скорость", "text"],
    ["age", "Возраст", "text"],
    ["status", "Статус", "text"],
    ["title", "Титул", "text"],
    ["goals", "Цели", "textarea"],
    ["secrets", "Секреты мастера", "textarea"],
    ["stats", "Характеристики", "stats"],
    ["skills", "Навыки", "textarea"],
    ["spells", "Заклинания", "textarea"],
    ["inventory", "Инвентарь", "textarea"],
    ["gold", "Золото", "number"],
    ["experience", "Опыт", "number"],
  ],
  factions: [
    ["leader", "Лидер", "text"],
    ["alignment", "Стремления", "text"],
    ["founded", "Основана", "text"],
    ["goal", "Цель", "textarea"],
  ],
  locations: [
    ["kind", "Тип", "text"],
    ["population", "Население", "text"],
    ["ruler", "Правитель", "text"],
    ["climate", "Климат", "text"],
    ["danger", "Опасность", "text"],
  ],
  creatures: [
    ["type", "Тип", "text"],
    ["size", "Размер", "text"],
    ["danger", "Опасность", "text"],
    ["hp", "HP", "number"],
    ["ac", "КД", "number"],
    ["habitat", "Среда обитания", "text"],
    ["abilities", "Способности", "textarea"],
  ],
  items: [
    ["rarity", "Редкость", "text"],
    ["weight", "Вес", "text"],
    ["origin", "Происхождение", "text"],
    ["ability", "Свойства", "textarea"],
    ["ac", "КД (класс доспеха)", "number"],
    ["damage", "Урон", "text"],
  ],
  articles: [],
  events: [
    ["year", "Год", "text"],
    ["era", "Эра", "text"],
    ["location", "Место", "text"],
  ],
  quests: [
    ["status", "Статус", "text"],
    ["reward", "Награда", "text"],
    ["giver", "Заказчик", "text"],
    ["difficulty", "Сложность", "text"],
  ],
  campaigns: [
    ["status", "Статус", "text"],
    ["players", "Игроков", "number"],
    ["level", "Уровень", "text"],
    ["tone", "Тон", "text"],
  ],
  maps: [
    ["imageUrl", "Карта — URL изображения", "text"],
    ["width", "Ширина", "number"],
    ["height", "Высота", "number"],
    [
      "layers",
      "Слои карты (по строке: id | название | visible/hidden)",
      "textarea",
    ],
    ["pins", "Маркеры", "pins"],
  ],
  units: [
    ["category", "Категория", "text"],
    ["rank", "Ранг", "text"],
    ["hp", "HP", "number"],
    ["ac", "КД", "number"],
    ["damage", "Урон", "text"],
    ["abilities", "Способности", "textarea"],
  ],
  sessions: [
    ["number", "Номер", "text"],
    ["date", "Дата", "text"],
    ["players", "Игроки", "text"],
    ["location", "Место", "text"],
    ["next", "Следующий шаг", "textarea"],
  ],
  religions: [["symbol", "Символ", "text"]],
  races: [
    ["language", "Язык", "text"],
    ["culture", "Культура", "textarea"],
    ["homeland", "Родина", "text"],
  ],
  stories: [
    ["nodes", "Узлы сюжета (Название -> Вариант A, Вариант B)", "textarea"],
    ["state", "Текущая ветвь", "text"],
  ],
};
const COMBAT_TYPES = new Set(["characters", "units", "creatures", "sheets"]);
FIELD_SCHEMAS.sheets = FIELD_SCHEMAS.characters.map((row) => [...row]);
for (const type of ["units", "creatures"]) {
  const specific = FIELD_SCHEMAS[type];
  FIELD_SCHEMAS[type] = [
    ...FIELD_SCHEMAS.characters.map((row) => [...row]),
    ...specific.filter(
      ([key]) => !FIELD_SCHEMAS.characters.some(([k]) => k === key),
    ),
  ];
}
const STAT_LABELS = { STR: "Сила", DEX: "Ловкость", CON: "Телосложение", INT: "Интеллект", WIS: "Мудрость", CHA: "Харизма" };
const STAT_SHORT = { STR: "С", DEX: "Л", CON: "Т", INT: "И", WIS: "М", CHA: "Х" };
const RETIRED_TYPES = new Set(["maps", "stories"]);
const isRetired = (e) => RETIRED_TYPES.has(e.type);
FIELD_SCHEMAS.magic = [["school", "Школа", "text"], ["level", "Уровень", "text"], ["cost", "Стоимость", "text"], ["castingTime", "Время применения", "text"], ["range", "Дальность", "text"], ["duration", "Длительность", "text"]];
for (const type of ["characters", "units", "creatures"]) {
  FIELD_SCHEMAS[type] = FIELD_SCHEMAS[type].filter(([k]) => !["category", "rank", "abilities"].includes(k) && (type === "characters" || k !== "title"));
  if (!FIELD_SCHEMAS[type].some(([k]) => k === "damage")) FIELD_SCHEMAS[type].push(["damage", "Урон", "text"]);
}
FIELD_SCHEMAS.items = [["rarity", "Редкость", "text"], ["weight", "Вес", "text"], ["cost", "Стоимость", "text"], ["ac", "КД", "number"], ["damage", "Урон", "text"], ["origin", "Происхождение", "text"], ["ability", "Свойства", "textarea"]];
FIELD_SCHEMAS.factions = FIELD_SCHEMAS.factions.map(row => row[0] === "goal" ? ["goal", "Статус", "textarea"] : row);
FIELD_SCHEMAS.factions.push(["relationships", "Отношения", "textarea"]);
const VISIBILITY = {
  PUBLIC: "Публично",
  PLAYER: "Игроку / владельцу",
  GM: "Мастерская",
  PRIVATE: "Только администратор",
};
const PUBLICATION = { PUBLISHED: "Опубликовано", DRAFT: "Черновик" };

let state = { user: null, entities: [], users: [], csrf: null, loading: true };
const view = document.getElementById("view");
const breadcrumbs = document.getElementById("breadcrumbs");
const toast = document.getElementById("toast");
const sidebar = document.getElementById("sidebar");
const nav = document.getElementById("mainNav");

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
const decodePath = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
const fmt = (v) =>
  v
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(v))
    : "";
const typeLabel = (t) => TYPE_LABELS[t] || t;
const safeAssetUrl = (value, fallback = "") => {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : fallback;
};
const visibleType = (t) => state.entities.filter((e) => e.type === t);
const getEntity = (id) =>
  state.entities.find((e) => e.id === id || e.slug === id);
const link = (path, text, cls = "") =>
  `<a class="${cls}" href="${path}" data-route="${path}">${text}</a>`;
const uiIcon = (id) =>
  `<svg class="ui-icon" aria-hidden="true"><use href="/assets/icons.svg#${id}"></use></svg>`;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 2400);
}
function icon(type) {
  const id =
    {
      magic: "sun",
      articles: "book",
      locations: "pin",
      races: "users",
      religions: "sun",
      events: "clock",
      characters: "user",
      factions: "faction",
      units: "shield",
      creatures: "paw",
      campaigns: "campaign",
      quests: "quest",
      sessions: "calendar",
      items: "gem",
      maps: "map",
      stories: "branch",
      sheets: "users",
    }[type] || "world";
  return `<svg class="ui-icon" aria-hidden="true"><use href="/assets/icons.svg#${id}"></use></svg>`;
}

function iconMark(type) {
  return `<span class="type-mark type-${type}" aria-hidden="true">${icon(type)}</span>`;
}
function markdown(text) {
  const source = String(text || "");
  if (/<[a-z][^>]*>/i.test(source)) return sanitizeRich(source);
  return source
    .split(/\n\n+/)
    .map((block) => {
      const b = block.trim();
      if (!b) return "";
      if (/^###\s/.test(b))
        return `<h3>${inlineRich(esc(b.replace(/^###\s/, "")))}</h3>`;
      if (/^##?\s/.test(b))
        return `<h2>${inlineRich(esc(b.replace(/^##?\s/, "")))}</h2>`;
      if (/^[-*]\s/m.test(b))
        return `<ul>${b
          .split("\n")
          .map((x) => `<li>${inlineRich(esc(x.replace(/^[-*]\s/, "")))}</li>`)
          .join("")}</ul>`;
      return `<p>${inlineRich(esc(b).replace(/\n/g, "<br>"))}</p>`;
    })
    .join("");
}
function inlineRich(v) {
  return v
    .replace(/@([a-zа-яё0-9_-]{3,32})/gi, '<span class="mention">@$1</span>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function fieldLabel(k, type) {
  const match = FIELD_SCHEMAS[type]?.find(([key]) => key === k);
  if (match) return match[1];
  const all = Object.fromEntries(
    Object.values(FIELD_SCHEMAS)
      .flat()
      .map(([key, label]) => [key, label]),
  );
  return all[k] || k.replaceAll("_", " ");
}
function formatField(v) {
  if (Array.isArray(v)) return v.map(esc).join(", ");
  if (v && typeof v === "object")
    return `<code>${esc(JSON.stringify(v))}</code>`;
  return esc(v);
}
function cover(e) {
  const image = safeAssetUrl(e.image);
  if (image)
    return `<div class="entry-image"><img src="${esc(image)}" alt="" loading="lazy"></div>`;
  return `<div class="entry-image placeholder-image"><span>${icon(e.type)}</span></div>`;
}
function card(e) {
  return `<article class="archive-card">${cover(e)}<div class="archive-card-body"><div class="archive-kicker">${iconMark(e.type)} ${esc(typeLabel(e.type))}${e.featured ? " · Избранное" : ""}</div><h3>${link(`/entity/${e.type}/${e.slug}`, esc(e.name))}</h3><p>${esc(e.shortDescription || "")}</p>${
    (e.tags || []).length
      ? `<div class="tag-line">${(e.tags || [])
          .slice(0, 3)
          .map((t) => `<span>#${esc(t)}</span>`)
          .join("")}</div>`
      : ""
  }</div></article>`;
}
function relationList(e) {
  const rows = (e.relations || [])
    .map((r) => {
      const t = getEntity(r.targetId);
      return t
        ? `<div class="relation-row"><span>${esc(r.label || "связь")}</span>${link(`/entity/${t.type}/${t.slug}`, esc(t.name), "relation-name")}</div>`
        : "";
    })
    .join("");
  return rows || '<div class="muted">Связей пока нет.</div>';
}
function hero() {
  const site = state.site || {}, index = rotationIndex(site), card = site.cards?.[index];
  const title = card ? card.title : site.title, text = card ? card.text : site.description;
  return `<section class="hero-panel daily-hero" data-card-index="${index}">${card?.image ? `<img class="daily-hero-image" src="${esc(safeAssetUrl(card.image))}" alt="${esc(card.title || "Витраж Асхана")}">` : '<div class="hero-seal" aria-hidden="true">А</div>'}<div class="hero-copy">${site.eyebrow ? `<div class="eyebrow">${esc(site.eyebrow)}</div>` : ""}${title ? `<h1>${esc(title)}</h1>` : ""}${text ? `<p>${esc(text)}</p>` : ""}<div class="hero-actions">${link("/world", "Войти в каталог", "text-button primary-action")}${link("/campaigns", "Кампании", "text-button")}</div></div></section>`;
}
function home() {
  const featured = state.entities.filter(e => e.featured).slice(0, 6), site = state.site || {};
  return `${hero()}${site.overviewTitle || site.overviewText ? `<section class="section intro-section"><h2>${esc(site.overviewTitle)}</h2><article class="prose">${markdown(site.overviewText)}</article></section>` : ""}${featured.length ? `<section class="section"><div class="section-heading"><h2>Избранное</h2>${link("/world", "Весь каталог →", "text-link")}</div><div class="archive-grid">${featured.map(card).join("")}</div></section>` : ""}`;
}
function world() {
  return `<div class="page-head"><div><div class="eyebrow">Энциклопедия</div><h1>Каталог Асхана</h1><p>Все сущности мира разложены по разделам и связаны между собой.</p></div>${link("/network", "Паутина Асхи →", "text-link")}</div>${TYPE_ORDER.filter(
    (t) => visibleType(t).length,
  )
    .map(
      (t) =>
        `<section class="section compact-section"><div class="section-heading"><div><div class="eyebrow">${icon(t)}</div><h2>${esc(typeLabel(t))}</h2></div>${link(`/encyclopedia/${t}`, "Смотреть весь раздел →", "text-link")}</div><div class="archive-grid small-grid">${visibleType(t).slice(0, 4).map(card).join("")}</div></section>`,
    )
    .join("")}`;
}
function listing(type, q = "") {
  const rows = visibleType(type).filter(
    (e) =>
      !q ||
      [e.name, e.shortDescription, e.content, (e.tags || []).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return `<div class="page-head"><div><div class="eyebrow">${icon(type)} Раздел</div><h1>${esc(typeLabel(type))}</h1><p>${esc({ characters: "Люди, NPC и герои.", factions: "Государства, ордены и организации.", locations: "Города, регионы и места.", creatures: "Монстры и существа.", items: "Артефакты и экипировка.", articles: "Основы мира и глубокий лор.", events: "Исторические и сюжетные события.", quests: "Сюжетные задачи и цели.", campaigns: "Игровые кампании.", maps: "Интерактивные карты.", units: "Боевые и сюжетные юниты.", sessions: "Журнал игровых сессий.", religions: "Боги и культы.", races: "Народы и культуры." }[type] || "")}</p></div></div><div class="search-line"><input id="listSearch" class="soft-input" value="${esc(q)}" aria-label="Поиск в разделе" placeholder="Искать в разделе…"><span>${rows.length} записей</span></div>${rows.length ? `<div class="archive-grid">${rows.map(card).join("")}</div>` : `<div class="empty-state"><div class="eyebrow">Архив молчит</div><h2>Записей не найдено</h2><p>Измените запрос или создайте первую запись в мастерской.</p></div>`}`;
}
function detail(type, id) {
  const e = state.entities.find(
    (e) => e.type === type && (e.id === id || e.slug === id),
  );
  if (!e) return `<div class="empty-state">Страница не найдена.</div>`;
  const generalKeys = COMBAT_TYPES.has(type) ? ["level", "hp", "maxHp", "ac", "initiative", "speed", "class", "gold", "experience", ...(type === "characters" ? ["title"] : []), "damage"] : type === "items" ? ["rarity", "weight", "cost", "ac", "damage"] : [];
  const removed = ["characters", "units", "creatures"].includes(type) ? ["category", "rank", "abilities", ...(type !== "characters" ? ["title"] : [])] : [];
  const fields = Object.entries(e.fields || {}).filter(([k,v]) => !generalKeys.includes(k) && !removed.includes(k) && k !== "stats" && !(type === "factions" && k === "relationships") && v !== "" && v != null && !(Array.isArray(v) && !v.length));
  const statBlock = generalKeys.length ? `<div class="stat-ribbon">${generalKeys.map(k => `<div><span>${esc(fieldLabel(k,type))}</span><strong>${esc(e.fields?.[k] ?? "—")}</strong></div>`).join("")}</div>` : "";
  const stats = e.fields?.stats;
  const statsBlock = COMBAT_TYPES.has(type) && stats ? `<section class="ability-scores" aria-label="Характеристики">${Object.entries(STAT_SHORT).map(([key,label]) => `<div><span>${label}</span><strong>${esc(stats[key] ?? "—")}</strong></div>`).join("")}</section>` : "";
  const body = type === "factions" ? `<div class="faction-tabs" role="tablist" aria-label="Разделы фракции"><button type="button" role="tab" id="descriptionTab" aria-controls="factionDescription" aria-selected="true" data-faction-tab="description">Описание</button><button type="button" role="tab" id="relationshipsTab" aria-controls="factionRelationships" aria-selected="false" data-faction-tab="relationships">Отношения</button></div><section id="factionDescription" role="tabpanel" aria-labelledby="descriptionTab">${markdown(e.content)}</section><section id="factionRelationships" role="tabpanel" aria-labelledby="relationshipsTab" hidden>${markdown(e.fields?.relationships || "Отношения пока не описаны.")}</section>` : markdown(e.content);
  return `<div class="detail-top"><div class="eyebrow">${icon(type)} ${esc(typeLabel(type))}</div><h1>${esc(e.name)}</h1><p>${esc(e.shortDescription || "")}</p><div class="tag-line">${(e.tags || []).map(t => `<span>#${esc(t)}</span>`).join("")}</div></div>${statBlock}${statsBlock}<div class="detail-columns"><article class="prose">${body}</article><aside class="detail-aside"><div class="aside-section"><div class="eyebrow">Сведения</div>${fields.map(([k,v]) => `<div class="info-row"><span>${esc(fieldLabel(k,type))}</span><strong>${formatField(v)}</strong></div>`).join("")}</div><div class="aside-section"><div class="eyebrow">Связи</div>${relationList(e)}</div></aside></div>`;
}
function mapPage() {
  const map = state.entities.find((e) => e.type === "maps");
  if (!map) return '<div class="empty-state">Карта ещё не добавлена.</div>';
  const rawPins = Array.isArray(map.fields?.pins) ? map.fields.pins : [];
  const pins = rawPins.filter(
    (p) => !p.hidden || ["ADMIN", "GM", "EDITOR"].includes(state.user?.role),
  );
  const layers = [...new Set(pins.map((p) => p.layer || "Основной"))];
  const markers = pins
    .map((p) => {
      const t = getEntity(p.targetId);
      const href = t ? `/entity/${t.type}/${t.slug}` : "#";
      return `<a class="map-pin" data-map-layer="${esc(p.layer || "Основной")}" href="${href}" data-route="${href}" style="left:${Number(p.x) || 0}%;top:${Number(p.y) || 0}%"><span>${esc(p.label || t?.name || "Точка")}</span></a>`;
    })
    .join("");
  return `<div class="page-head"><div><div class="eyebrow">Атлас</div><h1>Карта Асхана</h1><p>Нажмите на точку, чтобы открыть связанный объект.</p></div></div><div class="map-layers"><button data-map-filter="all" class="active">Все слои</button>${layers.map((l) => `<button data-map-filter="${esc(l)}">${esc(l)}</button>`).join("")}</div><div class="map-shell"><img src="${esc(safeAssetUrl(map.fields.imageUrl, "/assets/world-map.svg"))}" alt="Карта Асхана">${markers}</div><div class="map-caption">${pins.length} отмеченных мест · ${esc(map.fields?.year || "843 год Эры Королей")}</div>`;
}
function timeline() {
  const rows = visibleType("events")
    .slice()
    .sort((a, b) =>
      String(a.fields?.year || "").localeCompare(String(b.fields?.year || "")),
    );
  return `<div class="page-head"><div><div class="eyebrow">История</div><h1>Хронология</h1><p>События, после которых Асхан уже не была прежней.</p></div></div><div class="timeline-book">${rows.map((e) => `<article><div class="timeline-date">${esc(e.fields?.year || "—")}</div><div><div class="eyebrow">${esc(e.fields?.era || "Событие")}</div><h2>${link(`/entity/events/${e.slug}`, esc(e.name))}</h2><p>${esc(e.shortDescription || "")}</p></div></article>`).join("")}</div>`;
}
function campaigns() {
  const rows = visibleType("campaigns");
  return `<div class="page-head"><div><div class="eyebrow">Игра</div><h1>Кампании</h1><p>Сюжет, квесты, персонажи и ход игровых сессий.</p></div></div><div class="archive-grid two-grid">${rows.map(card).join("")}</div>`;
}
function campaignDetail(id) {
  const c = getEntity(id);
  if (!c) return '<div class="empty-state">Кампания не найдена.</div>';
  const related = (c.relations || [])
    .map((r) => getEntity(r.targetId))
    .filter(Boolean);
  return `<div class="detail-top"><div class="eyebrow">Кампания</div><h1>${esc(c.name)}</h1><p>${esc(c.shortDescription || "")}</p><div class="tag-line">${(c.tags || []).map((t) => `<span>#${esc(t)}</span>`).join("")}</div></div><div class="detail-columns"><article class="prose">${markdown(c.content)}<h2>Связанные материалы</h2><div class="archive-grid small-grid">${related.map(card).join("") || '<div class="empty-state">Материалы ещё не связаны.</div>'}</div></article><aside class="detail-aside"><div class="aside-section"><div class="eyebrow">Параметры</div>${Object.entries(
    c.fields || {},
  )
    .map(
      ([k, v]) =>
        `<div class="info-row"><span>${esc(fieldLabel(k, type))}</span><strong>${formatField(v)}</strong></div>`,
    )
    .join("")}</div></aside></div>`;
}
function networkPage() {
  const rows = state.entities
    .filter((e) => e.visibility === "PUBLIC")
    .slice(0, 20);
  const W = 960,
    H = 560,
    cx = W / 2,
    cy = H / 2,
    rx = 355,
    ry = 205;
  const pos = new Map(
    rows.map((e, i) => {
      const a = (Math.PI * 2 * i) / Math.max(rows.length, 1) - Math.PI / 2;
      return [e.id, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }];
    }),
  );
  const lines = [];
  rows.forEach((e) =>
    (e.relations || []).forEach((r) => {
      if (pos.has(e.id) && pos.has(r.targetId)) {
        const a = pos.get(e.id),
          b = pos.get(r.targetId);
        lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
      }
    }),
  );
  const nodes = rows
    .map((e) => {
      const p = pos.get(e.id);
      return `<a class="network-node" data-node-type="${e.type}" href="/entity/${e.type}/${e.slug}" data-route="/entity/${e.type}/${e.slug}" style="left:${(p.x / W) * 100}%;top:${(p.y / H) * 100}%"><span>${iconMark(e.type)}</span><b>${esc(e.name)}</b></a>`;
    })
    .join("");
  return `<div class="page-head"><div><div class="eyebrow">Паутина Асхи</div><h1>Кто с кем связан</h1><p>Персонажи, места, предметы и события образуют единую карту памяти.</p></div></div><div class="network-filters"><button data-network-type="all" class="active">Все</button>${[...new Set(rows.map((e) => e.type))].map((t) => `<button data-network-type="${t}">${esc(typeLabel(t))}</button>`).join("")}</div><div class="network-shell"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${lines.join("")}</svg>${nodes}</div>`;
}
function searchPage(q = "") {
  const rows = state.entities.filter(
    (e) =>
      !q ||
      [e.name, e.shortDescription, e.content, (e.tags || []).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return `<div class="page-head"><div><div class="eyebrow">Поиск</div><h1>Найти в мире</h1><p>Имя, город, артефакт, событие, фракция или часть описания.</p></div></div><div class="search-line wide"><input id="globalQuery" class="soft-input" value="${esc(q)}" placeholder="Поиск по всему миру…"><button class="text-button primary-action" id="searchSubmit">Найти</button></div>${q ? `<div class="search-summary">Результаты для «${esc(q)}» · ${rows.length}</div>` : ""}${rows.length ? `<div class="archive-grid">${rows.map(card).join("")}</div>` : `<div class="empty-state">Введите запрос, чтобы начать поиск.</div>`}`;
}
function characterList() {
  if (!state.user)
    return `<div class="empty-state"><h1>Листы персонажей</h1><p>Войдите, чтобы открыть свои игровые листы.</p>${link("/login", "Войти", "text-button")}</div>`;
  const rows = visibleType("sheets").filter(
    (e) =>
      ["ADMIN", "GM", "EDITOR"].includes(state.user.role) ||
      e.ownerId === state.user.id ||
      e.ownerEmail === state.user.nickname,
  );
  return `<div class="page-head"><div><div class="eyebrow">Игровые данные</div><h1>Листы персонажей</h1><p>Отдельные игровые листы: характеристики, снаряжение, золото и опыт. Каталог персонажей мира находится в разделе «Персонажи».</p></div></div>${rows.length ? `<div class="archive-grid">${rows.map(card).join("")}</div>` : '<div class="empty-state">Пока нет принадлежащих вам игровых листов. Обратитесь к мастеру.</div>'}`;
}
function loginPage() {
  return `<div class="auth-page auth-network"><div class="eyebrow">Личный контур</div><h1>Войти в историю</h1><p>Вход предназначен для игроков. После регистрации будет создан личный игровой лист.</p><div class="auth-tabs"><button type="button" data-auth-tab="login" class="active">Вход</button><button type="button" data-auth-tab="register">Регистрация</button></div><form id="loginForm" class="auth-form"><input type="hidden" name="mode" value="login"><label>Ник<input class="soft-input" name="nickname" autocomplete="username" required></label><label>Пароль<input class="soft-input" name="password" type="password" autocomplete="current-password" minlength="8" required></label><label class="register-only hidden-field">Имя персонажа<input class="soft-input" name="characterName"></label><button class="text-button primary-action">Продолжить</button></form><small class="muted">Забыли пароль? Обратитесь к администратору — он заменит его в мастерской.</small></div>`;
}
function enterPage() {
  return `<div class="auth-page admin-gate"><div class="gate-sigil">А</div><div class="eyebrow">Служебный контур</div><h1>Вход архивариуса</h1><p>Скрытая точка входа. Ссылка на неё не публикуется в интерфейсе.</p><form id="loginForm" data-admin-only="true" class="auth-form"><label>Ник администратора<input class="soft-input" name="nickname" autocomplete="username" required></label><label>Пароль<input class="soft-input" name="password" type="password" autocomplete="current-password" minlength="8" required></label><button class="text-button primary-action">Открыть мастерскую</button></form></div>`;
}
function accountPage() {
  return `<div class="page-head"><div><div class="eyebrow">Профиль</div><h1>${esc(state.user?.name || "Гость")}</h1><p>@${esc(state.user?.nickname || "")}</p></div></div><div class="account-grid"><div><div class="eyebrow">Роль</div><strong class="account-role">${esc(state.user?.role || "PUBLIC")}</strong></div><button id="accountLogout" class="text-button">Выйти</button></div>`;
}
function accessPage() {
  return `<div class="empty-state"><div class="eyebrow">403</div><h1>Этот слой закрыт</h1><p>У вашей роли нет доступа к разделу.</p>${link("/", "Вернуться в архив", "text-link")}</div>`;
}
function usersAdmin() {
  return `<div class="admin-shell"><aside class="admin-rail">${link("/admin", "‹ Мастерская", "admin-back-link")}<div class="admin-rail-title">Доступ</div></aside><section class="admin-work"><div class="admin-header"><div><div class="eyebrow">Роли и разрешения</div><h1>Игроки и команда</h1><p>ADMIN управляет доступом; GM и EDITOR редактируют мир; PLAYER видит свой слой.</p></div></div><div class="admin-table"><div class="admin-table-head users-head"><span>Пользователь</span><span>Роль</span><span>Статус</span><span>Пароль</span></div>${state.users.map((u) => `<div class="admin-table-row users-row"><div><strong>${esc(u.name)}</strong><small>@${esc(u.nickname)}</small></div><select class="soft-input user-role" data-user="${u.id}">${["ADMIN", "GM", "EDITOR", "PLAYER"].map((r) => `<option ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}</select><button class="text-button user-active" data-user="${u.id}" data-active="${u.active}">${u.active ? "Активен" : "Отключён"}</button><button class="text-button reset-password" data-user="${u.id}">Заменить пароль</button></div>`).join("")}</div></section></div>`;
}
function auditAdmin() {
  return `<div class="admin-shell"><aside class="admin-rail">${link("/admin", "‹ Мастерская", "admin-back-link")}<div class="admin-rail-title">Аудит</div></aside><section class="admin-work"><div class="admin-header"><div><div class="eyebrow">Безопасность</div><h1>Журнал изменений</h1></div></div><div id="auditList" class="record-list"><div class="muted">Загрузка…</div></div></section></div>`;
}

function typeOptions(active) {
  return TYPE_ORDER.map(
    (t) =>
      `<option value="${t}" ${t === active ? "selected" : ""}>${esc(typeLabel(t))}</option>`,
  ).join("");
}
function renderFieldInput(key, label, kind, value) {
  const safe = value ?? "";
  if (kind === "stats") {
    const stats = value && typeof value === "object" ? value : {};
    return `<fieldset class="form-label full structured-field"><legend>${esc(label)}</legend><div class="stats-editor">${["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((stat) => `<label>${esc(STAT_LABELS[stat])}<input class="soft-input" name="field_stats_${stat}" type="number" value="${esc(stats[stat] ?? "")}"></label>`).join("")}</div></fieldset>`;
  }
  if (kind === "pins") {
    const pins = Array.isArray(value) ? value : [];
    return `<fieldset class="form-label full structured-field"><legend>${esc(label)}</legend><div class="field-help">Координаты задаются в процентах от края карты.</div><div class="pins-list">${pins.map((pin, i) => pinEditorRow(pin, i)).join("")}</div><button type="button" class="text-button" id="addPin">+ Добавить маркер</button></fieldset>`;
  }
  if (kind === "textarea")
    return `<label class="form-label full">${esc(label)}<textarea class="soft-input" name="field_${esc(key)}" rows="4">${esc(safe)}</textarea></label>`;
  return `<label class="form-label">${esc(label)}<input class="soft-input" name="field_${esc(key)}" type="${kind === "number" ? "number" : "text"}" value="${esc(safe)}"></label>`;
}
function entityOptions(active = "") {
  return state.entities
    .filter((e) => e.type !== "maps")
    .map(
      (e) =>
        `<option value="${esc(e.id)}" ${e.id === active ? "selected" : ""}>${esc(typeLabel(e.type))} · ${esc(e.name)}</option>`,
    )
    .join("");
}
function pinEditorRow(pin = {}, i = Date.now()) {
  return `<div class="pin-editor-row"><input class="soft-input pin-label" value="${esc(pin.label || "")}" placeholder="Название"><select class="soft-input pin-target"><option value="">Без связанной страницы</option>${entityOptions(pin.targetId)}</select><label>X, %<input class="soft-input pin-x" type="number" min="0" max="100" step="0.1" value="${esc(pin.x ?? 50)}"></label><label>Y, %<input class="soft-input pin-y" type="number" min="0" max="100" step="0.1" value="${esc(pin.y ?? 50)}"></label><input class="soft-input pin-description" value="${esc(pin.description || "")}" placeholder="Короткое описание"><input class="soft-input pin-layer" value="${esc(pin.layer || "Основной")}" placeholder="Слой"><label class="pin-hidden"><input type="checkbox" ${pin.hidden ? "checked" : ""}> Скрытая область</label><button type="button" class="row-remove" data-remove-pin="${i}">Удалить</button></div>`;
}
function gatherPins() {
  return [...document.querySelectorAll(".pin-editor-row")].map((row) => ({
    label: row.querySelector(".pin-label")?.value.trim() || "",
    targetId: row.querySelector(".pin-target")?.value || "",
    x: Math.max(
      0,
      Math.min(100, Number(row.querySelector(".pin-x")?.value) || 0),
    ),
    y: Math.max(
      0,
      Math.min(100, Number(row.querySelector(".pin-y")?.value) || 0),
    ),
    description: row.querySelector(".pin-description")?.value.trim() || "",
    layer: row.querySelector(".pin-layer")?.value.trim() || "Основной",
    hidden: Boolean(row.querySelector(".pin-hidden input")?.checked),
  }));
}
function relationEditor(relations = []) {
  const valid = (relations || []).map((r) => ({
    targetId: r.targetId,
    label: r.label || "",
  }));
  return `<div class="relations-editor" id="relationsEditor"><div class="relations-list">${valid.map((r, i) => relationRow(r, i)).join("")}</div><button type="button" class="text-button" id="addRelation">+ Добавить связь</button></div>`;
}
function relationRow(r, i) {
  const opts = state.entities
    .map(
      (e) =>
        `<option value="${esc(e.id)}" ${e.id === r.targetId ? "selected" : ""}>${esc(typeLabel(e.type))} · ${esc(e.name)}</option>`,
    )
    .join("");
  return `<div class="relation-editor-row"><select class="soft-input relation-target"><option value="">Выберите объект…</option>${opts}</select><input class="soft-input relation-label" value="${esc(r.label || "")}" placeholder="Роль / связь"><button type="button" class="row-remove" data-remove-relation="${i}">Удалить</button></div>`;
}
function gatherRelations() {
  return [...document.querySelectorAll(".relation-editor-row")]
    .map((row) => ({
      targetId: row.querySelector(".relation-target")?.value || "",
      label: row.querySelector(".relation-label")?.value || "",
    }))
    .filter((r) => r.targetId);
}
function adminHome() {
  const total = state.entities.length;
  const hidden = state.entities.filter((e) => e.visibility !== "PUBLIC").length;
  const updated = state.entities
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 6);
  return `<div class="admin-shell"><aside class="admin-rail"><div class="admin-rail-title">Архивариус</div><div class="admin-tools">${state.user?.role === "ADMIN" ? link("/admin/site", "Витрина и витражи", "admin-nav-link") : ""}${link("/admin/users", "Пользователи", "admin-nav-link")}${link("/admin/media", "Медиатека", "admin-nav-link")}${link("/admin/audit", "Аудит", "admin-nav-link")}</div><button class="admin-create" id="openQuickCreate">+ Новая запись</button>${TYPE_GROUPS.map((g) => `<div class="admin-group"><div>${esc(g.label)}</div>${g.types.map((t) => link(`/admin/entities/${t}`, `<span>${icon(t)}</span>${esc(typeLabel(t))}`, "admin-nav-link")).join("")}</div>`).join("")}<div class="admin-group admin-bottom">${link("/", "← В публичный архив", "admin-nav-link")}</div></aside><section class="admin-work"><div class="admin-header"><div><div class="eyebrow">Панель управления</div><h1>Мастерская мира</h1><p>Здесь можно вести лор, кампании, персонажей и все игровые данные без обращения к разработчику.</p></div><div class="admin-summary"><span><b>${total}</b> записей</span><span><b>${hidden}</b> скрыто</span></div></div><div class="admin-overview"><div><div class="eyebrow">Быстрые действия</div><div class="quick-create-grid">${TYPE_GROUPS.flatMap(
    (g) => g.types,
  )
    .slice(0, 8)
    .map((t) =>
      link(
        `/admin/entities/${t}/new`,
        `${icon(t)} ${typeLabel(t)}`,
        "quick-create-link",
      ),
    )
    .join(
      "",
    )}</div></div><div><div class="eyebrow">Недавно изменено</div><div class="admin-recent">${updated.map((e) => `<div><span>${iconMark(e.type)}</span>${link(`/admin/entities/${e.type}/${e.id}`, `<strong>${esc(e.name)}</strong>`)}<small>${fmt(e.updatedAt)}</small></div>`).join("")}</div></div></div></div></section>`;
}
function adminList(type) {
  const rows = visibleType(type);
  return `<div class="admin-shell"><aside class="admin-rail">${link("/admin", "‹ Мастерская", "admin-back-link")}<div class="admin-rail-title">${esc(typeLabel(type))}</div>${TYPE_GROUPS.map((g) => `<div class="admin-group"><div>${esc(g.label)}</div>${g.types.map((t) => link(`/admin/entities/${t}`, `${icon(t)} ${typeLabel(t)}`, "admin-nav-link " + (t === type ? "active" : ""))).join("")}</div>`).join("")}</aside><section class="admin-work"><div class="admin-header"><div><div class="eyebrow">${esc(typeLabel(type))}</div><h1>${esc(typeLabel(type))}</h1><p>${rows.length} записей в архиве.</p></div>${link(`/admin/entities/${type}/new`, "+ Новая запись", "text-button primary-action")}</div><div class="admin-table"><div class="admin-table-head"><span>Название</span><span>Доступ</span><span>Обновлено</span><span></span></div>${rows.map((e) => `<div class="admin-table-row"><div class="admin-entry-name"><div class="admin-entry-icon">${icon(e.type)}</div><div>${link(`/admin/entities/${type}/${e.id}`, `<strong>${esc(e.name)}</strong>`)}<small>${esc(e.shortDescription || "")}</small></div></div><span class="visibility ${(e.status || "PUBLISHED").toLowerCase()}">${esc(e.status === "DRAFT" ? "Черновик" : VISIBILITY[e.visibility] || e.visibility)}</span><span class="muted">${fmt(e.updatedAt)}</span><div class="row-actions"><a href="/admin/entities/${type}/${e.id}" data-route="/admin/entities/${type}/${e.id}" class="row-edit">Изменить</a><button data-delete="${e.id}" class="row-delete">Удалить</button></div></div>`).join("")}</div></section></div>`;
}
function adminEditor(type, id) {
  const current = id
    ? getEntity(id)
    : {
        id: "",
        type,
        name: "",
        slug: "",
        shortDescription: "",
        content: "",
        image: "",
        tags: [],
        visibility: type === "sheets" ? "PLAYER" : "PUBLIC",
        status: "PUBLISHED",
        featured: false,
        ownerEmail: "",
        fields: {},
        relations: [],
      };
  if (!current || !TYPE_LABELS[type])
    return `<div class="empty-state">Запись не найдена. ${link("/admin", "В мастерскую")}</div>`;
  const schema = FIELD_SCHEMAS[type] || [];
  return `<div class="admin-shell"><aside class="admin-rail">${link("/admin", "‹ Мастерская", "admin-back-link")}<div class="admin-rail-title">Редактор</div><div class="admin-context">${icon(type)} ${esc(typeLabel(type))}</div><div class="admin-group"><div>Тип записи</div><select id="editorType" class="soft-input">${typeOptions(type)}</select></div><div class="admin-group"><div>Подсказка</div><p class="admin-help">Все данные заполняются обычными полями. Сохраняйте черновик, пока страница не готова для читателей.</p></div></aside><section class="admin-work"><div class="admin-header"><div><div class="eyebrow">${id ? "Редактирование" : "Новая запись"}</div><h1>${esc(current.name || `Новая запись · ${typeLabel(type)}`)}</h1></div>${id ? `<div class="editor-head-actions">${link(`/entity/${type}/${current.slug}`, "Открыть страницу →", "text-link")}<button type="button" class="text-link version-button" data-versions="${current.id}">История версий</button></div>` : ""}</div><form id="entityForm" data-type="${esc(type)}" data-id="${esc(current.id)}"><section class="editor-section"><div class="editor-section-head"><div><div class="eyebrow">Основа</div><h2>Как запись выглядит в мире</h2></div></div><div class="form-grid"><label class="form-label">Название<input class="soft-input" name="name" required value="${esc(current.name)}"></label><label class="form-label">Адрес страницы (slug)<input class="soft-input" name="slug" value="${esc(current.slug)}"></label><label class="form-label full">Короткое описание<input class="soft-input" name="shortDescription" value="${esc(current.shortDescription)}"></label><div class="form-label full rich-field"><span>Лор / описание</span>${richToolbar()}<div id="richEditor" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Лор и описание" spellcheck="true">${markdown(current.content)}</div><textarea class="hidden-field" name="content" id="contentField">${esc(current.content)}</textarea><div id="editorStatus" class="editor-status" role="status"></div></div><div class="form-label image-upload-field"><span>Обложка</span><div class="image-upload-box"><div class="image-upload-preview" id="imageUploadPreview">${current.image ? `<img src="${esc(current.image)}" alt="">` : `${uiIcon("image")}<small>PNG, JPEG, WEBP или GIF · до 5 МБ</small>`}</div><div class="image-upload-actions"><label class="upload-button">${uiIcon("upload")}<span>Загрузить файл</span><input id="entityImageUpload" class="hidden-field" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button type="button" class="ghost-button" id="clearEntityImage">Удалить</button></div><input class="soft-input image-url-input" id="entityImageUrl" name="image" value="${esc(current.image || "")}" placeholder="или вставьте URL изображения"></div></div><label class="form-label">Теги<input class="soft-input" name="tags" value="${esc((current.tags || []).join(", "))}" placeholder="город, север, магия"></label></div></section><section class="editor-section"><div class="editor-section-head"><div><div class="eyebrow">Свойства</div><h2>${esc(typeLabel(type))}</h2><p>Поля подобраны под этот тип сущности.</p></div></div><div class="form-grid" id="entityFields">${schema.map(([key, label, kind]) => renderFieldInput(key, label, kind, current.fields?.[key])).join("")}${schema.length ? "" : '<div class="empty-inline">Для этого типа отдельные поля не требуются — используйте текст и связи.</div>'}</div></section><section class="editor-section"><div class="editor-section-head"><div><div class="eyebrow">Связи</div><h2>С чем связан этот объект</h2><p>Связи помогают строить карту мира и переходы между страницами.</p></div></div>${relationEditor(current.relations || [])}</section><section class="editor-section"><div class="editor-section-head"><div><div class="eyebrow">Доступ и публикация</div><h2>Кто это видит</h2></div></div><div class="form-grid"><label class="form-label">Статус<select class="soft-input" name="status">${Object.entries(
    PUBLICATION,
  )
    .map(
      ([v, label]) =>
        `<option value="${v}" ${(current.status || "PUBLISHED") === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="form-label">Видимость<select class="soft-input" name="visibility">${Object.entries(
    VISIBILITY,
  )
    .map(
      ([v, label]) =>
        `<option value="${v}" ${current.visibility === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="form-label">Ник владельца (если PLAYER)<input class="soft-input" name="ownerEmail" value="${esc(current.ownerEmail || "")}" placeholder="ник игрока"></label><label class="check-line"><input type="checkbox" name="featured" ${current.featured ? "checked" : ""}> Показывать в избранном</label></div></section><section class="editor-actions"><button class="text-button primary-action">${id ? "Сохранить изменения" : "Создать запись"}</button>${link(`/admin/entities/${type}`, "Отмена", "text-button")}</section></form></section></div>`;
}

function siteCardEditor(card = {}) {
  return `<section class="editor-section site-card"><div class="form-grid"><label class="form-label">Заголовок<input class="soft-input" data-card="title" value="${esc(card.title)}" maxlength="180"></label><label class="form-label">Изображение — URL<input class="soft-input" data-card="image" value="${esc(card.image)}" placeholder="/uploads/… или https://…"></label><label class="form-label full">Текст<textarea class="soft-input" data-card="text" maxlength="2000">${esc(card.text)}</textarea></label></div><img class="site-card-preview" src="${esc(safeAssetUrl(card.image, "/assets/rune-texture.svg"))}" alt="Предпросмотр витража"><label class="upload-button">Загрузить витраж<input type="file" class="hidden-field card-upload" accept="image/png,image/jpeg,image/webp,image/gif"></label><div class="hero-actions"><button type="button" class="text-button" data-card-action="up">↑ Выше</button><button type="button" class="text-button" data-card-action="down">↓ Ниже</button><button type="button" class="text-button" data-card-action="delete">Удалить карточку</button></div></section>`;
}
function siteAdmin() {
  const site = state.site || {};
  return `<div class="admin-work">${link("/admin", "‹ Мастерская", "text-link")}<div class="page-head"><h1>Витрина и витражи</h1></div><form id="siteForm"><section class="editor-section"><h2>Текст витрины</h2><p>Пустые поля не отображаются. Если карточки добавлены, их заголовок и текст заменяют приветствие.</p><div class="form-grid">${[["eyebrow","Надзаголовок"],["title","Заголовок приветствия"],["description","Текст приветствия"],["overviewTitle","Заголовок вводного раздела"],["overviewText","Текст вводного раздела"]].map(([k,label]) => `<label class="form-label full">${label}<textarea class="soft-input" name="${k}">${esc(site[k])}</textarea></label>`).join("")}<label class="form-label">Дата начала цикла<input class="soft-input" type="date" name="startDate" required value="${esc(site.startDate)}"></label><label class="form-label">Часовой пояс<input class="soft-input" name="timeZone" required value="${esc(site.timeZone || "Europe/Moscow")}" placeholder="Europe/Moscow"></label></div></section><h2>Ежедневные карточки</h2><p>Смена в полночь выбранного часового пояса. После последней карточки цикл начинается заново. До даты начала показывается первая карточка. Максимум 60.</p><div id="siteCards">${(site.cards || []).map(siteCardEditor).join("")}</div><button type="button" class="text-button" id="addSiteCard">+ Добавить витраж</button><section class="editor-actions"><button class="text-button primary-action">Сохранить витрину</button>${link("/", "Посмотреть витрину", "text-link")}</section><div id="siteStatus" role="status"></div></form></div>`;
}
function bindSiteCards() {
  view.querySelectorAll("[data-card-action]").forEach(button => button.onclick = () => {
    const card = button.closest(".site-card");
    if (button.dataset.cardAction === "delete") card.remove();
    if (button.dataset.cardAction === "up" && card.previousElementSibling) card.previousElementSibling.before(card);
    if (button.dataset.cardAction === "down" && card.nextElementSibling) card.nextElementSibling.after(card);
    document.getElementById("siteForm").dataset.dirty = "true";
  });
  view.querySelectorAll(".card-upload").forEach(input => input.onchange = async () => {
    const card = input.closest(".site-card"), file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      const media = await uploadMediaFile(file);
      card.querySelector('[data-card="image"]').value = media.url;
      card.querySelector("img").src = media.url;
      document.getElementById("siteForm").dataset.dirty = "true";
      showToast("Витраж загружен. Сохраните витрину.");
    } catch(e) { showToast(e.message); } finally { input.disabled = false; input.value = ""; }
  });
  view.querySelectorAll('[data-card="image"]').forEach(input => input.oninput = () => input.closest(".site-card").querySelector("img").src = safeAssetUrl(input.value, "/assets/rune-texture.svg"));
}
function bindSiteForm() {
  const form = document.getElementById("siteForm");
  if (!form) return;
  form.oninput = () => form.dataset.dirty = "true";
  document.getElementById("addSiteCard").onclick = () => {
    if (view.querySelectorAll(".site-card").length >= 60) return showToast("Не более 60 карточек");
    document.getElementById("siteCards").insertAdjacentHTML("beforeend", siteCardEditor());
    form.dataset.dirty = "true"; bindSiteCards();
  };
  bindSiteCards();
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('.editor-actions button');
    if (form.querySelector('.card-upload:disabled')) return showToast("Дождитесь загрузки витража");
    button.disabled = true;
    const site = Object.fromEntries(new FormData(form));
    site.cards = [...form.querySelectorAll(".site-card")].map(card => Object.fromEntries([...card.querySelectorAll("[data-card]")].map(input => [input.dataset.card, input.value])));
    try { state.site = (await api("/site", { method:"PUT", body: JSON.stringify(site) })).site; form.dataset.dirty = "false"; document.getElementById("siteStatus").textContent = "Витрина сохранена"; showToast("Витрина сохранена"); }
    catch(e) { document.getElementById("siteStatus").textContent = e.message; }
    finally { button.disabled = false; }
  };
}
function mediaAdmin() {
  return `<div class="admin-shell"><aside class="admin-rail">${link("/admin", "‹ Мастерская", "admin-back-link")}<div class="admin-rail-title">Медиатека</div></aside><section class="admin-work"><div class="admin-header"><div><div class="eyebrow">Файлы</div><h1>Медиатека</h1><p>PNG, JPEG, WEBP, GIF или PDF до 5 МБ.</p></div><label class="text-button primary-action">${uiIcon("upload")} Загрузить<input id="mediaUpload" class="hidden-field" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"></label></div><div id="mediaGrid" class="media-grid"><div class="muted">Загрузка…</div></div></section></div>`;
}

function renderLayout(path) {
  const clean = path.split("?")[0];
  const navEntry = (route, title, symbol) =>
    link(route, `<span>${uiIcon(symbol)}</span> ${esc(title)}`, "nav-item");
  nav.innerHTML = `<div class="nav-label">Архив</div>${[
    ["/", "Витрина", "home"],
    ["/world", "Каталог", "world"],
    ["/timeline", "Хронология", "clock"],
    ["/network", "Паутина Асхи", "network"],
  ]
    .map((args) => navEntry(...args))
    .join(
      "",
    )}${TYPE_GROUPS.map((g) => `<div class="nav-label">${esc(g.label)}</div>${g.types.map((t) => navEntry(t === "sheets" ? "/characters" : t === "campaigns" ? "/campaigns" : `/encyclopedia/${t}`, typeLabel(t), { sheets: "users", articles: "book", magic: "sun", stories: "branch", sheets: "users" }[t] || { characters: "user", units: "shield", creatures: "paw", races: "users", religions: "sun", events: "clock", quests: "quest", sessions: "calendar", items: "gem", maps: "map", locations: "pin", factions: "faction", campaigns: "campaign" }[t])).join("")}`).join("")}${["ADMIN", "GM", "EDITOR"].includes(state.user?.role) ? `<div class="nav-label">Управление</div>${navEntry("/admin", "Мастерская", "shield")}` : ""}`;
  document
    .querySelectorAll(".nav-item")
    .forEach((a) =>
      a.classList.toggle(
        "active",
        a.dataset.route === clean ||
          (clean.startsWith("/encyclopedia/") && a.dataset.route === clean),
      ),
    );
  breadcrumbs.textContent = "Ashan Arcanum / " + breadcrumbName(clean);
  const auth = document.getElementById("authButton");
  auth.textContent = state.user
    ? state.user.role === "ADMIN"
      ? "Админ"
      : "Игрок"
    : "Войти";
  auth.href = ["ADMIN", "GM", "EDITOR"].includes(state.user?.role)
    ? "/admin"
    : state.user
      ? "/account"
      : "/login";
  auth.dataset.route = auth.getAttribute("href");
  document.getElementById("sidebarUser").innerHTML = state.user
    ? `<div class="sidebar-user"><strong>${esc(state.user.name)}</strong><small>${esc(state.user.nickname)}</small><span>${esc(state.user.role)}</span></div><button class="sidebar-action" id="logoutBtn">Выйти</button>`
    : `<div class="sidebar-user"><strong>Гостевой доступ</strong><small>Публичный архив</small></div>`;
  const logout = document.getElementById("logoutBtn");
  if (logout) logout.addEventListener("click", logoutUser);
}
function breadcrumbName(p) {
  if (p === "/") return "Витрина";
  if (p === "/world") return "Каталог";
  if (p === "/map") return "Карта";
  if (p === "/timeline") return "Хронология";
  if (p === "/campaigns" || p.startsWith("/campaign/")) return "Кампании";
  if (p === "/characters") return "Листы персонажей";
  if (p === "/search") return "Поиск";
  if (p.startsWith("/encyclopedia/")) return typeLabel(p.split("/")[2]);
  if (p.startsWith("/entity/")) return typeLabel(p.split("/")[2]);
  if (p.startsWith("/admin")) return "Мастерская";
  if (p === "/account") return "Профиль";
  if (p === "/login") return "Войти";
  if (p === "/enter") return "Служебный вход";
  return "Страница";
}
async function api(path, opts = {}) {
  const r = await fetch("/api" + path, {
    headers: {
      "Content-Type": "application/json",
      ...(state.csrf ? { "X-CSRF-Token": state.csrf } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  let data = {};
  try {
    data = await r.json();
  } catch {}
  if (!r.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
async function load() {
  state.loading = true;
  try {
    const me = await api("/me");
    state.user = me.user;
    state.csrf = me.csrf;
    const all = await api("/entities");
    state.entities = all.entities.filter(e => !isRetired(e));
    state.site = (await api("/site")).site;
  } catch (e) {
    console.error(e);
  } finally {
    state.loading = false;
  }
}
function render() {
  const url = new URL(location.href),
    p = decodePath(url.pathname),
    q = url.searchParams.get("q") || "";
  let html = "";
  if (p === "/") html = home();
  else if (p === "/world") html = world();
  else if (p === "/map") html = accessPage();
  else if (p === "/timeline") html = timeline();
  else if (p === "/campaigns") html = campaigns();
  else if (p === "/characters") html = characterList();
  else if (p === "/network") html = networkPage();
  else if (p === "/search") html = searchPage(q);
  else if (p === "/login") html = loginPage();
  else if (p === "/enter")
    html = state.user?.role === "ADMIN" ? adminHome() : enterPage();
  else if (p.startsWith("/encyclopedia/"))
    html = TYPE_LABELS[p.split("/")[2]]
      ? listing(p.split("/")[2], q)
      : accessPage();
  else if (p.startsWith("/campaign/")) html = campaignDetail(p.split("/")[2]);
  else if (p.startsWith("/entity/"))
    html = detail(p.split("/")[2], p.split("/")[3]);
  else if (p === "/admin")
    html = ["ADMIN", "GM", "EDITOR"].includes(state.user?.role)
      ? adminHome()
      : accessPage();
  else if (p === "/admin/site")
    html = state.user?.role === "ADMIN" ? siteAdmin() : accessPage();
  else if (p === "/admin/users")
    html = state.user?.role === "ADMIN" ? usersAdmin() : accessPage();
  else if (p === "/admin/media")
    html = ["ADMIN", "GM", "EDITOR"].includes(state.user?.role)
      ? mediaAdmin()
      : accessPage();
  else if (p === "/admin/audit")
    html = ["ADMIN", "GM"].includes(state.user?.role)
      ? auditAdmin()
      : accessPage();
  else if (p.startsWith("/admin/entities/")) {
    if (RETIRED_TYPES.has(p.split("/")[3]) || !["ADMIN", "GM", "EDITOR"].includes(state.user?.role))
      html = accessPage();
    else {
      const parts = p.split("/").filter(Boolean);
      const type = parts[2];
      const id = parts[3];
      html =
        id === "new"
          ? adminEditor(type, null)
          : id
            ? adminEditor(type, id)
            : adminList(type);
    }
  } else if (p === "/account") html = accountPage();
  else html = '<div class="empty-state">Страница не найдена.</div>';
  view.innerHTML = html;
  renderLayout(p);
  bindView(p);
}
function bindView(path) {
  bindSiteForm();
  view.querySelectorAll("[data-faction-tab]").forEach(button => button.onclick = () => {
    view.querySelectorAll("[data-faction-tab]").forEach(tab => tab.setAttribute("aria-selected", String(tab === button)));
    document.getElementById("factionDescription").hidden = button.dataset.factionTab !== "description";
    document.getElementById("factionRelationships").hidden = button.dataset.factionTab !== "relationships";
  });
  view.querySelectorAll("[data-route]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(a.getAttribute("href"));
    }),
  );
  const ls = document.getElementById("listSearch");
  if (ls)
    ls.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        navigate(location.pathname + "?q=" + encodeURIComponent(ls.value));
    });
  const gq = document.getElementById("globalQuery"),
    gs = document.getElementById("searchSubmit");
  if (gs && gq)
    gs.addEventListener("click", () =>
      navigate("/search?q=" + encodeURIComponent(gq.value)),
    );
  if (gq)
    gq.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        navigate("/search?q=" + encodeURIComponent(gq.value));
    });
  const login = document.getElementById("loginForm");
  if (login) login.addEventListener("submit", loginSubmit);
  const ef = document.getElementById("entityForm");
  if (ef) ef.addEventListener("submit", entitySubmit);
  view
    .querySelectorAll("[data-delete]")
    .forEach((b) =>
      b.addEventListener("click", () => deleteEntity(b.dataset.delete)),
    );
  const acc = document.getElementById("accountLogout");
  if (acc) acc.addEventListener("click", logoutUser);
  const addRel = document.getElementById("addRelation");
  if (addRel)
    addRel.addEventListener("click", () => {
      document
        .querySelector(".relations-list")
        .insertAdjacentHTML(
          "beforeend",
          relationRow({ targetId: "", label: "" }, Date.now()),
        );
      bindRelationRemove();
    });
  bindRelationRemove();
  bindPinEditor();
  const typeSelect = document.getElementById("editorType");
  if (typeSelect)
    typeSelect.addEventListener("change", () => {
      const form = document.getElementById("entityForm");
      const values = gatherEntityFields(
        form,
        form.dataset.type,
        form._fieldValues || getEntity(form.dataset.id)?.fields || {},
      );
      form._fieldValues = values;
      form.dataset.type = typeSelect.value;
      document.getElementById("entityFields").innerHTML = (
        FIELD_SCHEMAS[typeSelect.value] || []
      )
        .map(([key, label, kind]) =>
          renderFieldInput(key, label, kind, values[key]),
        )
        .join("");
      form.dataset.dirty = "true";
      bindPinEditor();
    });
  if (ef) ef.addEventListener("input", () => (ef.dataset.dirty = "true"));
  if (ef) ef.addEventListener("change", () => (ef.dataset.dirty = "true"));
  document.querySelectorAll("[data-auth-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-auth-tab]")
        .forEach((x) => x.classList.toggle("active", x === btn));
      const reg = btn.dataset.authTab === "register",
        form = document.getElementById("loginForm");
      form.elements.mode.value = reg ? "register" : "login";
      form
        .querySelector(".register-only")
        ?.classList.toggle("hidden-field", !reg);
    }),
  );
  const rich = document.getElementById("richEditor"),
    content = document.getElementById("contentField");
  const editor = rich && content ? bindRichEditor(rich, content) : null;
  const entityUpload = document.getElementById("entityImageUpload");
  if (entityUpload)
    entityUpload.addEventListener("change", async () => {
      const file = entityUpload.files?.[0];
      if (!file) return;
      await handleEntityImageUpload(file);
    });
  const imageUrl = document.getElementById("entityImageUrl");
  if (imageUrl)
    imageUrl.addEventListener("change", () =>
      updateImagePreview(imageUrl.value),
    );
  document.getElementById("clearEntityImage")?.addEventListener("click", () => {
    if (imageUrl) imageUrl.value = "";
    updateImagePreview("");
  });
  const richUpload = document.getElementById("richImageUpload");
  if (richUpload)
    richUpload.addEventListener("change", async () => {
      const file = richUpload.files?.[0];
      if (!file) return;
      try {
        const m = await uploadMediaFile(file);
        editor?.insert(
          `<img src="${esc(m.url)}" alt="${esc(file.name)}"><p><br></p>`,
        );
        showToast("Изображение добавлено");
      } catch (e) {
        showToast(e.message);
      } finally {
        richUpload.value = "";
      }
    });
  document.querySelectorAll("[data-map-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-map-filter]")
        .forEach((x) => x.classList.toggle("active", x === btn));
      document
        .querySelectorAll(".map-pin")
        .forEach(
          (n) =>
            (n.hidden =
              btn.dataset.mapFilter !== "all" &&
              n.dataset.mapLayer !== btn.dataset.mapFilter),
        );
    }),
  );
  document.querySelectorAll("[data-network-type]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-network-type]")
        .forEach((x) => x.classList.toggle("active", x === btn));
      document
        .querySelectorAll(".network-node")
        .forEach((n) =>
          n.classList.toggle(
            "network-hidden",
            btn.dataset.networkType !== "all" &&
              n.dataset.nodeType !== btn.dataset.networkType,
          ),
        );
    }),
  );
  document
    .querySelectorAll("[data-versions]")
    .forEach((btn) =>
      btn.addEventListener("click", () => showVersions(btn.dataset.versions)),
    );
  document
    .querySelectorAll(".user-role")
    .forEach((x) =>
      x.addEventListener("change", () =>
        updateUser(x.dataset.user, { role: x.value }),
      ),
    );
  document
    .querySelectorAll(".user-active")
    .forEach((x) =>
      x.addEventListener("click", () =>
        updateUser(x.dataset.user, { active: x.dataset.active !== "true" }),
      ),
    );
  document
    .querySelectorAll(".reset-password")
    .forEach((x) =>
      x.addEventListener("click", () => resetPassword(x.dataset.user)),
    );
  if (path === "/admin/users" && !state.users.length) loadUsers();
  if (path === "/admin/media") loadMedia();
  if (path === "/admin/audit") loadAudit();
  const quick = document.getElementById("openQuickCreate");
  if (quick)
    quick.addEventListener("click", () => {
      showQuickCreate();
    });
}
function bindRelationRemove() {
  view.querySelectorAll("[data-remove-relation]").forEach((b) => {
    b.onclick = () => b.closest(".relation-editor-row")?.remove();
  });
}
function gatherEntityFields(form, type, base = {}) {
  const fields = { ...base },
    data = new FormData(form);
  for (const [key, , kind] of FIELD_SCHEMAS[type] || []) {
    if (kind === "pins") {
      fields[key] = gatherPins();
      continue;
    }
    if (kind === "stats") {
      const entries = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
        .map((stat) => [stat, data.get(`field_stats_${stat}`)])
        .filter(([, v]) => v !== "" && v !== null);
      if (entries.length)
        fields[key] = Object.fromEntries(
          entries.map(([k, v]) => [k, Number(v)]),
        );
      else delete fields[key];
      continue;
    }
    const raw = data.get(`field_${key}`);
    if (raw === null) continue;
    if (raw === "") delete fields[key];
    else fields[key] = kind === "number" ? Number(raw) : String(raw);
  }
  return fields;
}
function bindPinEditor() {
  const add = document.getElementById("addPin");
  if (add)
    add.onclick = () => {
      document
        .querySelector(".pins-list")
        ?.insertAdjacentHTML("beforeend", pinEditorRow({}, Date.now()));
      bindPinRemove();
      document.getElementById("entityForm").dataset.dirty = "true";
    };
  bindPinRemove();
}
function bindPinRemove() {
  view.querySelectorAll("[data-remove-pin]").forEach((b) => {
    b.onclick = () => b.closest(".pin-editor-row")?.remove();
  });
}
function showQuickCreate() {
  const modal = document.getElementById("modal");
  modal.innerHTML = `<div class="modal-card archive-modal"><div class="eyebrow">Новая запись</div><h2>Что добавить в мир?</h2><div class="modal-types">${TYPE_GROUPS.flatMap(
    (g) => g.types,
  )
    .map((t) =>
      link(
        `/admin/entities/${t}/new`,
        `${icon(t)} ${typeLabel(t)}`,
        "modal-type",
      ),
    )
    .join("")}</div>${link("/admin", "Отмена", "text-link")}</div>`;
  modal.classList.remove("hidden");
  modal.querySelectorAll("[data-route]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      modal.classList.add("hidden");
      navigate(a.getAttribute("href"));
    }),
  );
}
async function loginSubmit(e) {
  e.preventDefault();
  const f = new FormData(e.target),
    mode = f.get("mode") || "login";
  try {
    const d = await api(mode === "register" ? "/register" : "/login", {
      method: "POST",
      body: JSON.stringify({
        nickname: f.get("nickname"),
        password: f.get("password"),
        characterName: f.get("characterName"),
        adminOnly: e.target.dataset.adminOnly === "true",
      }),
    });
    state.user = d.user;
    state.csrf = d.csrf;
    state.entities = (await api("/entities")).entities.filter(e => !isRetired(e));
    state.users = [];
    showToast(mode === "register" ? "Игровой лист создан" : "Вход выполнен");
    navigate(d.user.role === "ADMIN" ? "/admin" : "/characters");
  } catch (err) {
    showToast(err.message);
  }
}
async function showVersions(entityId) {
  try {
    const d = await api(`/versions/${entityId}`),
      modal = document.getElementById("modal");
    modal.innerHTML = `<div class="modal-card archive-modal"><div class="eyebrow">История редакций</div><h2>Восстановление</h2><div class="version-list">${d.versions.map((v) => `<div><span>${fmt(v.at)} · ${esc(v.actor)}</span><button class="text-button" data-restore="${v.id}">Восстановить</button></div>`).join("") || '<p class="muted">Редакций пока нет.</p>'}</div><button class="text-link" id="closeVersions">Закрыть</button></div>`;
    modal.classList.remove("hidden");
    modal.querySelector("#closeVersions").onclick = () =>
      modal.classList.add("hidden");
    modal.querySelectorAll("[data-restore]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Восстановить эту редакцию?")) return;
          const x = await api(
            `/versions/${entityId}/${b.dataset.restore}/restore`,
            { method: "POST" },
          );
          state.entities = state.entities
            .filter((e) => e.id !== x.entity.id)
            .concat(x.entity);
          modal.classList.add("hidden");
          showToast("Редакция восстановлена");
          render();
        }),
    );
  } catch (e) {
    showToast(e.message);
  }
}
async function loadUsers() {
  try {
    state.users = (await api("/users")).users;
    render();
  } catch (e) {
    showToast(e.message);
  }
}
async function updateUser(id, payload) {
  try {
    await api("/users/" + id, { method: "PUT", body: JSON.stringify(payload) });
    showToast("Доступ обновлён");
    const d = await api("/users");
    state.users = d.users;
    render();
  } catch (e) {
    showToast(e.message);
  }
}
async function resetPassword(id) {
  const password = prompt("Новый пароль (минимум 8 символов)");
  if (!password) return;
  try {
    await api(`/users/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
    showToast("Пароль заменён");
  } catch (e) {
    showToast(e.message);
  }
}
function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Не удалось прочитать файл"));
    r.readAsDataURL(file);
  });
}
async function uploadMediaFile(file) {
  if (file.size > 5_000_000) throw new Error("Файл больше 5 МБ");
  const data = await fileAsDataUrl(file);
  return (
    await api("/media", {
      method: "POST",
      body: JSON.stringify({ name: file.name, data }),
    })
  ).media;
}
function updateImagePreview(url) {
  const box = document.getElementById("imageUploadPreview");
  if (!box) return;
  box.innerHTML = url
    ? `<img src="${esc(url)}" alt="Предпросмотр обложки">`
    : `${uiIcon("image")}<small>PNG, JPEG, WEBP или GIF · до 5 МБ</small>`;
}
async function handleEntityImageUpload(file) {
  const box = document.getElementById("imageUploadPreview"),
    input = document.getElementById("entityImageUrl");
  try {
    if (box) box.innerHTML = '<span class="upload-progress">Загрузка…</span>';
    const m = await uploadMediaFile(file);
    if (input) input.value = m.url;
    updateImagePreview(m.url);
    showToast("Файл загружен на сервер");
  } catch (e) {
    updateImagePreview(input?.value || "");
    showToast(e.message);
  }
}
async function loadMedia() {
  try {
    const d = await api("/media"),
      grid = document.getElementById("mediaGrid");
    if (grid)
      grid.innerHTML =
        d.media
          .map(
            (m) =>
              `<button class="media-item" data-url="${esc(m.url)}">${m.type.startsWith("image/") ? `<img src="${esc(m.url)}" alt="">` : '<span class="media-file">PDF</span>'}<strong>${esc(m.name)}</strong><small>${Math.round(m.size / 1024)} КБ</small></button>`,
          )
          .join("") || '<div class="muted">Файлов пока нет.</div>';
    grid
      ?.querySelectorAll("[data-url]")
      .forEach((x) =>
        x.addEventListener("click", () =>
          navigator.clipboard
            .writeText(location.origin + x.dataset.url)
            .then(() => showToast("Ссылка скопирована")),
        ),
      );
    const input = document.getElementById("mediaUpload");
    if (input)
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          await uploadMediaFile(file);
          showToast("Файл загружен на сервер");
          loadMedia();
        } catch (e) {
          showToast(e.message);
        } finally {
          input.value = "";
        }
      };
  } catch (e) {
    showToast(e.message);
  }
}
async function loadAudit() {
  try {
    const d = await api("/audit"),
      list = document.getElementById("auditList");
    if (list)
      list.innerHTML = d.audit
        .map(
          (a) =>
            `<div class="record-row"><span>${esc(a.role)}</span><div><strong>${esc(a.action)}</strong><small>${esc(a.actor)} · ${fmt(a.at)}</small></div><span>${esc(a.target)}</span></div>`,
        )
        .join("");
  } catch (e) {
    showToast(e.message);
  }
}

async function logoutUser() {
  await api("/logout", { method: "POST" });
  state.user = null;
  state.csrf = null;
  state.users = [];
  state.entities = (await api("/entities")).entities.filter(e => !isRetired(e));
  showToast("Вы вышли");
  navigate("/");
}
async function entitySubmit(e) {
  e.preventDefault();
  const rich = document.getElementById("richEditor");
  if (rich)
    document.getElementById("contentField").value = sanitizeRich(
      rich.innerHTML,
    );
  const f = new FormData(e.target),
    type = e.target.dataset.type,
    id = e.target.dataset.id;
  const fields = gatherEntityFields(
    e.target,
    type,
    e.target._fieldValues || getEntity(id)?.fields || {},
  );
  const payload = {
    id: id || undefined,
    type,
    slug: f.get("slug") || slug(f.get("name")),
    name: f.get("name"),
    shortDescription: f.get("shortDescription"),
    content: f.get("content"),
    image: f.get("image"),
    tags: String(f.get("tags") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    visibility: f.get("visibility"),
    status: f.get("status"),
    ownerEmail: f.get("ownerEmail"),
    ownerId:
      f.get("ownerEmail") &&
      f.get("ownerEmail") !== (getEntity(id)?.ownerEmail || "")
        ? ""
        : getEntity(id)?.ownerId || "",
    featured: f.get("featured") === "on",
    fields,
    relations: gatherRelations(),
  };
  try {
    const d = await api(id ? `/entities/${id}` : "/entities", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    state.entities = state.entities
      .filter((x) => x.id !== d.entity.id)
      .concat(d.entity);
    e.target.dataset.dirty = "false";
    showToast(id ? "Изменения сохранены" : "Запись создана");
    navigate(`/admin/entities/${type}`);
  } catch (err) {
    showToast(err.message);
  }
}
async function deleteEntity(id) {
  if (
    !confirm("Удалить запись? Связи на неё будут удалены из других объектов.")
  )
    return;
  try {
    await api("/entities/" + id, { method: "DELETE" });
    state.entities = state.entities.filter((e) => e.id !== id);
    showToast("Запись удалена");
    render();
  } catch (err) {
    showToast(err.message);
  }
}
function navigate(p) {
  if (
    document.querySelector("#entityForm[data-dirty=true], #siteForm[data-dirty=true]") &&
    !confirm("Есть несохранённые изменения. Покинуть редактор?")
  )
    return;
  history.pushState({}, "", p);
  sidebar.classList.remove("open");
  document.getElementById("modal").classList.add("hidden");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.addEventListener("popstate", () => {
  if (
    document.querySelector("#entityForm[data-dirty=true], #siteForm[data-dirty=true]") &&
    !confirm("Покинуть редактор без сохранения?")
  ) {
    history.forward();
    return;
  }
  render();
});
window.addEventListener("beforeunload", (e) => {
  if (document.querySelector("#entityForm[data-dirty=true], #siteForm[data-dirty=true]")) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document
  .getElementById("mobileMenu")
  .addEventListener("click", () => sidebar.classList.toggle("open"));
document
  .getElementById("globalSearch")
  .addEventListener("click", () => navigate("/search"));
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-route]");
  if (a && a.closest(".view") === null && a.getAttribute("href")) {
    e.preventDefault();
    navigate(a.getAttribute("href"));
  }
});
(async () => {
  await load();
  render();
})();

// Re-render at the next observed calendar day, including tabs left open overnight.
let lastHeroDay = "";
setInterval(() => {
  if (location.pathname !== "/" || !state.site) return;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: state.site.timeZone }).format(new Date());
  if (day !== lastHeroDay) { lastHeroDay = day; render(); }
}, 30000);
