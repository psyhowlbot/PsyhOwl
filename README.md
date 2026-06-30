# Совёнок Premium — Telegram Mini App + OpenAI Realtime

Готовый MVP проекта: Telegram-бот открывает Mini App, пользователь нажимает **«Поговорить с Совёнком»**, браузер просит микрофон, затем запускается голосовая WebRTC-сессия через OpenAI Realtime.

Тариф заложен в коде:

- **Совёнок Premium**
- **12 990 ₽/мес**
- **до 60 минут в день**
- **до 1800 минут в месяц**
- пробный лимит по умолчанию: 10 минут

## Что уже есть

1. Telegram-бот с кнопкой Mini App.
2. Mini App с анимированным Совёнком.
3. Подключение к OpenAI Realtime через WebRTC.
4. Серверный прокси `/api/realtime/session`, чтобы OpenAI API key не попадал в браузер.
5. Проверка Telegram Mini App initData.
6. Лимиты: день / месяц / пробный доступ.
7. Ручная выдача Premium через админ-команды.
8. Автоматические администраторы: выбранные Telegram ID / username получают доступ без оплаты и без дневного лимита.
9. Системный промпт Совёнка с безопасным позиционированием: AI-помощник поддержки, не врач.

## Важно про токены

Токен Telegram-бота, который был отправлен в чат, лучше **сразу перевыпустить** через `@BotFather`, потому что он уже был раскрыт в переписке.

Никогда не вставляйте реальные токены в GitHub и не отправляйте их в чат. Вставляйте их только в файл `.env` на сервере.

## Где взять OpenAI API key

1. Зарегистрируйтесь / войдите в OpenAI Platform: `https://platform.openai.com/`
2. Откройте раздел API keys: `https://platform.openai.com/api-keys`
3. Создайте новый secret key.
4. Пополните баланс / подключите billing, иначе Realtime API может не заработать.
5. Вставьте ключ в `.env` в поле `OPENAI_API_KEY`.

## Быстрый запуск локально

Нужен Node.js 20+.

```bash
cd sovenok-ai-bot
cp .env.example .env
npm install
npm start
```

Откройте:

```text
http://localhost:3000
```

Для локальной проверки без Telegram можно временно поставить в `.env`:

```env
REQUIRE_TELEGRAM_AUTH=false
PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

Для настоящего запуска в Telegram верните:

```env
REQUIRE_TELEGRAM_AUTH=true
NODE_ENV=production
PUBLIC_APP_URL=https://ваш-домен.ru
```

## Настройка `.env`

Пример:

```env
TELEGRAM_BOT_TOKEN=сюда_новый_токен_бота
ADMIN_TELEGRAM_IDS=123456789
AUTO_ADMIN_TELEGRAM_IDS=8707664475
AUTO_ADMIN_TELEGRAM_USERNAMES=bo0odyaa,twystedgeniusbaby
PUBLIC_APP_URL=https://sovenok.example.com

OPENAI_API_KEY=PASTE_OPENAI_API_KEY_HERE
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_VOICE=marin
OPENAI_REASONING_EFFORT=low

PRODUCT_NAME=Совёнок Premium
PRICE_RUB=12990
DAILY_LIMIT_SECONDS=3600
MONTHLY_LIMIT_SECONDS=108000
TRIAL_SECONDS=600

