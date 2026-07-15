/**
 * Budget — Garde anti-boucle infinie ET garde anti-cout.
 *
 * Plafonne le compute par tokens (prompt + completion) ET par iterations.
 * withinBudget() verifie AVANT chaque appel. charge() apres.
 * Inspire d'Atlas core/budget.ts, adapte au harnais.
 */

export interface Budget {
  maxIterations: number;
  maxPromptTokens: number;
  maxCompletionTokens: number;
  spentPrompt: number;
  spentCompletion: number;
  iterations: number;
}

export function makeBudget(
  maxIterations = 10,
  maxPrompt = 200_000,
  maxCompletion = 200_000
): Budget {
  return {
    maxIterations,
    maxPromptTokens: maxPrompt,
    maxCompletionTokens: maxCompletion,
    spentPrompt: 0,
    spentCompletion: 0,
    iterations: 0,
  };
}

/** Renvoie true si un appel de c tokens est encore dans le budget. */
export function withinBudget(b: Budget, prompt: number, completion: number): boolean {
  return (
    b.spentPrompt + prompt <= b.maxPromptTokens &&
    b.spentCompletion + completion <= b.maxCompletionTokens &&
    b.iterations < b.maxIterations
  );
}

/** Compte un appel dans le budget. */
export function charge(b: Budget, prompt: number, completion: number): void {
  b.spentPrompt += prompt;
  b.spentCompletion += completion;
  b.iterations++;
}

/** Reset le budget (debut d'un nouveau cycle cognitif). */
export function resetBudget(b: Budget): void {
  b.spentPrompt = 0;
  b.spentCompletion = 0;
  b.iterations = 0;
}

/** Resume lisible pour introspection. */
export function budgetSummary(b: Budget): string {
  return `Budget: ${b.iterations}/${b.maxIterations} iter, ${b.spentPrompt}/${b.maxPromptTokens} prompt tok, ${b.spentCompletion}/${b.maxCompletionTokens} completion tok`;
}