# Сервер, доступ и выпуск — 23 октября 2026

## Действующий сервер: только чтение

Проверен проект ARBAT FINANCE, PostgreSQL 17.11. Снимок finance revision157 и warehouse revision40 использован только в scratch-копии, без записи финансовых документов.

- Все 9 публичных таблиц имеют RLS.
- У anon/authenticated нет INSERT/UPDATE/DELETE/TRUNCATE для finance_state/warehouse_state.
- У anon нет EXECUTE для update_shared_state, my_payroll, admin_set_staff, admin_people_list, admin_staff_list, set_finance_period_status.
- Включены оба триггера закрытия периодов и триггер неизменяемости журнала.
- Прочитаны актуальные определения RPC: проверки активной сессии, роли, ревизии присутствуют. Это не равно выполнению каждого RPC с реальными токенами всех ролей.

## Supabase Advisors

Предупреждения рассмотрены, а не устранены формально:

- SECURITY DEFINER для 8 публичных RPC намеренный: полномочия проверяются внутри. Простое снятие EXECUTE сломало бы разрешённые функции.
- auth_request_limits с RLS без политик намеренно закрыта от обычного клиента.
- [Проверка скомпрометированных паролей](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) выключена; переключение настройки Auth недоступно через подключённый инструмент. Это остаётся пунктом конфигурации.
- [RLS initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), два неиндексированных FK периодов и перекрывающиеся SELECT политики salary_accruals отмечены как рекомендации масштабирования. При текущем объёме не доказано влияние на рабочие сценарии; права не расширялись ради снятия предупреждений.

## Проверка Edge Function

Текущий исходник admin-invite-staff v4 сопоставлен с репозиторием. Проверка getUser сама по себе не заменяет проверку живой сессии перед привилегированными действиями. Добавлен отдельный вызов has_active_finance_session под JWT вызывающего пользователя; false/null/error прекращают действие до service-role доступа. Проверяется тестом с имитацией отозванной сессии.

Основание: [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out). Актуальный changelog прочитан перед изменением; релевантного изменения контракта session_id не выявлено.

Функция опубликована как v5, статус ACTIVE, verify_jwt=true. Повторное чтение подтвердило совпадение опубликованного исходника с проверенной версией. Действительные сотрудники и финансовые документы не изменялись.

## Границы приёмки

Отдельно остаются реальная доставка писем, авторизованные параллельные браузерные сессии, восстановление чистой инфраструктуры из baseline и переключение Auth password-protection. Нельзя заменить эти проверки наличием unit-тестов или анализом SQL.
