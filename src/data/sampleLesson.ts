import type { Annotation, Lesson, Paragraph, Sentence, Token } from '../types/lesson';
import lessonTimestamps from './lessonTimestamps.json';

// Раздел 22 ТЗ: полная разметка есть не у каждого слова — только у
// содержательных единиц (глаголы, конструкции, идиомы, ключевая грамматика).
// Остальные слова кликабельны и открывают fallback-состояние Bottom Sheet.

function word(id: string, sentenceId: string, text: string, annotationId?: string): Token {
  return { id, sentenceId, text, normalized: text.toLowerCase(), type: 'word', annotationId };
}

function punct(id: string, sentenceId: string, text: string): Token {
  return { id, sentenceId, text, normalized: text, type: 'punctuation' };
}

const s1: Sentence = {
  id: 's1',
  text: 'Claire arrivait à la gare Saint-Lazare quand il a commencé à pleuvoir.',
  tokens: [
    word('t1', 's1', 'Claire'),
    word('t2', 's1', 'arrivait', 'ann-arrivait'),
    word('t3', 's1', 'à'),
    word('t4', 's1', 'la'),
    word('t5', 's1', 'gare'),
    word('t6', 's1', 'Saint-Lazare'),
    word('t7', 's1', 'quand'),
    word('t8', 's1', 'il'),
    word('t9', 's1', 'a', 'ann-a-commence-1'),
    word('t10', 's1', 'commencé', 'ann-a-commence-1'),
    word('t11', 's1', 'à', 'ann-a-commence-1'),
    word('t12', 's1', 'pleuvoir', 'ann-pleuvoir'),
    punct('t13', 's1', '.'),
  ],
};

const s2: Sentence = {
  id: 's2',
  text: 'Elle avait besoin de quelques minutes pour trouver un café tranquille.',
  tokens: [
    word('t14', 's2', 'Elle'),
    word('t15', 's2', 'avait', 'ann-avoir-besoin'),
    word('t16', 's2', 'besoin', 'ann-avoir-besoin'),
    word('t17', 's2', 'de', 'ann-avoir-besoin'),
    word('t18', 's2', 'quelques'),
    word('t19', 's2', 'minutes'),
    word('t20', 's2', 'pour'),
    word('t21', 's2', 'trouver', 'ann-trouver'),
    word('t22', 's2', 'un'),
    word('t23', 's2', 'café'),
    word('t24', 's2', 'tranquille', 'ann-tranquille'),
    punct('t25', 's2', '.'),
  ],
};

const s3: Sentence = {
  id: 's3',
  text: "Elle s'est assise près de la fenêtre et elle a commandé un chocolat chaud.",
  tokens: [
    word('t26', 's3', 'Elle'),
    word('t27', 's3', "s'est", 'ann-sest-assise'),
    word('t28', 's3', 'assise', 'ann-sest-assise'),
    word('t29', 's3', 'près', 'ann-pres-de'),
    word('t30', 's3', 'de', 'ann-pres-de'),
    word('t31', 's3', 'la'),
    word('t32', 's3', 'fenêtre'),
    word('t33', 's3', 'et'),
    word('t34', 's3', 'elle'),
    word('t35', 's3', 'a', 'ann-a-commande'),
    word('t36', 's3', 'commandé', 'ann-a-commande'),
    word('t37', 's3', 'un'),
    word('t38', 's3', 'chocolat'),
    word('t39', 's3', 'chaud'),
    punct('t40', 's3', '.'),
  ],
};

const s4: Sentence = {
  id: 's4',
  text: 'Dehors, les gens marchaient vite sous leurs parapluies.',
  tokens: [
    word('t41', 's4', 'Dehors'),
    punct('t42', 's4', ','),
    word('t43', 's4', 'les'),
    word('t44', 's4', 'gens'),
    word('t45', 's4', 'marchaient', 'ann-marchaient'),
    word('t46', 's4', 'vite'),
    word('t47', 's4', 'sous'),
    word('t48', 's4', 'leurs'),
    word('t49', 's4', 'parapluies'),
    punct('t50', 's4', '.'),
  ],
};

