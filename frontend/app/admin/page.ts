'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Users,
  Package,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard');
      return res.data;
    },
    refetchInterval: 60000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: async () => {
      const res = await api.get('/admin/activity?limit=10');
      return res.data;
    },
    refetchInterval: 30000,
  });

  if (statsLoading || activityLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Utilisateurs',
      value: stats?.users?.total || 0,
      sub: `${stats?.users?.newToday || 0} aujourd'hui`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: 'Annonces',
      value: stats?.listings?.total || 0,
      sub: `${stats?.listings?.active || 0} actives`,
      icon: Package,
      color: 'bg-green-500',
    },
    {
      label: 'Ventes',
      value: stats?.transactions?.completed || 0,
      sub: `${stats?.transactions?.total || 0} totales`,
      icon: DollarSign,
      color: 'bg-purple-500',
    },
    {
      label: 'Signalements',
      value: stats?.reports?.pending || 0,
      sub: 'en attente',
      icon: AlertTriangle,
      color: 'bg-red-500',
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_joined':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'listing_created':
        return <Package className="w-4 h-4 text-green-500" />;
      case 'transaction':
        return <DollarSign className="w-4 h-4 text-purple-500" />;
      case 'report':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Vue d'ensemble de la plateforme</p>
        </div>
        <div className="text-sm text-gray-400">
          Dernière mise à jour: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card title="Annonces en modération">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-yellow-600">
                {stats?.listings?.pending || 0}
              </p>
              <p className="text-sm text-gray-500">en attente de validation</p>
            </div>
            <Badge variant="warning">
              {stats?.listings?.pending > 0 ? 'Action requise' : 'Aucune'}
            </Badge>
          </div>
        </Card>

        <Card title="Revenus">
          <div>
            <p className="text-2xl font-bold text-green-600">
              {stats?.revenue ? `${stats.revenue.toFixed(2)} DT` : '0.00 DT'}
            </p>
            <p className="text-sm text-gray-500">frais de service collectés</p>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card title="Activité récente">
        <div className="divide-y divide-gray-100">
          {activity?.length === 0 ? (
            <div className="py-4 text-center text-gray-500">
              Aucune activité récente
            </div>
          ) : (
            activity?.map((item: any) => (
              <div key={item.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getActivityIcon(item.type)}
                  <span className="text-sm text-gray-700">{item.message}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(item.createdAt), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}