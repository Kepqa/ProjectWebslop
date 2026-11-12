# Swipe/gesture-бой и эргономика touch-управления (для Swipe Survivors)

> Примечание о методе и надёжности. Прямое чтение страниц (WebFetch) в этой сессии было заблокировано сетевыми настройками (gamedeveloper.com, gameanalytics.com, blog.voodoo.io, naavik.co не резолвились), поэтому все факты ниже взяты из поисковой выдачи и её выжимок, а не из полного текста первоисточников. Цитаты там, где они есть, — это фрагменты из выдачи; контекст вокруг них не проверен. Конкретные цифры (пороги скорости свайпа, размеры хитбоксов в пикселях, тайминги окон) в источниках почти не встречаются — это отмечено в разделах «Gaps». Всё, что помечено «из общих знаний, не подтверждено в этой сессии», нельзя цитировать как установленный факт.

## 1. Как лучшие swipe/slash-игры проектируют жест и его фидбек

### Takeaway
Успешные swipe-игры делают жест единственным вводом (вторая рука свободна или только держит устройство), щедро прощают неточность (хитбокс цели намного больше спрайта) и вкладываются в «сочный» отклик на каждый разрез. Рисовальные жесты, вставленные в чужой темп боя (Dawn of Sorrow), критикуют за разрыв потока и наказание за ошибку распознавания; Okami решает ту же проблему полной паузой времени и ресурсом (чернила).

### Cited Findings