const s5: Sentence = {
  id: 's5',
  text: 'Après la pluie, Claire a décidé de continuer sa promenade le long de la Seine.',
  tokens: [
    word('t51', 's5', 'Après'),
    word('t52', 's5', 'la'),
    word('t53', 's5', 'pluie'),
    punct('t54', 's5', ','),
    word('t55', 's5', 'Claire'),
    word('t56', 's5', 'a', 'ann-decide-de'),
    word('t57', 's5', 'décidé', 'ann-decide-de'),
    word('t58', 's5', 'de', 'ann-decide-de'),
    word('t59', 's5', 'continuer'),
    word('t60', 's5', 'sa'),
    word('t61', 's5', 'promenade'),
    word('t62', 's5', 'le', 'ann-le-long-de'),
    word('t63', 's5', 'long', 'ann-le-long-de'),
    word('t64', 's5', 'de', 'ann-le-long-de'),
    word('t65', 's5', 'la'),
    word('t66', 's5', 'Seine'),
    punct('t67', 's5', '.'),
  ],
};

const s6: Sentence = {
  id: 's6',
  text: 'Elle aimait beaucoup cette partie de la ville, surtout le soir.',
  tokens: [
    word('t68', 's6', 'Elle'),
    word('t69', 's6', 'aimait', 'ann-aimait'),
    word('t70', 's6', 'beaucoup'),
    word('t71', 's6', 'cette'),
    word('t72', 's6', 'partie'),
    word('t73', 's6', 'de'),
    word('t74', 's6', 'la'),
    word('t75', 's6', 'ville'),
    punct('t76', 's6', ','),
    word('t77', 's6', 'surtout'),
    word('t78', 's6', 'le'),
    word('t79', 's6', 'soir'),
    punct('t80', 's6', '.'),
  ],
};

const s7: Sentence = {
  id: 's7',
  text: "Soudain, elle a reconnu une amie d'enfance assise sur un banc.",
  tokens: [
    word('t81', 's7', 'Soudain', 'ann-soudain'),
    punct('t82', 's7', ','),
    word('t83', 's7', 'elle'),
    word('t84', 's7', 'a', 'ann-a-reconnu'),
    word('t85', 's7', 'reconnu', 'ann-a-reconnu'),
    word('t86', 's7', 'une'),
    word('t87', 's7', 'amie'),
    word('t88', 's7', "d'enfance"),
    word('t89', 's7', 'assise'),
    word('t90', 's7', 'sur'),
    word('t91', 's7', 'un'),
    word('t92', 's7', 'banc'),
    punct('t93', 's7', '.'),
  ],
};

const s8: Sentence = {
  id: 's8',
  text: 'Les deux femmes se sont mises à parler pendant longtemps, sans remarquer le temps qui passait.',
  tokens: [
    word('t94', 's8', 'Les'),
    word('t95', 's8', 'deux'),
    word('t96', 's8', 'femmes'),
    word('t97', 's8', 'se', 'ann-se-sont-mises'),
    word('t98', 's8', 'sont', 'ann-se-sont-mises'),
    word('t99', 's8', 'mises', 'ann-se-sont-mises'),
    word('t100', 's8', 'à', 'ann-se-sont-mises'),
    word('t101', 's8', 'parler'),
    word('t102', 's8', 'pendant'),
    word('t103', 's8', 'longtemps'),
    punct('t104', 's8', ','),
    word('t105', 's8', 'sans', 'ann-sans'),
    word('t106', 's8', 'remarquer'),
    word('t107', 's8', 'le'),
    word('t108', 's8', 'temps'),
    word('t109', 's8', 'qui'),
    word('t110', 's8', 'passait', 'ann-passait'),
    punct('t111', 's8', '.'),
  ],
};

const s9: Sentence = {
  id: 's9',
  text: "Quand le soleil a commencé à se coucher, Claire a compris qu'elle devait rentrer.",
  tokens: [
    word('t112', 's9', 'Quand'),
    word('t113', 's9', 'le'),
    word('t114', 's9', 'soleil'),
    word('t115', 's9', 'a', 'ann-a-commence-2'),
    word('t116', 's9', 'commencé', 'ann-a-commence-2'),
    word('t117', 's9', 'à', 'ann-a-commence-2'),
    word('t118', 's9', 'se', 'ann-se-coucher'),
    word('t119', 's9', 'coucher', 'ann-se-coucher'),
    punct('t120', 's9', ','),
    word('t121', 's9', 'Claire'),
    word('t122', 's9', 'a', 'ann-a-compris'),
    word('t123', 's9', 'compris', 'ann-a-compris'),
    word('t124', 's9', "qu'elle"),
    word('t125', 's9', 'devait', 'ann-devait'),
    word('t126', 's9', 'rentrer'),
    punct('t127', 's9', '.'),
  ],
};

