import type { Lesson, Paragraph, Sentence, Token } from '../types/lesson';
import lessonTimestamps from './lessonTimestamps.json';

// Раздел 22 ТЗ (историческая нумерация) — теперь каждое слово кликабельно
// само по себе и объясняется лениво через /api/generate-annotation (см.
// AI_PIPELINE.md, «Bottom Sheet v2»): у sample-урока больше нет заранее
// подготовленных аннотаций (ни ручных, ни сгенерированных заранее в
// generatedAnnotations.json) — он идёт по тому же ленивому пути, что и любой
// сгенерированный урок. Единственное отличие — озвучка урока остаётся
// статичной (lessonTimestamps.json), это не связано с объяснениями слов.

function word(id: string, sentenceId: string, text: string): Token {
  return { id, sentenceId, text, normalized: text.toLowerCase(), type: 'word' };
}

function punct(id: string, sentenceId: string, text: string): Token {
  return { id, sentenceId, text, normalized: text, type: 'punctuation' };
}

const s1: Sentence = {
  id: 's1',
  text: 'Claire arrivait à la gare Saint-Lazare quand il a commencé à pleuvoir.',
  translation: 'Клэр подъезжала к вокзалу Сен-Лазар, когда начался дождь.',
  tokens: [
    word('t1', 's1', 'Claire'),
    word('t2', 's1', 'arrivait'),
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
  translation: 'Ей нужно было несколько минут, чтобы найти тихое кафе.',
  tokens: [
    word('t14', 's2', 'Elle'),
    word('t15', 's2', 'avait'),
    word('t16', 's2', 'besoin'),
    word('t17', 's2', 'de'),
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
  translation: 'Она села у окна и заказала горячий шоколад.',
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
  translation: 'Снаружи люди быстро шли под зонтами.',
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

const s5: Sentence = {
  id: 's5',
  text: 'Après la pluie, Claire a décidé de continuer sa promenade le long de la Seine.',
  translation: 'После дождя Клэр решила продолжить прогулку вдоль Сены.',
  tokens: [
    word('t51', 's5', 'Après'),
    word('t52', 's5', 'la'),
    word('t53', 's5', 'pluie'),
    punct('t54', 's5', ','),
    word('t55', 's5', 'Claire'),
    word('t56', 's5', 'a'),
    word('t57', 's5', 'décidé'),
    word('t58', 's5', 'de'),
    word('t59', 's5', 'continuer'),
    word('t60', 's5', 'sa'),
    word('t61', 's5', 'promenade'),
    word('t62', 's5', 'le'),
    word('t63', 's5', 'long'),
    word('t64', 's5', 'de'),
    word('t65', 's5', 'la'),
    word('t66', 's5', 'Seine'),
    punct('t67', 's5', '.'),
  ],
};

const s6: Sentence = {
  id: 's6',
  text: 'Elle aimait beaucoup cette partie de la ville, surtout le soir.',
  translation: 'Она очень любила эту часть города, особенно вечером.',
  tokens: [
    word('t68', 's6', 'Elle'),
    word('t69', 's6', 'aimait'),
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
  translation: 'Вдруг она узнала подругу детства, сидевшую на скамейке.',
  tokens: [
    word('t81', 's7', 'Soudain'),
    punct('t82', 's7', ','),
    word('t83', 's7', 'elle'),
    word('t84', 's7', 'a'),
    word('t85', 's7', 'reconnu'),
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
  translation: 'Обе женщины принялись болтать надолго, не замечая, как идёт время.',
  tokens: [
    word('t94', 's8', 'Les'),
    word('t95', 's8', 'deux'),
    word('t96', 's8', 'femmes'),
    word('t97', 's8', 'se'),
    word('t98', 's8', 'sont'),
    word('t99', 's8', 'mises'),
    word('t100', 's8', 'à'),
    word('t101', 's8', 'parler'),
    word('t102', 's8', 'pendant'),
    word('t103', 's8', 'longtemps'),
    punct('t104', 's8', ','),
    word('t105', 's8', 'sans'),
    word('t106', 's8', 'remarquer'),
    word('t107', 's8', 'le'),
    word('t108', 's8', 'temps'),
    word('t109', 's8', 'qui'),
    word('t110', 's8', 'passait'),
    punct('t111', 's8', '.'),
  ],
};

const s9: Sentence = {
  id: 's9',
  text: "Quand le soleil a commencé à se coucher, Claire a compris qu'elle devait rentrer.",
  translation: 'Когда солнце начало садиться, Клэр поняла, что ей пора возвращаться.',
  tokens: [
    word('t112', 's9', 'Quand'),
    word('t113', 's9', 'le'),
    word('t114', 's9', 'soleil'),
    word('t115', 's9', 'a'),
    word('t116', 's9', 'commencé'),
    word('t117', 's9', 'à'),
    word('t118', 's9', 'se'),
    word('t119', 's9', 'coucher'),
    punct('t120', 's9', ','),
    word('t121', 's9', 'Claire'),
    word('t122', 's9', 'a'),
    word('t123', 's9', 'compris'),
    word('t124', 's9', "qu'elle"),
    word('t125', 's9', 'devait'),
    word('t126', 's9', 'rentrer'),
    punct('t127', 's9', '.'),
  ],
};

const s10: Sentence = {
  id: 's10',
  text: 'Elle est repartie vers le métro, le cœur léger et heureuse de cette rencontre inattendue.',
  translation: 'Она отправилась обратно к метро, с лёгким сердцем и радуясь этой неожиданной встрече.',
  tokens: [
    word('t128', 's10', 'Elle'),
    word('t129', 's10', 'est'),
    word('t130', 's10', 'repartie'),
    word('t131', 's10', 'vers'),
    word('t132', 's10', 'le'),
    word('t133', 's10', 'métro'),
    punct('t134', 's10', ','),
    word('t135', 's10', 'le'),
    word('t136', 's10', 'cœur'),
    word('t137', 's10', 'léger'),
    word('t138', 's10', 'et'),
    word('t139', 's10', 'heureuse'),
    word('t140', 's10', 'de'),
    word('t141', 's10', 'cette'),
    word('t142', 's10', 'rencontre'),
    word('t143', 's10', 'inattendue'),
    punct('t144', 's10', '.'),
  ],
};


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

const paragraphs: Paragraph[] = [
  { id: 'p1', sentences: [s1, s2] },
  { id: 'p2', sentences: [s3, s4] },
  { id: 'p3', sentences: [s5, s6] },
  { id: 'p4', sentences: [s7, s8] },
  { id: 'p5', sentences: [s9, s10] },
];

export const sampleLesson: Lesson = {
  id: 'une-promenade-a-paris',
  language: 'French',
  sourceLanguage: 'Russian',
  level: 'A2–B1',
  title: 'Une promenade à Paris',
  translatedTitle: 'Прогулка по Парижу',
  estimatedMinutes: 4,
  paragraphs: withTimestamps(paragraphs),
  annotations: [],
};
