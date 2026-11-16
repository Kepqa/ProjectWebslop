# Webslop — хаб мини-игр

Маленькие браузерные игры: хаб с карточками в корне сайта, каждая игра — своя страница.
Сайт: GitHub Pages, обновляется сам после каждого мержа в `main`.

| Игра | Страница | Код | Подробности |
|---|---|---|---|
| Swipe Survivors | `survivors/` | `src/*.ts` | [survivors/README.md](survivors/README.md) |
| Дуэль | `duel/` | `src/duel/` | [duel/README.md](duel/README.md) |
| Гладиаторы | `gladiatorial/` | `src/gladiatorial/` | — |

```bash
npm install
npm run dev     # http://localhost:5173, доступен в локальной сети
npm run build   # проверка типов + сборка в dist/
```

Мобильные сборки — Capacitor: `npm run cap:android` / `npm run cap:ios`.

Как вести разработку, ветки, версии — в [CONTRIBUTING.md](CONTRIBUTING.md).
