// À ajouter dans SearchService
async getFacets(query: SearchQueryDto) {
  const where = this.buildWhereClause(query);
  
  const [categories, platforms, conditions, priceRange] = await Promise.all([
    this.prisma.listing.groupBy({
      by: ['category'],
      where,
      _count: true,
    }),
    this.prisma.listing.groupBy({
      by: ['platform'],
      where,
      _count: true,
    }),
    this.prisma.listing.groupBy({
      by: ['condition'],
      where,
      _count: true,
    }),
    this.prisma.listing.aggregate({
      where,
      _min: { price: true },
      _max: { price: true },
      _avg: { price: true },
    }),
  ]);

  return {
    categories: categories.map(c => ({
      name: c.category,
      count: c._count,
    })),
    platforms: platforms.map(p => ({
      name: p.platform,
      count: p._count,
    })),
    conditions: conditions.map(c => ({
      name: c.condition,
      count: c._count,
    })),
    priceRange: {
      min: priceRange._min.price || 0,
      max: priceRange._max.price || 1000,
      avg: priceRange._avg.price || 0,
    },
  };
}
