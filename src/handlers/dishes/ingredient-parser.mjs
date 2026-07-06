const UNICODE_FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

// Matches common cooking units — ordered longest-first to avoid partial matches
const UNIT_RE = /^(teaspoons?|tablespoons?|tbsps?|tsps?|cups?|kilograms?|kg|grams?|millilitres?|milliliters?|ml|litres?|liters?|ounces?|pounds?|lbs?|oz|cans?|tins?|bunches?|heads?|cloves?|slices?|pinch(?:es)?|dash(?:es)?|pieces?|sticks?|sprigs?|handfuls?|sheets?|rashers?|fillets?|g(?=\s|$)|l(?=\s|$))\b/i;

// Match leading quantity: integer, decimal, simple fraction, mixed fraction, or range
const QTY_RE = /^(\d+(?:\s+\d+\/\d+|\s*\/\s*\d+|\.\d+)?(?:\s*[-–]\s*\d+(?:\/\d+|\.\d+)?)?)\s*/;

// Lines like "Ingredients:", "Method", "Serves 4", "Prep time: 10 mins" are page furniture, not ingredients
const SECTION_HEADER_RE = /^(ingredients?|method|instructions?|directions?|steps?|notes?)\s*:?\s*$/i;
const SECTION_HEADER_WITH_VALUE_RE = /^(serves?|servings?|prep(?:aration)? time|cook(?:ing)? time|total time|yield)\s*:?\s*[\d].*$/i;

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function parseIngredient(raw) {
  // Decode HTML entities and normalise unicode fractions
  let s = decodeHtmlEntities(raw.trim());
  for (const [u, a] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.replaceAll(u, a + ' ');
  }
  s = s.trim();

  let quantity = null;
  let rest = s;

  const qtyMatch = s.match(QTY_RE);
  if (qtyMatch) {
    quantity = evalQuantity(qtyMatch[1].trim());
    rest = s.slice(qtyMatch[0].length).trim();
  }

  // Match unit
  let unit = '';
  const unitMatch = rest.match(UNIT_RE);
  if (unitMatch) {
    unit = unitMatch[0].trim();
    rest = rest.slice(unitMatch[0].length).trim();
  }

  // Clean ingredient name: strip parenthetical notes and descriptor clauses after comma
  let name = rest
    .replace(/\(.*?\)/g, '')
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) name = raw.replace(/,.*$/, '').trim();

  // Strip leading slash and any secondary quantity+unit that follows (e.g. "/ 1.6 lb", "/500g")
  name = name.replace(/^\/\s*(?:\d+(?:[,.]\d+)?\s*[a-z"']+\s+)?/i, '').trim();
  // Strip trailing unmatched closing brackets
  name = name.replace(/[\s)]+$/, '').trim();

  return { name, quantity, unit };
}

// Handle HowToIngredient objects (Schema.org v2)
function parseIngredientObject(obj) {
  const text = obj.name || obj.text || '';
  return parseIngredient(String(text));
}

function evalQuantity(s) {
  // Range like "2-3" — take first value
  const rangeMatch = s.match(/^(\d+(?:\/\d+|\.\d+)?)\s*[-–]/);
  if (rangeMatch) return evalSingle(rangeMatch[1]);

  // Mixed fraction like "2 1/2"
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const result = parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
    return Math.round(result * 1000) / 1000;
  }

  return evalSingle(s);
}

function evalSingle(s) {
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const result = parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
    return Math.round(result * 1000) / 1000;
  }
  const val = parseFloat(s);
  return isNaN(val) ? null : val;
}

// Heuristic for whether a raw OCR text line looks like an ingredient rather than
// a title, instruction sentence, or section header.
function looksLikeIngredientLine(rawLine) {
  const line = (rawLine || '').trim();
  if (!line || line.length > 120) return false;

  // Strip common OCR list-bullet/number prefixes before testing
  const stripped = line.replace(/^[•\-*▪◦]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
  if (!stripped || SECTION_HEADER_RE.test(stripped) || SECTION_HEADER_WITH_VALUE_RE.test(stripped)) return false;

  const parsed = parseIngredient(stripped);
  if (!parsed.name) return false;

  // Strong signal: a leading quantity or a recognised unit was detected
  if (parsed.quantity != null || parsed.unit) return true;

  // Weak fallback: short, punctuation-free phrase reads like a list item, not a sentence
  const wordCount = stripped.split(/\s+/).length;
  return wordCount <= 8 && !/[.!?](\s|$)/.test(stripped);
}

export {
  UNICODE_FRACTIONS,
  UNIT_RE,
  QTY_RE,
  decodeHtmlEntities,
  parseIngredient,
  parseIngredientObject,
  looksLikeIngredientLine,
};
