'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Heart, Trash2, ShoppingBag, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { WishlistButton } from '@/components/wishlist/WishlistButton';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function WishlistPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const res = await api.get('/wishlist');
      return res.data;
    },
    enabled: !!user,
  });

  const { data: recommendations } = useQuery({
    queryKey: ['wishlist-recommendations'],
    queryFn: async () => {
      const res = await api.get('/wishlist/recommendations?limit=4');
      return res.data;
    },
    enabled: !!user && data?.items?.length > 0,
  });

  const removeMutation = useMutation({
    mutationFn: async (listingId: string) => {
      await api.delete(`/wishlist/${listingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success('Article retiré des favoris');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const items = data?.items || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes favoris</h1>
          <p className="text-sm text-gray-500">
            {items.length} article{items.length > 1 ? 's' : ''} sauvegardé{items.length > 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/wishlist/price-drops">
          <Button variant="outline" className="gap-2">
            <Bell className="w-4 h-4" />
            Alertes prix
          </Button>
        </Link>
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Heart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">Aucun favori</h3>
          <p className="text-gray-500 mt-1">
            Commencez à sauvegarder les annonces qui vous intéressent
          </p>
          <Link href="/">
            <Button className="mt-4">Découvrir les annonces</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Wishlist items */}
          <div className="space-y-4">
            {items.map((item: any) => {
              const listing = item.listing;
              const hasPriceDrop = item.hasPriceDrop;
              const priceDropPercent = item.priceDropPercent;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-4">
                    {/* Image */}
                    <Link href={`/listing/${listing.id}`} className="flex-shrink-0">
                      <img
                        src={listing.images?.[0]?.url || '/placeholder.jpg'}
                        alt={listing.title}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                    </Link>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <Link href={`/listing/${listing.id}`}>
                        <h3 className="font-medium text-gray-900 hover:text-indigo-600">
                          {listing.title}
                        </h3>
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>{listing.category}</span>
                        {listing.platform && (
                          <>
                            <span>·</span>
                            <span>{listing.platform}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{listing.condition}</span>
                      </div>

                      {/* Price */}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-lg font-bold text-indigo-600">
                          {listing.price.toFixed(2)} DT
                        </span>
                        {hasPriceDrop && (
                          <Badge variant="success" className="gap-1">
                            ↓ {priceDropPercent.toFixed(0)}%
                          </Badge>
                        )}
                        {item.addedPrice > listing.price && (
                          <span className="text-sm text-gray-400 line-through">
                            {item.addedPrice.toFixed(2)} DT
                          </span>
                        )}
                      </div>

                      {/* Added date */}
                      <p className="text-xs text-gray-400 mt-2">
                        Ajouté {formatDistanceToNow(new Date(item.createdAt), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2">
                      <Link href={`/messages?listing=${listing.id}`}>
                        <Button size="sm" variant="outline" className="gap-1">
                          <ShoppingBag className="w-4 h-4" />
                          Contacter
                        </Button>
                      </Link>
                      <button
                        onClick={() => removeMutation.mutate(listing.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recommendations */}
          {recommendations && recommendations.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Vous pourriez aussi aimer
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {recommendations.map((listing: any) => (
                  <div key={listing.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <Link href={`/listing/${listing.id}`}>
                      <img
                        src={listing.images?.[0]?.url || '/placeholder.jpg'}
                        alt={listing.title}
                        className="w-full aspect-square object-cover"
                      />
                    </Link>
                    <div className="p-3">
                      <Link href={`/listing/${listing.id}`}>
                        <h4 className="font-medium text-gray-900 line-clamp-1">
                          {listing.title}
                        </h4>
                      </Link>
                      <p className="text-sm font-bold text-indigo-600 mt-1">
                        {listing.price.toFixed(2)} DT
                      </p>
                      <WishlistButton listingId={listing.id} size="sm" className="mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}