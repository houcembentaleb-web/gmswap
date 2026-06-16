'use client';

import { useRecommendations } from '@/hooks/useRecommendations';
import { ListingCard } from '@/components/listing/ListingCard';
import { Spinner } from '@/components/ui/Spinner';
import { Sparkles } from 'lucide-react';

interface RecommendationSectionProps {
  title?: string;
  limit?: number;
  className?: string;
}

export function RecommendationSection({
  title = 'Recommandations pour vous',
  limit = 8,
  className = '',
}: RecommendationSectionProps) {
  const { data: recommendations, isLoading } = useRecommendations(limit);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-indigo-500" />
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {recommendations.map((listing: any) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}