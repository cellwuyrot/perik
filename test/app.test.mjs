import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const port = 3300 + Math.floor(Math.random() * 100),
  base = `http://127.0.0.1:${port}`;
let proc, tempDir, testDb;
async function wait() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/api/me")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("server did not start");
}
function cookie(r) {
  return (r.headers.get("set-cookie") || "").split(";")[0];
}
async function json(url, opts = {}) {
  const r = await fetch(base + url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let data = {};
  try {
    data = await r.json();
  } catch {}
  return { r, data };
}
async function login(adminOnly = false) {
  const x = await json("/api/login", {
    method: "POST",
    body: JSON.stringify({
      nickname: "admin@example.com",
      password: "change-me-now",
      adminOnly,
    }),
  });
  return { ...x, cookie: cookie(x.r), csrf: x.data.csrf };
}
before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aetheria-v2-"));
  testDb = path.join(tempDir, "db.json");
  await new Promise((ok, no) => {
    const p = spawn(process.execPath, ["seed.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DB_FILE: testDb },
    });
    p.on("exit", (c) => (c === 0 ? ok() : no(Error("seed"))));
  });
  proc = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DB_FILE: testDb,
      SESSION_SECRET: "test-secret",
      ADMIN_PASSWORD: "change-me-now",
    },
    stdio: "ignore",
  });
  await wait();
});
after(async () => {
  proc?.kill();
  await fs.rm(tempDir, { recursive: true, force: true });
});
test("SPA, hidden /enter and SEO deep link are served", async () => {
  const home = await (await fetch(base + "/")).text();
  assert.match(home, /id="app"/);
  assert.doesNotMatch(home, /href="\/enter"/);
  assert.equal((await fetch(base + "/enter")).status, 200);
  const detail = await (
    await fetch(base + "/entity/locations/esterion")
  ).text();
  assert.match(detail, /og:title/);
  assert.match(detail, /Эстерион/);
});
test("public layer hides GM and player records", async () => {
  const x = await json("/api/entities");
  const names = x.data.entities.map((e) => e.name);
  assert.ok(names.includes("Эстерион"));
  assert.ok(!names.includes("Чёрный Хор"));
  assert.ok(!names.includes("Лира Звездопад"));
});
test("player registration creates account and owned character", async () => {
  const x = await json("/api/register", {
    method: "POST",
    body: JSON.stringify({
      nickname: "new_player",
      password: "long-pass-123",
      characterName: "Рин Тихий",
    }),
  });
  assert.equal(x.r.status, 201);
  assert.equal(x.data.user.role, "PLAYER");
  assert.equal(x.data.character.ownerId, x.data.user.id);
  const all = await json("/api/entities", { headers: { Cookie: cookie(x.r) } });
  assert.ok(all.data.entities.some((e) => e.name === "Рин Тихий"));
});
test("admin-only gate rejects player", async () => {
  const x = await json("/api/login", {
    method: "POST",
    body: JSON.stringify({
      nickname: "new_player",
      password: "long-pass-123",
      adminOnly: true,
    }),
  });
  assert.equal(x.r.status, 403);
});
test("CSRF is required and admin CRUD creates versions and audit", async () => {
  const a = await login(true);
  assert.equal(a.r.status, 200);
  const no = await json("/api/entities", {
    method: "POST",
    headers: { Cookie: a.cookie },
    body: JSON.stringify({ name: "bad" }),
  });
  assert.equal(no.r.status, 403);
  const h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const c = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      type: "articles",
      name: "Тест v2",
      content: "<p>rich <strong>text</strong> @new_player</p>",
    }),
  });
  assert.equal(c.r.status, 201);
  const u = await json("/api/entities/" + c.data.entity.id, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ name: "Тест v2.1" }),
  });
  assert.equal(u.r.status, 200);
  const v = await json("/api/versions/" + c.data.entity.id, { headers: h });
  assert.ok(v.data.versions.length >= 2);
  const audit = await json("/api/audit", { headers: h });
  assert.ok(audit.data.audit.some((x) => x.action === "entity.update"));
  const d = await json("/api/entities/" + c.data.entity.id, {
    method: "DELETE",
    headers: h,
  });
  assert.equal(d.r.status, 200);
});
test("admin can manage roles and reset password", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const users = await json("/api/users", { headers: h });
  const player = users.data.users.find((u) => u.nickname === "new_player");
  assert.ok(player);
  assert.equal(
    (
      await json("/api/users/" + player.id, {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ role: "EDITOR" }),
      })
    ).r.status,
    200,
  );
  assert.equal(
    (
      await json(`/api/users/${player.id}/password`, {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ password: "changed-pass-456" }),
      })
    ).r.status,
    200,
  );
  assert.equal(
    (
      await json("/api/login", {
        method: "POST",
        body: JSON.stringify({
          nickname: "new_player",
          password: "changed-pass-456",
        }),
      })
    ).r.status,
    200,
  );
});
test("media library accepts bounded image upload", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const tiny = "data:image/png;base64,iVBORw0KGgo=";
  const x = await json("/api/media", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: "tiny.png", data: tiny }),
  });
  assert.equal(x.r.status, 201);
  assert.match(x.data.media.url, /^\/uploads\//);
  assert.equal((await fetch(base + x.data.media.url)).status, 200);
});
test("frontend includes responsive rich editor and network UI", async () => {
  const js = await (await fetch(base + "/app.js")).text(),
    css = await (await fetch(base + "/styles.css")).text();
  assert.match(js, /richEditor/);
  assert.match(js, /entityImageUpload/);
  assert.match(js, /uploadMediaFile/);
  assert.match(js, /showVersions/);
  assert.match(js, /usersAdmin/);
  assert.match(css, /Aether Sans/);
  assert.match(css, /image-upload-preview/);
  assert.match(css, /ui-icon/);
  assert.match(css, /network-filters/);
  assert.match(css, /prefers-reduced-motion/);
});

