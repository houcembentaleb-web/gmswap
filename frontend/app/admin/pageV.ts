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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DashboardStats {
  users: {
    total: number;
    newToday: number;
    active: number;
  };
  listings: {
    total: number;
    active: number;
    pending: number;
    sold: number;
  };
  messages: {
    total: number;
    today: number;
  };
  reports: {
    pending: number;
    resolved: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
  }>;
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return res.data;
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const stats = [
    {
      label: 'Utilisateurs',
      value: data?.users.total || 0,
      sub: `${data?.users.newToday || 0} nouveaux aujourd'hui`,
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      label: 'Annonces',
      value: data?.listings.total || 0,
      sub: `${data?.listings.active || 0} actives`,
      icon: Package,
      color: 'bg-green-500',
    },
    {
      label: 'Messages',
      value: data?.messages.total || 0,
      sub: `${data?.messages.today || 0} aujourd'hui`,
      icon: MessageSquare,
      color: 'bg-purple-500',
    },
    {
      label: 'Signalements',
      value: data?.reports.pending || 0,
      sub: 'en attente de modération',
      icon: AlertTriangle,
      color: 'bg-red-500',
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Vue d'ensemble du marketplace</p>
        </div>
        <div className="text-sm text-gray-400">
          Dernière mise à jour : {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl border border-gray-200 p-6">
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
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Activité récente</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {data?.recentActivity?.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              Aucune activité récente
            </div>
          ) : (
            data?.recentActivity?.map((activity) => (
              <div key={activity.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-gray-700">{activity.message}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(activity.createdAt), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}