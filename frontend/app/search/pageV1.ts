'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ListingGrid } from '@/components/listing/ListingGrid';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { SlidersHorizontal, X } from 'lucide-react';

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

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';

  const [filters, setFilters] = useState<SearchFilters>({
    sort: 'relevance',
  });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

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
  });

  // ==========================================
  // UPDATE FILTERS
  // ==========================================

  const updateFilters = (newFilters: Partial<SearchFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1);
    
    // Update URL
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    
    Object.entries({ ...filters, ...newFilters }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    
    router.push(`/search?${params.toString()}`);
  };

  // ==========================================
  // CLEAR FILTERS
  // ==========================================

  const clearFilters = () => {
    const newFilters: SearchFilters = { sort: 'relevance' };
    setFilters(newFilters);
    setPage(1);
    router.push(`/search?q=${query}`);
  };

  // ==========================================
  // RENDER
  // ==========================================

  const hasFilters = Object.keys(filters).some(
    (key) => filters[key as keyof SearchFilters] !== undefined &&
             filters[key as keyof SearchFilters] !== '' &&
             key !== 'sort'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {query ? `Résultats pour "${query}"` : 'Tous les jeux'}
          </h1>
          <p className="text-sm text-gray-500">
            {data?.meta?.total || 0} annonces trouvées
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
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
              className="gap-1 text-gray-500"
            >
              <X className="w-3.5 h-3.5" />
              Effacer
            </Button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Catégorie
              </label>
              <select
                value={filters.category || ''}
                onChange={(e) => updateFilters({ category: e.target.value || undefined })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Toutes</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plateforme
              </label>
              <select
                value={filters.platform || ''}
                onChange={(e) => updateFilters({ platform: e.target.value || undefined })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Toutes</option>
                {PLATFORMS.map((plat) => (
                  <option key={plat} value={plat}>{plat}</option>
                ))}
              </select>
            </div>

            {/* Condition */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                État
              </label>
              <select
                value={filters.condition || ''}
                onChange={(e) => updateFilters({ condition: e.target.value || undefined })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Tous</option>
                {CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>{cond}</option>
                ))}
              </select>
            </div>

            {/* Price Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix min
              </label>
              <input
                type="number"
                value={filters.minPrice || ''}
                onChange={(e) => updateFilters({ minPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="0"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix max
              </label>
              <input
                type="number"
                value={filters.maxPrice || ''}
                onChange={(e) => updateFilters({ maxPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="1000"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {/* Options */}
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.isNegotiable || false}
                  onChange={(e) => updateFilters({ isNegotiable: e.target.checked || undefined })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="text-sm">Négociable</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.acceptsSwap || false}
                  onChange={(e) => updateFilters({ acceptsSwap: e.target.checked || undefined })}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="text-sm">Troc</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Trier par</span>
          <select
            value={filters.sort || 'relevance'}
            onChange={(e) => updateFilters({ sort: e.target.value })}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
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
        <div className="text-center py-12">
          <p className="text-red-500">Erreur lors de la recherche</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <ListingGrid listings={data?.data || []} />

          {/* Pagination */}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Précédent
              </Button>
              <span className="flex items-center px-4 text-sm text-gray-600">
                Page {page} / {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
              >
                Suivant
              </Button>
            </div>
          )}

          {/* No results */}
          {data?.data?.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">Aucun résultat trouvé</p>
              <p className="text-sm text-gray-400 mt-1">
                Essayez de modifier vos filtres ou votre recherche
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}