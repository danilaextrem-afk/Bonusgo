# Платежи BONUSGO

## Как это работает

1. Владелец компании на `/app/billing` выбирает тариф (PRO/TOP) и срок (1, 3 или 12 мес.) — форма уходит `POST /api/payments/checkout` (проверка origin, роль OWNER).
2. Сервер сам считает сумму из `PLAN_PRICES` по стране компании (3 мес. = 3x, 12 мес. = 10x), создаёт строку `payments` со статусом `PENDING` и перенаправляет (303) на страницу провайдера. Сумма из формы не принимается.
3. Провайдер присылает подписанное уведомление. Любое уведомление проходит один конвейер `processNotification` (одна транзакция):
   - дедупликация по `payment_events.event_key = провайдер:счёт:вид` (повтор -> `duplicated`, ничего не меняется);
   - блокировка платежа `FOR UPDATE`; сумма и валюта должны совпасть точно, иначе запись `error.payment_amount_mismatch` в аудит и **без активации**;
   - `PENDING -> PAID` (только из PENDING); тариф продлевается: тот же тариф и срок в будущем — прибавляется к дате окончания, иначе отсчёт от «сейчас»; обновляются `companies.plan/plan_expires_at` и `subscriptions`;
   - после коммита вызывается `confirmReferral` (ошибка не ломает платёж);
   - возврат `PAID -> REFUNDED` откатывает срок на оплаченный период (если не остаётся срока — тариф FREE); неуспех `PENDING -> FAILED`.
4. Страницы возврата (`success`/`fail`) только информационные: статус денег определяет подписанное уведомление.
5. `GET /api/payments/cron/expire` (заголовок `x-cron-secret`) переводит просроченные тарифы в FREE; идемпотентен. Запускать раз в час/сутки внешним cron.

| Страна | Провайдер | Маршрут уведомлений |
|---|---|---|
| RU | Robokassa | `POST /api/payments/robokassa/result` (ответ `OK{InvId}`) |
| BY | bePaid (WEBPAY — заглушка) | `POST /api/payments/bepaid/webhook` (Basic auth) |
| тест | mock | `GET /api/payments/mock/complete?invoice=N&sig=...` |

## Переменные окружения

`APP_URL`, `SESSION_SECRET`, `PAYMENTS_TEST_MODE` (`true` — тест), `CRON_SECRET`;
Robokassa: `ROBOKASSA_LOGIN`, `ROBOKASSA_PASSWORD1/2`, `ROBOKASSA_TEST_PASSWORD1/2`, `ROBOKASSA_SEND_RECEIPT` (`true` — передавать Receipt);
bePaid: `BEPAID_SHOP_ID`, `BEPAID_SECRET_KEY`, `BEPAID_LIVE_ENABLED` (`true` только после договора).
Секреты хранить только в секретах хостинга. `CRON_SECRET` добавить в `.env.example`.

## Тестовый режим и mock

- `PAYMENTS_TEST_MODE=true`: если реальный провайдер не настроен, используется mock; ссылка подписана HMAC от `SESSION_SECRET`, проходит тот же конвейер. Если Robokassa настроена — отправляется `IsTest=1` и используются тестовые пароли.
- mock запрещён при `NODE_ENV=production` и `PAYMENTS_TEST_MODE!=="true"`; без тестового режима и без живого провайдера оплата отвечает «пока не подключена».
- Админ-диагностика (`getPaymentDiagnostics`): провайдер/configured/live/testMode по странам, счётчики статусов, последние 20 событий, ошибки за 30 дней; секретов нет.

## Как владельцу подключить Robokassa (самозанятый)

1. Зарегистрироваться на robokassa.ru, создать магазин, тип — самозанятый/физлицо (договор-оферта онлайн). Нужны российский паспорт или иные документы и российский счёт для вывода — **для гражданина Беларуси с видом самозанятого в РФ условия уточнить у Robokassa** (в этой сборке не проверено).
2. В настройках магазина задать: Result URL `https://<APP_URL>/api/payments/robokassa/result` (метод POST), Success URL `.../robokassa/success`, Fail URL `.../robokassa/fail`, алгоритм подписи **MD5**.
3. Задать пароли #1 и #2 (и отдельные тестовые) -> секреты хостинга.
4. Пройти тестовый платёж (`PAYMENTS_TEST_MODE=true`), затем выключить тестовый режим.

### Робочеки СМЗ

Для самозанятых Robokassa может формировать чек НПД автоматически после включения услуги «Робочеки СМЗ» в личном кабинете (привязка к «Мой налог»). Тогда `ROBOKASSA_SEND_RECEIPT` оставить пустым. Параметр Receipt включать, только если провайдер этого потребует; чек уходит с НДС «без НДС», признак «услуга».

### Подпись (протокол)

- Запрос: `MD5(MerchantLogin:OutSum:InvId[:Receipt]:Password1[:Shp_k=v ...по алфавиту])`.
- Result: `MD5(OutSum:InvId:Password2[:Shp_k=v ...])`, сравнение без учёта регистра, ответ `OK{InvId}`.
- Источники: [документация Robokassa](https://docs.robokassa.ru/) (сайт был недоступен из среды сборки, сверить вручную) и независимая реализация [aiorobokassa](https://aiorobokassa.readthedocs.io/en/stable/_modules/aiorobokassa/utils/signature.html). Важно: aiorobokassa добавляет только значения Shp, а по документации Robokassa в строку входят пары `Shp_имя=значение` — реализовано по документации; **сверить с живым тестовым платежом**.

## Рекуррентные платежи

Сейчас — ручное продление за период (платёж создаётся владельцем). `cancelSubscription` ставит `cancelAtPeriodEnd` (отключает будущее автопродление, тариф действует до конца периода). Автосписание у Robokassa (родительский платёж + `Recurring=true`) — заглушка, не реализовано; требует отдельного подключения услуги.

## Беларусь: bePaid и WEBPAY

- bePaid: Checkout API `POST https://checkout.bepaid.by/ctp/api/checkouts`, Basic `shop_id:secret_key`, суммы в минимальных единицах; webhook проверяется заголовком Basic. Живой режим только при `BEPAID_LIVE_ENABLED=true` и заданных ключах; цены в BYN подтвердить владельцу.
- WEBPAY: заглушка (isConfigured = false), схема подписи описана в `webpay.ts`; поля уточнить у провайдера.
- Может ли нерезидент РБ / самозанятый РФ быть мерчантом: **не подтверждено, уточнить у провайдера**. В найденных материалах условия описаны для резидентов (юрлица и ИП РБ, договор и счёт в белорусском банке, ЕРИП): [myfin.by (2022)](https://myfin.by/article/banki/priem-online-platezej-na-sajte-cto-vazno-dla-biznesa), [Яндекс — работа с резидентами РБ](https://www.yandex.com/support/partner/en/payments/with-belarus-legal-entities) (про нерезидентов там ничего нет). Вероятный путь — регистрация ИП/ООО в РБ; это решение за владельцем и юристом.

## Блокеры

1. Нет договоров с Robokassa и bePaid/WEBPAY -> живые платежи выключены.
2. Допустимость самозанятого-нерезидента (гражданин РБ, НПД в РФ) у Robokassa и статус мерчанта в РБ — уточнить.
3. Сверка подписи Robokassa с официальной документацией на реальном тестовом платеже.
4. Подтвердить цены в BYN, добавить `CRON_SECRET` и расписание cron.
5. Автопродление (рекуррент) не реализовано.
