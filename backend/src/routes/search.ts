import { Router, Request, Response } from 'express';
import { orchestrateSearch } from '../services/orchestrator';

export const searchRouter = Router();

searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    console.log(`\n🔍 Search: "${query}"`);
    if (context) console.log(`   Context: ${context.title} (${context.domain})`);

    const results = await orchestrateSearch(query, context);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});
