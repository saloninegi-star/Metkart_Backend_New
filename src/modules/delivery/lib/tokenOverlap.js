/**
 * Calculates normalized token overlap score between two names.
 * Returns a float between 0.0 and 1.0.
 * A score of 0.6 or higher is considered a match.
 *
 * @param {string} name1
 * @param {string} name2
 * @returns {number} Score from 0.0 to 1.0
 */
function calculateTokenOverlap(name1, name2) {
  if (!name1 || !name2) return 0.0;

  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const tokens1 = normalize(name1);
  const tokens2 = normalize(name2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let common = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      common += 1;
    }
  }

  // Sørensen–Dice coefficient over unique tokens
  const score = (2 * common) / (set1.size + set2.size);
  return Number(score.toFixed(4));
}

module.exports = {
  calculateTokenOverlap,
};
