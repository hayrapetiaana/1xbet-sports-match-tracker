import { describeError, type SourceAdapter, type SourceTask } from "./model";

/**
 * Marathonbet, main site and the "old" live domain.
 *
 * Status: both domains answer this server with HTTP 451 ("unavailable for legal reasons"), a
 * jurisdiction restriction on the server's location. No pre-match data can be read from here.
 * This adapter probes both domains and reports the exact reason, so Marathonbet shows as
 * unavailable instead of silently returning nothing.
 */

const TARGETS = [
  { name: "www.marathonbet.com", url: "https://www.marathonbet.com/en/" },
  { name: "old.marathonbet.com", url: "https://old.marathonbet.com/su/live/popular" },
];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probeTarget(target: { name: string; url: string }): Promise<{ name: string; status: number }> {
  let response: Response;
  try {
    response = await fetch(target.url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`${target.name} is unreachable: ${describeError(error)}`);
  }
  await response.text();
  return { name: target.name, status: response.status };
}

async function probe(): Promise<never> {
  const results: { name: string; status: number }[] = [];
  for (const target of TARGETS) {
    results.push(await probeTarget(target));
  }

  const blockedLegally = results.filter((result) => result.status === 451);
  if (blockedLegally.length === results.length) {
    const details = results.map((result) => `${result.name} HTTP ${result.status}`).join(", ");
    throw new Error(`Marathonbet is unavailable for legal reasons from this server (${details})`);
  }

  const details = results.map((result) => `${result.name} HTTP ${result.status}`).join(", ");
  throw new Error(`Marathonbet is reachable (${details}), but the Marathonbet parser is not implemented yet`);
}

export const marathonAdapter: SourceAdapter = {
  id: "marathon",
  concurrency: 1,
  createTasks: async (): Promise<SourceTask[]> => {
    await probe();
    return [];
  },
};
