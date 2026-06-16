import fs from 'fs';
import path from 'path';

async function generateStaticSitemap() {
  const baseUrl = 'https://gamemarket.tn';
  
  // Static pages
  const staticPages = [
    '/',
    '/search',
    '/login',
    '/register',
    '/wishlist',
    '/messages',
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const page of staticPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${baseUrl}${page}</loc>\n`;
    xml += `    <changefreq>${page === '/' ? 'daily' : 'weekly'}</changefreq>\n`;
    xml += `    <priority>${page === '/' ? '1.0' : '0.7'}</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += '</urlset>';

  const outputPath = path.join(process.cwd(), 'public', 'sitemap.xml');
  fs.writeFileSync(outputPath, xml);
  console.log(`✅ Sitemap generated at ${outputPath}`);
}

generateStaticSitemap().catch(console.error);