const s10: Sentence = {
  id: 's10',
  text: 'Elle est repartie vers le métro, le cœur léger et heureuse de cette rencontre inattendue.',
  tokens: [
    word('t128', 's10', 'Elle'),
    word('t129', 's10', 'est', 'ann-est-repartie'),
    word('t130', 's10', 'repartie', 'ann-est-repartie'),
    word('t131', 's10', 'vers'),
    word('t132', 's10', 'le'),
    word('t133', 's10', 'métro'),
    punct('t134', 's10', ','),
    word('t135', 's10', 'le', 'ann-coeur-leger'),
    word('t136', 's10', 'cœur', 'ann-coeur-leger'),
    word('t137', 's10', 'léger', 'ann-coeur-leger'),
    word('t138', 's10', 'et'),
    word('t139', 's10', 'heureuse', 'ann-heureuse-de'),
    word('t140', 's10', 'de', 'ann-heureuse-de'),
    word('t141', 's10', 'cette'),
    word('t142', 's10', 'rencontre'),
    word('t143', 's10', 'inattendue', 'ann-inattendue'),
    punct('t144', 's10', '.'),
  ],
};

const annotations: Annotation[] = [
  {
    id: 'ann-arrivait',
    type: 'word',
    tokenIds: ['t2'],
    displayText: 'arrivait',
    lemma: 'arriver',
    pronunciation: '/a.ʁi.vɛ/',
    partOfSpeech: 'verb',
    grammarLabel: 'imparfait, 3 л. ед.ч.',
    shortTranslation: 'приезжала / прибывала',
    contextualMeaning:
      'Клэр была в процессе прибытия на вокзал — imparfait передаёт длящееся действие на фоне другого события (дождь).',
    grammarSummary: 'Форма глагола arriver в imparfait, 3-е лицо единственного числа.',
    examples: [
      { targetText: "Le train arrivait à l'heure.", translation: 'Поезд прибывал вовремя.' },
      { targetText: 'Nous arrivions bientôt.', translation: 'Мы вот-вот должны были приехать.' },
    ],
  },
  {
    id: 'ann-a-commence-1',
    type: 'phrase',
    tokenIds: ['t9', 't10', 't11'],
    displayText: 'a commencé à',
    lemma: 'commencer à + infinitif',
    partOfSpeech: 'verb construction',
    grammarLabel: 'passé composé, 3 л. ед.ч.',
    shortTranslation: 'начал(ось)…',
    contextualMeaning:
      'Дождь начался, пока Клэр шла по вокзалу — конкретное, законченное событие, поэтому passé composé, а не imparfait.',
    constructionExplanation:
      'commencer à + infinitif означает «начать делать что-то». После этой конструкции всегда следует предлог à, а не de.',
    grammarSummary: 'a commencé — форма commencer в passé composé (avoir + причастие прошедшего времени).',
    grammarDetails:
      'Passé composé используется для конкретного, завершённого события на фоне общего описания (imparfait). Здесь дождь «начался» в какой-то момент — это отдельное событие, а не фон.',
    otherMeanings: [{ translation: 'приступить к чему-либо' }],
    examples: [
      { targetText: 'Il a commencé à pleurer.', translation: 'Он начал плакать.' },
      { targetText: 'Elle a commencé à comprendre.', translation: 'Она начала понимать.' },
    ],
  },
  {
    id: 'ann-pleuvoir',
    type: 'word',
    tokenIds: ['t12'],
    displayText: 'pleuvoir',
    lemma: 'pleuvoir',
    partOfSpeech: 'verb (impersonal)',
    grammarLabel: 'infinitif',
    shortTranslation: 'идти (о дожде)',
    contextualMeaning:
      'Глагол pleuvoir используется только в безличной форме — «дождь идёт», буквально «оно дождит» (il pleut).',
    grammarSummary: 'Безличный глагол: употребляется только с местоимением il, без указания на реального деятеля.',
    grammarDetails:
      'Такие глаголы (pleuvoir, neiger, falloir) описывают явления природы или необходимость и не имеют других форм лица.',
    examples: [
      { targetText: 'Il pleut à Paris.', translation: 'В Париже идёт дождь.' },
      { targetText: 'Il a plu toute la nuit.', translation: 'Всю ночь шёл дождь.' },
    ],
  },
  {
    id: 'ann-avoir-besoin',
    type: 'phrase',
    tokenIds: ['t15', 't16', 't17'],
    displayText: 'avait besoin de',
    lemma: 'avoir besoin de',
    pronunciation: '/a.vwaʁ bə.zwɛ̃ d(ə)/',
    partOfSpeech: 'fixed expression',
    grammarLabel: 'imparfait, 3 л. ед.ч.',
    shortTranslation: 'нуждался в / ему было нужно',
    contextualMeaning:
      'Клэр говорит, что ей понадобилось немного времени, чтобы найти спокойное кафе — не физическая нужда, а «требовалось, было нужно».',
    constructionExplanation:
      'avoir besoin de + сущ. означает «нуждаться в чём-либо». Предлог de — обязательная часть выражения, без него конструкция не работает.',
    grammarSummary:
      'avait — форма avoir в imparfait: описывает состояние в прошлом, а не отдельное завершённое действие.',
    grammarDetails:
      'Imparfait используется для фона, состояний и повторяющихся действий в прошлом — в отличие от passé composé, который описывает законченное событие. Здесь потребность в кафе — фоновое состояние Клэр, а не разовое событие, поэтому passé composé («a eu besoin») звучал бы менее естественно. Частая ошибка: путать avoir besoin de с avoir envie de («хотеть») — смысл ощутимо разный.',
    otherMeanings: [{ translation: 'испытывать потребность в чём-либо' }],
    examples: [
      { targetText: "J'ai besoin de repos.", translation: 'Мне нужен отдых.' },
      { targetText: "Elle avait besoin d'aide.", translation: 'Ей была нужна помощь.' },
    ],
  },
  {
    id: 'ann-trouver',
    type: 'word',
    tokenIds: ['t21'],
    displayText: 'trouver',
    lemma: 'trouver',
    partOfSpeech: 'verb',
    grammarLabel: 'infinitif после pour',
    shortTranslation: 'найти',
    contextualMeaning:
      'Клэр искала кафе — «pour trouver» значит «для того чтобы найти», указывает на цель действия.',
    constructionExplanation: 'pour + infinitif выражает цель: «для того чтобы сделать что-то».',
    grammarSummary: 'После pour глагол всегда стоит в инфинитиве, а не спрягается.',
    examples: [
      { targetText: "Elle travaille pour gagner de l'argent.", translation: 'Она работает, чтобы зарабатывать деньги.' },
      { targetText: 'Il lit pour apprendre.', translation: 'Он читает, чтобы учиться.' },
    ],
  },
  {
    id: 'ann-tranquille',
    type: 'word',
    tokenIds: ['t24'],
    displayText: 'tranquille',
    lemma: 'tranquille',
    partOfSpeech: 'adjective',
    grammarLabel: 'м./ж. род одинаковый',
    shortTranslation: 'тихий, спокойный',
    contextualMeaning: 'Описывает кафе, которое искала Клэр — тихое, спокойное место.',
    grammarSummary: 'Прилагательное tranquille имеет одинаковую форму для мужского и женского рода (оканчивается на -e).',
    grammarDetails: 'В отличие от многих прилагательных, tranquille не меняется по родам: un café tranquille, une rue tranquille.',
    examples: [
      { targetText: 'Il est un quartier tranquille.', translation: 'Это тихий квартал.' },
      { targetText: 'La mer était tranquille.', translation: 'Море было спокойным.' },
    ],
  },
  {
    id: 'ann-sest-assise',
    type: 'phrase',
    tokenIds: ['t27', 't28'],
    displayText: "s'est assise",
    lemma: "s'asseoir",
    partOfSpeech: 'verb (pronominal)',
    grammarLabel: 'passé composé, ж.р. ед.ч.',
    shortTranslation: 'села',
    contextualMeaning: 'Клэр села у окна — законченное разовое действие, поэтому passé composé.',
    constructionExplanation:
      "s'asseoir — возвратный глагол, в passé composé спрягается с être, а причастие согласуется в роде и числе с подлежащим.",
    grammarSummary: 'assise — причастие asseoir с окончанием женского рода -e, потому что подлежащее elle женского рода.',
    grammarDetails:
      'Все возвратные глаголы в passé composé используют вспомогательный глагол être, а не avoir. Причастие при этом согласуется с подлежащим: il s\'est assis, elle s\'est assise.',
    examples: [
      { targetText: "Il s'est assis à côté de moi.", translation: 'Он сел рядом со мной.' },
      { targetText: 'Nous nous sommes assises au fond de la salle.', translation: 'Мы сели в конце зала.' },
    ],
  },
  {
    id: 'ann-pres-de',
    type: 'phrase',
    tokenIds: ['t29', 't30'],
    displayText: 'près de',
    lemma: 'près de',
    partOfSpeech: 'preposition',
    grammarLabel: 'составной предлог',
    shortTranslation: 'около, рядом с',
    contextualMeaning: 'Указывает, где именно села Клэр — рядом с окном.',
    constructionExplanation: 'près de всегда употребляется с предлогом de перед существительным.',
    grammarSummary: 'Составной предлог: près + de, вместе означает «рядом с», «около».',
    examples: [
      { targetText: "J'habite près de la gare.", translation: 'Я живу рядом с вокзалом.' },
      { targetText: "Elle s'est assise près de lui.", translation: 'Она села рядом с ним.' },
    ],
  },
  {
    id: 'ann-a-commande',
    type: 'phrase',
    tokenIds: ['t35', 't36'],
    displayText: 'a commandé',
    lemma: 'commander',
    partOfSpeech: 'verb',
    grammarLabel: 'passé composé, 3 л. ед.ч.',
    shortTranslation: 'заказала',
    contextualMeaning: 'Клэр заказала горячий шоколад — конкретное завершённое действие.',
    grammarSummary: 'a commandé — форма commander в passé composé (avoir + причастие commandé).',
    examples: [
      { targetText: 'Il a commandé une salade.', translation: 'Он заказал салат.' },
      { targetText: 'Nous avons commandé du café.', translation: 'Мы заказали кофе.' },
    ],
  },
  {
    id: 'ann-marchaient',
    type: 'word',
    tokenIds: ['t45'],
    displayText: 'marchaient',
    lemma: 'marcher',
    partOfSpeech: 'verb',
    grammarLabel: 'imparfait, 3 л. мн.ч.',
    shortTranslation: 'шли, ходили',
    contextualMeaning:
      'Описывает фоновую сцену — люди шли по улице под дождём, пока Клэр сидела в кафе.',
    grammarSummary: 'Imparfait здесь описывает длящуюся картину на фоне, а не отдельное событие.',
    examples: [
      { targetText: 'Les enfants marchaient dans le parc.', translation: 'Дети гуляли в парке.' },
      { targetText: 'Elle marchait lentement.', translation: 'Она шла медленно.' },
    ],
  },
  {
    id: 'ann-decide-de',
    type: 'phrase',
    tokenIds: ['t56', 't57', 't58'],
    displayText: 'a décidé de',
    lemma: 'décider de + infinitif',
    partOfSpeech: 'verb construction',
    grammarLabel: 'passé composé, 3 л. ед.ч.',
    shortTranslation: 'решила',
    contextualMeaning: 'После дождя Клэр приняла решение продолжить прогулку.',
    constructionExplanation:
      'décider de + infinitif — «решить сделать что-то». В отличие от commencer à, здесь используется предлог de.',
    grammarSummary: 'a décidé — passé composé от décider, конкретное решение, принятое в определённый момент.',
    grammarDetails:
      'Полезно сравнить: commencer à (начать) требует à, а décider de (решить) требует de — это нужно просто запомнить для каждого глагола отдельно.',
    examples: [
      { targetText: 'Il a décidé de partir.', translation: 'Он решил уехать.' },
      { targetText: "Elle a décidé d'apprendre le français.", translation: 'Она решила выучить французский.' },
    ],
  },
  {
    id: 'ann-le-long-de',
    type: 'phrase',
    tokenIds: ['t62', 't63', 't64'],
    displayText: 'le long de',
    lemma: 'le long de',
    partOfSpeech: 'preposition',
    grammarLabel: 'составной предлог',
    shortTranslation: 'вдоль',
    contextualMeaning: 'Клэр пошла вдоль реки Сены.',
    constructionExplanation: 'le long de + существительное — устойчивое выражение «вдоль чего-либо».',
    examples: [
      { targetText: 'Ils se promenaient le long de la plage.', translation: 'Они гуляли вдоль пляжа.' },
      { targetText: 'La route longe la rivière.', translation: 'Дорога идёт вдоль реки (родственный глагол longer).' },
    ],
  },
  {
    id: 'ann-aimait',
    type: 'word',
    tokenIds: ['t69'],
    displayText: 'aimait',
    lemma: 'aimer',
    partOfSpeech: 'verb',
    grammarLabel: 'imparfait, 3 л. ед.ч.',
    shortTranslation: 'любила',
    contextualMeaning:
      'Описывает постоянное чувство Клэр к этой части города — не разовое действие, а длительное отношение.',
    grammarSummary: 'Глаголы чувств и состояний (aimer, vouloir, savoir) в прошедшем времени почти всегда стоят в imparfait.',
    grammarDetails:
      'Imparfait — стандартное время для описания чувств, мнений и состояний в прошлом, поскольку они не имеют чёткой точки начала или конца.',
    examples: [
      { targetText: 'Elle aimait lire le soir.', translation: 'Она любила читать по вечерам.' },
      { targetText: 'Il aimait cette chanson.', translation: 'Ему нравилась эта песня.' },
    ],
  },
  {
    id: 'ann-a-reconnu',
    type: 'phrase',
    tokenIds: ['t84', 't85'],
    displayText: 'a reconnu',
    lemma: 'reconnaître',
    partOfSpeech: 'verb (irregular)',
    grammarLabel: 'passé composé, 3 л. ед.ч.',
    shortTranslation: 'узнала',
    contextualMeaning: 'Клэр вдруг узнала подругу детства на скамейке.',
    grammarSummary: 'reconnu — неправильное причастие прошедшего времени глагола reconnaître.',
    grammarDetails:
      'reconnaître спрягается как connaître (je reconnais, tu reconnais…), а причастие прошедшего времени — reconnu, без закономерного окончания по общему правилу.',
    examples: [
      { targetText: "Je ne t'ai pas reconnu tout de suite.", translation: 'Я не сразу тебя узнал.' },
      { targetText: 'Elle a reconnu sa voix.', translation: 'Она узнала его голос.' },
    ],
  },
  {
    id: 'ann-soudain',
    type: 'word',
    tokenIds: ['t81'],
    displayText: 'Soudain',
    lemma: 'soudain',
    partOfSpeech: 'adverb',
    grammarLabel: 'наречие',
    shortTranslation: 'вдруг, внезапно',
    contextualMeaning: 'Отмечает неожиданный поворот в рассказе — Клэр внезапно видит подругу.',
    grammarSummary:
      'Наречия вроде soudain, tout à coup обычно предвещают passé composé — они вводят конкретное, внезапное событие.',
    examples: [
      { targetText: "Soudain, il s'est arrêté.", translation: 'Вдруг он остановился.' },
      { targetText: "Tout à coup, la lumière s'est éteinte.", translation: 'Внезапно свет погас.' },
    ],
  },
  {
    id: 'ann-se-sont-mises',
    type: 'phrase',
    tokenIds: ['t97', 't98', 't99', 't100'],
    displayText: 'se sont mises à',
    lemma: 'se mettre à + infinitif',
    partOfSpeech: 'verb (pronominal)',
    grammarLabel: 'passé composé, мн.ч. ж.р.',
    shortTranslation: 'начали (делать что-то)',
    contextualMeaning:
      'Подруги начали разговаривать — se mettre à здесь синоним commencer à, но более разговорный и живой.',
    constructionExplanation:
      'se mettre à + infinitif — «взяться за что-то», «начать что-то делать». Возвратный глагол, поэтому вспомогательный — être.',
    grammarSummary: 'mises — причастие согласовано в женском роде множественного числа (les deux femmes).',
    grammarDetails:
      'se mettre à часто используется вместо commencer à, когда действие начинается резко или с воодушевлением. Оба варианта верны, но se mettre à звучит чуть живее.',
    examples: [
      { targetText: 'Il s\'est mis à pleurer.', translation: 'Он расплакался (начал плакать).' },
      { targetText: 'Elles se sont mises à rire.', translation: 'Они рассмеялись (начали смеяться).' },
    ],
  },
  {
    id: 'ann-sans',
    type: 'word',
    tokenIds: ['t105'],
    displayText: 'sans',
    lemma: 'sans',
    partOfSpeech: 'preposition',
    grammarLabel: 'sans + infinitif',
    shortTranslation: 'без; не делая чего-то',
    contextualMeaning:
      'sans remarquer — «не замечая»: подруги проговорили долго, не заметив, как прошло время.',
    constructionExplanation: 'sans + infinitif переводится как деепричастие с «не»: sans remarquer = «не замечая».',
    grammarSummary: 'В отличие от pour и de, после sans инфинитив используется без дополнительного предлога.',
    examples: [
      { targetText: 'Il est parti sans dire au revoir.', translation: 'Он ушёл, не попрощавшись.' },
      { targetText: 'Elle travaille sans se plaindre.', translation: 'Она работает, не жалуясь.' },
    ],
  },
  {
    id: 'ann-passait',
    type: 'word',
    tokenIds: ['t110'],
    displayText: 'passait',
    lemma: 'passer',
    partOfSpeech: 'verb',
    grammarLabel: 'imparfait, 3 л. ед.ч.',
    shortTranslation: 'проходило (о времени)',
    contextualMeaning:
      '«le temps qui passait» — время, которое проходило, пока они разговаривали; фоновое, длящееся действие.',
    grammarSummary: 'Imparfait передаёт ощущение течения времени на фоне разговора подруг.',
    examples: [
      { targetText: 'Le temps passait vite.', translation: 'Время шло быстро.' },
      { targetText: 'Les jours passaient sans nouvelles.', translation: 'Дни проходили без новостей.' },
    ],
  },
  {
    id: 'ann-a-commence-2',
    type: 'phrase',
    tokenIds: ['t115', 't116', 't117'],
    displayText: 'a commencé à',
    lemma: 'commencer à + infinitif',
    partOfSpeech: 'verb construction',
    grammarLabel: 'passé composé, 3 л. ед.ч.',
    shortTranslation: 'начало (о солнце)',
    contextualMeaning:
      'Та же конструкция, что и в начале текста («a commencé à pleuvoir») — теперь солнце «начало садиться».',
    constructionExplanation: 'commencer à + infinitif снова требует предлога à перед следующим глаголом (здесь — se coucher).',
    grammarSummary: 'Passé composé, потому что закат отмечает конкретный момент в развитии истории.',
    examples: [
      { targetText: "Le ciel a commencé à s'assombrir.", translation: 'Небо начало темнеть.' },
      { targetText: 'Ils ont commencé à courir.', translation: 'Они начали бежать.' },
    ],
  },
  {
    id: 'ann-se-coucher',
    type: 'phrase',
    tokenIds: ['t118', 't119'],
    displayText: 'se coucher',
    lemma: 'se coucher',
    partOfSpeech: 'verb (pronominal)',
    grammarLabel: 'infinitif',
    shortTranslation: 'садиться (о солнце) / ложиться спать',
    contextualMeaning:
      'Здесь se coucher относится к солнцу — «садиться, заходить». Тот же глагол обычно означает «ложиться спать» для людей.',
    otherMeanings: [{ translation: 'ложиться спать', note: 'когда подлежащее — человек' }],
    grammarSummary:
      'Возвратный глагол se coucher меняет оттенок значения в зависимости от подлежащего: le soleil se couche (солнце садится) / je me couche (я ложусь спать).',
    examples: [
      { targetText: 'Le soleil se couche tôt en hiver.', translation: 'Зимой солнце садится рано.' },
      { targetText: 'Je me couche à minuit.', translation: 'Я ложусь спать в полночь.' },
    ],
  },
  {
    id: 'ann-a-compris',
    type: 'phrase',
    tokenIds: ['t122', 't123'],
    displayText: 'a compris',
    lemma: 'comprendre',
    partOfSpeech: 'verb (irregular)',
    grammarLabel: 'passé composé, 3 л. ед.ч.',
    shortTranslation: 'поняла',
    contextualMeaning: 'Увидев закат, Клэр поняла, что пора возвращаться домой.',
    grammarSummary: 'compris — неправильное причастие прошедшего времени глагола comprendre.',
    grammarDetails: 'comprendre спрягается как prendre (je comprends, tu comprends…), а причастие — compris, как у prendre → pris.',
    examples: [
      { targetText: "Je n'ai pas compris la question.", translation: 'Я не понял вопрос.' },
      { targetText: 'Ils ont vite compris la situation.', translation: 'Они быстро поняли ситуацию.' },
    ],
  },
  {
    id: 'ann-devait',
    type: 'word',
    tokenIds: ['t125'],
    displayText: 'devait',
    lemma: 'devoir',
    partOfSpeech: 'verb (modal)',
    grammarLabel: 'imparfait, 3 л. ед.ч.',
    shortTranslation: 'должна была',
    contextualMeaning:
      'devait rentrer — «должна была вернуться домой»: обязанность, осознанная в тот момент, но описанная как фоновое состояние.',
    grammarSummary: 'devoir в imparfait часто передаёт долженствование или предположение в прошлом.',
    grammarDetails:
      'devoir — модальный глагол: в imparfait (devait) он описывает то, что было нужно/следовало сделать, в отличие от passé composé (a dû), который подчёркивает завершённость самой обязанности.',
    examples: [
      { targetText: 'Il devait travailler ce jour-là.', translation: 'В тот день он должен был работать.' },
      { targetText: 'Nous devions partir tôt.', translation: 'Нам нужно было уехать рано.' },
    ],
  },
  {
    id: 'ann-est-repartie',
    type: 'phrase',
    tokenIds: ['t129', 't130'],
    displayText: 'est repartie',
    lemma: 'repartir',
    partOfSpeech: 'verb (movement)',
    grammarLabel: 'passé composé, ж.р. ед.ч.',
    shortTranslation: 'снова отправилась, ушла',
    contextualMeaning: 'Клэр отправилась обратно к метро.',
    constructionExplanation:
      'repartir — глагол движения, поэтому в passé composé используется être, а причастие согласуется в роде: repartie (ж.р.), потому что подлежащее — elle.',
    grammarSummary: 'Глаголы движения (aller, partir, repartir, venir…) спрягаются с être в passé composé.',
    examples: [
      { targetText: 'Il est reparti chez lui.', translation: 'Он снова уехал домой.' },
      { targetText: 'Elles sont reparties tôt.', translation: 'Они рано уехали обратно.' },
    ],
  },
  {
    id: 'ann-coeur-leger',
    type: 'phrase',
    tokenIds: ['t135', 't136', 't137'],
    displayText: 'le cœur léger',
    lemma: 'avoir le cœur léger',
    partOfSpeech: 'idiom',
    grammarLabel: 'устойчивое выражение',
    shortTranslation: 'с лёгким сердцем',
    contextualMeaning:
      'Идиома описывает состояние Клэр — она уходила довольная и спокойная после приятной встречи.',
    constructionExplanation: 'le cœur léger используется как наречное выражение без предлога: partir le cœur léger — «уйти с лёгким сердцем».',
    grammarSummary: 'Устойчивое выражение, не переводится дословно слово в слово.',
    examples: [
      { targetText: 'Il est parti le cœur léger.', translation: 'Он ушёл с лёгким сердцем.' },
      { targetText: "Elle a le cœur lourd aujourd'hui.", translation: 'У неё сегодня тяжело на сердце (антоним).' },
    ],
  },
  {
    id: 'ann-heureuse-de',
    type: 'phrase',
    tokenIds: ['t139', 't140'],
    displayText: 'heureuse de',
    lemma: 'heureux / heureuse de',
    partOfSpeech: 'adjective construction',
    grammarLabel: 'ж.р. ед.ч. + de',
    shortTranslation: 'довольная, счастливая (чем-то)',
    contextualMeaning: 'Клэр была рада этой неожиданной встрече с подругой.',
    constructionExplanation: 'heureux/heureuse de + существительное или infinitif — «рад(а) чему-то / сделать что-то».',
    grammarSummary: 'heureuse — форма женского рода прилагательного heureux, согласуется с elle (Claire).',
    examples: [
      { targetText: 'Je suis heureuse de te voir.', translation: 'Я рада тебя видеть.' },
      { targetText: 'Il est heureux de ce résultat.', translation: 'Он доволен этим результатом.' },
    ],
  },
  {
    id: 'ann-inattendue',
    type: 'word',
    tokenIds: ['t143'],
    displayText: 'inattendue',
    lemma: 'inattendu',
    partOfSpeech: 'adjective',
    grammarLabel: 'ж.р. ед.ч.',
    shortTranslation: 'неожиданная',
    contextualMeaning: 'Описывает встречу (rencontre) — она была неожиданной для Клэр.',
    grammarSummary: 'inattendue — форма женского рода прилагательного inattendu, согласуется с rencontre (ж.р.).',
    grammarDetails:
      'Прилагательное образовано отрицательной приставкой in- + attendu (ожидаемый, причастие от attendre). Женский род образуется добавлением -e: inattendu → inattendue.',
    examples: [
      { targetText: 'une visite inattendue', translation: 'неожиданный визит' },
      { targetText: 'Le résultat était inattendu.', translation: 'Результат был неожиданным (м.р.).' },
    ],
  },
];

