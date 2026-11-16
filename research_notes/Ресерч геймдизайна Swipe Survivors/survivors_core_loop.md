# Геймдизайн survivors-like / bullet heaven: core loop, пейсинг, билды, мета-прогрессия

> **Оговорка о методе (важно для автора отчёта).** В этой сессии прямое открытие страниц (WebFetch) было заблокировано сетевой политикой: naavik.co, jboger.substack.com, howtomarketagame.com, 80.lv, rogueliker.com, itch.io не резолвились. Все «Cited Findings» ниже взяты из выдачи веб-поиска (сводки и цитаты из сниппетов), а не из полного текста страниц. Формулировки и числа стоит считать «подтверждёнными на уровне сниппета». Там, где источник слабый (Steam-обсуждение, блог, SEO-страница), это помечено. Первичных GDC-докладов и постмортемов найти не удалось. То, что я помню, но не смог подтвердить источником, вынесено в «Gaps» с пометкой «по памяти, не проверено».

---

## 1. Почему core loop работает: что говорят дизайнеры (casino-влияние, power fantasy, cadence наград, длина рана)

### Takeaway
Петля держится на трёх вещах: единственный ввод (движение), частая «капающая» прогрессия и слот-машинная подача наград (сундуки, звук, анимация), причём сам Галанте ограничивает влияние казино именно сундуками. Длина рана — осознанный выбор под платформу и степень активности игрока: 30 мин (VS, Halls of Torment), 15–30 по стадиям, 20 (20MTD), волны 20–90 с (Brotato); чем активнее ввод, тем короче ран.

