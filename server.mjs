import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(ROOT, "data/db.json");
const UPLOADS = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(path.dirname(DB_FILE), "uploads");
const PORT = Number(process.env.PORT || 3000);
const SECRET =
  process.env.SESSION_SECRET || "dev-only-aetheria-secret-change-me-please";
if (
  process.env.NODE_ENV === "production" &&
  (SECRET.length < 32 || /^(dev-only|replace-|change-)/.test(SECRET))
)
  throw new Error("Production требует SESSION_SECRET длиной от 32 символов.");
const cookieSecure =
  process.env.COOKIE_SECURE === "true" ||
  (process.env.NODE_ENV === "production" &&
    process.env.COOKIE_SECURE !== "false");
const MAX_JSON = 8_000_000;
const TYPES = new Set([
  "characters",
  "factions",
  "locations",
  "creatures",
  "items",
  "articles",
  "magic",
  "events",
  "quests",
  "campaigns",
  "maps",
  "units",
  "sessions",
  "religions",
  "races",
  "stories",
  "sheets",
]);
const ROLES = new Set(["ADMIN", "GM", "EDITOR", "PLAYER"]);
const MIME = {
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
let queue = Promise.resolve();
const buckets = new Map();
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const slugify = (v) =>
  String(v || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90) || `entry-${Date.now()}`;
const cleanText = (v, n = 10000) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .slice(0, n);
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(String(password), salt, 180000, 32, "sha256")
    .toString("hex");
  return `pbkdf2$180000$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  if (!encoded) return false;
  if (!encoded.startsWith("pbkdf2$")) return safeEq(password, encoded);
  const [, rounds, salt, want] = encoded.split("$");
  const got = crypto
    .pbkdf2Sync(String(password), salt, Number(rounds), 32, "sha256")
    .toString("hex");
  return safeEq(got, want);
}
function defaultSite() {
  return { eyebrow:"", title:"", description:"", overviewTitle:"", overviewText:"", cards:[], startDate:"2026-10-12", timeZone:"Europe/Moscow" };
}
function normalizeSite(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("Настройки должны быть объектом"), { status:400 });
  const site = {};
  for (const key of ["eyebrow","title","description","overviewTitle","overviewText"]) site[key] = cleanText(input[key], key === "overviewText" ? 15000 : key === "description" ? 2000 : 180);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate || "") || !Number.isFinite(Date.parse(input.startDate + "T00:00:00Z")) || new Date(input.startDate + "T00:00:00Z").toISOString().slice(0,10) !== input.startDate) throw Object.assign(new Error("Некорректная дата начала цикла"), { status:400 });
  try { new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone }).format(); } catch { throw Object.assign(new Error("Некорректный часовой пояс"), { status:400 }); }
  if (typeof input.timeZone !== "string" || !input.timeZone) throw Object.assign(new Error("Укажите часовой пояс"), { status:400 });
  site.startDate = input.startDate; site.timeZone = input.timeZone;
  if (!Array.isArray(input.cards) || input.cards.length > 60) throw Object.assign(new Error("Разрешено не более 60 карточек"), { status:400 });
  site.cards = input.cards.map(card => {
    if (!card || typeof card !== "object" || Array.isArray(card) || typeof card.image !== "string" || !/^(https?:\/\/|\/(?!\/))/i.test(card.image) || card.image.length > 1000) throw Object.assign(new Error("У каждой карточки должен быть безопасный URL изображения"), { status:400 });
    return { title:cleanText(card.title,180), text:cleanText(card.text,2000), image:card.image };
  });
  return site;
}
async function readDb() {
  let db;
  try {
    db = JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    db = { entities: [] };
  }
  if (!Array.isArray(db.entities))
    throw new Error("Повреждена база: entities не является массивом");
  db.users ||= [];
  db.media ||= [];
  db.audit ||= [];
  db.versions ||= [];
  db.sessions ||= [];
  // Existing owned/player characters become independent game sheets, preserving IDs and relations.
  if (!db.schemaVersion || db.schemaVersion < 2) {
    for (const e of [
      ...db.entities,
      ...db.versions.map((v) => v.data).filter(Boolean),
    ]) {
      if (
        e.type === "characters" &&
        (e.ownerId || e.ownerEmail || e.visibility === "PLAYER")
      )
        e.type = "sheets";
    }
    db.schemaVersion = 2;
  }
  if (!db.schemaVersion || db.schemaVersion < 3) {
    for (const e of [...db.entities, ...db.versions.map(v => v.data).filter(Boolean)]) {
      if (e.type === "characters" && e.fields?.rank && !e.fields.title) e.fields.title = e.fields.rank;
    }
    db.schemaVersion = 3;
  }
  db.site ||= defaultSite();
  ensureAdmin(db);
  return db;
}
function ensureAdmin(db) {
  const login = (
    process.env.ADMIN_NICK ||
    process.env.ADMIN_EMAIL ||
    "admin@example.com"
  ).toLowerCase();
  if (!db.users.some((u) => u.role === "ADMIN")) {
    if (
      process.env.NODE_ENV === "production" &&
      (String(process.env.ADMIN_PASSWORD || "").length < 12 ||
        /^(change-me|replace-)/.test(process.env.ADMIN_PASSWORD || ""))
    )
      throw new Error(
        "Production требует собственный ADMIN_PASSWORD от 12 символов",
      );
    db.users.push({
      id: "admin",
      nickname: login,
      displayName: "Архивариус",
      role: "ADMIN",
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "change-me-now"),
      createdAt: now(),
      active: true,
    });
  }
}
async function writeDb(db) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
      const tmp = DB_FILE + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(db, null, 2));
      await fs.rename(tmp, DB_FILE);
    });
  return queue;
}
function audit(db, user, action, target = "", details = {}) {
  db.audit.unshift({
    id: uid(),
    at: now(),
    actor: user?.nickname || "system",
    role: user?.role || "PUBLIC",
    action,
    target,
    details,
  });
  db.audit = db.audit.slice(0, 2000);
}
function cookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = p.trim().split("=");
    if (k)
      try {
        o[k] = decodeURIComponent(v.join("="));
      } catch {}
  }
  return o;
}
function sign(v) {
  return crypto.createHmac("sha256", SECRET).update(v).digest("base64url");
}
function tokenFor(db, u, csrf) {
  const session = {
    id: uid(),
    userId: u.id,
    csrf,
    exp: Date.now() + 7 * 864e5,
  };
  db.sessions = db.sessions.filter((x) => x.exp > Date.now());
  db.sessions.push(session);
  const p = Buffer.from(
    JSON.stringify({ id: u.id, sid: session.id, exp: session.exp }),
  ).toString("base64url");
  return `${p}.${sign(p)}`;
}
function authenticated(req, db) {
  const token = userFrom(req);
  if (!token) return null;
  const session = db.sessions.find(
    (x) => x.id === token.sid && x.userId === token.id && x.exp > Date.now(),
  );
  const user = db.users.find((x) => x.id === token.id && x.active !== false);
  return session && user
    ? {
        id: user.id,
        nickname: user.nickname,
        name: user.displayName,
        role: user.role,
        csrf: session.csrf,
        sid: session.id,
      }
    : null;
}
function userFrom(req) {
  const t = cookies(req).aetheria_session;
  if (!t) return null;
  const [p, s] = t.split(".");
  if (!p || !s || !safeEq(s, sign(p))) return null;
  try {
    const u = JSON.parse(Buffer.from(p, "base64url").toString());
    return u.exp > Date.now() ? u : null;
  } catch {
    return null;
  }
}
function rate(req, key, limit = 40, windowMs = 60000) {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "local"
  )
    .toString()
    .split(",")[0];
  const k = `${ip}:${key}`,
    t = Date.now();
  let b = buckets.get(k);
  if (!b || b.reset < t) b = { count: 0, reset: t + windowMs };
  b.count++;
  buckets.set(k, b);
  return b.count <= limit;
}
function send(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}
function requireRole(req, res, roles) {
  const u = req.authUser;
  if (!u || !roles.includes(u.role)) {
    send(res, 403, { error: "Недостаточно прав" });
    return null;
  }
  return u;
}
function verifyCsrf(req, res, u) {
  if (!u || !safeEq(req.headers["x-csrf-token"] || "", u.csrf || "")) {
    send(res, 403, { error: "Сессия формы устарела. Обновите страницу." });
    return false;
  }
  return true;
}
async function jsonBody(req) {
  let raw = "",
    size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_JSON) {
      const e = new Error("Слишком большой запрос");
      e.status = 413;
      throw e;
    }
    raw += c;
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    const e = new Error("Некорректный JSON");
    e.status = 400;
    throw e;
  }
}
function canView(e, u) {
  if (e.visibility === "PRIVATE") return u?.role === "ADMIN";
  if (e.status === "DRAFT" && !["ADMIN", "GM", "EDITOR"].includes(u?.role))
    return false;
  if (e.visibility === "PUBLIC") return true;
  if (!u) return false;
  if (["ADMIN", "GM", "EDITOR"].includes(u.role)) return true;
  if (e.visibility === "PLAYER")
    return e.ownerId
      ? e.ownerId === u.id
      : e.ownerEmail
        ? e.ownerEmail === u.nickname
        : e.type !== "sheets";
  return false;
}
function exposed(e, u, db) {
  const copy = structuredClone(e),
    isEditor = ["ADMIN", "GM", "EDITOR"].includes(u?.role);
  if (!isEditor) {
    delete copy.fields?.secrets;
    delete copy.ownerEmail;
    delete copy.ownerId;
    // Own sheets retain their owner ID so the client can filter them without exposing other owners.
    if (e.type === "sheets" && e.ownerId === u?.id) copy.ownerId = e.ownerId;
    if (e.type === "sheets" && e.ownerEmail === u?.nickname)
      copy.ownerEmail = e.ownerEmail;
    const visibleIds = new Set(
      db.entities.filter((x) => canView(x, u)).map((x) => x.id),
    );
    copy.relations = (copy.relations || []).filter((r) =>
      visibleIds.has(r.targetId),
    );
    const hiddenLayers = new Set(
      typeof copy.fields?.layers === "string"
        ? copy.fields.layers
            .split("\n")
            .filter((row) => row.split("|")[2]?.trim() === "hidden")
            .flatMap((row) =>
              row
                .split("|")
                .slice(0, 2)
                .map((v) => v.trim()),
            )
        : [],
    );
    if (Array.isArray(copy.fields?.pins))
      copy.fields.pins = copy.fields.pins.filter(
        (p) =>
          !p.hidden &&
          !hiddenLayers.has(p.layer) &&
          (!p.targetId || visibleIds.has(p.targetId)),
      );
    if (typeof copy.fields?.layers === "string")
      copy.fields.layers = copy.fields.layers
        .split("\n")
        .filter((row) => !row.split("|").some((v) => v.trim() === "hidden"))
        .join("\n");
  }
  return copy;
}
function normalize(input, current = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Object.assign(new Error("Нужен объект записи"), { status: 400 });
  if (input.type !== undefined && !TYPES.has(input.type))
    throw Object.assign(new Error("Неизвестный тип записи"), { status: 400 });
  if (
    input.fields !== undefined &&
    (input.fields === null ||
      typeof input.fields !== "object" ||
      Array.isArray(input.fields))
  )
    throw Object.assign(new Error("Поля должны быть объектом"), {
      status: 400,
    });
  const name = cleanText(input.name ?? current.name, 180).trim();
  const type = TYPES.has(String(input.type || current.type))
    ? String(input.type || current.type)
    : "articles";
  return {
    id: String(current.id || uid()),
    type,
    slug: slugify(input.slug || current.slug || name),
    name,
    shortDescription: cleanText(
      input.shortDescription ?? current.shortDescription,
      600,
    ),
    content: cleanText(input.content ?? current.content, 150000),
    image: cleanText(input.image ?? current.image, 1000),
    tags: Array.isArray(input.tags)
      ? input.tags.map((x) => cleanText(x, 40)).slice(0, 30)
      : current.tags || [],
    visibility: ["PUBLIC", "PLAYER", "GM", "PRIVATE"].includes(input.visibility)
      ? input.visibility
      : current.visibility || "PUBLIC",
    status: ["DRAFT", "PUBLISHED"].includes(input.status)
      ? input.status
      : current.status || "PUBLISHED",
    featured: Boolean(input.featured ?? current.featured),
    ownerId: cleanText(input.ownerId ?? current.ownerId, 80) || undefined,
    ownerEmail:
      cleanText(input.ownerEmail ?? current.ownerEmail, 160).toLowerCase() ||
      undefined,
    fields:
      input.fields && typeof input.fields === "object"
        ? input.fields
        : current.fields || {},
    relations: Array.isArray(input.relations)
      ? input.relations.slice(0, 200).map((r) => ({
          targetId: cleanText(r.targetId, 80),
          label: cleanText(r.label, 80),
        }))
      : current.relations || [],
    createdAt: current.createdAt || now(),
    updatedAt: now(),
  };
}
function snapshot(db, e, user, reason = "save") {
  db.versions.unshift({
    id: uid(),
    entityId: e.id,
    at: now(),
    actor: user.nickname,
    reason,
    data: structuredClone(e),
  });
  db.versions = db.versions.slice(0, 5000);
}
function unique(db, e, ignored = "") {
  return db.entities.some(
    (x) => x.id !== ignored && x.type === e.type && x.slug === e.slug,
  );
}
function publicUser(u) {
  return {
    id: u.id,
    nickname: u.nickname,
    name: u.displayName,
    role: u.role,
    active: u.active !== false,
    createdAt: u.createdAt,
  };
}
function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: https:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
  };
}

async function api(req, res, url) {
  const p = decodeURIComponent(url.pathname).split("/").filter(Boolean),
    action = p[1];
  if (
    !rate(req, action, action === "login" || action === "register" ? 12 : 120)
  )
    return send(res, 429, {
      error: "Слишком много запросов. Попробуйте позже.",
    });
  const db = await readDb(),
    u = authenticated(req, db);
  req.authUser = u;
  if (action === "site") {
    if (req.method === "GET") return send(res, 200, { site: db.site });
    if (req.method !== "PUT") return send(res, 405, { error:"Метод не поддерживается" });
    const admin = requireRole(req, res, ["ADMIN"]);
    if (!admin || !verifyCsrf(req,res,admin)) return;
    db.site = normalizeSite(await jsonBody(req));
    audit(db,admin,"site.update","showcase",{ cards:db.site.cards.length });
    await writeDb(db);
    return send(res,200,{ site:db.site });
  }
  if (action === "register" && req.method === "POST") {
    const b = await jsonBody(req),
      nickname = cleanText(b.nickname, 32).trim().toLowerCase();
    if (!/^[a-zа-яё0-9_-]{3,32}$/i.test(nickname))
      return send(res, 400, {
        error: "Ник: 3–32 символа, буквы, цифры, _ или -",
      });
    if (String(b.password || "").length < 8)
      return send(res, 400, {
        error: "Пароль должен содержать минимум 8 символов",
      });
    if (db.users.some((x) => x.nickname === nickname))
      return send(res, 409, { error: "Этот ник уже занят" });
    const player = {
      id: uid(),
      nickname,
      displayName: cleanText(b.displayName || nickname, 60),
      role: "PLAYER",
      passwordHash: hashPassword(b.password),
      createdAt: now(),
      active: true,
    };
    db.users.push(player);
    const character = normalize({
      type: "sheets",
      name: cleanText(
        b.characterName || `${player.displayName} — персонаж`,
        100,
      ),
      shortDescription: "Персонаж игрока. Заполните историю и характеристики.",
      visibility: "PLAYER",
      ownerId: player.id,
      status: "PUBLISHED",
      fields: { level: 1, hp: 10, maxHp: 10, ac: 10, gold: 0, experience: 0 },
    });
    db.entities.push(character);
    audit(db, player, "register", player.id);
    const csrf = uid(),
      t = tokenFor(db, player, csrf);
    await writeDb(db);
    return send(
      res,
      201,
      { user: publicUser(player), csrf, character },
      {
        "Set-Cookie": `aetheria_session=${encodeURIComponent(t)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800${cookieSecure ? "; Secure" : ""}`,
      },
    );
  }
  if (action === "login" && req.method === "POST") {
    const b = await jsonBody(req),
      login = cleanText(b.nickname || b.email, 160)
        .trim()
        .toLowerCase();
    const found = db.users.find(
      (x) => x.nickname === login && x.active !== false,
    );
    if (!found || !verifyPassword(b.password, found.passwordHash))
      return send(res, 401, { error: "Неверный ник или пароль" });
    if (b.adminOnly && found.role !== "ADMIN")
      return send(res, 403, { error: "Этот вход только для администратора" });
    const csrf = uid(),
      t = tokenFor(db, found, csrf);
    audit(db, found, "login", found.id);
    await writeDb(db);
    return send(
      res,
      200,
      { user: publicUser(found), csrf },
      {
        "Set-Cookie": `aetheria_session=${encodeURIComponent(t)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800${cookieSecure ? "; Secure" : ""}`,
      },
    );
  }
  if (action === "logout" && req.method === "POST") {
    if (!verifyCsrf(req, res, u)) return;
    db.sessions = db.sessions.filter((x) => x.id !== u.sid);
    await writeDb(db);
    return send(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": `aetheria_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${cookieSecure ? "; Secure" : ""}`,
      },
    );
  }
  if (action === "me" && req.method === "GET")
    return send(res, 200, {
      user: u
        ? { id: u.id, nickname: u.nickname, name: u.name, role: u.role }
        : null,
      csrf: u?.csrf || null,
    });
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    !verifyCsrf(req, res, u)
  )
    return;
  if (action === "users") {
    const admin = requireRole(req, res, ["ADMIN"]);
    if (!admin) return;
    if (p.length === 2 && req.method === "GET")
      return send(res, 200, { users: db.users.map(publicUser) });
    if (p[2] && p[3] === "password" && req.method === "PUT") {
      const target = db.users.find((x) => x.id === p[2]),
        b = await jsonBody(req);
      if (!target) return send(res, 404, { error: "Пользователь не найден" });
      if (String(b.password || "").length < 8)
        return send(res, 400, { error: "Минимум 8 символов" });
      target.passwordHash = hashPassword(b.password);
      db.sessions = db.sessions.filter((s) => s.userId !== target.id);
      audit(db, admin, "password.reset", target.id);
      await writeDb(db);
      return send(res, 200, { ok: true });
    }
    if (p[2] && req.method === "PUT") {
      const target = db.users.find((x) => x.id === p[2]),
        b = await jsonBody(req);
      if (!target) return send(res, 404, { error: "Пользователь не найден" });
      if (
        target.role === "ADMIN" &&
        ((b.role && b.role !== "ADMIN") || b.active === false) &&
        db.users.filter((x) => x.role === "ADMIN" && x.active !== false)
          .length <= 1
      )
        return send(res, 400, {
          error: "Нельзя отключить или понизить последнего администратора",
        });
      if (ROLES.has(b.role)) target.role = b.role;
      if (typeof b.active === "boolean") target.active = b.active;
      if (target.active === false)
        db.sessions = db.sessions.filter((s) => s.userId !== target.id);
      audit(db, admin, "user.update", target.id, {
        role: target.role,
        active: target.active,
      });
      await writeDb(db);
      return send(res, 200, { user: publicUser(target) });
    }
  }
  if (action === "audit") {
    if (!requireRole(req, res, ["ADMIN", "GM"])) return;
    return send(res, 200, { audit: db.audit.slice(0, 300) });
  }
  if (action === "media") {
    if (!requireRole(req, res, ["ADMIN", "GM", "EDITOR"])) return;
    if (req.method === "GET") return send(res, 200, { media: db.media });
    if (req.method === "POST") {
      const b = await jsonBody(req);
      if (
        !/^data:(image\/(png|jpeg|webp|gif)|application\/pdf);base64,/i.test(
          b.data || "",
        )
      )
        return send(res, 400, {
          error: "Разрешены PNG, JPEG, WEBP, GIF и PDF",
        });
      const [meta, data] = (b.data || "").split(","),
        buf = Buffer.from(data, "base64");
      if (buf.length > 5_000_000)
        return send(res, 413, { error: "Файл больше 5 МБ" });
      const ext = meta.includes("pdf")
          ? "pdf"
          : meta.includes("png")
            ? "png"
            : meta.includes("webp")
              ? "webp"
              : meta.includes("gif")
                ? "gif"
                : "jpg",
        file = `${uid()}.${ext}`;
      await fs.mkdir(UPLOADS, { recursive: true });
      await fs.writeFile(path.join(UPLOADS, file), buf);
      const item = {
        id: uid(),
        name: cleanText(b.name || file, 160),
        url: `/uploads/${file}`,
        size: buf.length,
        type: meta.slice(5, meta.indexOf(";")),
        createdAt: now(),
        author: u.nickname,
      };
      db.media.unshift(item);
      audit(db, u, "media.upload", item.id);
      await writeDb(db);
      return send(res, 201, { media: item });
    }
  }
  if (action === "versions") {
    if (!requireRole(req, res, ["ADMIN", "GM", "EDITOR"])) return;
    const entityId = p[2];
    const current = db.entities.find((e) => e.id === entityId);
    if (!current || !canView(current, u))
      return send(res, 404, { error: "Запись не найдена" });
    if (req.method === "GET")
      return send(res, 200, {
        versions: db.versions
          .filter((v) => v.entityId === entityId)
          .map((v) => ({
            id: v.id,
            at: v.at,
            actor: v.actor,
            reason: v.reason,
          })),
      });
    if (p[3] && p[4] === "restore" && req.method === "POST") {
      const v = db.versions.find(
          (x) => x.id === p[3] && x.entityId === entityId,
        ),
        i = db.entities.findIndex((x) => x.id === entityId);
      if (!v || i < 0) return send(res, 404, { error: "Редакция не найдена" });
      const candidate = { ...structuredClone(v.data), updatedAt: now() };
      if (!canView(candidate, u))
        return send(res, 403, { error: "Редакция недоступна этой роли" });
      if (unique(db, candidate, entityId))
        return send(res, 409, { error: "Адрес этой редакции уже занят" });
      snapshot(db, db.entities[i], u, "before restore");
      db.entities[i] = candidate;
      audit(db, u, "entity.restore", entityId, { version: p[3] });
      await writeDb(db);
      return send(res, 200, { entity: db.entities[i] });
    }
  }
  if (action !== "entities")
    return send(res, 404, { error: "API endpoint not found" });
  if (p.length === 2 && req.method === "GET") {
    let rows = db.entities
      .filter((e) => canView(e, u))
      .map((e) => exposed(e, u, db));
    const q = (url.searchParams.get("q") || "").toLowerCase(),
      type = url.searchParams.get("type");
    if (type) rows = rows.filter((e) => e.type === type);
    if (q)
      rows = rows.filter((e) =>
        [
          e.name,
          e.shortDescription,
          e.content,
          (e.tags || []).join(" "),
          JSON.stringify(e.fields || {}),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    return send(res, 200, { entities: rows });
  }
  if (p.length === 3 && req.method === "GET") {
    const e = db.entities.find((x) => x.id === p[2] || x.slug === p[2]);
    return !e || !canView(e, u)
      ? send(res, 404, { error: "Не найдено" })
      : send(res, 200, { entity: exposed(e, u, db) });
  }
  const editor = requireRole(req, res, ["ADMIN", "GM", "EDITOR"]);
  if (!editor) return;
  if (p.length === 2 && req.method === "POST") {
    const e = normalize(await jsonBody(req));
    if (!e.name) return send(res, 400, { error: "Название обязательно" });
    if (unique(db, e))
      return send(res, 409, { error: "Такой адрес уже занят" });
    db.entities.push(e);
    snapshot(db, e, editor, "created");
    audit(db, editor, "entity.create", e.id, { type: e.type });
    await writeDb(db);
    return send(res, 201, { entity: e });
  }
  if (p.length === 3 && req.method === "PUT") {
    const i = db.entities.findIndex((x) => x.id === p[2]);
    if (i < 0 || !canView(db.entities[i], u))
      return send(res, 404, { error: "Не найдено" });
    snapshot(db, db.entities[i], editor, "before update");
    const e = normalize(await jsonBody(req), db.entities[i]);
    if (!e.name) return send(res, 400, { error: "Название обязательно" });
    if (unique(db, e, e.id))
      return send(res, 409, { error: "Такой адрес уже занят" });
    db.entities[i] = e;
    audit(db, editor, "entity.update", e.id);
    await writeDb(db);
    return send(res, 200, { entity: exposed(e, u, db) });
  }
  if (p.length === 3 && req.method === "DELETE") {
    const i = db.entities.findIndex((x) => x.id === p[2]);
    if (i < 0 || !canView(db.entities[i], u))
      return send(res, 404, { error: "Не найдено" });
    snapshot(db, db.entities[i], editor, "before delete");
    db.entities.splice(i, 1);
    for (const e of db.entities)
      e.relations = (e.relations || []).filter((r) => r.targetId !== p[2]);
    audit(db, editor, "entity.delete", p[2]);
    await writeDb(db);
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: "Method not allowed" });
}
async function serve(req, res, url) {
  if (url.pathname.startsWith("/entity/characters/")) {
    const db = await readDb(),
      slug = decodeURIComponent(url.pathname).split("/")[3],
      sheet = db.entities.find((e) => e.type === "sheets" && e.slug === slug);
    if (sheet && canView(sheet, authenticated(req, db))) {
      res.writeHead(302, {
        Location: "/entity/sheets/" + encodeURIComponent(sheet.slug),
        "Cache-Control": "no-store",
      });
      return res.end();
    }
  }
  let rel = decodeURIComponent(
    url.pathname === "/" ? "/index.html" : url.pathname,
  );
  if (rel.startsWith("/uploads/")) {
    const file = path.join(UPLOADS, path.basename(rel));
    try {
      const d = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...securityHeaders(),
      });
      return res.end(d);
    } catch {
      return send(res, 404, { error: "Not found" });
    }
  }
  if (rel.includes("..")) return send(res, 400, { error: "Bad path" });
  let file = path.join(PUBLIC, rel);
  try {
    if ((await fs.stat(file)).isDirectory())
      file = path.join(file, "index.html");
  } catch {
    file = path.join(PUBLIC, "index.html");
  }
  try {
    let d = await fs.readFile(file);
    if (
      path.basename(file) === "index.html" &&
      url.pathname.startsWith("/entity/")
    ) {
      const db = await readDb(),
        parts = decodeURIComponent(url.pathname).split("/"),
        e = db.entities.find(
          (x) =>
            x.type === parts[2] &&
            x.slug === parts[3] &&
            x.visibility === "PUBLIC" &&
            x.status !== "DRAFT",
        );
      if (e) {
        let html = d.toString();
        const title = `${e.name} — Асхан`,
          desc = e.shortDescription || "Архив мира Асхана";
        html = html.replace(
          "<title>Асхан — Архив мира</title>",
          `<title>${title.replace(/[<>]/g, "")}</title><meta property="og:title" content="${title.replace(/["<>]/g, "")}"><meta property="og:description" content="${desc.replace(/["<>]/g, "")}"><meta property="og:type" content="article"><link rel="canonical" href="${url.origin}${url.pathname}">`,
        );
        d = Buffer.from(html);
      }
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control":
        process.env.NODE_ENV === "production"
          ? "public, max-age=300"
          : "no-cache",
      ...securityHeaders(),
    });
    res.end(d);
  } catch {
    send(res, 404, { error: "Not found" });
  }
}
let apiQueue = Promise.resolve();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const job = apiQueue.catch(() => {}).then(() => api(req, res, url));
      apiQueue = job;
      return await job;
    }
    if (req.method !== "GET")
      return send(res, 405, { error: "Method not allowed" });
    return await serve(req, res, url);
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: "Внутренняя ошибка сервера" });
  }
});
// Validate and persist migration/admin exactly once at startup; keep a pre-migration backup.
const initial = await readDb();
try {
  const old = JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  if (!old.schemaVersion || old.schemaVersion < 3) {
    try { await fs.copyFile(DB_FILE, DB_FILE + ".pre-2.3-backup", 1); } catch (error) { if (error.code !== "EEXIST") throw error; }
  }
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await writeDb(initial);
server.listen(PORT, () =>
  console.log(`Ashan Arcanum v2.3 running at http://localhost:${PORT}`),
);