test("public responses strip GM secrets, hidden pins and hidden relations", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const publicRows = (await json("/api/entities")).data.entities;
  const ilia = publicRows.find((e) => e.id === "ilia-ven");
  assert.ok(ilia);
  assert.ok(!("secrets" in ilia.fields));
  assert.equal(
    (await json("/api/entities/ilia-ven")).data.entity.fields.secrets,
    undefined,
  );
  const c = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      type: "maps",
      name: "Secret pin test",
      fields: {
        layers: "one | Open | visible\ntwo | Secret | hidden",
        pins: [
          { label: "hidden", hidden: true },
          { label: "visible", hidden: false },
        ],
      },
      relations: [{ targetId: "black-choir", label: "secret" }],
    }),
  });
  const pub = (await json("/api/entities/" + c.data.entity.id)).data.entity;
  assert.deepEqual(
    pub.fields.pins.map((p) => p.label),
    ["visible"],
  );
  assert.doesNotMatch(pub.fields.layers, /Secret/);
  assert.equal(pub.relations.length, 0);
});
test("all requested entity types and new fields round-trip; old owned characters migrate to sheets", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const all = (await json("/api/entities", { headers: h })).data.entities;
  assert.equal(all.find((e) => e.id === "lyra-starfall").type, "sheets");
  for (const type of [
    "articles",
    "races",
    "religions",
    "events",
    "stories",
    "quests",
    "sessions",
    "characters",
    "units",
    "creatures",
    "sheets",
    "items",
  ]) {
    const fields = ["characters", "units", "creatures", "sheets"].includes(type)
      ? {
          gold: 12,
          experience: 250,
          hp: 35,
          maxHp: 40,
          stats: { STR: 12, DEX: 14 },
          inventory: "Меч",
          customLegacy: "сохранить",
        }
      : type === "items"
        ? { ac: 17, damage: "1d8+2", ability: "Острое" }
        : {};
    const x = await json("/api/entities", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ type, name: "Regression " + type, fields }),
    });
    assert.equal(x.r.status, 201, type);
    const read = await json("/api/entities/" + x.data.entity.id, {
      headers: h,
    });
    assert.deepEqual(read.data.entity.fields, fields);
  }
  const invalid = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ type: "unknown", name: "Invalid" }),
  });
  assert.equal(invalid.r.status, 400);
});
test("session survives website navigation and server restart; logout revokes it and requires CSRF", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  assert.match(a.r.headers.get("set-cookie"), /HttpOnly/);
  assert.match(a.r.headers.get("set-cookie"), /Max-Age=604800/);
  for (const page of ["/", "/enter", "/admin", "/encyclopedia/units"])
    assert.equal((await fetch(base + page, { headers: h })).status, 200);
  const stopped = new Promise((resolve) => proc.once("exit", resolve));
  proc.kill();
  await stopped;
  proc = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DB_FILE: testDb,
      SESSION_SECRET: "test-secret",
    },
    stdio: "ignore",
  });
  await wait();
  assert.equal((await json("/api/me", { headers: h })).data.user.role, "ADMIN");
  assert.equal(
    (
      await json("/api/logout", {
        method: "POST",
        headers: { Cookie: a.cookie },
      })
    ).r.status,
    403,
  );
  assert.equal(
    (await json("/api/logout", { method: "POST", headers: h })).r.status,
    200,
  );
  assert.equal((await json("/api/me", { headers: h })).data.user, null);
});
test("role changes, disabling and password reset apply to existing sessions; last admin protected", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const r = await json("/api/register", {
    method: "POST",
    body: JSON.stringify({
      nickname: "revocation_test",
      password: "long-pass-123",
    }),
  });
  const playerId = r.data.user.id;
  const ph = { Cookie: cookie(r.r), "X-CSRF-Token": r.data.csrf };
  await json("/api/users/" + playerId, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ role: "EDITOR" }),
  });
  assert.equal(
    (await json("/api/me", { headers: ph })).data.user.role,
    "EDITOR",
  );
  await json("/api/users/" + playerId, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ role: "PLAYER" }),
  });
  assert.equal(
    (
      await json("/api/entities", {
        method: "POST",
        headers: ph,
        body: JSON.stringify({ name: "Not allowed" }),
      })
    ).r.status,
    403,
  );
  await json("/api/users/" + playerId, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ active: false }),
  });
  assert.equal((await json("/api/me", { headers: ph })).data.user, null);
  const adminId = a.data.user.id;
  assert.equal(
    (
      await json("/api/users/" + adminId, {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ active: false }),
      })
    ).r.status,
    400,
  );
});
test("parallel creates preserve every committed record", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const rows = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      json("/api/entities", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ type: "stories", name: `Parallel branch ${i}` }),
      }),
    ),
  );
  assert.ok(rows.every((x) => x.r.status === 201));
  const all = (await json("/api/entities", { headers: h })).data.entities;
  for (const x of rows) assert.ok(all.some((e) => e.id === x.data.entity.id));
});
test("malformed cookie does not crash the API and private rows are admin-only", async () => {
  assert.equal(
    (
      await json("/api/me", {
        headers: { Cookie: "x=%zz; aetheria_session=%zz" },
      })
    ).r.status,
    200,
  );
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const x = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: "Private row", visibility: "PRIVATE" }),
  });
  assert.equal((await json("/api/entities/" + x.data.entity.id)).r.status, 404);
});

