/**
 * Verhoeff algorithm implementation for 12-digit Aadhaar number validation.
 */

// The multiplication table
const d = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// The permutation table
const p = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// The inverse table
const inv = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates whether the given string passes the Verhoeff checksum.
 * @param {string} str - Decimal string
 * @returns {boolean}
 */
function validateVerhoeff(str) {
  if (typeof str !== "string" || !/^\d+$/.test(str)) {
    return false;
  }
  let c = 0;
  const reversedArray = str.split("").reverse().map(Number);
  for (let i = 0; i < reversedArray.length; i++) {
    c = d[c][p[i % 8][reversedArray[i]]];
  }
  return c === 0;
}

/**
 * Generates the Verhoeff check digit for a string.
 * @param {string} str - Decimal string without check digit
 * @returns {number}
 */
function generateVerhoeff(str) {
  let c = 0;
  const reversedArray = str.split("").reverse().map(Number);
  for (let i = 0; i < reversedArray.length; i++) {
    c = d[c][p[(i + 1) % 8][reversedArray[i]]];
  }
  return inv[c];
}

module.exports = {
  validateVerhoeff,
  generateVerhoeff,
};
