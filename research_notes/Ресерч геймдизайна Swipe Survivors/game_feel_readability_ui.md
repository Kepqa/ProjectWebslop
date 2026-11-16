# Game feel ("juice"), читаемость и UI/HUD для horde-экшена на маленьком экране

> Метод и ограничения. В этой сессии работал только веб-поиск: прямое открытие страниц (riotgames.com, developer.mozilla.org, kidscancode.org, itch.io) блокировалось сетевой политикой. Поэтому раздел "Cited Findings" опирается на выдачу поиска (сниппеты и резюме страниц), а не на полное чтение первоисточников. Точные формулировки и цифры из GDC-докладов (Eiserloh, Nijman, Jonasson/Purho), книги Swink и видео GMT напрямую не проверены. Всё, что взято из общих знаний модели, вынесено в "Inferences" с пометкой "(по памяти)" и требует проверки перед тем, как на него ссылаться как на факт. Многие найденные источники — блоги и devlog'и низкой и средней авторитетности; это отмечено по месту.

## 1. Основы game feel с конкретными значениями: hit-stop, screen shake, перегруз фидбэка при 10+ убийствах/сек

### Takeaway
Найденные источники сходятся на том, что hit-stop — это 2–5 кадров (≈30–80 мс) для лёгких ударов и до 8–20 кадров для редких тяжёлых, а тряска строится по trauma-модели (trauma 0..1, линейное затухание, видимая тряска = trauma в степени 2–3, шум вместо random). Ни один найденный источник не описывает hit-stop "на каждое убийство" при десятках убийств в секунду; прямых данных о том, как Vampire Survivors, Brotato, Hades, Nuclear Throne и Devil Daggers бюджетируют фидбэк, найти не удалось.

