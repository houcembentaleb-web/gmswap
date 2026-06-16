'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Search, UserCheck, UserX, Shield } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
      });
      const res = await api.get(`/admin/users?${params}`);
      return res.data;
    },
  });

  const banMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.put(`/admin/users/${userId}/ban`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Utilisateur banni');
    },
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.put(`/admin/users/${userId}/unban`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Utilisateur débanni');
    },
  });

  const handleBan = (userId: string) => {
    if (confirm('Voulez-vous vraiment bannir cet utilisateur ?')) {
      banMutation.mutate(userId);
    }
  };

  const handleUnban = (userId: string) => {
    if (confirm('Voulez-vous vraiment débannir cet utilisateur ?')) {
      unbanMutation.mutate(userId);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-gray-500">Gestion des utilisateurs de la plateforme</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Annonces</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
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
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              ) : (
                data?.data?.map((user: any) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                          {user.username?.[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user._count?.listings || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.ratingAvg > 0 ? `${user.ratingAvg.toFixed(1)} ⭐` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {user.isBanned ? (
                        <Badge variant="danger">Banni</Badge>
                      ) : (
                        <Badge variant="success">Actif</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {user.isBanned ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnban(user.id)}
                            className="text-green-600"
                          >
                            <UserCheck className="w-4 h-4 mr-1" />
                            Débannir
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleBan(user.id)}
                            className="text-red-600"
                          >
                            <UserX className="w-4 h-4 mr-1" />
                            Bannir
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

        {/* Pagination */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {data.meta.total} utilisateurs
            </p>
            <div className="flex gap-2">
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
          </div>
        )}
      </div>
    </div>
  );
}