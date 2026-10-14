import { generateText, stepCountIs } from "ai";
import { specstreamTools, SpecStreamClient } from "../src/index.js";

export async function readme() {
  const { text } = await generateText({
    model: "openai/gpt-5-mini",
    tools: specstreamTools({ maxPriceUsd: 5 }),
    stopWhen: stepCountIs(5),
    prompt: "x",
  });
  const client = new SpecStreamClient({ apiKey: process.env.SPECSTREAM_API_KEY });
  const list = await client.findList("Breweries", { maxResults: 25, maxPriceUsd: 3 });
  if ("rows" in list) console.log(list.row_count, list.rows[0].source_url);
  else console.log(list.message);
  return text;
}
