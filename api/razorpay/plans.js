const { cors } = require('./_lib.js');

const PURPOSES = [
  { id: 'annadana', amount: 101, labelKey: 'seva.purposeAnnadana' },
  { id: 'homam', amount: 1101, labelKey: 'seva.purposeHomam' },
  { id: 'veda', amount: 501, labelKey: 'seva.purposeVeda' },
  { id: 'grocery', amount: 251, labelKey: 'seva.purposeGrocery' }
];

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ purposes: PURPOSES });
};