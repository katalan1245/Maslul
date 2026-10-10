/** Http.get tells a timeout from a lost connection, since Expo's fetch reports both alike. */
import { Http } from '../src/data/http';

const fetchMock = global.fetch as jest.Mock;
afterEach(() => jest.useRealTimers());

test('a request that takes too long fails as a timeout', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementationOnce(
    (_url: string, { signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('fetch failed: Fetch request has been canceled')))),
  );
  const got = Http.get('https://example.org').catch((e: Error) => e);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(((await got) as Error).name).toBe('AbortError');
});

test('a lost connection fails as a network error', async () => {
  fetchMock.mockRejectedValueOnce(new Error('fetch failed: Unable to resolve host'));
  const e = await Http.get('https://example.org').catch((x: Error) => x);
  expect(e).toBeInstanceOf(TypeError);
  expect((e as Error).message).toMatch(/network/i);
});
