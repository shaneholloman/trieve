//evals.ts

import { EvalConfig } from "mcp-evals";
import { openai } from "@ai-sdk/openai";
import { grade, EvalFunction } from "mcp-evals";

const searchEval: EvalFunction = {
  name: "search Tool Evaluation",
  description:
    "Evaluates the search tool by querying a dataset using semantic search, highlighting, and filtering options",
  run: async () => {
    const result = await grade(
      openai("gpt-4"),
      "Use the search tool with dataset ID 'medical-journals' to find articles about the impact of green tea on heart health using semantic search. Apply a score threshold of 0.75, highlight relevant content, and limit the results to 5 items on the first page.",
    );
    return JSON.parse(result);
  },
};

const config: EvalConfig = {
  model: openai("gpt-4"),
  evals: [searchEval, searchEval],
};

export default config;

export const evals = [searchEval, searchEval];
