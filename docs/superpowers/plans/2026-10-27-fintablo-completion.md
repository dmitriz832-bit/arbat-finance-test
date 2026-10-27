# Завершение функциональных разрывов Финтабло — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with independent domain workers and a final fresh review. The user explicitly requests autonomous completion and publication, without repeated design approvals.

**Goal:** Закрыть перечисленные в матрице разрывы и привести действующие сценарии к единому информативному интерфейсу Финтабло.

**Architecture:** Развивать существующий vanilla JS проект и его финансовое ядро. Новые документы хранятся в общей db и проходят действующие save/sync/права/закрытие периода; отдельные модели используют BigInt в копейках. Плановые документы никогда не создают фактические деньги или признанные расходы автоматически.

**Tech Stack:** HTML/CSS, JavaScript, node:test, Playwright Chromium/WebKit, GitHub Pages.

**Spec:** Существующие `docs/superpowers/specs/2026-10-26-fintablo-ui-system-design.md`, `2026-10-26-informative-workspaces-design.md`, `docs/fintablo-function-matrix.md` и исходное поручение пользователя.

## Global Constraints

- Сохранить отдельные статьи ДДС и ОПиУ, организации, копеечное ядро, признание выручки по реализации, НЗП, FIFO, налоговые регистры.
- Новые окна используют общие токены, доступный фокус, отмену/несохранённый ввод и контроль изменённой версии.
- Статья закреплена в матрицах; страница не переполняется при 375–1920px; таблицы прокручиваются внутри.
- Не имитировать подключение банка, импорт из чужого сервиса, платные интеграции или юридическую отчётность.
- Публикация разрешена в предыдущих сообщениях «Отправляй» и «разрешаю»; рабочая ветка изолирована.

## Review Focus

- Смена организации и облачная перезагрузка не теряют фильтры и черновой ввод.
- Отмена не создаёт документы; проведение защищено ролями, закрытым периодом и устаревшей версией.
- Проценты и амортизация не считаются дважды с уже введёнными расходами.
- План не влияет на фактические ДДС/ОПиУ до отдельного осознанного действия.
- Неполный баланс не получает статус полного; неизвестные суммы остаются неизвестными.

### Task 1: Календарь план/факт

Files: new `app/calendar-workspace-model.js`, `app/calendar-workspace.js`, `app/calendar-workspace.css`, `tests/calendar-workspace.cjs`, `e2e/calendar-workspace.cjs`.
- [ ] Проверить живой эталон; модель временных колонок, план/факт/конечный остаток, статьи и контрагенты, источники и просрочка.
- [ ] Добавить тесты, увидеть ожидаемый FAIL, реализовать на существующих calendar/cash/liquidity/wallet источниках; не дублировать поставщиков.
- [ ] Реализовать компактную матрицу с фильтрами, графиком и собственными расшифровками, редактирование через native handlers.
- [ ] Проверить реальные записи, нулевые/отрицательные/неизвестные значения и телефон.

### Task 2: Этапы проекта

Files: `app/project-workspace.js`, `app/project-workspace-model.js`, `app/project-workspace.css`, new scoped tests.
- [ ] Проверить ограничения источника и existing deal editor.
- [ ] Добавить редактируемые этапы с суммами, датами и состояниями; равномерное распределение копеек при делении на месяцы.
- [ ] Сохранение тем же native submit с проверкой версии; этапы сами не становятся реализациями/платежами.
- [ ] Проверить сумму этапов, неполные даты, отмену/сохранение/перезагрузку и dirty guard.

### Task 3: БДДС/БДР и заявки

Files: new `app/budget-workspace-model.js`, `app/budget-workspace.js`, `app/budget-workspace.css`, tests/e2e.
- [ ] Реализовать версии помесячного бюджета по отдельным справочникам ДДС/ОПиУ, копирование версии, черновик/утверждение, сравнение план/факт из ядра.
- [ ] Заявки: черновик/на согласовании/утверждена/отклонена и явная передача утверждённой заявки в календарь с защитой от дублирования.
- [ ] Тестами доказать: ввод плана/заявки не создаёт денежную операцию или расход; утверждённая версия сохраняется неизменной.

### Task 4: Кредиты, имущество и управленческая позиция

Files: new focused loan/asset model and workspace JS/CSS, tests/e2e. Root owns integration into existing financial models if postings needed.
- [ ] Прочитать официальные инструкции и доступный интерфейс; договор кредита и график основного долга/процентов, фактическая сверка через явные ссылки на cash.
- [ ] Реестр имущества с первичной стоимостью/сроком/датой ввода/линейной амортизацией в копейках, отдельное явное проведение начисления через существующий costs.
- [ ] Сводка активов/обязательств с источниками и явным контролем полноты капитала/начальных остатков.
- [ ] Проверить частичные оплаты, две компании, границы месяцев, выбытие, запрет двойного проведения.

### Task 5: Общая интеграция и единый интерфейс

Files: `app/index.html`, sync/permissions/period/backups if required, shared UI files, source allowlists, docs.
- [ ] Зарегистрировать новые маршруты и зависимости после их создания; включить новые документы в существующие защиты.
- [ ] Пройти действующие разделы, модальные окна, фильтры, кнопки и подсказки; исправить подтверждённые разрывы.
- [ ] Обновить матрицу: проверено в live / подтверждено документацией / недоступно.
- [ ] Запустить полный unit/syntax, browser/acceptance/CI, независимый review, исправить замечания, merge и сверить опубликованные файлы.

## Execution ledger

- 27 октября: latest main d984708; isolated linked worktree, branch audit/fintablo-complete-20261027. Initial working tree clean except pre-existing node_modules symlink. Calendar live inspected: plan/fact groups, balances, source cells and settings. Filled construction demo remains unavailable; reference trial accessible.
- Ruling: continue implementation directly — user repeatedly requested autonomous completion and approved publication. No extra approval gate for routine local design choices.