PORT=3000
NODE_ENV=production
REQUIRE_TELEGRAM_AUTH=true
TRUST_PROXY=1
```

### Как узнать свой Telegram ID

Запустите бота и отправьте команду:

```text
/id
```

Потом вставьте этот ID в `ADMIN_TELEGRAM_IDS`.


## Автоматические администраторы

В проект добавлен отдельный админ-доступ. Администратор может разговаривать с Совёнком без оплаты и без дневного лимита. При первом `/start` бот автоматически проверяет Telegram ID и username пользователя.

По умолчанию в код уже добавлены:

- `@bo0odyaa`, Telegram ID: `8707664475`;
- `@twystedgeniusbaby`, пока по username. Когда будет известен Telegram ID, добавьте его в `AUTO_ADMIN_TELEGRAM_IDS` через запятую.

При первом входе администратор получает отдельное тёплое приветствие от Совёнка.

Переменные окружения:

```env
AUTO_ADMIN_TELEGRAM_IDS=8707664475
AUTO_ADMIN_TELEGRAM_USERNAMES=bo0odyaa,twystedgeniusbaby
```

ID надёжнее username: username в Telegram можно изменить, поэтому после получения ID второго администратора лучше добавить его в `AUTO_ADMIN_TELEGRAM_IDS`.

## Команды бота

```text
/start
```

Показывает кнопку «Поговорить с Совёнком».

```text
/status
```

Показывает текущий тариф и остаток минут.

```text
/id
```

Показывает Telegram ID пользователя.

Админ-команды:

```text
/grant TELEGRAM_ID DAYS
```

Например:

```text
/grant 123456789 30
```

Выдаёт Premium на 30 дней.

```text
/revoke TELEGRAM_ID
```

Отключает Premium.

```text
/users
```

Показывает последних пользователей.

## Как поставить на хостинг

### Вариант 1: VPS

```bash
apt update
apt install -y nodejs npm nginx certbot python3-certbot-nginx
git clone <ваш-репозиторий> sovenok-ai-bot
cd sovenok-ai-bot
cp .env.example .env
nano .env
npm install
npm start
```

Для постоянной работы лучше поставить PM2:

```bash
npm install -g pm2
pm2 start src/server.js --name sovenok-ai-bot
pm2 save
pm2 startup
```

### Вариант 2: Render / Railway / Fly.io

1. Загрузите проект в GitHub.
2. Создайте Web Service.
3. Build command: `npm install`
4. Start command: `npm start`
5. В переменные окружения добавьте все значения из `.env`.
6. В `PUBLIC_APP_URL` укажите HTTPS-домен сервиса.

## Настройка Telegram Mini App

1. Откройте `@BotFather`.
2. Выберите бота.
3. Bot Settings → Menu Button.
4. Укажите URL вашего Mini App: `https://ваш-домен.ru`
5. При необходимости настройте Main Mini App, описание, фото и видео в профиле бота.

Сервер также сам вызывает `setChatMenuButton`, если `PUBLIC_APP_URL` задан корректно.

## Как работает голос

1. Mini App создаёт WebRTC offer.
2. Отправляет SDP на backend: `/api/realtime/session`.
3. Backend добавляет конфиг Совёнка и отправляет запрос в OpenAI `/v1/realtime/calls`.
4. OpenAI возвращает SDP answer.
5. Браузер устанавливает WebRTC-соединение и пользователь говорит с Совёнком голосом.

OpenAI API key находится только на сервере. В браузер он не передаётся.

## Что надо доработать перед коммерческим запуском

1. Подключить оплату: ЮKassa / CloudPayments / Telegram Stars / другой эквайринг.
2. Заменить JSON-хранилище на PostgreSQL.
3. Добавить страницу оферты, политики конфиденциальности и согласия на обработку данных.
4. Добавить аналитику: регистрации, конверсия в оплату, средние минуты, себестоимость.
5. Добавить журнал ошибок и мониторинг.
6. Проверить юридическое позиционирование: не «лечим», не «ставим диагнозы», не заменяем врача.

## Структура проекта

```text
sovenok-ai-bot/
  src/
    server.js            # Express + Telegram bot + OpenAI Realtime proxy
    config.js            # переменные окружения
    db.js                # простое JSON-хранилище пользователей и лимитов
    telegramAuth.js      # проверка Telegram Mini App initData
    sovenokPrompt.js     # системный промпт персонажа
  public/
    index.html           # Mini App
    styles.css           # дизайн и анимация
    app.js               # WebRTC-клиент
    assets/sovenok.png   # изображение персонажа
  data/                  # db.json создаётся автоматически
  .env.example
  package.json
  Dockerfile
```
