'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Heart,
  Share2,
  MessageCircle,
  Star,
  MapPin,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  AlertTriangle,
  Flag,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'react-hot-toast';
import Image from 'next/image';
import Link from 'next/link';
import { ListingCard } from '@/components/listing/ListingCard';

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const listingId = params.id as string;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ==========================================
  // FETCH LISTING
  // ==========================================

  const { data, isLoading, error } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const response = await api.get(`/listings/${listingId}`);
      return response.data;
    },
    enabled: !!listingId,
  });

  // ==========================================
  // WISHLIST
  // ==========================================

  const wishlistMutation = useMutation({
    mutationFn: async () => {
      if (isWishlisted) {
        await api.delete(`/wishlist/${listingId}`);
      } else {
        await api.post('/wishlist', { listingId });
      }
    },
    onSuccess: () => {
      setIsWishlisted(!isWishlisted);
      toast.success(isWishlisted ? 'Retiré des favoris' : 'Ajouté aux favoris');
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
    onError: () => {
      toast.error('Une erreur est survenue');
    },
  });

  // ==========================================
  // REPORT
  // ==========================================

  const reportMutation = useMutation({
    mutationFn: async (reason: string) => {
      await api.post('/moderation/reports', {
        targetType: 'LISTING',
        targetId: listingId,
        reason,
      });
    },
    onSuccess: () => {
      toast.success('Signalement envoyé');
    },
    onError: () => {
      toast.error('Erreur lors du signalement');
    },
  });

  // ==========================================
  // INITIATE CHAT
  // ==========================================

  const startChat = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const response = await api.post('/conversations', {
        listingId: listingId,
      });
      
      router.push(`/messages/${response.data.id}`);
    } catch (error) {
      toast.error('Erreur lors de la création de la conversation');
    }
  };

  // ==========================================
  // SIMILAR LISTINGS
  // ==========================================

  const { data: similarListings } = useQuery({
    queryKey: ['similar-listings', listingId, data?.category],
    queryFn: async () => {
      if (!data?.category) return { data: [] };
      const response = await api.get('/listings', {
        params: {
          category: data.category,
          limit: 4,
          exclude: listingId,
        },
      });
      return response.data;
    },
    enabled: !!data?.category,
  });

  // ==========================================
  // HANDLERS
  // ==========================================

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? (data?.images?.length || 0) - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === (data?.images?.length || 0) - 1 ? 0 : prev + 1
    );
  };

  const handleReport = () => {
    const reasons = [
      'Arnaque ou contenu frauduleux',
      'Contenu inapproprié',
      'Annonce en double',
      'Autre',
    ];

    const reason = window.prompt(
      'Motif du signalement:\n' + reasons.map((r, i) => `${i + 1}. ${r}`).join('\n'),
      '1'
    );

    if (reason) {
      const selected = reasons[parseInt(reason) - 1] || 'Autre';
      reportMutation.mutate(selected);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900">Annonce introuvable</h2>
        <p className="text-gray-500 mt-2">
          Cette annonce n'existe pas ou a été supprimée
        </p>
        <Button onClick={() => router.push('/')} className="mt-6">
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  const listing = data;
  const images = listing.images || [];
  const isOwner = user?.id === listing.userId;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Accueil</Link>
        <span className="mx-2">/</span>
        <Link href={`/?category=${listing.category}`} className="hover:text-gray-700">
          {listing.category}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{listing.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ==========================================
        LEFT COLUMN - IMAGES
        ========================================== */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Main Image */}
            <div className="relative aspect-[4/3] bg-gray-100">
              {images.length > 0 ? (
                <img
                  src={images[currentImageIndex]?.url}
                  alt={listing.title}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <img
                    src="/placeholder.jpg"
                    alt="No image"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Image Navigation */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Image Counter */}
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 text-white text-sm rounded-full">
                  {currentImageIndex + 1} / {images.length}
                </div>
              )}

              {/* Status Badge */}
              {listing.status === 'SOLD' && (
                <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                  VENDU
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 p-4 overflow-x-auto">
                {images.map((img: any, index: number) => (
                  <button
                    key={img.id}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                      index === currentImageIndex
                        ? 'border-indigo-600'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={`Image ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ==========================================
        RIGHT COLUMN - INFO
        ========================================== */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-start justify-between">
                <h1 className="text-2xl font-bold text-gray-900">
                  {listing.title}
                </h1>
                <button
                  onClick={() => wishlistMutation.mutate()}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Heart
                    className={`w-6 h-6 ${
                      isWishlisted
                        ? 'fill-red-500 text-red-500'
                        : 'text-gray-400'
                    }`}
                  />
                </button>
              </div>

              {/* Price */}
              <div className="mt-2 flex items-center gap-3">
                <span className="text-3xl font-bold text-indigo-600">
                  {listing.price.toFixed(2)} DT
                </span>
                {listing.isNegotiable && (
                  <Badge variant="secondary">Négociable</Badge>
                )}
                {listing.acceptsSwap && (
                  <Badge variant="secondary">Troc possible</Badge>
                )}
              </div>

              {/* Stats */}
              <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {listing.viewCount || 0} vues
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDistanceToNow(new Date(listing.createdAt), {
                    addSuffix: true,
                    locale: fr,
                  })}
                </span>
              </div>
            </div>

            {/* Seller Info */}
            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                Vendeur
              </h3>
              <Link
                href={`/profile/${listing.user.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {listing.user.avatarUrl ? (
                  <img
                    src={listing.user.avatarUrl}
                    alt={listing.user.username}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                    {listing.user.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900">
                    {listing.user.username}
                    {listing.user.isVerified && (
                      <Badge variant="success" className="ml-2 text-xs">
                        ✓ Vérifié
                      </Badge>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    {listing.user.ratingAvg > 0
                      ? `${listing.user.ratingAvg.toFixed(1)} (${listing.user.ratingCount || 0} avis)`
                      : 'Aucun avis'}
                  </div>
                </div>
              </Link>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {listing.status !== 'SOLD' && !isOwner && (
                <Button
                  onClick={startChat}
                  className="w-full gap-2"
                  size="lg"
                >
                  <MessageCircle className="w-5 h-5" />
                  Contacter le vendeur
                </Button>
              )}

              {isOwner && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/listing/${listing.id}/edit`)}
                  >
                    Modifier l'annonce
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => {
                      if (confirm('Voulez-vous vraiment supprimer cette annonce ?')) {
                        // Delete mutation
                      }
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Lien copié !');
                  }}
                >
                  <Share2 className="w-4 h-4" />
                  Partager
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleReport}
                >
                  <Flag className="w-4 h-4" />
                  Signaler
                </Button>
              </div>
            </div>

            {/* Details */}
            <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">État</span>
                <span className="font-medium">{listing.condition}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Catégorie</span>
                <span className="font-medium">{listing.category}</span>
              </div>
              {listing.platform && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Plateforme</span>
                  <span className="font-medium">{listing.platform}</span>
                </div>
              )}
              {listing.location && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Localisation</span>
                  <span className="font-medium flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {listing.location}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
      DESCRIPTION
      ========================================== */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Description
        </h2>
        <p className="text-gray-700 whitespace-pre-wrap">
          {listing.description || 'Aucune description fournie'}
        </p>
      </div>

      {/* ==========================================
      SIMILAR LISTINGS
      ========================================== */}
      {similarListings?.data?.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Annonces similaires
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {similarListings.data.map((listing: any) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}