### Cited Findings
- Типичный hit-stop — короткая пауза в 2–5 кадров при попадании; в примере кода длительность 0.04–0.1 с. — [uhiyama-lab, Godot Hitstop Basics](https://uhiyama-lab.com/en/notes/godot/hit-feedback-hitstop/)
- Шкала по силе удара из блога: тяжёлые удары, заряженные атаки, парирования — 8–12 кадров; удары боссов, добивания, криты — 12–20 кадров; больше 20 кадров ощущается как баг. — [bugnet.io, hitstop feeling off](https://bugnet.io/blog/how-to-fix-hitstop-or-freeze-frame-feeling-off) (блог низкой/средней авторитетности)
- Для лёгких ударов в пиксель-арт боёвке рекомендуют 2–4 кадра полной остановки. — [gamineai.com, 2026](https://gamineai.com/blog/pixel-art-combat-fx-hitstop-smear-frames-impact-timing-2026)
- Hit-stop надо задавать во времени, а не в кадрах: при высоком FPS покадровая пауза "исчезает" (совет ждать x/60 секунды). — [r/gamedev, "Juice your game in 60 seconds"](https://lr.in.psf.lt/r/gamedev/comments/yy79kh/juice_your_game_in_60_seconds)
- Глобальная заморозка time scale останавливает и UI, и звук, и эффекты; рекомендуют замораживать только атакующего и цель (или их анимации). — [uhiyama-lab, Unity game feel primer](https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/)
- Проверять hit-stop стоит на ускоренной игре: читается ли он при более высоком темпе. — [bugnet.io](https://bugnet.io/blog/how-to-fix-hitstop-or-freeze-frame-feeling-off)
- Trauma-модель (по Eiserloh, GDC 2016, в пересказе): геймплей добавляет trauma в диапазоне 0..1, trauma линейно убывает, видимая тряска — trauma, возведённая в степень. — [dev.to, Godot 4 screen shake and hit stop](https://dev.to/saltmire/godot-4-screen-shake-and-hit-stop-in-one-script-11eh)
- Реализации используют квадрат (shake = trauma^2) и масштабируют им смещение и угол; на форуме Godot советуют степень 2 или 3. — [gist Ratstail91 (Love2D)](https://gist.github.com/Ratstail91/0b3b7f8f7321aff873549c5e06cd1a98); [Godot forum](https://forum.godotengine.org/t/how-to-use-perlin-noise-for-smooth-camera-shake/26455)
- Затухание в Godot-рецепте: `trauma = max(trauma - decay * delta, 0)`; поворот = `max_roll * amount * noise`. — [KidsCanCode, Screen Shake](https://kidscancode.org/godot_recipes/3.x/2d/screen_shake/)
- Официальный пример Bevy следует докладу: 1D Perlin noise (выход −1..1), для осей берутся разные смещения входа (+100 для x, +200 для y), чтобы оси не коррелировали. — [Bevy, 2D screen shake](https://bevy.org/examples/camera/2d-screen-shake/)
- npm-пакет screen-shake по умолчанию: максимальный угол 12, максимальное смещение 70 (плюс длительность и скорость шума). — [pkgstats, screen-shake](https://www.pkgstats.com/pkg:screen-shake)
- Доклад Eiserloh "Math for Game Programmers: Juicing Your Cameras With Math" (GDC 2016) охватывает кадрирование, сглаженное движение, тряску камеры и динамический split-screen. — [GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing)
- "The Art of Screenshake" Nijman'а: около 45 минут, скучный сайд-скроллер последовательно улучшается ~30 мелкими твиками (по другому источнику ~20). — [gamedeveloper.com](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)
- Частичный список шагов доклада из университетского конспекта: базовая анимация и звук, меньше HP у врагов, больше стрельбы и врагов, взрывы крупнее, "permanence" через дым, экран game over ради смысла, slow motion. — [Uni Bayreuth, GxD 10 Game Feel (PDF)](https://medienwissenschaft.uni-bayreuth.de/wp-content/uploads/GxD-10-Game-Feel.pdf)
- Источники расходятся о месте/дате доклада Nijman'а: INDIGO Classes 2013 — [itch.io post](https://itch.io/post/1671105); Control Conference в Амстердаме — [gamedeveloper.com](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)

### Inferences
- Для Swipe Survivors hit-stop на каждое убийство при 10+ убийствах/сек арифметически плох: даже 30 мс × 10 = 300 мс заморозки в секунду, то есть игра идёт на ~70% скорости и ощущается как лаг. Из найденного следует практика: hit-stop только на "редкие и значимые" события (первый kill свайпа, элитный враг, убийство N+ врагов одним свайпом, получение урона игроком), с глобальным cooldown и потолком суммарной заморозки в секунду (например, ≤60–80 мс/сек — моя оценка, не из источника).
- Hit-stop лучше считать на свайп, а не на убийство: один свайп = одно событие фидбэка, сила которого зависит от числа разрезанных (1 враг — 0 мс, 3–5 — ~30 мс, 8+ — ~60 мс; значения — стартовая гипотеза в диапазоне 2–5 кадров из источников).
- Trauma-модель сама по себе является агрегатором: события прибавляют trauma (мелкое +0.05–0.1, крупное +0.3–0.5), сумма ограничена 1, степень 2–3 гасит мелочь. Это естественный "бюджет" тряски для орды — заменить им текущую тряску "по kill streak".
- На телефоне смещение стоит задавать в долях экрана, а не в пикселях; дефолты 70 px/12° из npm-пакета для экрана ~390 pt шириной явно велики. Поворот камеры в top-down на маленьком экране вредит прицеливанию пальцем — разумно либо отключить, либо держать ≤1–2° (оценка).
- (по памяти) Eiserloh в докладе рекомендует для 2D трансляцию + поворот, степень 2 или 3 и шум Перлина вместо random, чтобы тряска была гладкой и корректно работала при slow motion/паузе. Сверить со слайдами.
- (по памяти) В списке Nijman'а присутствуют также: крупнее пули, muzzle flash, быстрее пули, разброс, impact-эффекты, hit animation, knockback врагов, трупы остаются (permanence), camera lerp, camera kick, screen shake, отдача игрока, "sleep" (hit pause, порядка 20 мс и больше на сильных ударах), больше баса в звуке. Не подтверждено найденными источниками в этой сессии.
- (по памяти) "Juice it or lose it" (Jonasson и Purho, 2012): tweening/easing всего, squash and stretch, частицы, звук на каждое событие, тряска, "личность" объектов — на примере Breakout. Steve Swink в "Game Feel" выделяет real-time control, simulated space и polish; порог отклика ~100 мс для ощущения мгновенности. Не проверено в этой сессии.
- (по памяти) Vampire Survivors почти не использует hit-stop и тряску на рядовых убийствах: фидбэк рядового врага — вспышка, отбрасывание, число урона и выпавший гем; "большие" эффекты зарезервированы под сундук, level-up и редкие события. Nuclear Throne и Devil Daggers работают с малым числом значимых событий (каждый выстрел/каждое попадание по игроку), а не с массовыми убийствами. Это наблюдения, а не задокументированные разработчиками решения.

### Gaps
- Не найдено первичных данных (доклады, постмортемы) о том, как Vampire Survivors, Brotato, Hades, Nuclear Throne, Devil Daggers масштабируют или агрегируют фидбэк при росте частоты убийств. Поиск по этим играм дал только косвенные материалы.
- Точные цифры из слайдов Eiserloh (значения decay, max offset, max angle) не получены: страница GDC Vault и рецепт KidsCanCode не открылись.
- Полный список твиков Nijman'а и наличие в нём hit pause найденными источниками не подтверждены.
- Видео Game Maker's Toolkit и книга Swink в выдачу не попали; конкретные тезисы из них не проверены.
- Таблица hit-stop для Street Fighter 6 (8–10/12–16/20–24 кадра) и утверждение про Dead Cells (2–3 кадра на удар) встретились только в источниках низкого качества — не использовать как факт.

## 2. Визуальная ясность в bullet-heaven/horde: иерархия, контраст, настройки эффектов, телеграфы, тёмная палитра

### Takeaway
Самая твёрдая опора — подход Riot: визуальный вес эффекта должен соответствовать его геймплейной важности, а собственные эффекты не должны закрывать то, что нужно читать. В survivors-like жанре это реализуется игровыми настройками (отключение вспышек, чисел урона, тряски, слайдер прозрачности снарядов/частиц). Для телеграфов найдена только нижняя граница — время реакции 200–300 мс; норматива для мобильных нет.

### Cited Findings
- VFX Style Guide League of Legends (Riot, 2017) называет четыре цели VFX: ясность геймплея, минимизация визуального шума, поддержка темы чемпиона, эффекты, которые удивляют игрока. — [Riot Nexus, VFX Style Guide](https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/); [PDF](https://nexus.leagueoflegends.com/wp-content/uploads/2017/10/VFX_Styleguide_final_public_hidpjqwx7lqyx0pjj3ss.pdf)
- Команда VFX Riot использует документ Visual Hierarchy: дизайнеры оценивают важность каждого умения от 1 до 10, и визуальный вес эффекта подгоняется под геймплейную важность. — [realtimevfx.com, Anatomy of a LoL missile, part 2](https://realtimevfx.com/t/anatomy-of-a-league-of-legends-missile-part-2-what-are-we-communicating-with-our-vfx/13062)
- Совет бывшего FX-художника Riot: свечение повышает контраст и читаемость эффекта, но нужно оставлять место для других эффектов в той же области. — [VFX Apprentice, 10 LoL VFX design tips](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips)
- Пример Illaoi: кончик снаряда Test of Spirit притягивает взгляд, потому что именно от него уворачиваются; часть взрывов приглушили, масляные пятна убрали ради ясности. — [Riot Nexus, Resistance Illaoi](https://nexus.leagueoflegends.com/en-us/2018/02/resistance-illaoi-the-final-update/)
- Навыки, на которые ориентируется VFX-команда Riot (Christina Wun): цвет, value, насыщенность, язык форм, визуальная иерархия, тайминг. — [CG Channel, 2015](https://www.cgchannel.com/2015/10/why-2d-art-skills-help-you-create-better-3d-vfx/)
- У Riot есть отдельная статья о ясности в League ("Dev: Clarity in League"). — [riotgames.com](https://riotgames.com/en/news/dev-clarity-in-league) (страница не открылась, содержание не проверено)
- Vampire Survivors (по сторонней базе доступности): числа урона включаются/выключаются, мигающие эффекты отключаются, тряска экрана отключается; при этом поздняя игра всё равно заполнена яркими пульсирующими эффектами. — [Family Gaming Database](https://www.familygamingdatabase.com/accessibility/Vampire+Survivors)
- Игроки Vampire Survivors сообщают, что отключение VFX и чисел урона снижает визуальный шум и уменьшает лаги в длинных забегах. — [Steam discussion](https://steamcommunity.com/app/1794680/discussions/0/3194745173775130766)
- Megabonk v1.0.17 добавил слайдер прозрачности частиц и снарядов, авто-прозрачность включена по умолчанию. — [consolepcgaming.com](https://consolepcgaming.com/megabonk-v1-0-17-patch-notes-full-map-opacity-slider-dx12-option)
- В Rogue: Genesia есть настройка Projectile Transparency в визуальных опциях. — [Steam discussion](https://steamcommunity.com/app/2067920/discussions/0/624417276294167685)
- Найденный баг-репорт: слайдер прозрачности затрагивал красные маркеры врагов — пример того, что настройка прозрачности не должна касаться индикаторов угроз. — [betahub.io issue](https://app.betahub.io/projects/pr-7682550116/issues/1046)
- Halls of Torment в обновлении 2024 года добавил в опции отображение радиуса подбора и переработал меню опций под новые настройки. — [fullcleared.com](https://fullcleared.com/news/one-of-our-favorite-games-of-2024-gets-a-nice-update/)
- Время реакции человека — примерно 200–300 мс (12–18 кадров); окно между телеграфом и ударом должно покрывать восприятие и реакцию. — [openskillindex, combat-design](https://openskillindex.com/skills/vibeforge1111-vibeship-spawner-skills-combat-design) (низкая авторитетность)
- Каждой вражеской атаке нужен ясный телеграф: wind-up анимация, визуальный сигнал или звуковой сигнал. — [bugnet.io, enemy attack telegraphs](https://bugnet.io/blog/how-to-design-enemy-attack-telegraphs)
- Аудит телеграфов 2026 года рекомендует вести таблицу: длительность wind-up в мс, тяжесть урона, ожидаемое действие игрока — чтобы видеть несогласованности языка форм. — [gamineai.com, telegraph shape language audit](https://gamineai.com/blog/enemy-telegraph-shape-language-top-down-boss-fights-fast-visual-consistency-audit-2026)
- Пример из жанра: в Starship Survivors у charger'а wind-up 3.2 с и recovery 1.5 с. — [Starship Survivors wiki](https://starship-survivors-wiki.pages.dev/gameplay/concepts/telegraphed-attack-pattern)
- "Контракт телеграфа": если игрок увернулся от объявленного удара и получил урон от необъявленного второго, честность нарушена. — [r/gamedesign](https://lr.in.psf.lt/r/gamedesign/comments/1fn63ts/question_from_a_layman/logastw/?context=3)

### Inferences
- Рабочая иерархия для Swipe Survivors (от максимального контраста к минимальному): игрок → телеграфы и опасные враги → обычные враги → подбираемое → собственные эффекты (trail, кровь, числа) → фон. Проверка: скриншот пиковой сцены перевести в grayscale и уменьшить до ~25% — игрок и телеграфы должны находиться за 1 секунду.
- Специфика свайпа: главный "собственный эффект" — ribbon trail и кровь — рисуется ровно там, где палец и так закрывает экран, и поверх врагов. По логике Riot trail должен иметь низкую геймплейную важность после момента удара: быстро гаснуть (порядка 100–200 мс — оценка) и не использовать красный, зарезервированный под угрозы.
- Конфликт цветового кода: красные телеграфы (линия charger'а, круг jumper'а) конкурируют с красной кровью в "grim" стиле. Варианты: кровь темнее и менее насыщенная (тёмно-бордовая, быстро впитывается в фон), а телеграф — самый насыщенный и светлый красный/оранжевый на экране плюс контур и анимация заполнения.
- Десатурированная тёмная палитра читаема, если насыщенность используется как сигнальный канал: фон и рядовые враги почти серые, а цвет получают только игрок, угрозы и пикапы. Vignette и film grain съедают контраст по краям, где находятся off-screen маркеры — маркеры стоит рисовать поверх пост-эффектов.
- Силуэты: при процедурной графике и 480 врагах тип врага должен читаться по форме и размеру (charger — вытянутый/клин, jumper — круглый/крупный), а не по деталям; цветовой акцент (глаза, контур) — второй канал.
- Минимум для телеграфа на телефоне: реакция 200–300 мс + перенос пальца + перекрытие экрана рукой, поэтому практичный нижний порог для опасных атак — порядка 500–700 мс, для первых встреч с типом врага — 1 с и больше (оценка; норматива в источниках нет).
- Настройки, которые выглядят жанровым стандартом и стоят дёшево: числа урона вкл/выкл, вспышки вкл/выкл, тряска вкл/выкл (лучше слайдер), прозрачность собственных эффектов (слайдер), причём маркеры угроз из-под слайдера исключены.
- (по памяти) Конвенции жанра: красный/оранжевый — опасная зона, заполнение формы показывает таймер до удара; white flash врага на 1–2 кадра при попадании; тёмный контур вокруг игрока и пикапов. Darkwood, Limbo, Diablo 2/4, Death Must Die упоминались в задании как ориентиры — по ним в этой сессии ничего не найдено.

### Gaps
- Текст статьи Riot "Clarity in League" и полный VFX Style Guide прочитать не удалось (домен заблокирован); конкретные правила про value/saturation оттуда не извлечены.
- Не найдено материалов Supercell/Brawl Stars о читаемости, дебатов о ясности в Path of Exile, докладов Blizzard об арт-дирекшне Diablo, материалов про Darkwood/Limbo.
- Не найдено подтверждения, что у Halls of Torment, Brotato или Death Must Die есть настройка прозрачности эффектов/снарядов.
- Официальные названия пунктов меню Vampire Survivors не подтверждены (источник — сторонняя база и форумы).
- Нет источника с рекомендуемой длительностью телеграфа именно для сенсорного управления.

## 3. Числа урона: когда помогают, когда шумят; агрегация

### Takeaway
Практика жанра: пул объектов, потолок одновременно видимых чисел, слияние частых попаданий в один растущий счётчик и обязательная настройка "выключить/приглушить". Для игры, где враги умирают с одного свайпа, число урона несёт мало информации.

### Cited Findings
- Starship Survivors: отдельные числа не сливаются, но быстрые попадания по кораблю собираются аккумулятором в одно растущее "−N" над кораблём, таймер сбрасывается при каждом новом попадании. — [Starship Survivors wiki, damage numbers](https://starship-survivors-wiki.pages.dev/gameplay/concepts/damage-numbers)
- Частое создание/уничтожение узлов чисел урона становится узким местом при массовом уроне; решение — object pooling. — [bugnet.io, damage number system](https://bugnet.io/blog/how-to-build-a-damage-number-system)
- Рекомендуют ограничивать число одновременно показываемых чисел и ставить лишние события в очередь. — [wayline.io, Godot floating damage numbers](https://www.wayline.io/blog/godot-floating-damage-numbers)
- Слишком много чисел, слишком крупных и разноцветных, загромождают экран и закрывают действие. — [bugnet.io](https://bugnet.io/blog/how-to-build-a-damage-number-system)
- Cozy Space Survivors добавил переключатель чисел урона в опциях. — [Cozy Space Survivors devlog, Update 113](https://simonschreibt.itch.io/cozy-space-survivors/devlog/685599/update-113-new-upgrades-damage-frequency-damage-numbers)
- Don't Die, Collect Loot: режимы "Full" и "Minimal"; в Minimal числа урона полупрозрачные. — [devlog](https://danmarchand.itch.io/dont-die-collect-loot/devlog/512934/minor-qol-damage-numbers)
- Игроки Vampire Survivors отключают числа урона ради меньшего шума и производительности в длинных забегах. — [Steam discussion](https://steamcommunity.com/app/1794680/discussions/0/3194745173775130766)
- Last Epoch: проблемы производительности чисел урона решены переписыванием системы; на форуме просят настраиваемость чисел. — [Last Epoch forum](https://forum.lastepoch.com/t/damage-numbers-suggestions-feedback-with-mock-up/11963)

### Inferences
- В Swipe Survivors числа полезны только там, где урон не равен "убит": враги с HP больше одного свайпа (элита, боссы), криты, урон по игроку, хил. Для рядовых зомби число дублирует сам факт смерти — кандидат на отключение по умолчанию.
- Вместо N чисел на свайп — одно агрегированное событие у конца свайпа: "×7" (счётчик убийств) или суммарные очки, размер шрифта растёт с величиной. Это одновременно усиливает комбо-фантазию и снимает шум.
- Потолок: не более ~10–15 чисел одновременно (оценка), время жизни 400–600 мс, криты крупнее и другого цвета, остальное мелкое и полупрозрачное.
- Рисовать числа bitmap-шрифтом из пула: создание текстовых объектов Canvas/WebGL на лету дорого (следует из рекомендаций о пулинге).

### Gaps
- Нет исследований или первичных данных о том, при какой плотности числа урона перестают помогать; все источники — devlog'и и форумы.
- Не найдено, как именно Vampire Survivors или Brotato ограничивают число одновременных чисел урона.

## 4. Аудио-фидбэк: восходящий pitch, лимит голосов, адаптивная музыка, звук подбора XP

### Takeaway
Лучший задокументированный образец восходящей серии — Peggle 2 / Peggle Blast: попадания играют восходящую гамму, привязанную к тональности текущей музыкальной фразы. Для массовых событий стандарт — лимит экземпляров одного звука с правилом разрешения и коротким cooldown (в Cozy Space Survivors ~0.03 с).

### Cited Findings
- Peggle 2: попадания по колышкам считаются мелодическим инструментом и частью музыки; они дают восходящую диатоническую гамму, которая меняется под гармонию текущей фразы, даже посреди выстрела. — [Game Audio Network Guild, Peggle 2](https://www.audiogang.org/peggle-2-storytelling-through-adaptive-music/)
- Peggle Blast: каждый музыкальный сегмент несёт метки с тональностью, ладом и диапазоном нот; наборы нот генерируются в реальном времени (48 комбинаций тональность/лад); первая нота — на первое попадание, далее по списку на каждое следующее. — [Audiokinetic blog, Peg Hits and the Music System](https://blog.audiokinetic.com/en/peggle-blast-peg-hits-and-the-music-system)
- Peggle Blast: весь набор нот получается из 5 wav-файлов через MIDI в Wwise; звук — арфа на любое попадание плюс слой маримбы для оранжевых колышков. — [Audiokinetic blog](https://blog.audiokinetic.com/en/peggle-blast-peg-hits-and-the-music-system)
- Нарастание pitch одного и того же звука даёт разнообразие и возбуждение без новых ассетов. — [Audiokinetic blog, Real-time synthesis in Peggle Blast](https://www.audiokinetic.com/ko/blog/real-time-synthesis-for-sound-creation-in-peggle-blast)
- Cozy Space Survivors запретил одновременное многократное воспроизведение одного и того же звука: cooldown на звук, по умолчанию около 0.03 с. — [devlog, Update 61 - Sound Regulation](https://simonschreibt.itch.io/cozy-space-survivors/devlog/634575/update-61-sound-regulation-loot-magnet)
- Разработчик похожей игры отмечал, что звук подбора гемов был слишком громким и раздражающим — типичная боль жанра. — [itch.io post](https://itch.io/post/10052843)
- Kotaku описывает "невероятно приятный" звук одновременного сбора всех гемов в XP в серии Vampire Survivors. — [Kotaku](https://kotaku.com/vampire-crawlers-survivors-garlic-poe-decks-chests-sponge-2000689719)
- Unreal Sound Concurrency: лимит одновременных экземпляров звука и правило при достижении лимита; правила можно делить между звуками; есть время fade-out при "краже" голоса; ducking громкости применяется после правила "stop quietest". — [Epic, Sound Concurrency Reference](https://dev.epicgames.com/documentation/unreal-engine/sound-concurrency-reference-guide)
- Voice stealing как механизм приоритетов: когда каналы заняты, останавливается звук с наименьшим приоритетом; приоритеты назначают по категориям, использование каналов смотрят отладочным оверлеем. — [bugnet.io, audio cutting out](https://bugnet.io/blog/how-to-fix-a-game-with-audio-cutting-out)

### Inferences
- Текущая пентатоника на убийства/подборы — правильное направление; следующий шаг по образцу Peggle — привязать ступени к тональности и текущему аккорду слоёной музыки, чтобы звуки убийств были "инструментом" в миксе.
- Шаг гаммы повышать на свайп или на порог комбо, а не на каждое убийство: при 10+ убийствах/сек гамма иначе упрётся в потолок за секунду. Нужен потолок (например, 2 октавы) и сброс при обрыве комбо.
- Бюджет голосов для WebAudio (оценка): не более 1 запуска одного SFX за 30–50 мс; 3–4 одновременных экземпляра на категорию; общий потолок ~16–24 голосов; при переполнении отбрасывать новый тихий звук или красть самый старый с fade 10–20 мс. Приоритеты: урон по игроку и телеграфы > level-up/пикап редкости > убийства > шаги/окружение.
- Агрегация звука: K убийств в одном кадре = один звук с большей громкостью/более низким слоем ("мясной" бас), а не K звуков. Громкость растить сублинейно (например, логарифмически), иначе клиппинг.
- Звук подбора XP — самый частый "положительный" сигнал жанра, поэтому он должен быть коротким, тихим, высоким и не утомлять; массовый сбор (магнит) — отдельный агрегированный звук-"награда".
- Телеграфам нужен свой звуковой сигнал (источник: многоканальность телеграфа), причём в частотной полосе, не занятой убийствами, и с ducking'ом остального микса; но на мобильном звук часто выключен, так что звук — только дублирующий канал.
- (по памяти) Восходящий pitch на серию используют также монеты/комбо в Mario и Fruit Ninja; в Vampire Survivors pitch подбора гема растёт при быстром сборе подряд. Не подтверждено источниками этой сессии.

### Gaps
- Не найдено технических сведений о звуке Vampire Survivors (лимиты, pitch подбора гемов).
- По практике слоёной адаптивной музыки (вертикальное наслоение, привязка к интенсивности, гистерезис переключения слоёв) источники в этой сессии не найдены, кроме Peggle 2.
- Нет авторитетного источника по лимитам голосов конкретно в WebAudio/Phaser; цифры в Inferences — оценки.

## 5. Мобильный HUD/UI: safe areas, зоны пальца, карточки апгрейдов, онбординг, частота пауз

### Takeaway
Твёрдые цифры есть только по размерам целей касания (44×44 pt Apple, 48×48 dp Material) и по ограничению числа активных контролов (5–6 в гайде Fortnite). По карточкам апгрейдов, онбордингу и частоте level-up найдены лишь анекдотические devlog'и; общий вывод из них — прогрессивное раскрытие текста и реже прерывать игру.

### Cited Findings
- Минимальная цель касания: 44×44 pt (Apple), 48×48 dp (Material Design); 44×44 CSS px соответствует критерию WCAG 2 AAA по размеру цели. — [Ocean View Games, mobile UI for complex games](https://oceanviewgames.co.uk/blog/posts/mobile-ui-design-complex-games); [NZ Govt web a11y guidance](https://govtnz.github.io/web-a11y-guidance/ka/accessible-ux-best-practices/mobile-apps/mobile-app-a11y-by-feature-type/touch-and-pointer-target-sizing.html)
- Видимая графика может быть меньше области нажатия: увеличивать прозрачную кликабельную зону вокруг мелкого объекта. — [Zebra developer blog](https://developer.zebra.com/community/home/blog/2015/08/05/mobile-ui-mistakes-to-avoid-the-touch-target)
- Около 75% касаний смартфона делаются большим пальцем; концепция thumb zone приписывается Steven Hoober. — [Parachute Design, thumb zone UX](https://parachutedesign.ca/blog/thumb-zone-ux/); [UXmatters, Hoober 2013](https://uxmatters.com/mt/archives/2013/11/design-for-fingers-and-thumbs-instead-of-touch.php)
- Гайд Fortnite для мобильных: одновременно видимых активных контролов не больше 5–6, показывать только необходимое в данный момент. — [Epic, Designing for Mobile in Fortnite](https://dev.epicgames.com/documentation/fortnite/designing-for-mobile-in-fortnite)
- Баг в survivors-like игре: карточки апгрейдов заняли весь экран и стали нечитаемыми/невыбираемыми — вёрстку карточек нужно тестировать на разных размерах экрана. — [itch.io post](https://itch.io/post/12360720)
- Way To Crown: тултипы по умолчанию скрывают ключевые слова второго уровня; при апгрейде карты анимируются изменившиеся эффекты и стоимость. — [devlog v0.17](https://alsoknown.itch.io/way-to-crown/devlog/929309/v017-major-graphics-and-ui-improvements)
- Игрок на джеме не понял, что делает level-up и как взаимодействуют карточки — нужно показывать, для чего выбор, а не только варианты. — [itch.io post](https://itch.io/post/10066237)
- Разработчик перешёл на волновую структуру (геймплей → босс → level-up), чтобы игра не прерывалась каждые 20 секунд. — [itch.io post](https://itch.io/post/13902514)
- Цель дизайна карточного рогалика: информация на лицевой стороне карты читается за секунду. — [Erin Imhof, Deckweaver](https://erinimhof.squarespace.com/work/deckweaver)
- Slay the Spire на Android критиковали за "UI для муравьёв" — прямой перенос десктопного размера текста на телефон не работает. — [Android Central](https://www.androidcentral.com/slay-spire-android-game-week)

### Inferences
- В игре на свайпах всё игровое поле — зона касания, поэтому HUD должен жить по краям, вне типичных траекторий свайпа, и быть некликабельным во время боя (иначе свайп, начавшийся на кнопке, вызовет ложное нажатие). Кнопка паузы — в углу, с зоной ≥44 pt, срабатывание по tap, а не по касанию-проходу.
- 6+4 слотов предметов постоянно на экране — много для телефона (ориентир Fortnite — 5–6 активных элементов). Вариант: в бою показывать только то, что меняется (cooldown, заряд), полный инвентарь — на паузе и на экране level-up.
- HP у персонажа (кольцо/полоска под ним) надёжнее верхней полосы: взгляд игрока там же, где палец и персонаж; верхний центр со счётом/комбо на телефонах с вырезом попадает в unsafe area. Нужно учитывать `env(safe-area-inset-*)` и полосу жестов снизу. Риск: HP рядом с персонажем перекрывается пальцем — дублировать критический уровень HP краевым эффектом (красная пульсация виньетки), с учётом ограничений по вспышкам из раздела 7.
- Карточки апгрейда на телефоне: 3 варианта вертикальным списком (в портрете горизонтальные карточки слишком узки для текста); на каждой — крупная иконка, название, одна строка эффекта с числом "было → стало", метка "NEW"/уровень, подсветка синергии с уже взятым; текст не мельче ~16 px CSS (оценка); зона нажатия — вся карточка.
- Защита от случайного выбора: экран level-up появляется посреди свайпа, поэтому первые ~300–500 мс игнорировать ввод и требовать нового касания (отпустить и нажать), иначе палец "выберет" карту по инерции. После выбора — отсчёт/короткая неуязвимость 0.5–1 с перед возвратом в бой.
- Частота level-up: если прерывания чаще, чем раз в ~20–30 с, они рвут flow (ориентир из devlog — "каждые 20 секунд" воспринимается как проблема). Варианты: копить уровни и выдавать выбор в паузах между волнами, растить стоимость уровня, либо авто-выбор/"быстрый выбор" для мелких апгрейдов.
- Онбординг без текста в первые 30 секунд: один медленный враг в центре + анимированный "призрак" свайпа через него; затем 3–4 врага в линию (учит длинному свайпу); первый charger — с увеличенным телеграфом (1.5–2 с). Текстовых подсказок не нужно, если первый враг не может убить игрока.
- (по памяти) Vampire Survivors и Brotato показывают 3–4 варианта, Brotato выносит прокачку в межволновый магазин — это и есть решение проблемы прерываний. Не проверено в этой сессии.

### Gaps
- Нет источников с данными о времени принятия решения на экране апгрейда и об оптимальном числе вариантов.
- Нет авторитетных источников по размещению HP (у персонажа или в верхней полосе) и по перекрытию экрана пальцем в играх.
- Game UI Database и материалы по безтекстовому онбордингу в выдачу не попали.
- Apple HIG и Material 3 напрямую не открыты; размеры целей взяты из вторичных источников.

## 6. Хаптика в мобильном вебе и гайдлайны по дизайну хаптики

### Takeaway
`navigator.vibrate()` на iOS Safari не работает и Apple его не реализовывала; с iOS 17.4/18 существует хак — программный клик по скрытому `<input type="checkbox" switch>` даёт один тип импульса Taptic Engine. Оба платформенных гайдлайна требуют сдержанности: короткие импульсы на дискретные значимые события.

### Cited Findings
- Apple никогда не реализовывала Vibration API в iOS Safari; `navigator.vibrate()` там ничего не делает. Хаптику следует считать прогрессивным улучшением, а не требованием. — [rapidtoolset, iOS Haptics Tester](https://rapidtoolset.com/en/tool/ios-haptics-tester)
- Обходной путь: скрытый `<input type="checkbox" switch>` с `<label>`; клик по label из JavaScript вызывает импульс Taptic Engine; паттерны собираются из повторных кликов по таймеру (requestAnimationFrame). — [pub.dev, web_haptics](https://pub.dev/documentation/web_haptics/0.0.1)
- Версия появления: по одному источнику Safari 17.4 — [ios-haptics, how it works](https://mintlify.wiki/tijnjh/ios-haptics/guides/how-it-works); по баг-репорту WebKit — iOS Safari 18.0, там же обсуждается, должен ли эффект требовать user activation — [WebKit Bugzilla 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)
- Хак даёт по сути один тип импульса: "light" и "heavy" в Safari ощущаются одинаково. — [github.com/mxerf/tappt](https://github.com/mxerf/tappt)
- Это хак, который может перестать работать, если WebKit его закроет. — [azukiazusa.dev (яп.)](https://azukiazusa.dev/blog/ios-safari-web-haptics.md)
- Библиотеки с этим подходом: ios-haptics, web-haptics, tappt, web-haptics-polyfill (на Android — navigator.vibrate(), на iOS — трюк с checkbox). — [web-haptics-polyfill](https://doublej.github.io/web-haptics-polyfill/)
- В марте 2026 года в рассылке W3C Device APIs по-прежнему описывался тот же подход: checkbox switch на iOS и navigator.vibrate() на Android. — [W3C public-device-apis-log, 2026-03](https://lists.w3.org/Archives/Public/public-device-apis-log/2026Mar/0000.html)
- Apple HIG: большинству приложений подходят короткие хаптики на дискретные события; длительная хаптика может обогащать геймплей, но размывает смысл обратной связи; есть готовые паттерны notification, impact, selection. — [Apple HIG, Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics.md)
- Android: "less is more" — избыток вибрации раздражает и притупляет ощущения в руке; предпочитать чёткие ("rich and clear") импульсы жужжащим; учитывать частоту срабатывания и важность события; низкоуровневые on/off и waveform-вибрации часто "жужжат" и годятся лишь как крайняя мера. — [Android Developers, Haptics design principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)
- Material: ограничивать число новых уникальных паттернов, использовать их только там, где нет системных. — [Material Design, Android haptics](https://m2.material.io/design/platform-guidance/android-haptics.html)

### Inferences
- В вебе на Android доступна только `navigator.vibrate()` — именно тот "жужжащий" низкоуровневый режим, который Android советует избегать. Значит, импульсы должны быть очень короткими (порядка 10–20 мс — оценка) и редкими.
- Вибрация на каждое убийство при 10+/сек сливается в непрерывный гул, притупляет ощущения и расходует батарею. Бюджет хаптики (оценка): не чаще 1 импульса за 80–100 мс; три уровня — "тик" на первый контакт свайпа, более длинный импульс на мультикилл/элиту, отдельный отчётливый паттерн на получение урона игроком (самое важное событие — приоритет над остальными).
- На iOS хак с checkbox даёт один слабый импульс и требует DOM-клика — использовать только для редких событий (урон по игроку, level-up, выбор карточки) с feature-detect и тихим отказом; не строить на нём игровую читаемость.
- Обязателен переключатель вибрации в настройках; хаптика не должна быть единственным каналом ни для одного сигнала.
- (по памяти) Vibration API требует sticky user activation и работает в Chrome/Edge/Samsung Internet на Android; в Firefox поддержка была свёрнута на десктопе/ограничена. Страница MDN не открылась — проверить.

### Gaps
- Страница MDN по `navigator.vibrate()` не открылась: точные ограничения (требование user activation, обрезка длинных паттернов, таблица совместимости) в этой сессии не проверены.
- Не найдено изменений позиции Apple по Vibration API в 2025–2026 годах; отсутствие новости не равно подтверждению отсутствия изменений.
- Расхождение источников о версии iOS (17.4 или 18.0) не разрешено.
- Полный текст Apple HIG получен в обрезанном виде; формулировки о злоупотреблении хаптикой сверить.

## 7. Производительный juice для web canvas/WebGL и доступность (reduced motion, фоточувствительность)

### Takeaway
В Phaser главный рычаг — батчинг: спрайты с общей текстурой, blend mode и шейдером уходят в один draw call; каждая частица — отдельный quad, так что стоимость линейна по числу активных частиц. По доступности есть твёрдые пороги: не больше 3 вспышек в секунду, особенно на ≥20–25% площади экрана, осторожно с насыщенным красным, и режим "reduced effects", отключающий тряску и полноэкранные эффекты.

### Cited Findings
- WebGL-рендерер Phaser автоматически батчит спрайты с одинаковой текстурой, blend mode и шейдером в один draw call. — [generalistprogrammer.com, Phaser performance guide](https://generalistprogrammer.com/tutorials/phaser-performance-optimization-guide) (неавторитетный гайд)
- Мобильный бенчмарк Phaser 3.60 измерял texture binds и draw calls: один тест держал 45 824 texture binds и 2 864 draw calls при 60 fps; отладчик Spector примерно вдвое снижал показатели. — [Phaser 3.60 changelog, MobilePerformance](https://cdn.jsdelivr.net/npm/phaser@4.2.0/changelog/v3/3.60/MobilePerformance.md)
- Старый десктопный ориентир: Phaser 3 держал 80 000 спрайтов при 60 fps на GPU автора. — [Phaser newsletter 66](https://phaser.io/newsletter/issue-066)
- Object pooling называют практически обязательным для часто создаваемых объектов (пули, частицы). — [The Polyglot Developer, 2020](https://www.thepolyglotdeveloper.com/blog/2020/09/object-pooling-sprites-phaser-game-performance-gains/)
- Противоположный опыт: в одной ветке форума пулинг на мобильном Firefox ухудшил работу игр — нужно мерить до и после на целевых устройствах. — [html5gamedevs, topic 38002](https://html5gamedevs.com/topic/38002-developing-a-game-for-desktop-and-mobile-browsers)
- Каждая частица — отдельно рендерящийся quad; число активных частиц напрямую определяет стоимость (из документации по Construct 3, принцип переносим). — [bugnet.io, Construct 3 performance](https://bugnet.io/blog/fix-construct3-performance-low-fps-lag)
- Версии: в Phaser 4 рендеринг изменён (в том числе GPU layers) — советы зависят от версии. — [Phaser 3.60 changelog (в пакете phaser@4.2.1)](https://unpkg.com/phaser@4.2.1/changelog/v3/3.60/MobilePerformance.md)
- WCAG 2.3.1 (уровень A): контент, мигающий чаще трёх раз в секунду, может вызвать приступ, если он достаточно крупный и яркий. — [W3C, Understanding Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
- Xbox Accessibility Guideline 118: порог площади — примерно 20% экрана и больше; менее интенсивное мигание тоже может не пройти, если длится долго. — [Microsoft Learn, XAG 118](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118)
- Game Accessibility Guidelines: порог 25% экрана и отдельное правило о мигающих последовательностях дольше 5 секунд. — [gameaccessibilityguidelines.com](https://gameaccessibilityguidelines.com/?p=3348)
- Unity: не более ~3 вспышек в секунду, особенно при ≥20% экрана; насыщенный красный вызывает проблемы при меньшей интенсивности, чем другие цвета. — [Unity blog, accessibility basics](https://unity.com/blog/video-game-accessibility-basics)
- Настройка "reduced effects" должна уменьшать или убирать тряску экрана, параллакс, быстрые частицы, анимации переходов и полноэкранные эффекты. — [abratabia.com, visual accessibility](https://www.abratabia.com/game-accessibility/visual-accessibility.php)
- Тряска камеры и движение вынесены в отдельный Xbox Guideline 117 "Visual distractions and motion". — [Xbox Accessibility Guidelines index](https://devdocs.xbox.com/build/game-principles/accessibility/xbox-accessibility-guidelines.md)

### Inferences
- Для процедурной графики без спрайтов художника ключевой шаг — один раз отрисовать формы врагов, частиц и цифр в общую текстуру-атлас (Graphics → generateTexture/RenderTexture) и дальше рисовать как спрайты: 480 врагов + частицы + числа тогда укладываются в единицы draw call'ов. Перерисовка Graphics каждый кадр и смена blend mode (ADD для свечения вперемешку с NORMAL) ломают батч.
- Бюджеты частиц (оценка, не из источника): жёсткий глобальный потолок активных частиц (на среднем телефоне начать с 300–500 и мерить), кровь — 4–8 частиц на убийство с уменьшением при росте частоты убийств (при 10+/сек — 1–2 на убийство или одна "лужа"-декаль), время жизни 300–500 мс. Декали крови запекать в RenderTexture, а не держать живыми объектами.
- Адаптивное качество: следить за скользящим средним времени кадра и ступенчато срезать частицы → числа урона → film grain/vignette. Полноэкранные пост-эффекты (grain, vignette) на мобильном GPU нередко дороже сотен спрайтов — им нужен отдельный переключатель и проверка на реальном устройстве.
- Риск фоточувствительности конкретно в этой игре: полноэкранные вспышки на мультикиллах и красная пульсация при низком HP при 10+ событиях/сек легко превышают 3 вспышки/сек на >20–25% экрана, причём в красном цвете. Нужен лимитер: не больше 2–3 полноэкранных вспышек в секунду независимо от числа событий, по возможности заменять вспышку плавным изменением яркости.
- Минимальный набор настроек: тряска (слайдер 0–100%), вспышки (вкл/выкл), "reduced effects" (один переключатель: тряска 0, частицы −50% и более, без grain, без полноэкранных вспышек), прозрачность собственных эффектов, числа урона, вибрация. По умолчанию уважать системный `prefers-reduced-motion`.
- Hit-stop в режиме reduced motion тоже стоит ослаблять: частые микрозаморозки воспринимаются как подёргивание.

### Gaps
- Нет авторитетных Phaser-специфичных цифр по бюджету частиц и числу объектов на мобильных; встреченные "500–1000 спрайтов при 60 fps" и "GC-паузы 1–5 мс" — из неавторитетных гайдов без измерений, как факт не использовать.
- Полный текст Xbox Guideline 117 (требования по тряске) не получен.
- Не найдено материалов о том, как конкретные веб-игры с сотнями сущностей (survivors-like на Phaser/Pixi) удерживают 60 fps; нужны собственные замеры на целевых устройствах.
- Неясно, на какой версии Phaser (3.x или 4.x) проект; от этого зависят конкретные приёмы рендеринга.
