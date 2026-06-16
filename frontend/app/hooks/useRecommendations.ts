'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from './useAuth';

export function useRecommendations(limit: number = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['recommendations', user?.id, limit],
    queryFn: async () => {
      if (!user) {
        // For non-authenticated users, get trending
        const res = await api.get('/listings', {
          params: { sort: 'popular', limit },
        });
        return res.data.data;
      }
      
      const res = await api.get(`/recommendations/personalized?limit=${limit}`);
      return res.data;
    },
    enabled: true,
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useSimilarListings(listingId: string, limit: number = 6) {
  return useQuery({
    queryKey: ['similar-listings', listingId, limit],
    queryFn: async () => {
      const res = await api.get(`/recommendations/similar/${listingId}?limit=${limit}`);
      return res.data;
    },
    enabled: !!listingId,
    staleTime: 300000,
  });
}

export function useTrackInteraction() {
  return async (listingId: string, type: 'VIEW' | 'CLICK' | 'SAVE' | 'CHAT' | 'PURCHASE') => {
    try {
      await api.post('/recommendations/track', { listingId, type });
    } catch (error) {
      // Silent fail - analytics shouldn't block user actions
      console.debug('Failed to track interaction:', error);
    }
  };
}