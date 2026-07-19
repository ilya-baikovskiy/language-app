import type { Annotation, Lesson, Sentence, Token } from '../types/lesson';

// Placeholder content for Этап 1 (static UI). Full text + full annotation
// coverage for every content word arrives in Этап 4 — this only proves the
// data shape against real components, mirrors the approved HTML mockup.

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
    word('t9', 's1', 'a'),
    word('t10', 's1', 'commencé'),
    word('t11', 's1', 'à'),
    word('t12', 's1', 'pleuvoir'),
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
    word('t21', 's2', 'trouver'),
    word('t22', 's2', 'un'),
    word('t23', 's2', 'café'),
    word('t24', 's2', 'tranquille'),
    punct('t25', 's2', '.'),
  ],
};

const s3: Sentence = {
  id: 's3',
  text: "Elle s'est assise près de la fenêtre et elle a commandé un chocolat chaud.",
  tokens: [
    word('t26', 's3', 'Elle'),
    word('t27', 's3', "s'est"),
    word('t28', 's3', 'assise'),
    word('t29', 's3', 'près'),
    word('t30', 's3', 'de'),
    word('t31', 's3', 'la'),
    word('t32', 's3', 'fenêtre'),
    word('t33', 's3', 'et'),
    word('t34', 's3', 'elle'),
    word('t35', 's3', 'a'),
    word('t36', 's3', 'commandé'),
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
    word('t45', 's4', 'marchaient'),
    word('t46', 's4', 'vite'),
    word('t47', 's4', 'sous'),
    word('t48', 's4', 'leurs'),
    word('t49', 's4', 'parapluies'),
    punct('t50', 's4', '.'),
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
  },
  {
    id: 'ann-avoir-besoin',
    type: 'phrase',
    tokenIds: ['t15', 't16', 't17'],
    displayText: 'avait besoin de',
    lemma: 'avoir besoin de',
    pronunciation: '/a.vwa bə.zwɛ̃ d(ə)/',
    partOfSpeech: 'fixed expression',
    grammarLabel: 'imparfait, 3 л. ед.ч.',
    shortTranslation: 'нуждался в… / ему было нужно…',
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
];

export const sampleLesson: Lesson = {
  id: 'une-promenade-a-paris',
  language: 'French',
  sourceLanguage: 'Russian',
  level: 'A2–B1',
  title: 'Une promenade à Paris',
  translatedTitle: 'Прогулка по Парижу',
  estimatedMinutes: 4,
  paragraphs: [
    { id: 'p1', sentences: [s1, s2] },
    { id: 'p2', sentences: [s3, s4] },
  ],
  annotations,
};
