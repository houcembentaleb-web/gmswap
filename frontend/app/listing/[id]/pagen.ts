'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  User,
  MapPin,
  Star,
  Package,
  MessageCircle,
  CheckCircle,
  Award,
  Clock,
  Calendar,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { ListingGrid } from '@/components/listing/ListingGrid';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function ProfilePage() {
  const params = useParams();
  const { user: currentUser } = useAuth();
  const userId = params.id as string;
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews' | 'about'>('listings');

  const isOwnProfile = currentUser?.id === userId;

  // ==========================================
  // FETCH PROFILE
  // ==========================================

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const response = await api.get(`/profile/${userId}`);
      return response.data;
    },
    enabled: !!userId,
  });

  // ==========================================
  // FETCH USER LISTINGS
  // ==========================================

  const { data: listings, isLoading: listingsLoading } = useQuery({
    queryKey: ['profile-listings', userId],
    queryFn: async () => {
      const response = await api.get(`/listings?userId=${userId}&status=ACTIVE`);
      return response.data;
    },
    enabled: !!userId,
  });

  // ==========================================
  // FETCH REVIEWS
  // ==========================================

  const { data: reviews } = useQuery({
    queryKey: ['profile-reviews', userId],
    queryFn: async () => {
      const response = await api.get(`/ratings/user/${userId}`);
      return response.data;
    },
    enabled: activeTab === 'reviews',
  });

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleStartChat = async () => {
    if (!currentUser) {
      toast.error('Connectez-vous pour contacter ce vendeur');
      return;
    }

    if (currentUser.id === userId) {
      toast.error('Vous ne pouvez pas vous contacter vous-même');
      return;
    }

    try {
      // Créer ou récupérer une conversation
      const response = await api.post('/conversations', {
        otherUserId: userId,
      });
      window.location.href = `/messages/${response.data.id}`;
    } catch (error) {
      toast.error('Erreur lors de la création de la conversation');
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <User className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Utilisateur introuvable</h2>
        <p className="text-gray-500 mt-2">Cet utilisateur n'existe pas</p>
      </div>
    );
  }

  const user = profile.user;
  const reputation = profile.reputation || {};
  const stats = profile.stats || {};

  // ==========================================
  // BADGES
  // ==========================================

  const badges = reputation.badges || [];
  const trustLevel = reputation.trustLevel || 'NEW';

  const trustLevelColors = {
    NEW: 'bg-gray-100 text-gray-600',
    BRONZE: 'bg-amber-100 text-amber-700',
    SILVER: 'bg-gray-200 text-gray-700',
    GOLD: 'bg-yellow-100 text-yellow-700',
    PLATINUM: 'bg-indigo-100 text-indigo-700',
  };

  const trustLevelLabels = {
    NEW: 'Nouveau',
    BRONZE: 'Bronze',
    SILVER: 'Argent',
    GOLD: 'Or',
    PLATINUM: 'Platine',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ==========================================
      PROFILE HEADER
      ========================================== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          {/* Avatar */}
          <div className="relative">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-24 h-24 rounded-full object-cover border-4 border-gray-100"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-3xl font-bold">
                {user.username?.[0]?.toUpperCase()}
              </div>
            )}
            {user.isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full p-1">
                <CheckCircle className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {user.username}
              </h1>
              {user.isVerified && (
                <Badge variant="success">✓ Vérifié</Badge>
              )}
              {trustLevel !== 'NEW' && (
                <Badge className={trustLevelColors[trustLevel as keyof typeof trustLevelColors]}>
                  {trustLevelLabels[trustLevel as keyof typeof trustLevelLabels]}
                </Badge>
              )}
            </div>

            {user.bio && (
              <p className="text-gray-600 mt-1">{user.bio}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
              {user.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {user.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Membre depuis{' '}
                {formatDistanceToNow(new Date(user.createdAt), {
                  addSuffix: true,
                  locale: fr,
                })}
              </span>
              {user.lastLoginAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Actif{' '}
                  {formatDistanceToNow(new Date(user.lastLoginAt), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </span>
              )}
            </div>

            {/* Badges */}
            {badges.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {badges.includes('FAST_RESPONDER') && (
                  <Badge variant="info" className="gap-1">
                    ⚡ Réponse rapide
                  </Badge>
                )}
                {badges.includes('TRUSTED') && (
                  <Badge variant="success" className="gap-1">
                    🤝 Fiable
                  </Badge>
                )}
                {badges.includes('TOP_SELLER') && (
                  <Badge variant="warning" className="gap-1">
                    ⭐ Top vendeur
                  </Badge>
                )}
                {badges.includes('EXPERIENCED') && (
                  <Badge variant="secondary" className="gap-1">
                    🏆 Expérimenté
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {!isOwnProfile && (
              <Button onClick={handleStartChat} className="gap-2">
                <MessageCircle className="w-4 h-4" />
                Contacter
              </Button>
            )}
            {isOwnProfile && (
              <Link href="/profile/settings">
                <Button variant="outline" className="gap-2">
                  <Settings className="w-4 h-4" />
                  Paramètres
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
      STATS
      ========================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <Package className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
          <p className="text-2xl font-bold">{stats.activeListings || 0}</p>
          <p className="text-sm text-gray-500">Annonces actives</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <Star className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">
            {reputation.ratingAvg ? reputation.ratingAvg.toFixed(1) : '-'}
          </p>
          <p className="text-sm text-gray-500">
            {reputation.ratingCount || 0} avis
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <Award className="w-5 h-5 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{reputation.completedDeals || 0}</p>
          <p className="text-sm text-gray-500">Ventes réalisées</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <Clock className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">
            {reputation.responseRate ? `${Math.round(reputation.responseRate)}%` : '-'}
          </p>
          <p className="text-sm text-gray-500">Taux de réponse</p>
        </div>
      </div>

      {/* ==========================================
      TABS
      ========================================== */}
      <div className="mt-8 border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('listings')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'listings'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Annonces
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'reviews'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Avis ({reputation.ratingCount || 0})
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'about'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            À propos
          </button>
        </div>
      </div>

      {/* ==========================================
      CONTENT
      ========================================== */}
      <div className="mt-6">
        {/* LISTINGS */}
        {activeTab === 'listings' && (
          <>
            {listingsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : listings?.data?.length > 0 ? (
              <ListingGrid listings={listings.data} />
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                {isOwnProfile
                  ? "Vous n'avez pas encore d'annonces"
                  : `${user.username} n'a pas encore d'annonces`}
              </div>
            )}
          </>
        )}

        {/* REVIEWS */}
        {activeTab === 'reviews' && (
          <>
            {reviews?.data?.length > 0 ? (
              <div className="space-y-4">
                {reviews.data.map((review: any) => (
                  <div key={review.id} className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        {review.fromUser.avatarUrl ? (
                          <img
                            src={review.fromUser.avatarUrl}
                            alt={review.fromUser.username}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium">
                            {review.fromUser.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/profile/${review.fromUser.id}`}
                            className="font-medium text-gray-900 hover:text-indigo-600"
                          >
                            {review.fromUser.username}
                          </Link>
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.score
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-200'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-gray-500">
                            {formatDistanceToNow(new Date(review.createdAt), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </span>
                        </div>
                        {review.comment && (
                          <p className="text-gray-700 mt-1">{review.comment}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Star className="w-12 h-12 mx-auto mb-2 opacity-50" />
                Aucun avis pour le moment
              </div>
            )}
          </>
        )}

        {/* ABOUT */}
        {activeTab === 'about' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            {user.bio ? (
              <p className="text-gray-700">{user.bio}</p>
            ) : (
              <p className="text-gray-500 italic">
                {isOwnProfile
                  ? 'Ajoutez une bio pour vous présenter'
                  : `${user.username} n'a pas encore de bio`}
              </p>
            )}

            {isOwnProfile && (
              <Link href="/profile/settings">
                <Button variant="outline" size="sm">
                  Modifier le profil
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}