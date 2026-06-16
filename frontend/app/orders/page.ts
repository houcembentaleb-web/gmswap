'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { Package, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

const statusColors: Record<string, string> = {
  PENDING: 'warning',
  PAID: 'info',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'danger',
};

const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  PROCESSING: 'En préparation',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  REFUNDED: 'Remboursée',
};

export default function OrdersPage() {
  const { user } = useAuth();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', role],
    queryFn: async () => {
      const res = await api.get(`/orders?role=${role}`);
      return res.data;
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes commandes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setRole('buyer')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              role === 'buyer'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Achats
          </button>
          <button
            onClick={() => setRole('seller')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              role === 'seller'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Ventes
          </button>
        </div>
      </div>

      {data?.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">
            {role === 'buyer'
              ? 'Vous n\'avez pas encore d\'achats'
              : 'Vous n\'avez pas encore de ventes'}
          </p>
          {role === 'buyer' && (
            <Link href="/" className="text-indigo-600 hover:text-indigo-700 mt-2 inline-block">
              Découvrir des annonces
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {data?.map((order: any) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Image */}
                <img
                  src={order.listing.images?.[0]?.url || '/placeholder.jpg'}
                  alt={order.listing.title}
                  className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {order.listing.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {order.listing.category} · {order.listing.platform || 'Non spécifié'}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="font-medium text-indigo-600">
                      {order.total.toFixed(2)} DT
                    </span>
                    <Badge variant={statusColors[order.status] || 'default'}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                    {role === 'seller' ? (
                      <span className="text-gray-500">
                        Acheteur: {order.buyer.username}
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        Vendeur: {order.seller.username}
                      </span>
                    )}
                  </div>
                </div>

                {/* Date */}
                <div className="text-sm text-gray-400 flex-shrink-0">
                  {formatDistanceToNow(new Date(order.createdAt), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}