'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle, XCircle, Eye, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

export default function AdminListings() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'flagged'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-listings', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      const res = await api.get(`/admin/listings?${params}`);
      return res.data;
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approve' | 'reject' | 'delete' }) => {
      await api.put(`/admin/listings/${id}/moderate`, { action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      toast.success('Annonce modérée');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'PENDING':
        return <Badge variant="warning">En attente</Badge>;
      case 'FLAGGED':
        return <Badge variant="danger">Signalée</Badge>;
      case 'SOLD':
        return <Badge variant="secondary">Vendue</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Annonces</h1>
          <p className="text-gray-500">Modération des annonces</p>
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'active', 'flagged'].map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f as any)}
            >
              {f === 'all' ? 'Toutes' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Annonce</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendeur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prix</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créée</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              ) : data?.data?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucune annonce trouvée
                  </td>
                </tr>
              ) : (
                data?.data?.map((listing: any) => (
                  <tr key={listing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={listing.images?.[0]?.url || '/placeholder.jpg'}
                          alt={listing.title}
                          className="w-12 h-12 object-cover rounded"
                        />
                        <span className="text-sm font-medium text-gray-900 line-clamp-1">
                          {listing.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {listing.user?.username || 'Inconnu'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {listing.price.toFixed(2)} DT
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(listing.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDistanceToNow(new Date(listing.createdAt), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/listing/${listing.id}`} target="_blank">
                          <Button size="sm" variant="outline">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        {listing.status === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => moderateMutation.mutate({ id: listing.id, action: 'approve' })}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => moderateMutation.mutate({ id: listing.id, action: 'reject' })}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {listing.status === 'FLAGGED' && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => moderateMutation.mutate({ id: listing.id, action: 'delete' })}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Supprimer
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}