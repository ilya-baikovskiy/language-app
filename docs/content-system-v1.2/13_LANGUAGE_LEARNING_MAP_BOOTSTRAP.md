# Bootstrap скрытых учебных карт по языкам

## 1. Назначение

Этот документ не является готовой лингвистической программой. Он задаёт структуру,
с которой Claude может создать seed `LearningNode` records и затем уточнять их.

Каждый язык должен иметь собственные grammar nodes. Communicative/lexical nodes
могут иметь общие semantic codes, но отдельные language-specific implementations.

## 2. Общая обязательная база A0–A2

### Communicative

- introduce_self;
- ask_basic_information;
- family_and_people;
- work_and_study;
- daily_routine;
- time_and_dates;
- food_and_cafe;
- shopping;
- housing;
- city_and_directions;
- transport;
- travel;
- health_and_pharmacy;
- request_and_help;
- problem_and_resolution;
- plans_and_invitation;
- describe_past_event;
- express_simple_opinion.

### Lexical

- people;
- family;
- home;
- food;
- city;
- movement;
- time;
- weather;
- body_health;
- work;
- learning;
- emotions;
- nature;
- travel;
- quantities;
- common_adjectives.

### Discourse

- simple_dialogue;
- chronological_story;
- place_description;
- person_description;
- cause_effect_basic;
- comparison_basic;
- opinion_basic.

## 3. German bootstrap

### A0–A1 grammar priorities

- personal pronouns;
- `sein`, `haben`;
- regular present tense;
- common irregular present forms;
- W-questions and yes/no questions;
- verb-second word order;
- negation `nicht/kein`;
- nominative/accusative basics;
- modal verbs in frequent chunks;
- separable verbs in simple clauses;
- time expressions;
- `es gibt`;
- basic perfect for past events later in A1.

### A2 direction

- Perfekt breadth;
- dative basics;
- subordinate clauses with common conjunctions;
- comparisons;
- reflexive verbs;
- two-way prepositions in practical contexts;
- narrative sequencing.

## 4. French bootstrap

### A0–A1 grammar priorities

- subject pronouns;
- `être`, `avoir`, `aller`, `faire`;
- present tense frequent verbs;
- articles and gender;
- negation;
- questions;
- `il y a`;
- `c'est/ce sont`;
- adjective position basics;
- near future;
- common object/pronominal chunks;
- polite request constructions.

### A2 direction

- passé composé;
- imparfait contrast in controlled contexts;
- pronoun references;
- partitive articles;
- comparisons;
- cause/consequence;
- relative `qui/que/où`;
- common reflexive and idiomatic constructions.

## 5. Greek bootstrap

### A2 → B1 focus

- present/aorist/imperfect contrast;
- future with `θα`;
- aspect choice in frequent verbs;
- accusative articles/nouns;
- clitic pronouns;
- reflexive/mediopassive frequent forms;
- cause and result connectors;
- temporal sequencing;
- comparison;
- expressing opinion;
- subordinate clauses;
- common participial/adjectival forms where relevant;
- practical noun/verb morphology.

Content domains:

- Greece and islands;
- culture and history;
- daily life;
- travel;
- work;
- social situations;
- simple public issues;
- older Cyprus history, not current Cyprus fiction dominance.

## 6. English bootstrap

Not a linear A1 curriculum.

### Natural-input nodes

- phrasal verbs by semantic family;
- irregular verb forms in narrative;
- collocations;
- reporting verbs;
- stance markers;
- cause/effect academic links;
- contrast/concession;
- hedging;
- noun phrases;
- common idioms with transparent context;
- register differences;
- multiword verbs;
- topic-specific vocabulary breadth.

### Domain breadth

- AI/technology;
- product/design;
- linguistics;
- society;
- science;
- economics;
- history;
- culture;
- health general (non-medical advice);
- cities/architecture;
- travel.

## 7. Seed format

```json
{
  "language": "de",
  "category": "grammar",
  "code": "de.grammar.verb_second",
  "title": "Глагол на второй позиции",
  "introducedAt": "A1",
  "expectedComfortAt": "A2",
  "mandatoryWeight": 0.9,
  "defaultPriority": 0.8,
  "prerequisites": [],
  "relatedNodeCodes": ["de.grammar.questions"]
}
```

## 8. Требование к seed

Первый seed должен быть небольшим и проверяемым:

- 25–50 nodes на язык;
- не пытаться сразу кодировать всю грамматику;
- каждый node должен реально использоваться карточками;
- не создавать сверхмелкие узлы без достаточного evidence;
- version seed data.

## Cross-language content ideas

Learning map применяется после выбора active language. Одна canonical идея может иметь разные passports и difficulty constraints для Greek, German, French и English. Не переносить evidence между языками только потому, что subject одинаковый.
