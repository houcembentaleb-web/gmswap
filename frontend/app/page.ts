'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTrackInteraction } from '@/hooks/useRecommendations';
import { ListingGrid } from '@/components/listing/ListingGrid';
import { ListingFilters } from '@/components/listing/ListingFilters';
import { RecommendationSection } from '@/components/recommendations/RecommendationSection';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Sparkles, TrendingUp, Clock } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { user } = useAuth();
  const trackInteraction = useTrackInteraction();
  const [filters, setFilters] = useState({
    category: '',
    platform: '',
    minPrice: '',
    maxPrice: '',
    sort: 'newest',
    search: '',
  });
  const [showRecommendations, setShowRecommendations] = useState(true);

  // ==========================================
  // FETCH FEED LISTINGS
  // ==========================================

  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ['feed', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, String(value));
      });
      params.append('limit', '20');
      
      const response = await api.get(`/listings?${params}`);
      return response.data;
    },
    staleTime: 60000,
  });

  // ==========================================
  // FETCH TRENDING (fallback for non-logged)
  // ==========================================

  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending'],
    queryFn: async () => {
      const response = await api.get('/listings', {
        params: { sort: 'popular', limit: 8 },
      });
      return response.data;
    },
    enabled: !user,
    staleTime: 300000,
  });

  // ==========================================
  // CATEGORIES FOR QUICK ACCESS
  // ==========================================

  const categories = [
    { name: 'Jeux', icon: '🎮', value: 'GAME' },
    { name: 'Consoles', icon: '🕹️', value: 'CONSOLE' },
    { name: 'Accessoires', icon: '🎯', value: 'ACCESSORY' },
    { name: 'Collectibles', icon: '🏆', value: 'COLLECTIBLE' },
    { name: 'Goodies', icon: '👕', value: 'MERCH' },
  ];

  // ==========================================
  // TRACK FEED VIEWS
  // ==========================================

  useEffect(() => {
    if (feedData?.data && user) {
      // Track first 5 listings as viewed
      const viewed = feedData.data.slice(0, 5);
      for (const listing of viewed) {
        trackInteraction(listing.id, 'VIEW').catch(() => {});
      }
    }
  }, [feedData, user, trackInteraction]);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleCategoryClick = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      category: prev.category === category ? '' : category,
    }));
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ==========================================
      HERO SECTION
      ========================================== */}
      <section className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                La marketplace gaming<br />
                <span className="text-indigo-200">en Tunisie</span>
              </h1>
              <p className="text-lg text-indigo-100 mb-6 max-w-lg">
                Achetez, vendez et échangez vos jeux vidéo, consoles et accessoires 
                avec la communauté gaming tunisienne.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/listing/new">
                  <Button className="bg-white text-indigo-600 hover:bg-indigo-50">
                    Vendre maintenant
                  </Button>
                </Link>
                <Link href="/search">
                  <Button variant="outline" className="border-white text-white hover:bg-white/10">
                    Explorer
                  </Button>
                </Link>
              </div>
            </div>
            <div className="flex-shrink-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">500+</div>
                  <div className="text-sm text-indigo-200">Jeux disponibles</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold">200+</div>
                  <div className="text-sm text-indigo-200">Vendeurs actifs</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==========================================
      CATEGORIES QUICK ACCESS
      ========================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 -mt-4">
        <div className="flex flex-wrap gap-2 justify-center">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryClick(cat.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filters.category === cat.value
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-100 shadow-sm'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
          {filters.category && (
            <button
              onClick={() => handleCategoryClick('')}
              className="text-sm text-gray-400 hover:text-gray-600 px-2"
            >
              ✕
            </button>
          )}
        </div>
      </section>

      {/* ==========================================
      RECOMMENDATIONS (Logged-in users)
      ========================================== */}
      {user && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <RecommendationSection 
            title="Recommandations pour vous"
            limit={8}
            className="mb-8"
          />
        </section>
      )}

      {/* ==========================================
      TRENDING (Non-logged users)
      ========================================== */}
      {!user && trendingData?.data && trendingData.data.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-orange-500" />
                <h2 className="text-xl font-bold text-gray-900">Tendances du moment</h2>
              </div>
              <Link href="/search?sort=popular" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                Voir tout
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <ListingGrid listings={trendingData.data} />
          </div>
        </section>
      )}

      {/* ==========================================
      FILTERS
      ========================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <ListingFilters
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </div>
      </section>

      {/* ==========================================
      FEED
      ========================================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-12">
        {feedLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : feedData?.data && feedData.data.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {feedData.meta?.total || 0} annonces trouvées
              </p>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <select
                  value={filters.sort}
                  onChange={(e) => handleFilterChange('sort', e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="newest">Plus récentes</option>
                  <option value="popular">Plus populaires</option>
                  <option value="price_asc">Prix croissant</option>
                  <option value="price_desc">Prix décroissant</option>
                </select>
              </div>
            </div>
            <ListingGrid listings={feedData.data} />
            
            {/* Pagination */}
            {feedData.meta && feedData.meta.totalPages > 1 && (
              <div className="flex justify-center mt-8">
                <nav className="flex items-center gap-1">
                  {[...Array(Math.min(feedData.meta.totalPages, 5))].map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={i}
                        className={`w-8 h-8 rounded-md text-sm transition-colors ${
                          pageNum === feedData.meta.page
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-gray-100 text-gray-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <div className="text-6xl mb-4">🎮</div>
            <h3 className="text-lg font-medium text-gray-900">Aucune annonce trouvée</h3>
            <p className="text-gray-500 mt-2">
              {filters.category || filters.search
                ? "Aucune annonce ne correspond à vos critères"
                : "Soyez le premier à publier une annonce !"}
            </p>
            <Link href="/listing/new">
              <Button className="mt-4">
                Publier une annonce
              </Button>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}