**Fruit Ninja (Halfbrick)**
- Вся инструкция игры — четыре слова: «slice fruit, avoid bombs»; Luke Muscat говорит, что команда училась на простых казуальных играх вроде Flight Control и Doodle Jump и начинала со списка целей. — [PocketGamer.biz, Hall of Fame: Luke Muscat](https://www.pocketgamer.biz/hall-of-fame-luke-muscat/)
- Phil Larsen связывает удовольствие от повторения разреза с вводом и фидбеком от «сочных» фруктов. — [Game Developer, интервью с Phil Larsen](https://www.gamedeveloper.com/business/halfbrick-s-phil-larsen-ponders-the-evolution-of-i-fruit-ninja-i-)
- Принцип Muscat: коллизия должна ощущаться «gamey», а не реалистично; хитбокс фрукта намного больше видимого фрукта, так что свайп рядом засчитывается. Для бомб допуск обратный — небольшое перекрытие с бомбой может не считаться попаданием. (Формулировка — пересказ из выдачи, не дословная цитата.) — [O'Reilly, «Swipe This!», Game Design Spotlight 1: Fruit Ninja HD](https://www.oreilly.com/library/view/swipe-this-the/9781119940531/07_9781119940531-pp02.ef.html)
- Для ощущения «сочности» модель фрукта состоит из двух мешей; модель поворачивают так, чтобы шов совпал с линией свайпа игрока. Брызги частично остаются следом вдоль разреза, комбо вызывает текст на экране. — [O'Reilly, «Swipe This!»](https://www.oreilly.com/library/view/swipe-this-the/9781119940531/07_9781119940531-pp02.ef.html)
- Типовая реализация в клонах: фрукт — окружность, каждая точка следа клинка проверяется на расстояние до центра (point-to-circle). Это подход любителей, не подтверждённая реализация Halfbrick. — [Aryan VX, Fruit Ninja (CV) case study](https://aryanvx.github.io/portfolio/case-studies/fruitninja-cs.html)
- Существуют доклады Halfbrick на GDC: GDC China 2011 (Phil Larsen, разработка и успех) и GDC 2012 «Iterating Design and Fighting Fires: Updating Fruit Ninja and Jetpack Joyride». Детального разбора «slice feel» в найденных материалах нет. — [GDC Vault](https://gdcvault.com/play/1015483/Iterating-Design-and-Fighting-Fires); [GameBusiness.jp о GDC China 2011](https://www.gamebusiness.jp/article/2011/11/15/4749.html)

**Infinity Blade (Chair)**
- Меч управляется свайпом по экрану; атаковать можно в любом направлении, определённые комбинации дают доп. урон. Свайп-фехтование выросло из желания Donald Mustard сделать нюансированный бой с парированием. — [Wikipedia: Infinity Blade](https://en.wikipedia.org/wiki/Infinity_Blade)
- На GDC Mustard говорил, что команда рано решила: вся игра должна быть играбельна одним пальцем («a huge gauntlet to throw down»), нужны упрощённые контролы, не опирающиеся на портированную схему управления. — [The Loop, пересказ GDC-доклада](https://loopinsight.com/2011/03/03/infinity-blade-creator-talks-ios-game-development/); см. также [Shacknews, GDC: Infinity Blade post-mortem](https://shacknews.com/article/67674/gdc-infinity-blade-post-mortem)
- Критики хвалили свайп-бой, но расходились в оценке цикличного геймплея (затягивает / повторяется). — [Wikipedia: Infinity Blade](https://en.wikipedia.org/wiki/Infinity_Blade)

**Severed (DrinkBox)**
- Свайп по экрану режет эту область; короткие свайпы наносят значительно меньше урона, длинные — больше, но занимают больше времени. Направление свайпа важно: часть врагов прикрывает отдельные зоны. — [Gaming Trend, Severed review](https://gamingtrend.com/feature/reviews/severed-review); [Pocket Gamer о Severed](https://www.pocketgamer.com/severed/see-how-severed-makes-use-of-the-ps-vitas-touchscreen-for-its-monster-slashing-a)
- Chris McQuinn (DrinkBox): touch-бой потребовал большого количества дизайн-экспериментов. Graham Smith: такой ввод позволил сделать бой глубже и сложнее, чем кнопочное фехтование. — [Miketendo64, интервью с DrinkBox](https://miketendo64.com/2016/09/23/an-interview-with-drinkbox-studios-severing-limbs-with-sasha/); [Gamereactor, интервью](https://ipv6.gamereactor.eu/we-talk-to-drinkbox-about-severed-on-new-platforms/)
- Рецензенты отмечают, что игра не даёт побеждать бездумным свайпаньем — разнообразие задаёт дизайн врагов; критический отзыв: бой может стать однообразным и полностью зависит от тачскрина. — [Gaming Trend, Severed review](https://gamingtrend.com/feature/reviews/severed-review); [Worthplaying, PS Vita review](https://worthplaying.com/article/2016/5/3/reviews/99331-ps-vita-review-severed/)
- Физический дискомфорт — повторяющаяся оговорка в рецензиях (подробно в разделе 2).

**Рисовальные жесты: Dawn of Sorrow и Okami**
- Magic Seals в Castlevania: Dawn of Sorrow: Nintendo Life называет их «инновацией ради инновации», ломающей поток босс-файтов. — [Nintendo Life review](https://www.nintendolife.com/reviews/ds/castlevania_dawn_of_sorrow)
- Если не успеть нарисовать печать за отведённое время, босс восстанавливает здоровье и бой продолжается. — [Wikipedia: Castlevania: Dawn of Sorrow](https://Wikipedia.com/wiki/Castlevania:_Dawn_of_Sorrow)
- Один рецензент пишет, что печати стали причиной множества лишних смертей и что одни печати распознаются лучше других. — [Hogan Reviews](https://hoganreviews.co.uk/2024/09/25/castlevania-dawn-of-sorrow-nintendo-ds-review)
- Обратное мнение: RPGFan проблем с печатями не испытал, тренировка в меню делает их выполнимыми. — [RPGFan review](https://www.rpgfan.com/review/castlevania-dawn-of-sorrow/)
- Okami: в любой момент игрок удерживает кнопку и останавливает время; пока время стоит, он рисует символы кистью. Чернила ограничены и восполняются со временем, когда кисть не используется, — это не даёт побеждать одной кистью. — [Wikipedia: Ōkami](https://en.wikipedia.org/wiki/%C5%8Ckami)
- В Ōkamiden (DS, тачскрин) один из персонажей-напарников не может останавливать время бесконечно — рисование идёт с лимитом времени. — [Wikipedia: Ōkamiden](https://en.wikipedia.org/wiki/%C5%8Ckamiden)

**Другие мобильные slash-игры (рецензии TouchArcade)**
- Slashy Hero: свайпы рисуют разрезы при ограниченной шкале энергии; можно «влететь в линию врагов и выйти невредимым». Оценка 4/5. — [TouchArcade, Slashy Hero review](https://toucharcade.com/2015/11/12/slashy-hero-review)
- Infinite Warrior: рецензент критикует связь между направлением свайпа и действием как «по сути произвольную». — [TouchArcade, Infinite Warrior review](https://toucharcade.com/2012/09/11/infinite-warrior-review/)
- Hanzo: свайпы хороши для рубки врагов, но точные прыжки свайпом фрустрируют; рецензент хотел бы виртуальные кнопки вместо свайпов. — [TouchArcade (Hanzo review)](https://toucharcade.com/?p=147903) (заголовок игры взят из выжимки выдачи)

**Задержка ввода**
- Исследования перетаскивания на тачскрине: пользователи различают задержку при drag вплоть до ~2 мс (в другом источнике 2,38 мс); производительность падает с ростом задержки (Jota, Ng, Dietz, Wigdor, CHI 2013), в одной сводке — заметно выше 25 мс. — [CHI 2013, DOI 10.1145/2470654.2481317](https://unpaywall.org/10.1145%2F2470654.2481317); [«How Much Faster is Fast Enough?», CHI 2015](https://dcmpx.remotevs.com/com/tactuallabs/www/SL/papers/howMuchFasterIsFastEnoughCHI15.pdf)
- Исследование приемлемости: около 300 мс терпимо для тапов с низким вниманием и около 170 мс для drag, где визуальный отклик существенен. — [User-Acceptance of Latency in Touch Interactions](https://rd.springer.com/chapter/10.1007/978-3-319-20681-3_13)
- Правило «до 100 мс» вторичные источники называют и ориентиром, и устаревшим. — [Ink & Switch, Slow Software](https://inkandswitch.com/slow-software/)

### Inferences
- Текущий дизайн Swipe Survivors («медленный свайп не режет», «клинок тупится к концу») идёт против главного приёма Fruit Ninja — щедрого допуска. Порог скорости и убывающая острота — это два отказа подряд на один жест; при 480 врагах на экране и занятой второй руке их стоит смягчать (большие хитбоксы врагов относительно следа, мягкий, а не бинарный порог скорости).
- След клинка при перетаскивании — именно тот тип отклика, где задержка заметнее всего (drag чувствительнее тапа). В браузере это аргумент за рисование следа по самым свежим pointer-событиям и за отказ от сглаживания, добавляющего отставание. Это вывод из HCI-данных, а не проверенная рекомендация для конкретного движка.
- «Свайп-шейпы» как апгрейды (резкий разворот, зеркальный свайп, замкнутая петля) повторяют риск Dawn of Sorrow и Infinite Warrior: распознавание формы в разгар боя и произвольная связь «форма → эффект». Okami показывает два работающих предохранителя: пауза/замедление времени на время рисования и ресурс, ограничивающий частоту.
- Петля для сбора лута — жест низкого риска (ошибка распознавания ничего не стоит), в отличие от боевых форм.

### Gaps
- Не найдено чисел: порог скорости свайпа, длина следа, размер хитбокса в пикселях/процентах, длительность окна парирования в Infinity Blade, правила комбо (сколько фруктов за один свайп) и критов в Fruit Ninja. Из общих знаний (не подтверждено в этой сессии): комбо в Fruit Ninja даётся за 3+ фрукта одним свайпом, криты случайны.
- Полные тексты GDC-докладов Halfbrick и постмортема Infinity Blade недоступны (GDC Vault, блокировка сети); интервью DrinkBox про focus-метр и механику severing не найдены в выдаче.
- Не найдено материалов по Dungeon Raid, Flight Control/Mini Metro (рисование линий), Slash Quest, Blades of Brim, Ronin: The Last Samurai, Samurai Blitz, One Finger Death Punch.

## 2. Движение + второй активный жест: одна рука или две, утомляемость, окклюзия

### Takeaway
Доминирующие мобильные хорд-игры (Archero, Survivor.io, Vampire Survivors) играются одним большим пальцем, и это считается их ключевым преимуществом; у единственной хорошо задокументированной игры с непрерывным боевым свайпом (Severed) физический дискомфорт — самая частая претензия в рецензиях. HCI-данные показывают, что усилие свайпа зависит от направления и удалённости от ладони, а окклюзия пальцем — признанная проблема, для которой придуманы специальные техники.

### Cited Findings

**Одна рука как индустриальная норма**
- App Store про Archero: нужен только один большой палец — лучник сам целится и стреляет, когда стоит на месте. — [App Store, история про Archero](https://apps.apple.com/kz/story/id1466746068)
- Voodoo называет схему Archero (чтобы начать стрелять, надо убрать палец с экрана) «счастливой случайностью». — [Voodoo blog, Hybrid-casual](https://blog.voodoo.io/articles/hybrid-casual)
- Deconstructor of Fun среди основ успеха Archero называет высокую доступность, ясный хук и короткие петли обратной связи. — [Deconstructor of Fun, How Archero Shot to the Top](https://www.deconstructoroffun.com/blog/2019/8/9/why-archero-banked-25m-but-leaves-25m-hanging-hlx9n)
- Есть и негатив: комментатор на itch.io называет «stop to shoot» раздражающим, хотя признаёт, что схема даёт собственный скилл и челлендж. — [itch.io, комментарий](https://itch.io/post/9252142)
- Vampire Survivors mobile: TouchArcade описывает её как «single stick game», где двигаешься и стреляешь одновременно, что идеально для портретной игры большим пальцем (4,5/5). Poncle заявляла игру в ландшафте и портрете, с тачем или геймпадом. — [TouchArcade review](https://toucharcade.com/2022/12/09/vampire-survivors-mobile-review-controller-cloud-save-sync-dlc-unlock-iphone-ipad-pro/); [PC Gamer](https://www.pcgamer.com/vampire-survivors-studio-says-it-couldnt-find-a-non-predatory-mobile-developer-so-it-did-the-job-itself)
- Контрпример даже для одного стика: Pocket Gamer пишет, что тач-управление Vampire Survivors «не самое отзывчивое», а в игре про лавирование в толпе это существенно. — [Pocket Gamer review](https://www.pocketgamer.com/vampire-survivors/review)

**Две руки: что известно**
- Brawl Stars: до марта 2018 был выбор «джойстик или tap-to-move»; разработчики увидели сильный перевес в пользу джойстика, оставили только его и вместе с этим перешли в ландшафт. Игра тогда была в софт-лонче. — [Newsweek о мартовском обновлении 2018](https://www.newsweek.com/entertainment/video-games/brawl-stars-update-landscape-controls-upgrade-system-new-mode-838786)
- В Brawl Stars есть «quick fire» (бывший auto aim): тап стреляет сам, без ручного прицеливания. В апреле 2020 добавлены настраиваемые позиции контролов. — [App Store: Brawl Stars](https://apple.co/2T9Jmhl); [Supercell, Customizable Controls](https://supercell.com/en/games/brawlstars/blog/release-notes/optional-update-customizable-controls)
- 20 Minutes Till Dawn на мобильных: полностью ручное прицеливание — отличие от жанра; на старте не было поддержки геймпада, и точное прицеливание на таче было трудным, поддержку контроллера добавили позже. — [Pocket Gamer, launch](https://www.pocketgamer.com/20-minutes-till-dawn/launch); [Pocket Gamer, controller update](https://www.pocketgamer.com/20-minutes-till-dawn/controller-offline-update)
- Тред TouchArcade про мобильный рогалик (название в выжимке не указано): dash назначен на свайп тем же левым пальцем, что управляет движением; игрок возражает, что так dash эффективно использовать нельзя — палец надо сначала оторвать от движения; требуемую точность «почти невозможно» достичь без контроллера. — [TouchArcade forum thread](https://toucharcade.com/community/threads/425316)

**Утомляемость: Severed как ближайший аналог**
- Держать Vita одной рукой и свайпать другой «может вызвать судороги в руке». — [WeTheNerdy, Severed review](https://wethenerdy.com/severed-review)
- Switch-версия: чтобы не получить судорогу, консоль советуют положить на стол, а не держать весь её вес левой рукой. — [Digitally Downloaded, Switch review](https://www.digitallydownloaded.net/2017/08/review-severed-nintendo-switch.html)
- Устройство приходится чем-то подпирать; удержание одной рукой в бою даёт «небольшое напряжение запястья». — [Power Up Gaming](https://powerupgaming.co.uk/?p=17063)
- Отсутствие второй руки делает хват некомфортным «через некоторое время»; пользователь Giant Bomb: хват-«клешня» становится неудобным довольно быстро. — [Chalgyr's Game Room](https://www.chalgyr.com/2016/05/severed-ps-vita-review.html?m=0); [Giant Bomb user review](https://www.giantbomb.com/severed/3030-46014/user-reviews/2200-29399/)
- При этом сам тач-бой рецензенты в целом хвалят; дискомфорт — повторяющаяся оговорка, а не главная претензия. — [God is a Geek, Severed review](https://godisageek.com/reviews/severed-ps-vita-review/)

**HCI: усилие свайпа, хват, зоны, окклюзия**
- Модель Log2Motion (Aalto/Leipzig; мышечно-скелетная модель руки, 63 мышечно-сухожильных единицы) оценивает вертикальные свайпы (вверх-вниз и вниз-вверх) как самые затратные. Это симуляция, не измерения на людях. — [Digital Trends](https://www.digitaltrends.com/phones/we-swipe-our-phones-all-day-and-scientists-just-ranked-which-ones-are-the-most-tiring/); [Interesting Engineering](https://interestingengineering.com/ai-robotics/log2motion-ai-smartphone-ux-biomechanics)
- ЭМГ-исследование на планшетах (16 взрослых, 320 жестов): чем дальше цель от ладони, тем больше разгибание/отведение большого пальца и разгибание запястья; свайпы в зоне, ближайшей к ладони, выполняются в более нейтральной позе и с меньшей активностью мышц предплечья. Данные по планшетам, на телефоны переносить осторожно. — [CDC Stacks](https://stacks.cdc.gov/view/cdc/207488)
- Hoober (1333 наблюдения, ноябрь 2012 — январь 2013; 780 с касанием экрана): 49% держат телефон одной рукой, 36% «в колыбели», 15% двумя руками. Планшеты не учитывались. — [UXmatters, How Do Users Really Hold Mobile Devices?](https://uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
- Тепловую карту «thumb zone» оспаривают: по вторичному источнику, сам Hoober позже назвал ту диаграмму неверной; люди меняют хват по задаче и контексту. — [Monterail](https://www.monterail.com/blog/thumb-friendly-navigation-word-oriented-design)
- Исследование Qian Fei (Alibaba): у правшей наименее точные зоны для большого пальца — нижний и верхний правый углы. — [Medium, Mobile UI ergonomics](https://medium.com/@mibosc/mobile-ui-ergonomics-how-hard-is-it-really-to-tap-different-areas-of-your-phone-interface-bb043d409af8)
- Shift (Vogel & Baudisch, CHI 2007): проблема тача — окклюзия цели пальцем и неясность, какая часть пальца задаёт точку выбора; решение — выноска с копией закрытой области в незакрытом месте; над крупными целями выноска не показывается. — [CHI 2007 paper (PDF)](https://projects.csail.mit.edu/hci-reading/papers/chi2007-vogel.pdf)
- Occlusion-Aware Interfaces (Vogel & Balakrishnan, CHI 2010): интерфейс знает закрытую рукой область и выносит важное содержимое в незакрытую зону. — [CHI 2010, DOI 10.1145/1753326.1753365](https://www.springerprofessional.de/doi/10.1145/1753326.1753365)
- Практическое правило из руководства по тач-контролам: если критичная информация или персонаж скрыты за джойстиком/пальцем, контролы расположены неверно; распространённая ошибка — переносить десктопную схему, добавив виртуальный d-pad. — [Cursa, Touch Controls for Mobile Games](https://cursa.app/en/page/touch-controls-for-mobile-games-input-patterns-and-feedback)
- Руководство по Godot: позволять менять направление на виртуальном джойстике без отрыва пальца, использовать щедрые хитбоксы и пороги ввода. — [InAirSpace, Godot touch controls guide](https://inairspace.com/blogs/learn-with-inair/godot-touch-controls-for-mobile-a-complete-practical-guide-1)

### Inferences
- Схема Swipe Survivors тяжелее, чем у Severed: там свободная рука только держит устройство, здесь она ещё и непрерывно ведёт джойстик 10 минут. Жалобы на судороги при более лёгкой нагрузке — серьёзный сигнал против «постоянного свайпа» как обязательного действия каждую секунду.
- Окклюзия структурно хуже, чем в twin-stick: в двухстиковой схеме оба пальца лежат в нижних углах, а свайпающая рука пересекает именно ту область, где находятся враги. В Fruit Ninja это терпимо, потому что цели крупные и нет персонажа, которого нужно уворачивать; в хорд-игре игрок одновременно читает угрозы вокруг героя.
- Данные о хвате (49% одной рукой) и успех одно-пальцевых игр означают, что двуручная ландшафтная схема сужает ситуации игры (транспорт, стоя) — для браузерной мобильной игры это потеря аудитории, а не только вопрос комфорта.
- Если свайп остаётся, зона свайпа ближе к ладони свайпающей руки (нижняя правая часть) дешевле по усилию, чем дальние углы; вертикальные свайпы, вероятно, дороже горизонтальных. Отсюда идея: клинок со смещением (offset) относительно пальца или управление «в относительных координатах», чтобы палец не закрывал точку разреза, — по аналогии с выноской в Shift. В найденных источниках применительно к играм это не описано.

### Gaps
- Не найдено исследований утомляемости именно при быстрых повторяющихся свайпах в играх на телефоне за 10+ минут; «gorilla arm» в литературе относится к вертикальным экранам, для телефонов прямых данных не найдено.
- Не найден процент экрана, закрываемый рукой (вероятный источник — Vogel et al., CHI 2009, «Hand Occlusion with Tablet-sized Direct Pen Input», не проверен).
- Нет данных о портрете против ландшафта для двуручных схем, о размерах мёртвой зоны джойстика; цифра «палец 40–60 px» в выдаче без источника.
- Не найдено ничего по Soul Knight, Downwell, гироскопу/наклону как альтернативе. Данные Naavik по Survivor.io недоступны.

## 3. Активная атака против авто-атаки в хорд-играх

### Takeaway
Авто-атака в жанре — наследие мобильных игр и осознанное снятие нагрузки: игрок управляет только позицией. Игры с ручным прицеливанием существуют, но стандартным решением стал переключатель auto-aim/auto-attack; количественных данных о том, какую долю игроков устраивает ручной режим, найти не удалось.

### Cited Findings
- Главным источником вдохновения Luca Galante называл мобильную Magic Survival; разработчики клонов говорят, что привлекательны были именно авто-атака и очень простые контролы. — [GamesRadar](https://gamesradar.com/games/action/vampire-survivors-kicked-off-a-game-development-gold-rush-but-has-a-legitimately-new-genre-emerged-between-the-cash-ins)
- Цели Galante: игра-«palate cleanser»; изначальное видение — стримеры играют и одновременно разговаривают с чатом. — [80.lv](https://80.lv/articles/vampire-survivors-developer-on-its-design-sudden-success); [Wikipedia: Vampire Survivors](https://en.wikipedia.org/wiki/Vampire_Survivors)
- Подход к разработке описан как «наёмнический»: ассеты из спрайт-пака, паттерны атак кодились на ходу. — [Game Developer](https://gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream)
- Halls of Torment: мышь — прицеливание, R переключает auto-aim; на геймпаде правый стик целится, R3 переключает auto-aim; даже с auto-aim игрок с геймпадом может выбирать цели сам. Гайды советуют держать авто-атаку включённой всегда. — [Prima Games](https://primagames.com/tips/halls-of-torment-controls-guide-keyboard-and-controller); [The Nerd Stash](https://thenerdstash.com/halls-of-torment-controls-guide/)
- Entropy Survivors: разработчик добавил переключатель auto-aim патчем в декабре 2024 и планировал автоматический переход в ручной режим при движении правого стика. — [Steam discussions, Entropy Survivors](https://steamcommunity.com/app/2602030/discussions/0/604141771964862053/?snr=2___)
- Мнения игроков есть в обе стороны: на форуме Vampire Survivors один пользователь утверждал, что ручной twin-stick был бы веселее; другой отвечал, что жанр ценен тем, что отличается от большинства top-down шутеров. В Deep Rock Galactic: Survivor игрок просил сделать основное оружие прицеливаемым. Это отдельные посты, не выборка. — [Steam, Vampire Survivors](https://steamcommunity.com/app/1794680/discussions/0/3189118358007612079); [Steam, DRG: Survivor](https://steamcommunity.com/app/2321470/discussions/0/6292161380817875268)
- 20 Minutes Till Dawn выделяется в жанре полностью ручным прицеливанием. — [Pocket Gamer](https://www.pocketgamer.com/20-minutes-till-dawn/launch)

### Inferences
- Авто-атака превращает жанр в игру про позиционирование и билд; активный свайп добавляет второй непрерывный канал внимания. При ~480 врагах, если базовый зомби умирает только от свайпа, нагрузка на ввод растёт вместе с плотностью орды — то есть максимальна именно там, где у жанра обычно фаза «силовой фантазии» с минимальным вводом.
- Практика жанра (Halls of Torment, Entropy Survivors, quick fire в Brawl Stars) подсказывает безопасную форму: авто-режим по умолчанию плюс ручной ввод как добровольное усиление. Для Swipe Survivors эквивалент — базовая авто-атака/авто-клинок и свайп как более сильный, но необязательный удар.
- Ручное прицеливание на таче без геймпада оказалось проблемой для 20 Minutes Till Dawn; свайп требует меньшей точности, чем прицел, но выше по моторной нагрузке — прямого сравнения нет.

### Gaps
- Прямого высказывания Galante о том, почему убрана кнопка атаки, не найдено; интервью Game Informer недоступно онлайн, транскрипт документалки Noclip не найден.
- Нет статистики (доля игроков с включённым auto-aim, удержание при ручной атаке) ни по одной игре.
- Не найдено дизайн-материалов по Death Must Die, Soulstone Survivors (активные навыки), Deep Rock Galactic: Survivor (добыча как активный глагол), Brotato (ручное прицеливание); наличие auto-aim в 20 Minutes Till Dawn не подтверждено.

## 4. Паттерны снижения нагрузки при сохранении свайпа как «особого» действия

### Takeaway
В найденных примерах работают четыре приёма: ресурс/шкала, ограничивающая частоту жеста (Okami, Slashy Hero); остановка или лимит времени на рисование (Okami, Ōkamiden); схема «двигайся ИЛИ атакуй» (Archero); авто-режим с ручным перехватом (Halls of Torment, Brawl Stars). Жанр «свайп = рывок-удар персонажа» существует, но задокументирован в выдаче слабо.

### Cited Findings
- Okami: время останавливается на всё время рисования; чернила — ограниченный, восполняемый ресурс, не дающий решать всё кистью. — [Wikipedia: Ōkami](https://en.wikipedia.org/wiki/%C5%8Ckami)
- Ōkamiden: вариант с лимитом времени на рисование вместо бесконечной паузы. — [Wikipedia: Ōkamiden](https://en.wikipedia.org/wiki/%C5%8Ckamiden)
- Slashy Hero: свайпы ограничены шкалой энергии; персонаж проносится по линии врагов. — [TouchArcade review](https://toucharcade.com/2015/11/12/slashy-hero-review)
- Archero: атака только в неподвижности, один палец; схема возникла случайно и стала отличительной чертой. — [Voodoo blog](https://blog.voodoo.io/articles/hybrid-casual); [App Store](https://apps.apple.com/kz/story/id1466746068)
- Severed: длина свайпа как выбор «быстро и слабо / долго и сильно». — [Gaming Trend](https://gamingtrend.com/feature/reviews/severed-review)
- Авто с ручным перехватом: Halls of Torment (переключатели auto-attack и auto-aim), Brawl Stars (тап = quick fire, drag = ручной прицел). — [Prima Games](https://primagames.com/tips/halls-of-torment-controls-guide-keyboard-and-controller); [App Store: Brawl Stars](https://apple.co/2T9Jmhl)
- Dash Quest — раннер с ударами по тапу (не swipe-to-dash); контролы названы отзывчивыми и вовлекающими, 4/5. — [TouchArcade, Dash Quest review](https://toucharcade.com/2015/10/28/dash-quest-review)
- Предостережение: жест, назначенный на тот же палец, что и движение, конфликтует с движением (тред про dash свайпом левого пальца). — [TouchArcade forum thread](https://toucharcade.com/community/threads/425316)

### Inferences
Варианты реструктуризации для Swipe Survivors, от наименьшего изменения к наибольшему (это синтез, не проверенные на игроках решения):
1. **Авто-клинок + свайп как усиление.** Слабая авто-атака держит базовую орду; свайп — заметно более сильный удар с шкалой энергии или перезарядкой (как чернила в Okami, энергия в Slashy Hero). Снимает утомляемость и сохраняет идентичность.
2. **Замедление времени при свайпе.** Касание правой зоны замедляет игру на короткое окно, ограниченное ресурсом; уменьшает цену окклюзии и ошибок распознавания форм. Риск — рваный темп, как у печатей Dawn of Sorrow, если окно длинное или обязательное.
3. **Двигайся ИЛИ режь (один палец).** Нет джойстика во время свайпа: персонаж стоит/продолжает движение по инерции, пока игрок режет. Даёт одноручную портретную игру и напряжение выбора, как в Archero.
4. **Свайп = рывок-удар.** Персонаж сам проносится вдоль линии свайпа; движение и атака объединены в один жест, палец работает рядом с героем, а не по всему экрану. Ближе всего к Slashy Hero.
5. **Свайп только для особых целей.** Авто-атака убивает базовых зомби; свайп нужен для элиты, щитов, снарядов, лута (петля). Частота жеста падает на порядок.
- Общий принцип из примеров: частоту обязательного жеста должен ограничивать дизайн (ресурс, кулдаун, редкие цели), а не выносливость игрока.

### Gaps
- Не найдено игр с bullet-time именно во время свайпа и данных об их приёме; Superhot-подобный «время идёт, когда двигаешься» в мобильных slash-играх не подтверждён.
- Не найдено рецензий на Ninja Tobu, Slash Quest, Samurai Blitz, Ronin: The Last Samurai, One Finger Death Punch, Ketchapp-игры со свайп-рывком; приём жанра swipe-dash оценён по двум-трём рецензиям TouchArcade 2012–2015 годов.
- Свежих (2023–2026) примеров хорд-игры с активным свайпом как основным действием в выдаче не найдено — либо их нет среди заметных, либо поиск их не достал; утверждать, что ниша пуста, нельзя.

## 5. Перенос свайп-механик на PC (мышь)

### Takeaway
Надёжных источников о том, что именно теряется при переносе свайпа на мышь, найти не удалось; известные факты касаются Kinect/VR-версий Fruit Ninja и того, что Severed остался привязан к тачскрину.

### Cited Findings
- Fruit Ninja Kinect: рецензенты хвалили ощущение от движения всем телом; Destructoid называл Kinect-версию лучшей версией игры. — [GamesRadar, Fruit Ninja Kinect review](https://www.gamesradar.com/fruit-ninja-kinect-review); [Destructoid](https://destructoid.com/?p=111487)
- Fruit Ninja VR (PS VR, 7/10): рецензент сомневается в надёжности распознавания взмаха — «сливу пропустили, потому что запястье было под неверным углом?». — [TheSixthAxis, Fruit Ninja VR review](https://thesixthaxis.com/2017/01/23/fruit-ninja-vr-review)
- Разработчик о портировании в VR: дизайн нужно формировать вокруг взаимодействий. — [GameAnalytics, Fruit Ninja dev talks porting to VR](https://www.gameanalytics.com/blog/fruit-ninja-dev-talks-porting-to-vr)
- Версии Fruit Ninja с мышью существуют (drag мышью режет фрукты), но найденные страницы — описания без оценки ощущений. — [itch.io, Fruit Ninja PC Edition (клон)](https://chintan-patel-games.itch.io/fruit-ninja-clone); [Windows Central, WP8/Windows 8 review](https://windowscentral.com/fruit-ninja-wp8-windows-8-review)
- Severed на Switch требует тачскрина (рецензия советует положить консоль на стол); критический отзыв отмечает полную зависимость боя от тача. — [Digitally Downloaded](https://www.digitallydownloaded.net/2017/08/review-severed-nintendo-switch.html); [Worthplaying](https://worthplaying.com/article/2016/5/3/reviews/99331-ps-vita-review-severed/)

### Inferences
- На PC исчезают две главные проблемы тача: окклюзии нет, а WASD + мышь — привычное разделение рук. Поэтому PC-версия Swipe Survivors, вероятно, комфортнее мобильной, и плейтесты на десктопе могут скрывать мобильные проблемы — тестировать утомляемость нужно на телефоне.
- Теряется прямая манипуляция («палец и есть клинок») и абсолютное позиционирование без зажатой кнопки. Зажатие кнопки мыши при каждом взмахе — отдельная нагрузка; вариант «клинок следует за курсором и режет при скорости выше порога, без клика» стоит проверить. Источниками это не подтверждено.

### Gaps
- Нет рецензий, сравнивающих ощущение разреза мышью и пальцем; нет данных о чувствительности/ускорении мыши и порогах скорости для мышиного свайпа.
- Не проверено, есть ли у Severed версии без тача (в выдаче — Vita, Switch, упоминание других платформ в интервью Gamereactor без деталей управления).

## 6. Доступность в играх с тяжёлой жестовой нагрузкой

### Takeaway
Все основные гайдлайны сходятся: жесты по траектории и одновременные действия не должны быть обязательными — нужна более простая альтернатива, плюс леворукий режим и настройка чувствительности.

### Cited Findings
- Xbox Accessibility Guidelines (XAG 107): для любого pinch/двухпальцевого жеста должна быть альтернатива тапом/кликом/долгим нажатием; не должно быть обязательных жестов по траектории (свайпы, рисование форм) без альтернатив. — [Xbox Accessibility Guidelines 107](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/107)
- Game Accessibility Guidelines: одновременные действия (например, click/drag или swipe) не должны требоваться — только как дополнительный/альтернативный способ ввода; все ключевые действия должны выполняться цифровым вводом, сложный ввод (аналог, жесты) — лишь дополнение. — [Game Accessibility Guidelines, intermediate](https://gameaccessibilityguidelines.com/intermediate/); [GAG, digital controls](https://gameaccessibilityguidelines.com/ensure-that-all-key-actions-can-be-carried-out-by-digital-controls-pads-keys-presses-with-more-complex-input-eg-analogue-gesture-not-required-and-included-only-as-supplementary-alternati)
- IGDA Game Accessibility SIG, Top Ten: дать выбор между виртуальным джойстиком и наклоном устройства или между тапами и жестами; настройка чувствительности, инверсия осей, леворукий/southpaw-режим. Список помечен как архивный. — [IGDA GA-SIG, Game Accessibility Top Ten](https://igda-gasig.org/how/game-accessibility-top-ten-se/)
- Equal Entry разбирала Vampire Survivors как одноручную игру с точки зрения игрока с инвалидностью. — [Equal Entry](https://equalentry.com/?p=174954)
- Brawl Stars дал игрокам перестановку контролов (апрель 2020). — [Supercell](https://supercell.com/en/games/brawlstars/blog/release-notes/optional-update-customizable-controls)

### Inferences
- Текущая схема (джойстик + непрерывный свайп + формы) нарушает сразу два пункта гайдлайнов: обязательные одновременные действия и обязательные жесты по траектории. Режим «авто-клинок» одновременно закрывает вопросы доступности, утомляемости и одноручной игры — это один и тот же переключатель.
- Минимальный набор для соло-разработчика: зеркалирование зон (джойстик справа), настраиваемая доля экрана под джойстик вместо жёстких 40%, настройка порога скорости свайпа, режим авто-атаки, альтернатива формам через удержание/тап.

### Gaps
- По reduced-motion применительно к следам клинка, тряске экрана и вспышкам в выдаче ничего конкретного не найдено.
- Нет данных о доле леворуких игроков или о том, как часто используются альтернативные схемы управления.
