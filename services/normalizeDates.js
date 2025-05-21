function normalizeDate(value) {
  const d = new Date(value);                       // Try to parse the input as a Date
  return isNaN(d) ? value : d.toISOString().split('T')[0];  // Return YYYY-MM-DD if valid
}

module.exports = normalizeDate;