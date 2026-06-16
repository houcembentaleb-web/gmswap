'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'react-hot-toast';

const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  REJECTED: 'Refusée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

const statusColors: Record<string, string> = {
  PENDING: 'warning',
  ACCEPTED: 'info',
  REJECTED: 'danger',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export default function ReservationsPage() {
  const { user } = useAuth();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', role],
    queryFn: async () => {
      const res = await api.get(`/reservations?role=${role}`);
      return res.data;
    },
    enabled: !!user,
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/reservations/${id}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Réservation acceptée');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/reservations/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      toast.success('Réservation refusée');
    },
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
        <h1 className="text-2xl font-bold text-gray-900">Réservations</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setRole('buyer')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              role === 'buyer'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            En tant qu'acheteur
          </button>
          <button
            onClick={() => setRole('seller')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              role === 'seller'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            En tant que vendeur
          </button>
        </div>
      </div>

      {data?.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Aucune réservation</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.map((reservation: any) => (
            <div
              key={reservation.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <Link
                href={`/reservations/${reservation.id}`}
                className="flex flex-col sm:flex-row gap-4"
              >
                {/* Image */}
                <img
                  src={reservation.listing.images?.[0]?.url || '/placeholder.jpg'}
                  alt={reservation.listing.title}
                  className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900">
                    {reservation.listing.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {reservation.listing.category} · {reservation.listing.price.toFixed(2)} DT
                  </p>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
                    <Badge variant={statusColors[reservation.status] || 'default'}>
                      {statusLabels[reservation.status] || reservation.status}
                    </Badge>
                    <span className="text-gray-500">
                      {role === 'buyer' ? (
                        <>Vendeur: {reservation.seller.username}</>
                      ) : (
                        <>Acheteur: {reservation.buyer.username}</>
                      )}
                    </span>
                    <span className="text-gray-400">
                      {formatDistanceToNow(new Date(reservation.createdAt), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </span>
                  </div>
                </div>
              </Link>

              {/* Actions for seller */}
              {role === 'seller' && reservation.status === 'PENDING' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <Button
                    size="sm"
                    onClick={() => acceptMutation.mutate(reservation.id)}
                    loading={acceptMutation.isPending}
                    className="gap-1"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Accepter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectMutation.mutate(reservation.id)}
                    loading={rejectMutation.isPending}
                    className="gap-1 text-red-600"
                  >
                    <XCircle className="w-4 h-4" />
                    Refuser
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}