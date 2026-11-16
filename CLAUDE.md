# Swipe Survivors — хаб мини-игр

Stack: TypeScript + Vite 6 + Phaser 3.90 | Мобилки: Capacitor 8 | Мультиплеер: PeerJS
Deploy: GitHub Pages — сам после мержа в `main` (`.github/workflows/pages.yml`)
Общение, комментарии, коммиты, CHANGELOG — на русском.

## Структура
- `index.html` + `src/hub/` — хаб (меню выбора игры)
- `survivors/index.html` + `src/*.ts` — Swipe Survivors. Точка входа `src/main.ts`,
  основная логика в `src/GameScene.ts` (~3000 строк: ищи нужное через grep, не читай целиком)
- `duel/index.html` + `src/duel/` — «Дуэль»
- `gladiatorial/index.html` + `src/gladiatorial/` — «Гладиаторы» (перенесена из github.com/Ualadislav/gladiatorial, картинки в `assets/`)
- Новая игра = своя HTML-страница + вход в `rollupOptions.input` в `vite.config.ts`

## Команды
- `npm run build` — проверка типов + сборка. Запускать перед каждым коммитом
- `npm run dev` — dev-сервер. Тестов нет: изменения проверяй сборкой и запуском

## Ветки и релизы
Правила — в `CONTRIBUTING.md`: PR в `main`, версия и CHANGELOG поднимаются перед мержем, на изменение
не для игрока версию не поднимать. Сообщение коммита с версией: `0.X.Y: что изменилось`.
Подробности игр — `survivors/README.md`, `duel/README.md`.

## Как работать
- Думай до кода: неясно — спроси, допущения называй явно
- Минимальное решение. Никаких «на будущее», лишних абстракций и конфигов
- Хирургические правки: не трогай, не форматируй и не «улучшай» код вне задачи
- Определи, как проверить результат, и доведи до него. Написал 200 строк там, где хватило бы 50, — перепиши
