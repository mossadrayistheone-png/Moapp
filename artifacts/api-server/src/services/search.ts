/**
 * Web search service.
 *
 * Priority:
 * 1. Serper.dev (if SERPER_API_KEY is set) — Google-quality results, 2500 free/month
 * 2. DuckDuckGo Instant Answers (free, no key, limited coverage)
 * 3. Graceful fallback message
 *
 * To enable Serper: add SERPER_API_KEY secret at serper.dev (free tier).
 */

interface SerperResult {
  title: string;
  snippet: string;
  link: string;
}

interface SerperResponse {
  organic?: SerperResult[];
  answerBox?: { answer?: string; snippet?: string; title?: string };
  knowledgeGraph?: { description?: string; title?: string };
}

interface DdgResponse {
  AbstractText?: string;
  AbstractSource?: string;
  RelatedTopics?: { Text?: string }[];
  Answer?: string;
  Definition?: string;
}

async function searchSerper(query: string): Promise<string> {
  const apiKey = process.env.SERPER_API_KEY!;
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Serper error ${res.status}`);

  const data: SerperResponse = await res.json();
  const parts: string[] = [];

  if (data.answerBox?.answer) {
    parts.push(data.answerBox.answer);
  } else if (data.answerBox?.snippet) {
    parts.push(data.answerBox.snippet);
  }

  if (data.knowledgeGraph?.description) {
    parts.push(data.knowledgeGraph.description);
  }

  if (data.organic?.length) {
    const snippets = data.organic
      .slice(0, 3)
      .map((r) => `${r.title}: ${r.snippet}`)
      .join(" | ");
    parts.push(snippets);
  }

  return parts.join(" ").trim() || "No results found.";
}

async function searchDuckDuckGo(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);
  const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mo-AI-Assistant/1.0" },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) throw new Error(`DDG error ${res.status}`);

  const data: DdgResponse = await res.json();
  const parts: string[] = [];

  if (data.Answer) parts.push(data.Answer);
  if (data.AbstractText) parts.push(data.AbstractText);
  if (data.Definition) parts.push(data.Definition);

  if (!parts.length && data.RelatedTopics?.length) {
    const topics = data.RelatedTopics
      .filter((t) => t.Text)
      .slice(0, 2)
      .map((t) => t.Text!);
    parts.push(...topics);
  }

  return parts.join(" ").trim();
}

export async function webSearch(query: string): Promise<string> {
  // 1. Try Serper if key is available
  if (process.env.SERPER_API_KEY) {
    try {
      const result = await searchSerper(query);
      if (result) return `[Web search results] ${result}`;
    } catch (err) {
      console.error("Serper search failed, falling back:", err);
    }
  }

  // 2. Try DuckDuckGo Instant Answers (free, no key)
  try {
    const result = await searchDuckDuckGo(query);
    if (result) return `[Search result] ${result}`;
  } catch (err) {
    console.error("DuckDuckGo search failed:", err);
  }

  // 3. Fallback — let GPT answer from training knowledge
  return `[No live search available] Answer from training knowledge: the query was "${query}". Note this information may not be current.`;
}