test("GM cannot edit, delete or restore ADMIN-private records, including by known ID", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const c = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ name: "Admin only fixture", visibility: "PRIVATE" }),
  });
  const r = await json("/api/register", {
    method: "POST",
    body: JSON.stringify({
      nickname: "gm_access_test",
      password: "long-pass-123",
    }),
  });
  await json("/api/users/" + r.data.user.id, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ role: "GM" }),
  });
  const gh = { Cookie: cookie(r.r), "X-CSRF-Token": r.data.csrf };
  for (const method of ["GET", "PUT", "DELETE"]) {
    const x = await json("/api/entities/" + c.data.entity.id, {
      method,
      headers: gh,
      ...(method === "PUT"
        ? { body: JSON.stringify({ name: "Not allowed" }) }
        : {}),
    });
    assert.equal(x.r.status, 404);
  }
  assert.equal(
    (await json("/api/versions/" + c.data.entity.id, { headers: gh })).r.status,
    404,
  );
  const version = (
    await json("/api/versions/" + c.data.entity.id, { headers: h })
  ).data.versions[0];
  assert.equal(
    (
      await json(`/api/versions/${c.data.entity.id}/${version.id}/restore`, {
        method: "POST",
        headers: gh,
      })
    ).r.status,
    404,
  );
});
test("Cyrillic slugs resolve by API and SEO; migrated deep links redirect", async () => {
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const c = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({ type: "articles", name: "Русский лор" }),
  });
  assert.equal(c.data.entity.slug, "русский-лор");
  assert.equal(
    (await json("/api/entities/" + encodeURIComponent(c.data.entity.slug))).data
      .entity.name,
    "Русский лор",
  );
  const html = await (
    await fetch(
      base + "/entity/articles/" + encodeURIComponent(c.data.entity.slug),
    )
  ).text();
  assert.match(html, /Русский лор — Асхан/);
  const redirect = await fetch(base + "/entity/characters/lyra-starfall", {
    headers: h,
    redirect: "manual",
  });
  assert.equal(redirect.status, 302);
  assert.equal(
    redirect.headers.get("location"),
    "/entity/sheets/lyra-starfall",
  );
});
test("search cannot match unrevealed GM secrets; restore refuses occupied slugs", async () => {
  const publicSearch = await json(
    "/api/entities?q=" + encodeURIComponent("Колодец Ночи"),
  );
  assert.ok(!publicSearch.data.entities.some((e) => e.id === "ilia-ven"));
  const a = await login(),
    h = { Cookie: a.cookie, "X-CSRF-Token": a.csrf };
  const c = await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      type: "articles",
      name: "Version one",
      slug: "version-one",
    }),
  });
  const version = (
    await json("/api/versions/" + c.data.entity.id, { headers: h })
  ).data.versions[0];
  await json("/api/entities/" + c.data.entity.id, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ name: "Version two", slug: "version-two" }),
  });
  const restored = await json(
    `/api/versions/${c.data.entity.id}/${version.id}/restore`,
    { method: "POST", headers: h },
  );
  assert.equal(restored.r.status, 200);
  assert.equal(restored.data.entity.name, "Version one");
  await json("/api/entities/" + c.data.entity.id, {
    method: "PUT",
    headers: h,
    body: JSON.stringify({ slug: "version-three" }),
  });
  await json("/api/entities", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      type: "articles",
      name: "Occupant",
      slug: "version-one",
    }),
  });
  assert.equal(
    (
      await json(`/api/versions/${c.data.entity.id}/${version.id}/restore`, {
        method: "POST",
        headers: h,
      })
    ).r.status,
    409,
  );
});

