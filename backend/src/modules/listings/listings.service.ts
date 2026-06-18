async findAll(query: ListingsQueryDto) {
  const {
    category,
    platform,
    condition,
    minPrice,
    maxPrice,
    search,
    status,
    userId,
    page = 1,
    limit = 20,
    sort,
  } = query;

  // 1. Construction sécurisée du WHERE
  const whereClause: any = {};
  whereClause.status = status || 'ACTIVE';

  // 2. Filtres simples (évite les chaînes vides)
  if (category && category.trim() !== '') whereClause.category = category;
  if (platform && platform.trim() !== '') whereClause.platform = platform;
  if (condition && condition.trim() !== '') whereClause.condition = condition;
  if (userId && userId.trim() !== '') whereClause.userId = userId;

  // 3. Filtres de prix (sécurisés)
  if (minPrice !== undefined || maxPrice !== undefined) {
    whereClause.price = {};
    if (minPrice !== undefined) whereClause.price.gte = minPrice;
    if (maxPrice !== undefined) whereClause.price.lte = maxPrice;
  }

  // 4. Recherche textuelle
  if (search && search.trim() !== '') {
    whereClause.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { description: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }

  // 5. Pagination
  const take = Number(limit) > 0 ? Number(limit) : 20;
  const skip = (Number(page) - 1) * take >= 0 ? (Number(page) - 1) * take : 0;

  // 6. Tri sécurisé (évite les erreurs de syntaxe Prisma)
  let orderBy: any = { createdAt: 'desc' };
  if (sort === 'price_asc') orderBy = { price: 'asc' };
  else if (sort === 'price_desc') orderBy = { price: 'desc' };
  else if (sort === 'popular') orderBy = { viewsCount: 'desc' };
  else if (sort === 'oldest') orderBy = { createdAt: 'asc' };

  try {
    // 7. Exécution atomique avec $transaction
    const [listings, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where: whereClause,
        skip,
        take,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              ratingAvg: true,
              isVerified: true,
            },
          },
          images: {
            where: { isCover: true },
            take: 1,
          },
        },
      }),
      this.prisma.listing.count({ where: whereClause }),
    ]);

    return {
      data: listings,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  } catch (error) {
    // 8. Log précis pour déboguer
    this.logger.error(`Prisma error in findAll: ${error.message}`, error.stack);
    throw new BadRequestException(`Database query error: ${error.message}`);
  }
}
