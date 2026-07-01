const UNICODE_FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

// Matches common cooking units — ordered longest-first to avoid partial matches
const UNIT_RE = /^(teaspoons?|tablespoons?|tbsps?|tsps?|cups?|kilograms?|kg|grams?|millilitres?|milliliters?|ml|litres?|liters?|ounces?|pounds?|lbs?|oz|cans?|tins?|bunches?|heads?|cloves?|slices?|pinch(?:es)?|dash(?:es)?|pieces?|sticks?|sprigs?|handfuls?|sheets?|rashers?|fillets?|g(?=\s|$)|l(?=\s|$))\b/i;

export const handler = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ message: 'url query parameter is required' }) };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Invalid protocol');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid URL provided' }) };
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeScraper/1.0; +https://github.com/FFarquar)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        statusCode: 422,
        body: JSON.stringify({ message: `Could not fetch the page (HTTP ${res.status}). Please add ingredients manually.` }),
      };
    }

    const html = await res.text();
    const recipe = extractRecipeSchema(html);

    if (!recipe || !Array.isArray(recipe.recipeIngredient) || recipe.recipeIngredient.length === 0) {
      return {
        statusCode: 422,
        body: JSON.stringify({ message: 'No ingredient data found on this page. This site may not support automatic extraction — please add ingredients manually.' }),
      };
    }

    const ingredients = recipe.recipeIngredient
      .map(ing => (typeof ing === 'string' ? parseIngredient(ing) : parseIngredientObject(ing)))
      .filter(ing => ing.name);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients }),
    };
  } catch (err) {
    console.error('Scrape error:', err);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { statusCode: 422, body: JSON.stringify({ message: 'Page took too long to load. Please add ingredients manually.' }) };
    }
    return { statusCode: 422, body: JSON.stringify({ message: 'Could not extract ingredients from this page. Please add ingredients manually.' }) };
  }
};

function extractRecipeSchema(html) {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { blocks.push(JSON.parse(m[1])); } catch {}
  }
  return findRecipe(blocks);
}

function findRecipe(nodes) {
  if (!nodes) return null;
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      const found = findRecipe(n);
      if (found) return found;
    }
    return null;
  }
  const type = nodes['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return nodes;
  if (nodes['@graph']) return findRecipe(nodes['@graph']);
  return null;
}

// Handle HowToIngredient objects (Schema.org v2)
function parseIngredientObject(obj) {
  const text = obj.name || obj.text || '';
  return parseIngredient(String(text));
}

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

  // Match leading quantity: integer, decimal, simple fraction, mixed fraction, or range
  const QTY_RE = /^(\d+(?:\s+\d+\/\d+|\s*\/\s*\d+|\.\d+)?(?:\s*[-–]\s*\d+(?:\/\d+|\.\d+)?)?)\s*/;
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
