# iroom market

Node.js 24 + Express + Turso. Includes the storefront, Telegram Mini App support, admin panel, and Digital Goods categories.

## Render
- Build command: `npm install`
- Start command: `npm start`
- Required environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BOT_TOKEN`, `MINIAPP_URL`.

## Digital Goods
Categories are created on startup if missing: PlayStation / PS Plus, Подписки, Другое, Apple / iTunes, Telegram Stars. Products can be configured for manual or automatic fulfillment in the admin panel.

## Product images
No sample product images are included in this ZIP to make GitHub upload easier. Add images later from the admin panel. Uploaded product images are stored in the database as data URLs, so they do not depend on Render's temporary local filesystem.

## Upload to GitHub from iPhone
Extract the ZIP in Files, open the repository on GitHub, choose Add file → Upload files, select the contents of `iroom-market-project`, then commit. Deploy latest commit in Render.

Important: configure environment variables in Render and test the live database and Telegram bot before taking real orders.

## Управление категориями (обновление)

В админ-панели категории поддерживают название, описание, изображение, родительскую категорию (подкатегории) и порядок отображения. Изображение можно выбрать через файловый выбор iPhone (галерея, если браузер её предлагает) до 8 МБ; оно хранится как data URL в базе и сохраняется после перезапуска Render. Удаление категории требует подтверждения. Перед массовым использованием проверьте удаление на тестовой категории.

После загрузки обновлённых файлов в GitHub Render должен развернуть проект на Node.js 24 с командами `npm install` и `npm start`. Не удаляйте базу Turso.


## Обновление интерфейса (октябрь 2026)

- При входе открывается экран выбора «Магазин техники» или «Цифровой магазин».
- В боковом меню доступны оба магазина для переключения.
- Для цифрового магазина есть анимированный экран загрузки и розовые акценты.
- Каталоги фильтруются по категориям: цифровые категории включают PlayStation / PS Plus, Подписки, Другое, Apple / iTunes, Telegram Stars, Steam и OpenAI.
- Корзины хранятся отдельно в localStorage (`iroom_cart_tech`, `iroom_cart_digital`).
- Заказы имеют поле `store_type`; пользовательский список заказов запрашивает только заказы выбранного магазина. Существующие заказы мигрируют в `tech`, чтобы старые данные не пропали.
- Админ-панель поддерживает CRUD категорий/подкатегорий, описание, загрузку картинки из галереи iPhone (до 8 МБ), сортировку и подтверждение удаления.

## Проверки

Проверены синтаксис `server.js`, `public/app.js` и `public/admin.js` командой `node --check`. Для полноценного smoke-теста запуска необходимы реальные переменные окружения Turso и Telegram; они не включены в ZIP. После деплоя проверь запуск сервера, вход в оба магазина, раздельные корзины/списки заказов и сохранение категории в админке.