let showcaseSession;
async function showcaseLogin() {
  showcaseSession ||= await login();
  assert.equal(showcaseSession.r.status,200);
  return showcaseSession;
}
test('Showcase defaults are empty, public read allowed, guest write forbidden', async () => {
  const {r,data} = await json('/api/site');
  assert.equal(r.status,200);
  assert.deepEqual(data.site.cards,[]);
  assert.equal(data.site.description,'');
  assert.equal((await json('/api/site',{method:'PUT',body:'{}'})).r.status,403);
  assert.equal((await json('/api/site',{method:'DELETE'})).r.status,405);
});
test('Showcase admin save is CSRF-protected, persistent and audited', async () => {
  const admin = await showcaseLogin();
  const site = {eyebrow:'Асхан',title:'Приветствие',description:'Новый текст',overviewTitle:'История',overviewText:'Вводный текст',startDate:'2026-10-12',timeZone:'Europe/Moscow',cards:[{title:'Один',text:'Текст 1',image:'/assets/rune-texture.svg'},{title:'Два',text:'Текст 2',image:'/assets/stone-texture.svg'}]};
  assert.equal((await json('/api/site',{method:'PUT',headers:{Cookie:admin.cookie},body:JSON.stringify(site)})).r.status,403);
  const saved = await json('/api/site',{method:'PUT',headers:{Cookie:admin.cookie,'X-CSRF-Token':admin.csrf},body:JSON.stringify(site)});
  assert.equal(saved.r.status,200);
  assert.deepEqual(saved.data.site,site);
  assert.deepEqual((await json('/api/site')).data.site,site);
  const disk = JSON.parse(await fs.readFile(testDb,'utf8'));
  assert.deepEqual(disk.site,site);
  assert.equal(disk.audit[0].action,'site.update');
});
test('Showcase rejects unsafe images, invalid dates/time zones and excessive cards', async () => {
  const admin = await showcaseLogin();
  const site = (await json('/api/site')).data.site;
  for (const invalid of [null, {...site,startDate:'2026-02-30'}, {...site,timeZone:'Not/AZone'}, {...site,timeZone:null}, {...site,cards:[{image:'javascript:alert(1)'}]}, {...site,cards:[{image:'//evil.example/img.png'}]}, {...site,cards:Array(61).fill(site.cards[0])}, {...site,cards:[null]}]) {
    const {r} = await json('/api/site',{method:'PUT',headers:{Cookie:admin.cookie,'X-CSRF-Token':admin.csrf},body:JSON.stringify(invalid)});
    assert.equal(r.status,400);
  }
  assert.deepEqual((await json('/api/site')).data.site,site);
});
test('Player cannot change showcase with valid CSRF; magic CRUD works', async () => {
  const player = await json('/api/register',{method:'POST',body:JSON.stringify({nickname:'showcase_player',password:'showcase-password'})});
  assert.equal((await json('/api/site',{method:'PUT',headers:{Cookie:cookie(player.r),'X-CSRF-Token':player.data.csrf},body:'{}'})).r.status,403);
  const admin = await showcaseLogin();
  const headers = {Cookie:admin.cookie,'X-CSRF-Token':admin.csrf};
  const created = await json('/api/entities',{method:'POST',headers,body:JSON.stringify({type:'magic',name:'Пламя Асхана',fields:{school:'Огонь',cost:'3 маны',duration:'1 минута'}})});
  assert.equal(created.r.status,201);
  assert.equal(created.data.entity.type,'magic');
  const changed = await json('/api/entities/'+created.data.entity.id,{method:'PUT',headers,body:JSON.stringify({fields:{school:'Огонь',cost:'4 маны'}})});
  assert.equal(changed.data.entity.fields.cost,'4 маны');
  assert.equal((await json('/api/entities/'+created.data.entity.id,{method:'DELETE',headers})).r.status,200);
});
test('v2 database migration preserves character rank as title and backup', async () => {
  const port2=port+120, file=path.join(tempDir,'legacy.json');
  await fs.writeFile(file,JSON.stringify({schemaVersion:2,entities:[{id:'legacy',type:'characters',name:'Лорд',fields:{rank:'Барон',category:'Legacy',abilities:'Legacy ability'}}],users:[]}));
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port2),DB_FILE:file,SESSION_SECRET:'test-secret'},stdio:'ignore'});
  try {
    let data;
    for(let i=0;i<50;i++) { try { data=await (await fetch(`http://127.0.0.1:${port2}/api/site`)).json(); break; } catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.ok(data.site);
    const migrated=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(migrated.entities[0].fields.title,'Барон');
    assert.equal(migrated.entities[0].fields.rank,'Барон');
    assert.equal(migrated.schemaVersion,3);
    assert.equal(JSON.parse(await fs.readFile(file+'.pre-2.3-backup','utf8')).schemaVersion,2);
  } finally { child.kill(); }
});

