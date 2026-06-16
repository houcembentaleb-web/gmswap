'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

export default function AdminReports() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reports', filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      const res = await api.get(`/admin/reports?${params}`);
      return res.data;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/admin/reports/${id}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.success('Signalement résolu');
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/admin/reports/${id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      toast.success('Signalement ignoré');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Signalements</h1>
          <p className="text-gray-500">Gestion des signalements utilisateurs</p>
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'resolved'].map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f as any)}
            >
              {f === 'all' ? 'Tous' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signalement</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cible</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Par</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Créé</th>
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
                    Aucun signalement trouvé
                  </td>
                </tr>
              ) : (
                data?.data?.map((report: any) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-medium text-gray-900">{report.reason}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {report.targetType === 'LISTING' ? 'Annonce' : 'Utilisateur'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {report.reporter?.username || 'Inconnu'}
                    </td>
                    <td className="px-4 py-3">
                      {report.status === 'PENDING' ? (
                        <Badge variant="warning">En attente</Badge>
                      ) : (
                        <Badge variant="success">Résolu</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDistanceToNow(new Date(report.createdAt), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {report.status === 'PENDING' && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600"
                            onClick={() => resolveMutation.mutate(report.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Résoudre
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-gray-600"
                            onClick={() => dismissMutation.mutate(report.id)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Ignorer
                          </Button>
                        </div>
                      )}
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