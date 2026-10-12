import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aetheria-ui-"));
const db = path.join(temp, "db.json"),
  port = 3456,
  base = `http://127.0.0.1:${port}`;
let server, browser, page;
const results = [],
  errors = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
};
async function ready() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/me")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("server timeout");
}
async function restartServer() {
  // Split test batches at a real restart rather than disabling production rate limits.
  const exited = once(server, "exit"); server.kill(); await exited;
  server = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, DB_FILE: db, PORT: String(port), SESSION_SECRET: "ui-test-secret" }, stdio:"ignore" });
  await ready();
}
async function goto(route) {
  await page.goto(base + route);
  await page.waitForFunction(
    () => document.querySelector("#view")?.children.length > 0,
  );
}
async function create(type, name, fields = {}) {
  await goto(`/admin/entities/${type}/new`);
  await page.locator("[name=name]").fill(name);
  for (const [key, value] of Object.entries(fields))
    await page.locator(`[name=field_${key}]`).fill(String(value));
  await page.locator("#richEditor").fill("Тестовое описание " + name);
  await page.locator(".editor-actions button").click();
  await page.waitForURL(`**/admin/entities/${type}`);
  const all = await page.evaluate(
    async () => (await (await fetch("/api/entities")).json()).entities,
  );
  return all.find((e) => e.name === name);
}
try {
  const seed = spawn(process.execPath, ["seed.mjs"], {
    env: { ...process.env, DB_FILE: db },
    stdio: "ignore",
  });
  assert.equal((await once(seed, "exit"))[0], 0);
  server = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      DB_FILE: db,
      PORT: String(port),
      SESSION_SECRET: "ui-test-secret",
    },
    stdio: "ignore",
  });
  await ready();
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      execFileSync("which", ["chromium"], { encoding: "utf8" }).trim(),
    args: ["--no-sandbox"],
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await check(
    "Guest: every requested section is present and reachable",
    async () => {
      await goto("/");
      for (const [type, title] of [
        ["articles", "Лор"],
        ["races", "Народы"],
        ["religions", "Религии"],
        ["events", "События"],
        ["magic", "Магия"],
        ["units", "Юниты"],
        ["quests", "Квесты"],
        ["sessions", "Сессии"],
      ]) {
        const link = page.locator(`#mainNav a[href="/encyclopedia/${type}"]`);
        assert.equal(await link.count(), 1);
        await link.click();
        assert.equal(await page.locator("#view h1").innerText(), title);
      }
      assert.equal(await page.locator('#mainNav a[href="/admin"]').count(), 0);
    },
  );
  await check(
    "Guest sheets are separate from the character catalog",
    async () => {
      await goto("/characters");
      assert.match(await page.locator("#view").innerText(), /Войдите/);
      await goto("/encyclopedia/characters");
      assert.match(await page.locator("#view").innerText(), /Илия Вен/);
    },
  );
  await check(
    "Admin login immediately loads all entities without refresh",
    async () => {
      await goto("/enter");
      await page.locator("[name=nickname]").fill("admin@example.com");
      await page.locator("[name=password]").fill("change-me-now");
      await page.locator("#loginForm button").click();
      await page.waitForURL("**/admin");
      assert.match(await page.locator("#view").innerText(), /Мастерская мира/);
      const rows = await page.evaluate(
        async () => (await (await fetch("/api/entities")).json()).entities,
      );
      assert.equal(rows.length, 19);
      await page.locator('#mainNav a[href="/encyclopedia/factions"]').click();
      assert.match(await page.locator("#view").innerText(), /Чёрный Хор/);
    },
  );
  await check(
    "Admin returns from website and reload without re-login",
    async () => {
      await goto("/");
      await page.locator("#authButton").click();
      await page.waitForURL("**/admin");
      await goto("/");
      await page.reload();
      await page.waitForSelector('#mainNav a[href="/admin"]');
      await page.locator('#mainNav a[href="/admin"]').click();
      assert.match(await page.locator("#view").innerText(), /Мастерская мира/);
    },
  );
  await check(
    "Every requested section supports CMS creation and public detail",
    async () => {
      for (const type of [
        "articles",
        "races",
        "religions",
        "events",
        "magic",
        "quests",
        "sessions",
      ]) {
        const e = await create(type, "UI " + type);
        assert.ok(e);
        await goto(`/entity/${type}/${e.slug}`);
        assert.match(
          await page.locator("#view").innerText(),
          new RegExp("UI " + type),
        );
      }
    },
  );
  await check(
    "Units, characters and bestiary share combat fields; gold and XP persist",
    async () => {
      for (const type of ["units", "characters", "creatures"]) {
        await goto(`/admin/entities/${type}/new`);
        for (const key of [
          "maxHp",
          "inventory",
          "skills",
          "spells",
          "gold",
          "experience",
          "stats_STR",
        ])
          assert.equal(
            await page.locator(`[name=field_${key}]`).count(),
            1,
            `${type} ${key}`,
          );
        const e = await create(type, "Combat " + type, {
          gold: 23,
          experience: 500,
          hp: 27,
          maxHp: 30,
          ac: 16,
        });
        await goto(`/entity/${type}/${e.slug}`);
        assert.match(
          await page.locator(".stat-ribbon").innerText(),
          /Опыт\s*500/i,
        );
        assert.match(
          await page.locator(".stat-ribbon").innerText(),
          /Золото\s*23/i,
        );
        await goto(`/admin/entities/${type}/${e.id}`);
        assert.equal(
          await page.locator("[name=field_experience]").inputValue(),
          "500",
        );
      }
    },
  );
  await check("Items save AC, damage and Properties label", async () => {
    const e = await create("items", "Armor test", {
      ac: 18,
      damage: "1d8+2",
      ability: "Магическое",
    });
    await goto(`/entity/items/${e.slug}`);
    const text = await page.locator("#view").innerText();
    assert.match(text, /КД\s*18/);
    assert.match(text, /Урон\s*1d8\+2/i);
    assert.match(text, /Свойства\s*Магическое/);
  });
  await check(
    "Document formatting, tables, safe paste and save/reopen",
    async () => {
      await goto("/admin/entities/articles/new");
      await page.locator("[name=name]").fill("Formatted document");
      await page.locator("#richEditor").fill("Форматированный текст");
      await page.evaluate(() => {
        const rich = document.querySelector("#richEditor");
        rich.focus();
        const range = document.createRange();
        range.selectNodeContents(rich);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        rich.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
      await page.locator("[data-cmd=bold]").click();
      await page.locator("[data-cmd=underline]").click();
      await page.locator("[data-command=fontName]").selectOption("Georgia");
      await page.locator("[data-cmd=justifyCenter]").click();
      await page.evaluate(() => {
        const rich = document.querySelector("#richEditor");
        rich.focus();
        const sel = getSelection();
        sel.collapseToEnd();
        rich.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
      page.once("dialog", (dialog) => dialog.accept("2x2"));
      await page.locator("#insertTable").click();
      assert.equal(await page.locator("#richEditor td").count(), 4);
      await page.evaluate(() => {
        const rich = document.querySelector("#richEditor");
        rich.focus();
        const range = document.createRange();
        range.selectNodeContents(rich);
        range.collapse(false);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        rich.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        const data = new DataTransfer();
        data.setData(
          "text/html",
          '<p><u>Safe pasted</u><img src="x" onerror="window.__xss=1"><script>window.__xss=1</script><a href="javascript:alert(1)">bad link</a></p>',
        );
        rich.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await page.locator(".editor-actions button").click();
      await page.waitForURL("**/admin/entities/articles");
      const e = await page.evaluate(async () =>
        (await (await fetch("/api/entities")).json()).entities.find(
          (e) => e.name === "Formatted document",
        ),
      );
      assert.match(e.content, /<(b|strong)>/);
      assert.match(e.content, /<u>/);
      assert.match(e.content, /Georgia/);
      assert.match(e.content, /text-align:center/);
      assert.match(e.content, /<table>/);
      assert.doesNotMatch(e.content, /onerror|<script|javascript:/);
      await goto(`/admin/entities/articles/${e.id}`);
      assert.equal(await page.locator("#richEditor td").count(), 4);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      await fs.mkdir("test-results", { recursive: true });
      await page.screenshot({
        path: "test-results/editor-desktop.png",
        fullPage: true,
      });
    },
  );
  await check(
    "Unknown legacy fields survive edits; unsaved navigation is warned",
    async () => {
      const id = await page.evaluate(async () => {
        const me = await (await fetch("/api/me")).json();
        const r = await fetch("/api/entities", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": me.csrf,
          },
          body: JSON.stringify({
            type: "units",
            name: "Legacy test",
            fields: { customLegacy: "Keep me", gold: 10 },
          }),
        });
        return (await r.json()).entity.id;
      });
      await goto("/admin/entities/units/" + id);
      await page.locator("[name=name]").fill("Legacy changed");
      page.once("dialog", (d) => d.dismiss());
      await page.locator('#mainNav a[href="/"]').click();
      assert.match(page.url(), /\/admin\/entities/);
      await page.locator(".editor-actions button").click();
      await page.waitForURL("**/admin/entities/units");
      const e = await page.evaluate(
        async (id) =>
          (await (await fetch("/api/entities/" + id)).json()).entity,
        id,
      );
      assert.equal(e.fields.customLegacy, "Keep me");
    },
  );
  await check("Changing record type keeps unsaved text and common fields", async () => {
    await goto("/admin/entities/units/new");
    await page.locator("[name=name]").fill("Type conversion");
    await page.locator("[name=field_gold]").fill("40");
    await page.locator("#richEditor").fill("Описание не теряется");
    await page.locator("#editorType").selectOption("magic");
    await page.locator("[name=field_school]").fill("Огонь");
    await page.locator("#editorType").selectOption("characters");
    assert.equal(await page.locator("[name=field_gold]").inputValue(), "40");
    await page.locator("#editorType").selectOption("magic");
    assert.equal(await page.locator("[name=field_school]").inputValue(), "Огонь");
    await page.locator("#editorType").selectOption("units");
    assert.equal(await page.locator("#richEditor").innerText(), "Описание не теряется");
    await page.locator(".editor-actions button").click();
    await page.waitForURL("**/admin/entities/units");
  });
  await restartServer();
  await check("Ashan navigation: renamed sections, no maps/story/search in sidebar", async () => {
    await goto("/");
    assert.equal(await page.locator('.brand-name').innerText(), 'Ashan Arcanum');
    assert.equal(await page.locator('#mainNav a[href="/"]').innerText(), 'Витрина');
    assert.equal(await page.locator('#mainNav a[href="/world"]').innerText(), 'Каталог');
    assert.match(await page.locator('#mainNav a[href="/network"]').innerText(), /Паутина Асхи/);
    for (const route of ['/map','/search','/encyclopedia/maps','/encyclopedia/stories']) assert.equal(await page.locator(`#mainNav a[href="${route}"]`).count(),0);
    assert.equal(await page.locator('.hero-copy h1, .hero-copy p').count(),0);
    await goto('/world');
    assert.doesNotMatch(await page.locator('#view').innerText(), /Ветки сюжета|Карты/);
    await goto('/admin/entities/maps');
    assert.match(await page.locator('#view').innerText(), /Этот слой закрыт/);
  });
  await check("Combat schema, damage and readable abbreviated ability scores", async () => {
    for (const type of ['characters','units','creatures']) {
      await goto(`/admin/entities/${type}/new`);
      for (const key of ['category','rank','abilities']) assert.equal(await page.locator(`[name=field_${key}]`).count(),0);
      assert.equal(await page.locator('[name=field_title]').count(), type === 'characters' ? 1 : 0);
      for (const label of ['Сила','Ловкость','Телосложение','Интеллект','Мудрость','Харизма']) assert.ok((await page.locator('.stats-editor').innerText()).includes(label));
      const entity = await create(type, 'Damage '+type, {damage:'2d6 + 4', gold:15, experience:300, stats_STR:18});
      await goto(`/entity/${type}/${entity.slug}`);
      assert.match(await page.locator('.stat-ribbon').textContent(), /Урон[\s\S]*2d6 \+ 4/);
      assert.equal((await page.locator('.ability-scores span').allTextContents()).join(''), 'СЛТИМХ');
      assert.match(await page.locator('.ability-scores').innerText(), /18/);
      assert.doesNotMatch(await page.locator('.detail-aside').innerText(), /Золото|Опыт|Урон|STR/);
    }
  });
  await check("Items: cost, armor and damage above description", async () => {
    const entity = await create('items','Предмет со стоимостью',{cost:'120 золотых',ac:17,damage:'1d8',rarity:'Редкий',weight:'2 кг'});
    await goto(`/entity/items/${entity.slug}`);
    assert.match(await page.locator('.stat-ribbon').textContent(), /120 золотых/);
    assert.match(await page.locator('.stat-ribbon').textContent(), /1d8/);
    assert.doesNotMatch(await page.locator('.detail-aside').innerText(), /Урон|Стоимость|КД/);
  });
  await check("Factions: goal becomes status and relationship tab works", async () => {
    const entity = await create('factions','Отношения фракции',{goal:'Активна',relationships:'Союз с орденом'});
    await goto(`/entity/factions/${entity.slug}`);
    assert.match(await page.locator('.detail-aside').innerText(), /Статус[\s\S]*Активна/);
    await page.locator('#relationshipsTab').click();
    assert.equal(await page.locator('#factionRelationships').innerText(),'Союз с орденом');
    assert.equal(await page.locator('#factionDescription').isVisible(), false);
    await page.locator('#descriptionTab').click();
    assert.equal(await page.locator('#factionDescription').isVisible(), true);
  });
  await check("Pasted text blends with page; no white document background", async () => {
    const entity = await create('articles','Контраст текста');
    await page.evaluate(async id => {
      const me = await (await fetch('/api/me')).json();
      await fetch('/api/entities/'+id,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify({content:'<p style="background-color: white; color: black">Текст без белой подложки</p>'})});
    },entity.id);
    await goto(`/entity/articles/${entity.slug}`);
    const style = await page.locator('.prose p').evaluate(e => ({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,parent:getComputedStyle(e.parentElement).color}));
    assert.equal(style.background,'rgba(0, 0, 0, 0)'); assert.equal(style.color,style.parent);
  });
  await check("Showcase CMS: upload, reorder, daily card, save/reload and delete", async () => {
    await goto('/admin');
    await page.locator('a[href="/admin/site"]').click();
    await page.locator('[name=title]').fill('Асхан приветствует');
    await page.locator('#siteForm [name=description]').fill('Изменённое приветствие');
    await page.locator('[name=overviewTitle]').fill('О мире');
    await page.locator('[name=overviewText]').fill('Новый текст витрины');
    await page.locator('[name=startDate]').fill(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow'}).format(new Date()));
    for (const title of ['Первый витраж','Второй витраж']) {
      await page.locator('#addSiteCard').click();
      const card = page.locator('.site-card').last();
      await card.locator('[data-card=title]').fill(title);
      await card.locator('[data-card=text]').fill('Текст '+title);
      await card.locator('.card-upload').setInputFiles({name:'stained.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYo0AAAAASUVORK5CYII=','base64')});
      await page.waitForFunction(() => [...document.querySelectorAll('[data-card=image]')].every(input => input.value.startsWith('/uploads/')));
    }
    await page.locator('.site-card').last().locator('[data-card-action=up]').click();
    assert.equal(await page.locator('.site-card').first().locator('[data-card=title]').inputValue(),'Второй витраж');
    await page.locator('#siteForm .editor-actions button').click();
    await page.waitForFunction(() => document.getElementById('siteStatus')?.textContent === 'Витрина сохранена');
    await goto('/');
    assert.equal(await page.locator('.hero-copy h1').innerText(),'Второй витраж');
    assert.match(await page.locator('#view').innerText(),/Новый текст витрины/);
    assert.equal(await page.locator('.daily-hero-image').evaluate(img => img.complete && img.naturalWidth > 0),true);
    await page.screenshot({path:'test-results/showcase-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    for (const route of ['/', '/admin/site','/admin/entities/creatures/new']) {
      await goto(route);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),true, 'No overflow '+route);
    }
    await page.screenshot({path:'test-results/ashan-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await goto('/admin/site');
    await page.reload(); await page.waitForSelector('.site-card');
    assert.equal(await page.locator('.site-card').count(),2);
    await page.locator('.site-card [data-card-action=delete]').first().click();
    await page.locator('.site-card [data-card-action=delete]').first().click();
    await page.locator('#siteForm .editor-actions button').click();
    await page.waitForFunction(() => document.getElementById('siteStatus')?.textContent === 'Витрина сохранена');
    await goto('/');
    assert.equal(await page.locator('.hero-copy h1').innerText(),'Асхан приветствует');
  });
  await check(
    "Character sheets are independent and migrated sheet retains its ID",
    async () => {
      await goto("/characters");
      const text = await page.locator("#view").innerText();
      assert.match(text, /Лира Звездопад/);
      assert.doesNotMatch(text, /Илия Вен/);
      await goto("/encyclopedia/characters");
      assert.doesNotMatch(
        await page.locator("#view").innerText(),
        /Лира Звездопад/,
      );
    },
  );
  await check(
    "Image upload embeds the real file and survives reopening",
    async () => {
      await goto("/admin/entities/articles/new");
      await page.locator("[name=name]").fill("Image upload");
      const buffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      );
      await page
        .locator("#richImageUpload")
        .setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer });
      await page.waitForSelector("#richEditor img");
      await page
        .locator("#entityImageUpload")
        .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer });
      await page.waitForFunction(() =>
        document.querySelector("#entityImageUrl").value.startsWith("/uploads/"),
      );
      await page.locator(".editor-actions button").click();
      await page.waitForURL("**/admin/entities/articles");
      const e = await page.evaluate(async () =>
        (await (await fetch("/api/entities")).json()).entities.find(
          (e) => e.name === "Image upload",
        ),
      );
      await goto("/entity/articles/" + e.slug);
      const image = page.locator(".prose img");
      assert.equal(await image.count(), 1);
      await image.evaluate((img) => img.decode());
    },
  );
  await check(
    "Missing editor record is handled without a client crash",
    async () => {
      await goto("/admin/entities/articles/no-such-id");
      assert.match(
        await page.locator("#view").innerText(),
        /Запись не найдена/,
      );
    },
  );
  await check("Mobile menu and editor fit 390 px viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goto("/admin/entities/units/new");
    await page.locator("#mobileMenu").click();
    await page.locator('#mainNav a[href="/encyclopedia/units"]').click();
    assert.match(await page.locator("#view h1").innerText(), /Юниты/);
    await goto("/admin/entities/units/new");
    const dims = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    assert.ok(dims.scroll <= dims.width + 1, JSON.stringify(dims));
    await page.screenshot({
      path: "test-results/editor-mobile.png",
      fullPage: true,
    });
  });
  await restartServer();
  await check(
    "Cyrillic entity URLs work after creation and browser reload",
    async () => {
      const e = await create("articles", "Русский лор страницы");
      await goto("/entity/articles/" + encodeURIComponent(e.slug));
      assert.equal(
        await page.locator("#view h1").innerText(),
        "Русский лор страницы",
      );
      await page.reload();
      await page.waitForSelector("#view h1");
      assert.equal(
        await page.locator("#view h1").innerText(),
        "Русский лор страницы",
      );
    },
  );
  await check(
    "Logout immediately clears private client data and blocks CMS",
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await goto("/");
      await page.locator("#logoutBtn").click();
      await page.waitForFunction(
        () => document.querySelector("#authButton")?.textContent === "Войти",
      );
      await goto("/encyclopedia/factions");
      assert.doesNotMatch(
        await page.locator("#view").innerText(),
        /Чёрный Хор/,
      );
      await goto("/admin");
      assert.match(await page.locator("#view").innerText(), /Этот слой закрыт/);
    },
  );
  await check(
    "Player registration creates only an owned sheet, not an encyclopedia duplicate",
    async () => {
      await goto("/login");
      await page.locator("[data-auth-tab=register]").click();
      await page.locator("[name=nickname]").fill("browser_player");
      await page.locator("[name=password]").fill("browser-password");
      await page.locator("[name=characterName]").fill("Игровой герой");
      await page.locator("#loginForm button").click();
      await page.waitForURL("**/characters");
      assert.match(await page.locator("#view").innerText(), /Игровой герой/);
      await goto("/encyclopedia/characters");
      assert.doesNotMatch(
        await page.locator("#view").innerText(),
        /Игровой герой/,
      );
    },
  );
  assert.deepEqual(errors, [], "No browser exceptions");
  console.log(
    `UI tests: ${results.length} passed; browser exceptions: ${errors.length}`,
  );
  await fs.writeFile(
    "test-results/ui-results.json",
    JSON.stringify({ passed: results.length, cases: results, errors }, null, 2),
  );
} finally {
  await browser?.close();
  if (server) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  await fs.rm(temp, { recursive: true, force: true });
}
