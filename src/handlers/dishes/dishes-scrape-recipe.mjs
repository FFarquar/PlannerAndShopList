import { parseIngredient, parseIngredientObject } from './ingredient-parser.mjs';

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
