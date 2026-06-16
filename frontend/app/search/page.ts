'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MetaTags } from '@/components/seo/MetaTags';
import { useSeo } from '@/hooks/useSeo';
import { ListingGrid } from '@/components/listing/ListingGrid';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import {
  SlidersHorizontal,
  X,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchFilters {
  category?: string;
  platform?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  location?: string;
  city?: string;
  minRating?: number;
  isNegotiable?: boolean;
  acceptsSwap?: boolean;
}

const CATEGORIES = ['GAME', 'CONSOLE', 'ACCESSORY', 'COLLECTIBLE', 'MERCH'];
const PLATFORMS = ['PS5', 'PS4', 'SWITCH', 'XBOX', 'PC', 'MOBILE', 'RETRO'];
const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'USED', 'FAIR', 'REFURBISHED'];
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Pertinence' },
  { value: 'newest', label: 'Plus récentes' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'popular', label: 'Plus populaires' },
  { value: 'rating', label: 'Mieux notées' },
];

// Loading component for Suspense
function SearchPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-200 rounded mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-gray-200 rounded-lg h-64" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Main component
function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';

  const [filters, setFilters] = useState<SearchFilters>({
    sort: 'relevance',
  });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    category: true,
    platform: true,
    condition: true,
    price: true,
    options: false,
  });

  // ==========================================
  // LOAD FILTERS FROM URL
  // ==========================================

  useEffect(() => {
    const newFilters: SearchFilters = {};
    
    searchParams.forEach((value, key) => {
      if (key === 'q') return;
      
      switch (key) {
        case 'category':
        case 'platform':
        case 'condition':
        case 'sort':
        case 'location':
        case 'city':
          newFilters[key as keyof SearchFilters] = value;
          break;
        case 'minPrice':
        case 'maxPrice':
        case 'minRating':
          newFilters[key as keyof SearchFilters] = parseFloat(value);
          break;
        case 'isNegotiable':
        case 'acceptsSwap':
          newFilters[key as keyof SearchFilters] = value === 'true';
          break;
      }
    });

    setFilters(newFilters);
  }, [searchParams]);

  // ==========================================
  // SEO DATA
  // ==========================================

  const searchPath = query 
    ? `/search?q=${encodeURIComponent(query)}` 
    : '/search';
  
  const { seoData, loading: seoLoading } = useSeo(searchPath, { q: query });

  // ==========================================
  // SEARCH QUERY
  // ==========================================

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', query, filters, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
      
      params.append('page', String(page));
      params.append('limit', '20');

      const res = await api.get(`/search?${params}`);
      return res.data;
    },
    enabled: true,
    staleTime: 30000,
    keepPreviousData: true,
  });

  // ==========================================
  // UPDATE FILTERS
  // ==========================================

  const updateFilters = (newFilters: Partial<SearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
    
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    
    Object.entries({ ...filters, ...newFilters }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    
    router.push(`/search?${params.toString()}`, { scroll: false });
  };

  // ==========================================
  // CLEAR FILTERS
  // ==========================================

  const clearFilters = () => {
    const newFilters: SearchFilters = { sort: 'relevance' };
    setFilters(newFilters);
    setPage(1);
    router.push(`/search?q=${query}`, { scroll: false });
  };

  // ==========================================
  // TOGGLE SECTION
  // ==========================================

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // ==========================================
  // HAS FILTERS
  // ==========================================

  const hasFilters = Object.keys(filters).some(
    (key) => filters[key as keyof SearchFilters] !== undefined &&
             filters[key as keyof SearchFilters] !== '' &&
             key !== 'sort'
  );

  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof SearchFilters] !== undefined &&
             filters[key as keyof SearchFilters] !== '' &&
             key !== 'sort'
  ).length;

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <>
      <MetaTags
        title={seoData?.title || (query ? `Recherche "${query}" - GameMarket` : 'Recherche - GameMarket')}
        description={seoData?.description || (query 
          ? `Résultats de recherche pour "${query}" sur GameMarket. Trouvez les meilleurs jeux vidéo, consoles et accessoires en Tunisie.` 
          : 'Recherchez des jeux vidéo, consoles et accessoires sur GameMarket. La plus grande marketplace gaming de Tunisie.')
        }
        image={seoData?.image || '/og-image.jpg'}
        url={searchPath}
        type="website"
        jsonLd={seoData?.jsonLd}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {query ? `Résultats pour "${query}"` : 'Tous les jeux'}
            </h1>
            <p className="text-sm text-gray-500">
              {data?.meta?.total || 0} annonce{data?.meta?.total > 1 ? 's' : ''} trouvée{data?.meta?.total > 1 ? 's' : ''}
              {activeFilterCount > 0 && ` · ${activeFilterCount} filtre${activeFilterCount > 1 ? 's' : ''} actif${activeFilterCount > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2 flex-1 sm:flex-none"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtres
              {hasFilters && (
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
              )}
            </Button>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 text-gray-500 flex-1 sm:flex-none"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Effacer</span>
              </Button>
            )}
          </div>
        </div>

        {/* Active Filters Tags */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.category && (
              <Badge variant="secondary" className="gap-1">
                {filters.category}
                <button
                  onClick={() => updateFilters({ category: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.platform && (
              <Badge variant="secondary" className="gap-1">
                {filters.platform}
                <button
                  onClick={() => updateFilters({ platform: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.condition && (
              <Badge variant="secondary" className="gap-1">
                {filters.condition}
                <button
                  onClick={() => updateFilters({ condition: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.minPrice !== undefined && filters.minPrice > 0 && (
              <Badge variant="secondary" className="gap-1">
                ≥ {filters.minPrice} DT
                <button
                  onClick={() => updateFilters({ minPrice: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.maxPrice !== undefined && filters.maxPrice > 0 && (
              <Badge variant="secondary" className="gap-1">
                ≤ {filters.maxPrice} DT
                <button
                  onClick={() => updateFilters({ maxPrice: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.isNegotiable && (
              <Badge variant="secondary" className="gap-1">
                Négociable
                <button
                  onClick={() => updateFilters({ isNegotiable: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {filters.acceptsSwap && (
              <Badge variant="secondary" className="gap-1">
                Troc
                <button
                  onClick={() => updateFilters({ acceptsSwap: undefined })}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Category Section */}
              <div>
                <button
                  onClick={() => toggleSection('category')}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                >
                  Catégorie
                  {expandedSections.category ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.category && (
                  <div className="space-y-1">
                    {CATEGORIES.map((cat) => (
                      <label key={cat} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="category"
                          value={cat}
                          checked={filters.category === cat}
                          onChange={() => updateFilters({ 
                            category: filters.category === cat ? undefined : cat 
                          })}
                          className="w-4 h-4 text-indigo-600"
                        />
                        <span className="text-sm text-gray-600">{cat}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Platform Section */}
              <div>
                <button
                  onClick={() => toggleSection('platform')}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                >
                  Plateforme
                  {expandedSections.platform ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.platform && (
                  <div className="space-y-1">
                    {PLATFORMS.map((plat) => (
                      <label key={plat} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="platform"
                          value={plat}
                          checked={filters.platform === plat}
                          onChange={() => updateFilters({ 
                            platform: filters.platform === plat ? undefined : plat 
                          })}
                          className="w-4 h-4 text-indigo-600"
                        />
                        <span className="text-sm text-gray-600">{plat}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Condition Section */}
              <div>
                <button
                  onClick={() => toggleSection('condition')}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                >
                  État
                  {expandedSections.condition ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.condition && (
                  <div className="space-y-1">
                    {CONDITIONS.map((cond) => (
                      <label key={cond} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="condition"
                          value={cond}
                          checked={filters.condition === cond}
                          onChange={() => updateFilters({ 
                            condition: filters.condition === cond ? undefined : cond 
                          })}
                          className="w-4 h-4 text-indigo-600"
                        />
                        <span className="text-sm text-gray-600">{cond}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Price Range */}
              <div>
                <button
                  onClick={() => toggleSection('price')}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                >
                  Prix
                  {expandedSections.price ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.price && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">Min</label>
                      <input
                        type="number"
                        value={filters.minPrice || ''}
                        onChange={(e) => updateFilters({ 
                          minPrice: e.target.value ? parseFloat(e.target.value) : undefined 
                        })}
                        placeholder="0"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Max</label>
                      <input
                        type="number"
                        value={filters.maxPrice || ''}
                        onChange={(e) => updateFilters({ 
                          maxPrice: e.target.value ? parseFloat(e.target.value) : undefined 
                        })}
                        placeholder="1000"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Options */}
              <div>
                <button
                  onClick={() => toggleSection('options')}
                  className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                >
                  Options
                  {expandedSections.options ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {expandedSections.options && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.isNegotiable || false}
                        onChange={(e) => updateFilters({ 
                          isNegotiable: e.target.checked || undefined 
                        })}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <span className="text-sm text-gray-600">Négociable</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.acceptsSwap || false}
                        onChange={(e) => updateFilters({ 
                          acceptsSwap: e.target.checked || undefined 
                        })}
                        className="w-4 h-4 text-indigo-600"
                      />
                      <span className="text-sm text-gray-600">Troc possible</span>
                    </label>
                    <div>
                      <label className="text-xs text-gray-500">Note minimum</label>
                      <select
                        value={filters.minRating || ''}
                        onChange={(e) => updateFilters({ 
                          minRating: e.target.value ? parseFloat(e.target.value) : undefined 
                        })}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Toutes</option>
                        <option value="3">3+ ⭐</option>
                        <option value="4">4+ ⭐</option>
                        <option value="4.5">4.5+ ⭐</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sort & Results */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Trier par</span>
            <select
              value={filters.sort || 'relevance'}
              onChange={(e) => updateFilters({ sort: e.target.value })}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900">Erreur de recherche</h3>
            <p className="text-gray-500 mt-1">Une erreur est survenue. Veuillez réessayer.</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Réessayer
            </Button>
          </div>
        ) : data?.data?.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900">Aucun résultat trouvé</h3>
            <p className="text-gray-500 mt-1">
              Essayez de modifier vos filtres ou votre recherche
            </p>
            <Button 
              variant="outline" 
              onClick={clearFilters} 
              className="mt-4"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <>
            <ListingGrid listings={data.data} />

            {/* Pagination */}
            {data?.meta && data.meta.totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Précédent
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(data.meta.totalPages, 5))].map((_, i) => {
                    const pageNum = page <= 3 
                      ? i + 1 
                      : page >= data.meta.totalPages - 2 
                        ? data.meta.totalPages - 4 + i 
                        : page - 2 + i;
                    
                    if (pageNum < 1 || pageNum > data.meta.totalPages) return null;
                    
                    return (
                      <button
                        key={i}
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          'w-8 h-8 rounded-md text-sm transition-colors',
                          page === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-gray-100 text-gray-600'
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                  disabled={page === data.meta.totalPages}
                >
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// Wrap with Suspense for useSearchParams
export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchPageContent />
    </Suspense>
  );
}