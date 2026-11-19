# Деплой QRonus в Yandex Cloud

Целевая конфигурация использует Yandex Serverless Containers, Container Registry, Managed Service for PostgreSQL и Lockbox. Next.js и Drizzle остаются на текущем стеке. Существующую ветку YDB в релиз не включали.

## Сборка и миграция

1. Подготовьте отдельную staging-базу PostgreSQL 16 в сети контейнера. Используйте тестовые данные. Для переноса существующих данных сначала сохраните резервную копию, проверьте восстановление отдельно и согласуйте перенос персональных данных. До переключения пользователей проверьте число записей, журнал миграций, действующие подписки и незавершённые платежи.
2. Соберите два образа из одного проверенного коммита. `APP_URL` указывает на HTTPS-origin будущего сайта, без пути и query. Он нужен при сборке публичных страниц и canonical URL. Когда реквизиты появятся, передавайте публичные переменные из `Dockerfile` и задавайте те же значения в окружении HTTP-ревизии. Секреты не являются аргументами сборки.

   ```bash
   export QRONUS_IMAGE=cr.yandex/<registry-id>/qronus
   export APP_URL=https://<staging-domain>
   QRONUS_SHA="$(git rev-parse HEAD)"
   yc container registry configure-docker
   docker build --platform linux/amd64 --target migration -t "$QRONUS_IMAGE:migrate-$QRONUS_SHA" .
   docker build --platform linux/amd64 --build-arg APP_URL --build-arg GIT_COMMIT="$QRONUS_SHA" -t "$QRONUS_IMAGE:$QRONUS_SHA" .
   docker push "$QRONUS_IMAGE:migrate-$QRONUS_SHA"
   docker push "$QRONUS_IMAGE:$QRONUS_SHA"
   ```

3. Запустите образ миграций один раз из доверенного runner или VM с доступом к сети базы. Предоставьте `DATABASE_URL` через защищённое окружение процесса и используйте `docker run --rm --env DATABASE_URL "$QRONUS_IMAGE:migrate-$QRONUS_SHA"`. Новые HTTP-реплики миграции не выполняют. Перед миграцией существующей базы проверьте дубли `provider_ref` для `provider = 'platega'` без печати идентификаторов в общие логи. Уникальный индекс остановит миграцию, если такие дубли есть.
4. Создайте HTTP-ревизию из образа `$QRONUS_IMAGE:$QRONUS_SHA` в сети PostgreSQL. Сервисная учётная запись получает доступ к чтению образа и конкретным секретам Lockbox. В `DATABASE_URL` используйте FQDN мастера из консоли Yandex и `sslmode=verify-full&sslrootcert=/etc/qronus/yandex-postgresql-ca.pem`. В образе установлен публичный CA Yandex. Используйте отдельный пароль для приложения и мигратора, если роли уже разделены. Используйте Lockbox для `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET` и рабочих ключей. Для staging оставьте `DEMO_MODE=true`, `PLATEGA_LIVE_ENABLED=false` и `PLATEGA_SELLER_PAYS_FEE=false`. `PORT` назначает HTTP-платформа. Контейнер слушает на `0.0.0.0`.
5. Для периодического истечения подписок запускайте `GET /api/payments/cron/expire` из планировщика, передавая `x-cron-secret` из хранилища секретов. Планировщик Render по-прежнему использует legacy `/api/health`. В Serverless Containers не рассчитывайте на фоновую работу после завершения HTTP-ответа.

## Приёмка и откат

- Проверьте `GET /api/version` и сравните 12 символов Git SHA. `GET /api/live` проверяет процесс. `GET /api/ready` проверяет соединение с PostgreSQL. У всех трёх ожидается HTTP 200.
- Пройдите регистрацию, вход, кабинет бизнеса и публичную бонусную карту на staging. Проверьте пароль через настроенную тестовую рассылку, QR-операции и тестовый checkout. Создайте тестовую запись, перезапустите ревизию и подтвердите, что данные сохранились.
- Подтвердите, что логи чисты от ключей и URI базы. Сверьте ограничения на размеры запросов и ответов Serverless Containers с PDF и экспортом CSV на репрезентативной выборке.
- До переключения домена сохраните известный рабочий образ и ревизию. Откат приложения выполняется переключением активной ревизии. Миграция 0006 добавляет nullable-поля и индексы. При откате приложения оставьте их в базе.
- Отдельно подтвердите [готовность Platega](platega.md). Пока продажа не согласована, сохраните платёжные флаги выключенными и не задавайте ключи других реальных способов оплаты на staging.

Документация: [контейнер и Managed PostgreSQL](https://yandex.cloud/en/docs/tutorials/container-infrastructure/container-pg-connect), [Lockbox](https://yandex.cloud/en/docs/lockbox/operations/serverless/containers), [сетевые и размерные ограничения](https://yandex.cloud/en/docs/serverless-containers/concepts/limits).
