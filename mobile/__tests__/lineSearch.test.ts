import type { LineRoute } from '../src/data/models';
import type { StrideApi } from '../src/data/strideApi';
import { plusDays, today } from '../src/data/time';
import { TransitRepository } from '../src/data/transitRepository';

// A weekend: Stride's newest feed is two days old, so neither today's nor yesterday's has the line.
const latest = plusDays(today(), -2);
const route = { date: latest, routeShortName: '480', operatorRef: 3, mkt: '10480', gtfsRouteId: 1, lineRef: 10958, mode: 'BUS' } as unknown as LineRoute;
const asked: string[] = [];
const stride = {
  searchRoutes: async (_q: string, date: string) => (asked.push(date), date === latest ? [route] : []),
  routesByLineRef: async (_r: number[], date: string) => (date === latest ? [route] : []),
  latestDate: async () => latest,
} as unknown as StrideApi;
const repo = new TransitRepository(null as never, undefined, undefined, stride);

test("finds lines on Stride's newest feed when today's and yesterday's are missing", async () => {
  const lines = await repo.searchLines('480', null);
  expect(lines.map((l) => l.routes[0].date)).toEqual([latest]);
  expect(asked).toEqual([today(), plusDays(today(), -1), latest]);
  expect(await repo.lineRoute('il-Israel-MOT_10958')).toBe(route);
});