### Cited Findings
**Vampire Survivors (Luca Galante / poncle)**
- Галанте до VS делал графику для слот-машин; это повлияло на анимации открытия сундуков. Начал разработку в 2020, отталкиваясь от мобильной Magic Survival. — [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)
- По пересказу Game Developer (интервью Game Informer, онлайн не опубликовано), Галанте говорил, что опыт в гемблинге повлиял не на весь дизайн, а только на открытие сундуков. — [Game Developer](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream)
- В интервью The Verge (по пересказу) он связывал внимание к звуку и анимации со слот-дизайном: там игрок «фактически тратит деньги при каждом нажатии», поэтому каждое нажатие обязано ощущаться. Его же противопоставление: «слот-машина — это нажать кнопку и ждать, выиграл ли я». — [The Conversation](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613)
- Первый прототип играл «в точности как Magic Survival»; Галанте долго тестировал игру всего с 2–3 оружиями и говорил: «I don't care for game balance that much». Оружие делал «по-наёмничьи»: брал спрайт из ассет-пака и тут же кодил паттерн атаки. — [Game Developer](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream); [PC Gamer](https://www.pcgamer.com/vampire-survivors-creator-didnt-have-a-vision-when-he-started-making-the-game-that-allowed-him-to-quit-his-job/)
- VS получила BAFTA за Game Design и Best Game. — [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)
- У сессий VS мягкий лимит 15, 20 или 30 минут в зависимости от стадии. — [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)
- Аналитика (Университет Портсмута): игра чередует периоды, где игрок спокойно доминирует, с периодами напряжения при появлении больших групп врагов; работает эффект «near miss» (ран, оборвавшийся до 30:00, толкает на «ещё один заход»). — [University of Portsmouth](https://www.port.ac.uk/news-events-and-blogs/blogs/popular-culture/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game)
- «Ни один ран не ощущается потраченным зря»: даже проигрыш даёт немного золота и ощущение роста мастерства. — [The Addictive Nature of Vampire Survivors (блог)](https://www.natrowley.com/the-addictive-nature-of-vampire-survivors/)
- Тезис эссе «The Secret Sauce of Vampire Survivors»: игрок здесь «полубог», а не хрупкий уклонист; «капающая» прогрессия статов держит пейсинг лучше ступенчатой кривой, где усиления редки. — [jboger.substack.com](https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors)
- Единственный ввод — движение; за счёт этого игрок занят маршрутом через просветы в толпе и «пастьбой» врагов в группы для эффективного убийства. — [University of Portsmouth](https://www.port.ac.uk/news-events-and-blogs/blogs/popular-culture/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game)

**Cadence level-up (конкретные числа VS)**
- До 2-го уровня нужно 5 XP; далее требование растёт на +10 XP за уровень до 20-го (15 на 2→3, 25 на 3→4…), на +13 XP за уровень с 21 по 40 и на +16 XP с 41-го. — [Vampire Survivors Wiki: Level up](https://vampire.survivors.wiki/w/Level_up)
- Старая версия вики (Fandom) описывает иначе: на уровнях 20 и 40 «стенки» в +600 и +2400 XP, но при этом игрок получает +100% Growth до следующего уровня. Расхождение, вероятно, из-за версии игры. — [Fandom: Level up](https://vampire-survivors.fandom.com/wiki/Level_up); противоречит [vampire.survivors.wiki](https://vampire.survivors.wiki/w/Level_up)
- Игрок критикует середину и конец рана VS: уровни идут так быстро, что всплывающие окна выбора утомляют; предлагает более плоскую кривую — реже, но сильнее. — [itch.io, комментарий игрока](https://itch.io/post/8171585)

**Длина рана у других игр**
- Brotato: 20 волн; первая волна 20 секунд, последняя до 90 секунд. Волны и арена намного короче и меньше, чем в VS. — [Wikipedia: Brotato](https://en.wikipedia.org/wiki/Brotato); [mssv.net (Adrian Hon)](https://mssv.net/2023/08/29/brotato/)
- Другой источник даёт более короткую шкалу: 20 с на волне 1 и 60 с к волне 9. — [mssv.net](https://mssv.net/2023/08/29/brotato/)
- Halls of Torment: раны около 30 минут; цель команды — середина между экшеном VS и прогрессией персонажа из action-RPG. — [Wikipedia: Halls of Torment](https://en.wikipedia.org/wiki/Halls_of_Torment)
- 20 Minutes Till Dawn: автор (flanne) не любил авто-огонь и хотел более активную игру, поэтому игрок сам целится и перезаряжается; цель — глубина механик при коротких казуальных сессиях. Цитата известна по пересказу, с оригиналом не сверена. — [howtomarketagame.com](https://howtomarketagame.com/2022/06/14/20-minutes-till-dawn/)
- Рецензент: 20-минутный лимит создаёт «естественное напряжение», которое другие roguelike размазывают по длинным сессиям. — [wcrobinson.org](https://wcrobinson.org/2024/03/31/20-minutes-till-dawn-review-roguelike-survival-with-a-lovecraftian-twist/)
- В VS есть ускорение игрового времени: 30 минут превращаются в 20, а позже и в 15; критик считает медленный пейсинг типичной слабостью подражателей. — [Game Wisdom](https://game-wisdom.com/critical/success-vampire-survivors)
- Разработчик конкурента называл формат VS «бесконечной 30-минутной рутиной». — [GamesRadar](https://www.gamesradar.com/games/action/vampire-survivors-kicked-off-a-game-development-gold-rush-but-has-a-legitimately-new-genre-emerged-between-the-cash-ins/)
- Существует devlog инди-игры Fisherman's Curse «Why 10 minutes per run?» — содержание прочитать не удалось. — [itch.io devlog](https://trickyzergis.itch.io/fishermans-curse/devlog/1014530/devlog-1-why-10-minutes-per-run)

**Deep Rock Galactic: Survivor (Funday Games)**
- Директор Anders Leicht Rohde: «держим инновации на минимально возможном уровне» — инновация ради инновации слишком дорога. — [GamesRadar](https://gamesradar.com/games/fps/deep-rock-galactic-roguelike-dev-says-innovation-for-innovations-sake-is-too-expensive-to-survive-were-a-studio-of-50-people-with-bills-to-pay)
- Первый прототип собран за неделю маленькой командой (директор, 4 штатных, аудио-дизайнер на полставки). Месяц потратили на попытку добавить «больше миссий и сложности» ближе к оригиналу — и отказались. — [NME](https://www.nme.com/features/deep-rock-galactic-survivor-finds-joy-in-breaking-the-rules-of-vampire-survivors-3461649)
- Управление упрощали, потому что игроки перегружались, а сложность при этом повышали. — [NME](https://www.nme.com/features/deep-rock-galactic-survivor-finds-joy-in-breaking-the-rules-of-vampire-survivors-3461649)
- Вместо бесконечной резни — явная цель: высадиться, добыть минералы, выполнить квоту убийств, вернуться к капсуле за 30-секундный таймер эвакуации. Добыча породы превращает рельеф из помехи в инструмент (копаешь себе проход). — [GameSpot](https://gamespot.com/articles/deep-rock-galactics-vampire-survivors-style-game-excels-by-giving-you-something-new-to-do/1100-6521414/)

### Inferences
- Для Swipe Survivors активный свайп ближе к 20MTD (активный ввод) и Brotato (короткие плотные отрезки), чем к VS. Источники сходятся в том, что активный ввод сочетается с более коротким раном: 10 минут выглядят оправданно, а 30 минут непрерывного свайпа были бы утомительны.
- Влияние казино стоит применять точечно, как у Галанте: в моментах выдачи награды (сундук, эволюция, level-up), со звуком и анимацией, а не в структуре всей игры.
- Из формулы XP VS следует практическое правило: первый level-up почти сразу (5 XP — буквально первые убийства), затем линейный, а не экспоненциальный рост требования. При 10-минутном ране жалоба на «слишком частые окна выбора» в конце будет острее, потому что свайп-игру пауза рвёт сильнее.
- Урок DRG:S (цель + эвакуация) прямо поддерживает уже существующие objectives в story-режиме: цель делает ран осмысленнее «просто доживи».

### Gaps
- Не найден ни один первичный GDC-доклад/постмортем Галанте, Blobfish (Thomas Gervraud), Chasing Carrots или Funday с цифрами. Объяснения Gervraud, почему волны 20–90 с, не найдено.
- Нет данных от разработчиков Magic Survival.
- Нет измеренных данных о «правильной» частоте level-up в минуту; есть только формула XP из вики.
- По памяти, не проверено: в VS сундуки падают с элитных/босс-врагов по расписанию стадии и дают 1/3/5 предметов; в конце 30:00 приходит Reaper как жёсткий финал.

---

## 2. Пейсинг врагов: кривые спавна, количество vs HP, элиты и боссы, передышки, финальное крещендо

### Takeaway
Сложность задаётся расписанием по времени: число врагов и их HP растут ступенями, элиты и боссы привязаны к фиксированным отметкам, а напряжение идёт волнами «доминирование → давление». Баланс хрупок: небольшое смещение HP относительно порогов урона ломает ощущение «один удар — один труп».

### Cited Findings
- VS чередует периоды комфортного доминирования и периоды напряжения с большими группами врагов. — [University of Portsmouth](https://www.port.ac.uk/news-events-and-blogs/blogs/popular-culture/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game)
- В VS босс Mad Forest (Giant Blue Venus) появляется ровно на 25:00 при лимите стадии 30:00; первый сундук (с Glowing Bat) уже может эволюционировать оружие. — [Vampire Survivors Wiki: Mad Forest](https://vampire.survivors.wiki/w/Mad_Forest); [Vampire Survivors Wiki: Stages](https://vampire.survivors.wiki/w/Stages)
- В VS боссы спавнятся на карте вместе с обычными врагами и отличаются только размером и видом; в Survivor.io нужно продержаться заданное время до финального босса. — [PocketGamer.biz](https://www.pocketgamer.biz/feature/79592/how-innovation-and-iteration-has-transformed-survivorio/)
- Survivor.io, глава 2: первый босс на 5-й минуте, ещё два на 10-й и 15-й. Подтверждено только для этой главы. — [Touch, Tap, Play](https://www.touchtapplay.com/how-to-beat-chapter-2-in-survivor-io-chapter-guide/)
- Brotato: на Danger 2+ на волне 11 или 12 приходит Elite Wave (60%) или Horde Wave (40%); босс на волне 20; на Danger 5 — элита и босс одновременно. Число elite-волн за ран — 0, 1 или 3 в зависимости от уровня Danger. — [gameplay.tips](https://gameplay.tips/guides/brotato-ultimate-guide-to-enemies-and-waves.html); [Brotato Wiki: Endless Mode](https://brotato.wiki.spellsandguns.com/Endless_Mode)
- Brotato: у каждого врага базовый HP плюс фиксированная прибавка за волну (линейно); элиты вроде Butcher и Rhino получают +750 HP за волну. Уровни Danger добавляют до +60% HP и урона врагов. — [Brotato Wiki: Enemies](https://brotato.wiki.spellsandguns.com/Enemies); [brotator.com](https://brotator.com/enemies)
- Brotato: элиты роняют легендарный ящик с гарантированным предметом tier 4. — [Brotato Wiki: Enemies](https://brotato.wiki.spellsandguns.com/Enemies)
- Brotato, биом The Abyss: примеры волн на 60 с и 90 с. — [Brotato Fandom: The Abyss](https://brotato.fandom.com/wiki/The_Abyss)
- Chasing Carrots (Halls of Torment): планируют кривые прогрессии в таблицах, которые показывают, как менять значения ради нужного результата; балансировку называют трудной. — [FullCleared](https://fullcleared.com/features/inside-halls-of-torment-an-interview-with-chasing-carrots/)
- Утверждение о хрупкости: жанр держится на балансе частоты спавна и порогов урона; +5% HP врагов может сломать петлю. Источник слабый (SEO-страница), но тезис совпадает с практикой. — [presentationbuilder.internationaltrucks.com](https://presentationbuilder.internationaltrucks.com/best-vampire-survivor-like-games)
- Гайды: враги спавнятся за экраном и «во всё растущем числе» по ходу уровня; давление начинается сразу. — [fantasywarden.com](https://fantasywarden.com/games/deep-rock-galactic-survivor-beginners-guide)
- Студенческий постмортем Zombie Survivors: точки спавна нужно аккуратно настраивать, иначе враги появляются вне карты. — [itch.io postmortem](https://farrior.itch.io/zombie-survivors/devlog/378512/postmortem)

### Inferences
- Общий шаблон расписания: мини-событие (элита) примерно в середине, босс в конце, финал — наложение угроз (Brotato Danger 5: элита + босс). Для 10-минутного рана пропорция Survivor.io (босс на каждой трети: 5/10/15 из 15) переводится примерно в 3:20 / 6:40 / 10:00.
- Линейный рост HP по волнам (Brotato) проще настраивать соло-разработчику, чем экспоненты: порог «базовый зомби умирает с одного свайпа» можно удерживать, наращивая количество и состав врагов, а не HP базового типа.
- Для свайп-механики правило порогов особенно важно: «one-swipe kill» базового зомби — это и есть фантазия силы. Рост HP стоит отдавать отдельным типам (танк, элита), а не размазывать по всей толпе.
- Передышка в жанре — это не пустой экран, а фаза, когда игрок временно сильнее толпы; её создаёт скачок силы (сундук/эволюция) сразу после пика давления.

### Gaps
- Полные минутные таблицы спавна VS (сколько врагов, какой интервал) получить не удалось: таблицы вики в выдаче пустые. Страница для ручной проверки: https://vampire.survivors.wiki/w/Mad_Forest
- Нет сведений от разработчиков о целевом числе врагов на экране и о соотношении «количество vs HP».
- Нет данных о пейсинге Halls of Torment и DRG:S в числах.
- По памяти, не проверено: в VS волны меняются каждую минуту, у каждой свой минимум врагов на экране и интервал спавна; в DRG:S ран состоит из 5 стадий с боссом в конце.

---

## 3. Дизайн апгрейдов: слоты, размер пула, эволюции/синергии, редкость, reroll/banish/skip, разнообразие билдов

### Takeaway
Значимость выбора создают ограничения (слоты, цена, редкость) и видимые цели вроде эволюций, а не длина списка: VS запускалась на горстке оружия, и Галанте сознательно не гнался за балансом. Стандарт жанра — 3 карточки на выбор; экономика reroll должна дорожать внутри одного выбора и сбрасываться между ними.

### Cited Findings
- Галанте долго тестировал VS всего с 2–3 оружиями и не придавал большого значения балансу. — [Game Developer](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream)
- Гайд: «три варианта — стандарт; больше вариантов даёт больше agency, но замедляет ран». Вся сложность жанра — в тюнинге: скорость масштабирования врагов, число вариантов на уровень, взаимодействие оружия. Источник — маркетинговый блог движка. — [Summer Engine](https://www.summerengine.com/blog/make-a-game-like-vampire-survivors)
- Brotato, магазин: слот с вероятностью 35% занят оружием и 65% предметом; четыре редкости (Common, Uncommon, Rare, Legendary). — [Brotato Wiki: Shop](https://brotato.wiki.spellsandguns.com/Shop); [Brotato Wiki: Items](https://brotato.wiki.spellsandguns.com/Items)
- Brotato, reroll: стартовая цена = floor(волна × 0.75) + прирост; каждый reroll повышает цену; цена сбрасывается между level-up и магазином. В патч-заметке база изменена на волна / 2 — зависит от версии. — [Brotato Wiki: Shop](https://brotato.wiki.spellsandguns.com/Shop)
- Brotato: цены предметов растут на 10% базовой цены + 1 за волну. — [gameplay.tips](https://gameplay.tips/guides/brotato-useful-tips-for-the-shop.html)
- Brotato: скидка на reroll ограничена 90%; есть предметы, дающие бесплатные reroll (Dangerous Bunny: +1 за копию). — [Brotato Wiki: Shop](https://brotato.wiki.spellsandguns.com/Shop); [Brotato Wiki: Dangerous Bunny](https://brotato.wiki.spellsandguns.com/Dangerous_Bunny)
- DRG:S: внутри каждого дерева апгрейдов новые тиры открываются по мере набора опыта. — [Wikipedia: Deep Rock Galactic: Survivor](https://en.wikipedia.org/wiki/Deep_Rock_Galactic:_Survivor)
- Archero 2: способность на каждом level-up плюс особо сильные способности от Валькирий на стадиях 5, 15, 25, 35, 45. — [archero2hub.com](https://archero2hub.com/en/guide/beginner)
- Критика (Steam, Wielders of the Essence): когда выживание зависит только от того, как предметы комбинируются, раны решаются удачей и билдом, а не умением. — [Steam discussion](https://steamcommunity.com/app/3546610/discussions/0/756178376553859358/)
- Пример «анти-выбора» в VS: Pentagram вредит росту, так как уничтожает гемы опыта на экране. — [calxylian.com](https://calxylian.com/vampire-survivors-exploiting-cognitive-biases/)
- Критика «stat sticks» на уровне меты: в играх, где анлоки — лишь мелкие прибавки статов, игроки «почти не чувствуют изменений». — [Steam: Yet Another Zombie Survivors](https://steamcommunity.com/app/2163330/discussions/0/4356744414625049828)

### Inferences
- Схема Swipe Survivors (6 свайпов + 4 тринкета, эволюции, reroll/skip) соответствует жанровому стандарту; риск не в структуре, а в наполнении. Опыт VS подсказывает: сначала 2–3 оружия довести до отличного ощущения, потом расширять пул.
- Правило Archero 2 («обычный выбор каждый уровень + гарантированный сильный выбор на фиксированных отметках») — дешёвый способ дать предсказуемые пики силы и уменьшить зависимость от RNG.
- Модель reroll Brotato (дорожает внутри одного выбора, сбрасывается на следующем, база растёт с прогрессом рана) переносится напрямую: reroll остаётся решением, а не автоматическим действием.
- Против «stat sticks»: каждый предмет должен менять поведение (траекторию, область, условие срабатывания, связь с комбо/петлёй), а чистые +X% оставлять уровням внутри уже взятого предмета.
- В свайп-игре часть «билда» — это навык руки. Критика «всё решает удача предметов» здесь менее опасна, но только если апгрейды усиливают свайп, а не заменяют его автоматикой.

### Gaps
- Не подтверждены источником точные размеры пулов (сколько оружия/предметов у VS на релизе, у Brotato сейчас) и рекомендация «сколько предметов нужно маленькой игре».
- Нет высказываний разработчиков о banish/skip и о борьбе с доминирующими билдами.
- По памяти, не проверено: VS — 6 оружий + 6 пассивок, эволюция = оружие макс. уровня + нужная пассивка + сундук; Brotato — до 6 оружий, без лимита предметов, объединение двух одинаковых оружий повышает tier; DRG:S — оверклоки оружия на уровнях 6/12/18; Survivor.io — 6 активных + 6 пассивных, эволюция через пару «оружие + supply».

---

## 4. Дизайн подбора XP: гемы на земле, магниты, риск/награда движения

### Takeaway
Гемы на земле превращают движение (единственный ввод) в постоянный выбор «безопасная позиция или рост»: сила лежит там, где только что была толпа. Прямых дизайнерских объяснений этого от разработчиков найти не удалось — подтверждение косвенное.

### Cited Findings
- Игроки VS «гонятся за гемами и собирают монеты», чтобы стать исключительно сильными; это описывается как внешняя мотивация петли. — [The Addictive Nature of Vampire Survivors (блог)](https://www.natrowley.com/the-addictive-nature-of-vampire-survivors/)
- Ран описывается как гонка: игрок пытается обогнать рост врагов по экспоненте собственной силы. — [calxylian.com](https://calxylian.com/vampire-survivors-exploiting-cognitive-biases/)
- Потеря гемов наказуема: Pentagram, стирающий гемы с экрана, вредит росту. — [calxylian.com](https://calxylian.com/vampire-survivors-exploiting-cognitive-biases/)
- Поскольку управление одно, игрок сосредоточен на маршруте через просветы в толпе и на сгоне врагов в группы. — [University of Portsmouth](https://www.port.ac.uk/news-events-and-blogs/blogs/popular-culture/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game)
- Megabonk (2025) делает движение игрока главным оружием. — [choostgames.com](https://choostgames.com/blog/best-bullet-hell-bullet-heaven-games/)
- DRG:S даёт движению второй смысл: добыча ресурсов и прокладка прохода в породе. — [GameSpot](https://gamespot.com/articles/deep-rock-galactics-vampire-survivors-style-game-excels-by-giving-you-something-new-to-do/1100-6521414/)

### Inferences
- «Обвести XP замкнутой петлёй» в Swipe Survivors — это skill-based магнит: он сохраняет риск/награду (палец занят сбором, а не убийством), но снимает необходимость идти в толпу. Чтобы риск остался, петля должна стоить времени или внимания; иначе сбор ходьбой станет лишним.
- Раз потеря XP ощущается как наказание, а сбор как награда, крупные «куши» (редкий гем, пачка XP с элиты) работают как мини-джекпоты между level-up.
- Радиус подбора и «пылесос» логично держать апгрейдом, а не базой: тогда выбор «магнит или урон» остаётся значимым.

### Gaps
- Не найдено ни одного источника от разработчиков о дизайне гемов, радиусе подбора, слиянии гемов и vacuum-пикапах. Раздел в основном выводной.
- По памяти, не проверено: в VS при переполнении экрана гемы сливаются в один «красный» гем (техническое ограничение, ставшее фичей), а Vacuum-пикап собирает всё с карты и работает как отложенный джекпот.

---

## 5. Мета-прогрессия: постоянные апгрейды, анлоки, персонажи; критика гринда; cadence анлоков

### Takeaway
Хорошая мета выдаёт новое (оружие, персонажи, стадии, квесты) и даёт ощутимый прирост, не требуя гринда; плохая — это много валют и мелкие +% статов, которых игрок не чувствует. Сообщество расколото: одни считают постоянный рост силы сутью жанра, другие — power creep, обесценивающим умение.

### Cited Findings
- Разработчик о современных survivors-like: «так много мета-валют и гринда, что они будто спроектированы, чтобы я застрял на 200 часов» — и это отталкивает. — [itch.io, пост](https://itch.io/post/16154584)
- Игрок (Steam): цикл «умер → потратил золото → мелкая прибавка стата» делает ощущение прогресса почти отсутствующим. — [Steam: Wielders of the Essence](https://steamcommunity.com/app/3546610/discussions/0/756178376553859358/)
- Sodaman: «ни один апгрейд не достаточно большой, чтобы почувствовать прогресс». Встречное мнение в рецензии: именно мелкие награды удерживают людей, а их отсутствие «отправляет игроков в другое место». — [Steam discussion](https://steamcommunity.com/app/2178990/discussions/0/595141367272840027); [Steam review](https://steamcommunity.com/id/dimm_ddr/recommended/2015240?l=danish)
- Yet Another Zombie Survivors: после покупки апгрейдов игрок «почти не чувствует изменений». — [Steam discussion](https://steamcommunity.com/app/2163330/discussions/0/4356744414625049828)
- Megabonk: одни игроки считают, что жанр «В ОСНОВНОМ про power fantasy и рост силы с каждым раном через мету»; другие — что мета была бы «запредельным power creep». — [Steam: Megabonk](https://steamcommunity.com/app/3405340/discussions/0/600790523214758342/)
- Megabonk: постоянные анлоки покупаются редкой валютой, которую дают челленджи, особые горшки и прокачка Silver Tome. — [Wikipedia: Megabonk](https://en.wikipedia.org/wiki/Megabonk)
- Разработчики Roguebook: мета должна слегка поднимать силу на высоких сложностях, «но не в темпе, требующем гринда». — [Steam discussion](https://steamcommunity.com/app/1076200/discussions/0/3070873501568676154)
- Критик: одна карта и никаких анлоков, кроме базовых атрибутов, делают игру монотонной «без ощутимого прогресса между матчами». — [gabtoschi.com, обзор Geometry Survivor](https://gabtoschi.com/blog/review/geometry-survivor)
- VS, анлок через достижение: Inlaid Library открывается при уровне персонажа 20 в Mad Forest; Hyper-режим — победой над боссом на 25:00. — [Vampire Survivors Wiki: Mad Forest](https://vampire.survivors.wiki/w/Mad_Forest)
- Halls of Torment: мета идёт через квесты; постоянные баффы (blessings) переносятся между ранами, а квесты задают цель сессии. Softpedia считает, что мета не удерживает свежесть; Rogueliker называет темп «медленным и ровным». — [GamingOnLinux](https://www.gamingonlinux.com/2023/05/halls-of-torment-is-out-in-early-access-a-great-fusion-of-diablo-and-vampire-survivors/); [Gameffine](https://www.gameffine.com/halls-of-torment-review-here-to-slay/); [Softpedia](https://www.softpedia.com/reviews/games/pc/halls-of-torment-review-537631.shtml); [Rogueliker](https://rogueliker.com/halls-of-torment-review/)
- Survivor.io (Naavik, data.ai): удержание D1 44%, D7 15%, D30 4% против Archero D1 49%, D7 23%, D30 11%. Вывод Naavik: сильный дофаминовый ранний опыт, который затем «останавливается»; новые области и механики добавлять трудно. — [Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/)

### Inferences
- Рабочее правило: каждый ран должен что-то открывать или приближать видимый анлок; анлок через задачу («достигни уровня 20», «убей босса») даёт рану цель и не требует отдельной валюты.
- Workshop за валюту — зона риска. Чтобы не попасть в «не чувствую разницы», шаг апгрейда должен быть заметным, число веток небольшим, валюта одна. Апгрейды, меняющие правила (второй reroll, стартовый тринкет, +1 вариант в выборе), безопаснее длинной лестницы +2%.
- Цифры Survivor.io показывают, что сильного core loop для долгого удержания мало; для премиум/браузерной игры это аргумент за конечную, честную мету, а не за бесконечную.
- Раскол сообщества решается опциональностью: мета ускоряет первые победы, а режимы сложности возвращают вызов тем, кто хочет skill-based игру.

### Gaps
- Нет количественных данных о cadence анлоков (сколько анлоков на ран или на час удерживает игроков). Отдельного поиска по r/roguelites и r/gamedesign сделать не удалось — выдача дала Steam и itch.io.
- Нет высказываний Галанте о мете VS (PowerUps, возврат золота, достижения как анлоки).
- По памяти, не проверено: в VS PowerUps можно бесплатно сбросить и перераспределить, а почти весь контент открывается достижениями; в Brotato постоянных статов нет вовсе — только анлоки персонажей/оружия и уровни Danger.

---

## 6. Мобильные survivors-like (Survivor.io, Archero): длина сессии, главы, управление одной рукой

### Takeaway
Мобильная формула Habby — один палец, авто-прицел, быстрый рост силы в ране, главы с боссами по таймеру и внешняя мета из экипировки и слияния редкостей поверх energy-системы. Она сильна в первые дни, но удерживает хуже Archero и плохо расширяется контентом.

### Cited Findings
- Naavik: Survivor.io и Archero управляются одним пальцем, используют авто-прицел, быстро наращивают способности игрока и сочетают mid-core roguelike-механики с отполированным UX. Мета общая: пройди стадию — открой следующую, плюс слияние предметов, редкости и свитки улучшения. — [Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/)
- Survivor.io: до финального босса нужно продержаться заданное время (в отличие от 30 минут VS); боссы — отдельные события, а не просто крупные враги. — [PocketGamer.biz](https://www.pocketgamer.biz/feature/79592/how-innovation-and-iteration-has-transformed-survivorio/)
- Survivor.io, глава 2: боссы на 5, 10 и 15 минутах. — [Touch, Tap, Play](https://www.touchtapplay.com/how-to-beat-chapter-2-in-survivor-io-chapter-guide/)
- Контент наращивается количеством глав: в версии 2.5.4 (февраль 2024) добавлены главы 131–135 с Challenge-стадиями. — [APKMirror](https://www.apkmirror.com/apk/habby/survivor-io/survivor-io-2-5-4-release/)
- Удержание Survivor.io: D1 44%, D7 15%, D30 4%; Archero: 49% / 23% / 11%. — [Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/)
- За два месяца Survivor.io собрала $75 млн при 37 млн загрузок; рост шёл через TikTok. — [mobilegamer.biz](https://mobilegamer.biz/two-months-in-survivor-io-passes-75m-from-37m-downloads/); [Axios](https://www.axios.com/2022/08/26/survivorio-habby-tiktok-ios-android)
- Позже Naavik описывает Survivor.io как идущую на спад после ухода «золотых когорт». — [Naavik: The Evolution of Hybridcasual](https://naavik.co/deep-dives/evolution-of-hybridcasual-deepdive/)
- Archero, energy: старт сессии стоит 5 из 20 единиц (минимум 4 сессии подряд); энергию возвращают реклама (+5) или 100 гемов. — [Game Deconstruct](https://gamedeconstruct.com/archero-deconstruct-new-subgenre/)
- Archero: главы до 50 стадий; прогресс медленный, поэтому важна реиграбельность; уровни случайны, рост идёт через экипировку, таланты и героев. — [Game Deconstruct](https://gamedeconstruct.com/archero-deconstruct-new-subgenre/)
- Archero 2: около 50 стадий в главе с финальным боссом. — [Theria Games](https://theriagames.com/guide/archero-2-chapter-50-fairytale-fortress/)

### Inferences
- Мобильные игры заменили «один длинный ран» на главу фиксированной длины с 2–3 босс-вехами; при смерти игрок уже получил промежуточные награды. 4 главы story-режима с целями близки к этой схеме.
- Swipe Survivors требует двух пальцев (джойстик + свайп), а мобильный стандарт — один. Это главный UX-риск концепта; жанр подсказывает компромиссы: авто-движение или авто-атака как опция, короткие сессии, игра в портрете.
- Energy и gear-merge — монетизационные механики F2P; в браузерной игре без IAP они дадут только трение. Из мобильной формулы стоит взять главы и боссов по таймеру, а не экономику.

### Gaps
- Полный текст Naavik недоступен (и частично под Naavik Pro), поэтому нет подтверждённых данных о точной длине главы, числе слотов навыков, стоимости энергии Survivor.io.
- Не найдено источников о дизайне управления одной рукой и о портретной ориентации.
- Deconstructor of Fun, GameRefinery и Liftoff в выдаче не появились.
- По памяти, не проверено: Survivor.io — главы по 15 минут (есть 8-минутные), 6+6 слотов, 5 энергии за заход, портретная ориентация; Archero — «стой, чтобы стрелять» (движение и атака взаимоисключающие).

---

## 7. Типичные ошибки клонов и тренды 2025–2026

### Takeaway
Клоны проваливаются на медленном пейсинге, монотонности (одна карта, только +статы), избытке мета-валют и сломанном балансе порогов урона. В 2025–2026 жанр живёт за счёт гибридов и одного сильного «твиста» механики; чистый клон перестал быть лёгкой победой, а исполнение и стиль решают.

### Cited Findings
**Ошибки**
- Медленный пейсинг — типичная слабость подражателей; VS сама даёт ускорение времени (30 → 20 → 15 минут). — [Game Wisdom](https://game-wisdom.com/critical/success-vampire-survivors)
- Одна карта и никаких анлоков, кроме базовых атрибутов, — монотонно, без ощутимого прогресса между матчами. — [gabtoschi.com](https://gabtoschi.com/blog/review/geometry-survivor)
- Слишком много мета-валют и гринда («спроектировано, чтобы застрять на 200 часов»). — [itch.io, пост](https://itch.io/post/16154584)
- Мелкие мета-прибавки, которых не чувствуешь. — [Steam: Yet Another Zombie Survivors](https://steamcommunity.com/app/2163330/discussions/0/4356744414625049828)
- Исход рана определяется удачей с комбинацией предметов, а не умением. — [Steam: Wielders of the Essence](https://steamcommunity.com/app/3546610/discussions/0/756178376553859358/)
- Слишком частые level-up-окна в середине и конце рана утомляют. — [itch.io, комментарий](https://itch.io/post/8171585)
- Перегруз управления и усложнение ради сложности: DRG:S упростила управление и отказалась от месяца работы над «больше миссий и сложности». — [NME](https://www.nme.com/features/deep-rock-galactic-survivor-finds-joy-in-breaking-the-rules-of-vampire-survivors-3461649)
- Формат «30 минут без событий» воспринимается как рутина. — [GamesRadar](https://www.gamesradar.com/games/action/vampire-survivors-kicked-off-a-game-development-gold-rush-but-has-a-legitimately-new-genre-emerged-between-the-cash-ins/)
- Мобильная ошибка: сильный ранний опыт, который «останавливается», и структура, в которую трудно добавлять новые области и механики. — [Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/)

**Тренды 2025–2026**
- Анализ мая 2026 (How To Market A Game, «2026 State of Bullet Heavens: How Vital Shell Succeeded»): маленькие команды всё ещё могут преуспеть за счёт полировки и верности жанру, но жанр больше не «быстрая победа»; исполнение и стиль имеют значение. Полный текст прочитать не удалось. — [howtomarketagame.com](https://howtomarketagame.com/2026/05/19/2026-state-of-bullet-heavens-how-vital-shell-succeeded/)
- Valve добавила в Steam отдельный жанровый тег «Bullet Heaven» с описанием «фокус на апгрейдах при автоматической атаке орд врагов». — [TweakTown](https://www.tweaktown.com/news/111680/steam-has-finally-given-vampire-survivors-and-similar-games-its-own-genre-tag/index.html)
- Megabonk (2025) перенёс формулу в 3D: сообщается о миллионе копий за две недели и пике онлайна 117 000 против 77 000 у VS. Цифры из блогов, не проверены. — [choostgames.com](https://choostgames.com/blog/best-bullet-hell-bullet-heaven-games/); [Medium / Choost Games](https://medium.com/@choost-games/the-bullet-heaven-genre-is-eating-gaming-from-the-inside-f06410e938c0)
- BALL x PIT соединяет прогрессию bullet heaven с формулой Breakout и строительством базы. — [Rogueliker](https://rogueliker.com/bullet-heaven-games-like-vampire-survivors/)
- Vampire Crawlers (poncle, апрель 2026) — вселенная VS в виде пошагового deckbuilder; вышла в Game Pass, на iOS и Android. — [Wikipedia: Vampire Crawlers](https://en.wikipedia.org/wiki/Vampire_Crawlers)
- Общий тренд — гибридизация: петлю прививают к deckbuilding, base building, 3D, управлению отрядом, коллекционированию существ; появляются системы инвентаря. Базовая петля (движение, авто-атака, выбор апгрейдов) дешева в разработке. — [Medium / Choost Games](https://medium.com/@choost-games/the-bullet-heaven-genre-is-eating-gaming-from-the-inside-f06410e938c0)
- Ilya Boytsov (MidHard Games) об итогах 2025: жанр продолжает эволюционировать; ожидаются новые синергии кор-механик, новые меты и сеттинги. — [WN Hub](https://wnhub.io/news/other/item-49655)

### Inferences
- Успешные игры 2025–2026 отличаются одним ясным твистом ввода или кор-механики (движение как оружие, Breakout, добыча породы). Активный свайп + петля вокруг XP — именно такой твист; его стоит делать центром и обвешивать стандартной, «неинновационной» структурой (принцип Funday: минимум инноваций вне твиста).
- Чек-лист против ошибок для Swipe Survivors: (1) нет «мёртвых» минут — событие каждые 1–2 минуты; (2) анлок или заметный шаг меты почти каждый ран; (3) одна мета-валюта; (4) порог one-swipe kill для базового зомби стабилен; (5) окна выбора к концу рана реже, но весомее; (6) управление проще, сложность выше.
- Наличие у проекта волнового arena-режима и story-глав уже закрывает «одну карту / один режим»; риск скорее в распылении контента соло-разработчика по четырём режимам (story, arena, co-op, workshop).

### Gaps
- Содержание анализа How To Market A Game за май 2026 (цифры по жанру, уроки Vital Shell) недоступно — только заголовок и общий вывод из сниппета.
- Нет постмортемов провалившихся клонов с цифрами.
- Game Maker's Toolkit, Deconstructor of Fun, GameRefinery и Reddit в выдаче не появились — эти рекомендованные источники не покрыты.
