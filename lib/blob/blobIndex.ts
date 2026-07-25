// Общий кэш-бастинг для чтения lessons/index.json (см. api/lessons.ts,
// api/lesson-status.ts, api/save-lesson.ts).
//
// Индекс — один JSON-файл по фиксированному пути (allowOverwrite: true,
// addRandomSuffix: false), который каждый эндпоинт читает целиком, меняет и
// перезаписывает целиком. При таком паттерне URL блоба не меняется между
// перезаписями, а Vercel Blob может какое-то время отдавать закешированную
// по этому URL версию — значит readIndex() в одном запросе способен увидеть
// устаревший снимок индекса и, записав его обратно с одной своей правкой,
// молча откатить прогресс, сделанный ДРУГИМ, не связанным запросом между
// снимком кэша и этим моментом (реальный кейс: 'ready'-урок откатился в
// 'creating', потому что чужой readIndex() в это время читал старую копию).
//
// blobs[0].uploadedAt меняется на каждую реальную перезапись — добавляем его
// в query как cache-buster, чтобы получить byte-for-byte актуальный ответ,
// а не полагаться на то, что кэш когда-нибудь сам протухнет.
export async function fetchIndexBlobFresh(blob: { url: string; uploadedAt: Date }): Promise<Response> {
  const bustUrl = `${blob.url}${blob.url.includes('?') ? '&' : '?'}t=${blob.uploadedAt.getTime()}`;
  return fetch(bustUrl, { cache: 'no-store' });
}
