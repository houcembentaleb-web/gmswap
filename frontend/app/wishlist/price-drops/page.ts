'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Bell, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function PriceDropsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['price-drops', page],
    queryFn: async () => {
      const res = await api.get(`/wishlist/price-drops?page=${page}&limit=20`);
      return res.data;
    },
    enabled: !!user,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/wishlist/price-drops/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-drops'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const notifications = data?.data || [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/wishlist">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Alertes prix</h1>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Bell className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">Aucune alerte</h3>
          <p className="text-gray-500 mt-1">
            Les alertes de baisse de prix apparaîtront ici
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification: any) => (
            <div
              key={notification.id}
              className={`bg-white rounded-xl border p-4 ${
                !notification.isRead ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-4">
                <img
                  src={notification.listing?.images?.[0]?.url || '/placeholder.jpg'}
                  alt={notification.listing?.title}
                  className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <Link href={`/listing/${notification.listingId}`}>
                    <h3 className="font-medium text-gray-900 hover:text-indigo-600">
                      {notification.listing?.title}
                    </h3>
                  </Link>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-gray-400 line-through">
                      {notification.oldPrice.toFixed(2)} DT
                    </span>
                    <span className="text-lg font-bold text-green-600">
                      {notification.newPrice.toFixed(2)} DT
                    </span>
                    <Badge variant="success">
                      ↓ {notification.dropPercent.toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </p>
                </div>
                {!notification.isRead && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markReadMutation.mutate(notification.id)}
                    className="flex-shrink-0"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Marquer lu
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Précédent
          </Button>
          <span className="flex items-center px-3 text-sm text-gray-600">
            {page} / {data.meta.totalPages}
          </span>
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
    </div>
  );
}