test('GM and EDITOR cannot change global showcase',async()=>{
  const admin=await showcaseLogin(), headers={Cookie:admin.cookie,'X-CSRF-Token':admin.csrf};
  const player=await json('/api/login',{method:'POST',body:JSON.stringify({nickname:'showcase_player',password:'showcase-password'})});
  for(const role of ['GM','EDITOR']) {
    const changed=await json('/api/users/'+player.data.user.id,{method:'PUT',headers,body:JSON.stringify({role})});
    assert.equal(changed.r.status,200);
    assert.equal((await json('/api/site',{method:'PUT',headers:{Cookie:cookie(player.r),'X-CSRF-Token':player.data.csrf},body:'{}'})).r.status,403);
  }
});
test('Showcase and administrator session survive server restart',async()=>{
  const site=(await json('/api/site')).data.site;
  const admin=await showcaseLogin();
  const exited=new Promise(resolve=>proc.once('exit',resolve));
  proc.kill(); await exited;
  proc=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DB_FILE:testDb,SESSION_SECRET:'test-secret',ADMIN_PASSWORD:'change-me-now'},stdio:'ignore'});
  await wait();
  assert.deepEqual((await json('/api/site')).data.site,site);
  assert.equal((await json('/api/me',{headers:{Cookie:admin.cookie}})).data.user.role,'ADMIN');
});
