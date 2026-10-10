export function editDistance(reference: string, hypothesis: string): number {
  const previousRow = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);

  for (let referenceIndex = 1; referenceIndex <= reference.length; referenceIndex += 1) {
    let diagonal = previousRow[0];
    previousRow[0] = referenceIndex;

    for (let hypothesisIndex = 1; hypothesisIndex <= hypothesis.length; hypothesisIndex += 1) {
      const previousValue = previousRow[hypothesisIndex];
      const substitutionCost = reference[referenceIndex - 1] === hypothesis[hypothesisIndex - 1] ? 0 : 1;
      previousRow[hypothesisIndex] = Math.min(
        previousRow[hypothesisIndex] + 1,
        previousRow[hypothesisIndex - 1] + 1,
        diagonal + substitutionCost,
      );
      diagonal = previousValue;
    }
  }

  return previousRow[hypothesis.length];
}

export function characterErrorRate(reference: string, hypothesis: string): number {
  if (reference.length === 0) return hypothesis.length === 0 ? 0 : hypothesis.length;
  return editDistance(reference, hypothesis) / reference.length;
}