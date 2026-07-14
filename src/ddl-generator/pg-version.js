/**
 * @param {number} [pgVersion]
 * @returns {boolean}
 */
export function supportsPg18Features(pgVersion) {
  return (pgVersion || 15) >= 180000;
}

/**
 * @param {number} [pgVersion]
 * @returns {boolean}
 */
export function supportsPg15Features(pgVersion) {
  return (pgVersion || 15) >= 150000;
}
