/**
 * Forest-of-Thought Prompts
 * @module agents/reasoning/forest-engine-prompts
 */

export const HYPOTHESIS_PROMPT = `You are analyzing a problem using Forest-of-Thought reasoning.
Given the problem, generate a creative hypothesis or approach to solve it.
Focus on a specific angle or methodology that could lead to a solution.

Problem: {problem}

{context}

Respond with a JSON object:
{
  "hypothesis": "Your hypothesis or approach (1-2 sentences)",
  "reasoning": "Brief explanation of why this approach might work",
  "confidence": 0.0-1.0
}`;

export const REASONING_STEP_PROMPT = `You are exploring a reasoning path in a Forest-of-Thought analysis.

Problem: {problem}
Current hypothesis: {hypothesis}
Current path: {path}
Depth: {depth}
{crossTreeContext}

Generate the next reasoning step. Consider:
- Does this path lead toward a solution?
- What evidence or logic supports or refutes this approach?
- Should we continue this line of reasoning or conclude?

Respond with a JSON object:
{
  "stepType": "inference" | "decomposition" | "synthesis" | "verification" | "conclusion",
  "content": "Your reasoning step content",
  "confidence": 0.0-1.0,
  "isConclusion": true | false,
  "conclusionContent": "If isConclusion is true, the final answer/solution"
}`;
