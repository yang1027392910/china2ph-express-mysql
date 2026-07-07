const express = require('express');
const sitemapService = require('../services/sitemapService');

const router = express.Router();

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const xml = await sitemapService.generateSitemapXml();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (error) {
    console.error('Failed to generate sitemap:', error);
    res.status(500).send('Failed to generate sitemap');
  }
});

router.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(`User-agent: *
Allow: /
Sitemap: ${sitemapService.SITE_URL}/sitemap.xml
`);
});

module.exports = router;
