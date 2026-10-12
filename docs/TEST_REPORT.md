# Отчёт проверки Ashan Arcanum 2.3.0

Дата: 12 октября 2026 года.

## Результат

- `npm run check`: синтаксис server.mjs, app.js, editor.js, site.js — успешно; **26/26 тестов Node.js пройдены**, без пропусков.
- `npm run test:ui`: **23/23 браузерных сценария пройдены**, **0 исключений JavaScript**.
- Окружение: Linux, Node.js 24.14.1, Chromium headless, Playwright. Тесты запускались на временных базах; пользовательская production-база не затрагивалась.
- Проверены desktop 1440×1000 и mobile 390×844. Горизонтального переполнения в проверенных формах/страницах нет.
- Просмотрены итоговые скриншоты витрины и мобильного редактора.

## Серверные проверки

Сохранены исходные 17 регрессионных тестов: доступ к публичным/скрытым/PRIVATE-записям, CRUD, версии, аудит, регистрация игровых листов, медиа, CSRF, роли, отзыв сессий, конкурентные записи, безопасный поиск и кириллические ссылки.

Добавлены проверки:

1. Пустые настройки витрины, публичное чтение и отказ гостю в записи.
2. Сохранение ADMIN, обязательный CSRF, запись на диск и аудит.
3. Отклонение javascript/protocol-relative URL, неверных дат/часовых поясов, более 60 карточек, некорректных объектов.
4. Отказ PLAYER в изменении витрины и CRUD раздела «Магия».
5. Миграция rank→title персонажа и резервная копия старой базы.
6. Отказ GM/EDITOR в изменении глобальной витрины.
7. Настройки и сессия администратора сохраняются после перезапуска.
8. Ежедневная смена карточек на границе московской полуночи и повтор цикла.
9. Пустой/одноэлементный набор, дата до старта, високосная дата, иной часовой пояс.

Смена дня проверялась передачей фиксированных дат в функцию ротации, а не ожиданием нескольких реальных суток.

## Браузерные сценарии

1. Guest: every requested section is present and reachable
2. Guest sheets are separate from the character catalog
3. Admin login immediately loads all entities without refresh
4. Admin returns from website and reload without re-login
5. Every requested section supports CMS creation and public detail
6. Units, characters and bestiary share combat fields; gold and XP persist
7. Items save AC, damage and Properties label
8. Document formatting, tables, safe paste and save/reopen
9. Unknown legacy fields survive edits; unsaved navigation is warned
10. Changing record type keeps unsaved text and common fields
11. Ashan navigation: renamed sections, no maps/story/search in sidebar
12. Combat schema, damage and readable abbreviated ability scores
13. Items: cost, armor and damage above description
14. Factions: goal becomes status and relationship tab works
15. Pasted text blends with page; no white document background
16. Showcase CMS: upload, reorder, daily card, save/reload and delete
17. Character sheets are independent and migrated sheet retains its ID
18. Image upload embeds the real file and survives reopening
19. Missing editor record is handled without a client crash
20. Mobile menu and editor fit 390 px viewport
21. Cyrillic entity URLs work after creation and browser reload
22. Logout immediately clears private client data and blocks CMS
23. Player registration creates only an owned sheet, not an encyclopedia duplicate

## Обнаруженные и исправленные проблемы

- Перестановка карточки вверх/вниз не меняла DOM-порядок: исправлена, подтверждена загрузкой двух карточек, перестановкой, сохранением и повторным открытием.
- Вход/выход использовали отдельный путь загрузки данных, возвращавший удалённые разделы в клиентское состояние: применена одинаковая фильтрация всех путей загрузки.
- Верхние характеристики и формы наследовали капительный стиль: русские подписи и буквенные характеристики теперь имеют обычный регистр.
- Вставленные белые подложки и стандартный чёрный текст из документов: нормализуются при санитарной обработке, цветные акценты остаются доступны.

В тестах были обновлены ожидания переименованных подписей и точные селекторы форм. Расширенные браузерные серии разделены перезапуском сервера, чтобы не превышать боевые лимиты автоматическими запросами; защита runtime не отключалась.

## Файлы доказательств

- `test-results/api-results.txt` — финальный лог синтаксиса и Node.js-тестов.
- `test-results/ui-log.txt`, `ui-results.json` — финальные сценарии и результат.
- `showcase-desktop.png` — редактируемая главная карточка (для технического теста загружено одноцветное PNG).
- `ashan-mobile.png`, `editor-desktop.png`, `editor-mobile.png` — формы/редактор в итоговой версии.

## Ограничения проверки

Не проверялось развёртывание на пользовательском сервере, Docker/HTTPS/reverse proxy, реальная производственная база и внешние URL изображений. PostgreSQL-схема не подключена к работающему JSON-приложению. Обновление открытой вкладки проверяет календарный день каждые 30 секунд; браузер может задерживать таймеры неактивных вкладок. Для production следуйте README и PRODUCTION.md.
