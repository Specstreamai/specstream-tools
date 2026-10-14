// Compile-only: `npm run typecheck` fails if the tools stop plugging into the AI SDK.
import { generateText, streamText, stepCountIs, ToolLoopAgent, type LanguageModel, type ToolSet } from "ai";
import { specstreamTools, SpecStreamClient, type FindListResult } from "../src/index.js";

declare const model: LanguageModel;

export async function check() {
  const tools = specstreamTools({ maxPriceUsd: 5 });
  const asSet: ToolSet = tools;

  await generateText({ model, tools: specstreamTools({ maxPriceUsd: 5 }), stopWhen: stepCountIs(5), prompt: "x" });
  await generateText({ model, tools: { ...asSet }, prompt: "x" });
  streamText({ model, tools, stopWhen: stepCountIs(5), prompt: "x" });
  new ToolLoopAgent({ model, tools });

  const result = await new SpecStreamClient({ apiKey: "k" }).findList("x", { maxResults: 5, maxPriceUsd: 5 });
  const typed: FindListResult = result;
  if (typed.status === "over_maximum") return typed.maximum_price_usd;
  // @ts-expect-error the cap is set in code, not by the model
  specstreamTools({});
  return undefined;
}