// Таймкоды слов (src/data/lessonTimestamps.json) генерируются отдельным
// скриптом (scripts/generate-lesson-audio.ts) по озвучке в public/audio/ —
// не хранятся в самой разметке урока, чтобы переозвучка не требовала
// переписывать текст/аннотации руками.
const timestampsById = lessonTimestamps as Record<string, { startTime: number; endTime: number }>;

function withTimestamps(paragraphs: Paragraph[]): Paragraph[] {
  return paragraphs.map((paragraph) => ({
    ...paragraph,
    sentences: paragraph.sentences.map((sentence) => ({
      ...sentence,
      tokens: sentence.tokens.map((token) => {
        const timing = timestampsById[token.id];
        return timing ? { ...token, startTime: timing.startTime, endTime: timing.endTime } : token;
      }),
    })),
  }));
}

export const sampleLesson: Lesson = {
  id: 'une-promenade-a-paris',
  language: 'French',
  sourceLanguage: 'Russian',
  level: 'A2–B1',
  title: 'Une promenade à Paris',
  translatedTitle: 'Прогулка по Парижу',
  estimatedMinutes: 4,
  paragraphs: withTimestamps([
    { id: 'p1', sentences: [s1, s2] },
    { id: 'p2', sentences: [s3, s4] },
    { id: 'p3', sentences: [s5, s6] },
    { id: 'p4', sentences: [s7, s8] },
    { id: 'p5', sentences: [s9, s10] },
  ]),
  annotations,
};
