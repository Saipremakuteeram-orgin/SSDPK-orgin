module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  const result = {};

  if (supabaseUrl && supabaseAnonKey) {
    result.SUPABASE_URL = supabaseUrl;
    result.SUPABASE_ANON_KEY = supabaseAnonKey;
  }

  if (geminiApiKey) {
    result.GEMINI_API_KEY = geminiApiKey;
  }

  const hasKeys = Object.keys(result).length > 0;
  if (!hasKeys) {
    return res.status(500).json({ error: 'No API keys (SUPABASE or GEMINI) configured on server' });
  }

  return res.status(200).json(result);
};
