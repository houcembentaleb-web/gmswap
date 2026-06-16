'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { MetaTags } from '@/components/seo/MetaTags';
import { useSeo } from '@/hooks/useSeo';
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
  Users,
  Clock,
  Shield,
  Award,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import Image from 'next/image';
import { ListingCard } from '@/components/listing/ListingCard';
import { WishlistButton } from '@/components/wishlist/WishlistButton';
import { ReservationButton } from '@/components/reservation/ReservationButton';

// Loading skeleton
function ListingDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse">
        <div className="h-4 w-48 bg-gray-200 rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-gray-200 rounded-xl aspect-[4/3]" />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div className="h-8 w-3/4 bg-gray-200 rounded" />
            <div className="h-6 w-1/2 bg-gray-200 rounded" />
            <div className="h-20 bg-gray-200 rounded" />
            <div className="h-12 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Main component
function ListingDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const listingId = params.id as string;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');

  // ==========================================
  // FETCH LISTING
  // ==========================================

  const { data: listing, isLoading, error } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const response = await api.get(`/listings/${listingId}`);
      return response.data;
    },
    enabled: !!listingId,
    staleTime: 60000,
  });

  // ==========================================
  // SEO DATA
  // ==========================================

  const { seoData } = useSeo(`/listing/${listingId}`, { id: listingId });

  // ==========================================
  // SIMILAR LISTINGS
  // ==========================================

  const { data: similarListings } = useQuery({
    queryKey: ['similar-listings', listingId, listing?.category],
    queryFn: async () => {
      if (!listing?.category) return { data: [] };
      const response = await api.get('/listings', {
        params: {
          category: listing.category,
          limit: 4,
          exclude: listingId,
        },
      });
      return response.data;
    },
    enabled: !!listing?.category,
  });

  // ==========================================
  // REPORT
  // ==========================================

  const reportMutation = useMutation({
    mutationFn: async ({ reason, description }: { reason: string; description?: string }) => {
      await api.post('/moderation/reports', {
        targetType: 'LISTING',
        targetId: listingId,
        reason,
        description,
      });
    },
    onSuccess: () => {
      toast.success('Signalement envoyé. Merci de contribuer à la sécurité de la plateforme.');
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erreur lors du signalement');
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

    if (user.id === listing?.userId) {
      toast.error('Vous ne pouvez pas vous contacter vous-même');
      return;
    }

    try {
      const response = await api.post('/conversations', {
        listingId: listingId,
      });
      
      router.push(`/messages/${response.data.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur lors de la création de la conversation');
    }
  };

  // ==========================================
  // HANDLERS
  // ==========================================

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? (listing?.images?.length || 0) - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === (listing?.images?.length || 0) - 1 ? 0 : prev + 1
    );
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrevImage();
    if (e.key === 'ArrowRight') handleNextImage();
    if (e.key === 'Escape') setIsFullscreen(false);
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [listing?.images?.length]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: listing?.title,
          text: `Découvrez "${listing?.title}" sur GameMarket`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Lien copié dans le presse-papier !');
      }
    } catch {
      toast.success('Partagez ce lien: ' + window.location.href);
    }
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason) {
      toast.error('Veuillez sélectionner un motif');
      return;
    }
    reportMutation.mutate({ reason: reportReason, description: reportDescription });
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (isLoading) {
    return <ListingDetailSkeleton />;
  }

  if (error || !listing) {
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

  const images = listing.images || [];
  const isOwner = user?.id === listing.userId;
  const isSold = listing.status === 'SOLD';
  const isReserved = listing.status === 'RESERVED';

  // Trust level colors
  const trustLevelColors: Record<string, string> = {
    NEW: 'bg-gray-100 text-gray-600',
    BRONZE: 'bg-amber-100 text-amber-700',
    SILVER: 'bg-gray-200 text-gray-700',
    GOLD: 'bg-yellow-100 text-yellow-700',
    PLATINUM: 'bg-indigo-100 text-indigo-700',
  };

  const trustLevelLabels: Record<string, string> = {
    NEW: 'Nouveau',
    BRONZE: 'Bronze',
    SILVER: 'Argent',
    GOLD: 'Or',
    PLATINUM: 'Platine',
  };

  return (
    <>
      <MetaTags
        title={seoData?.title || `${listing.title} - ${listing.price} DT - GameMarket`}
        description={seoData?.description || (listing.description 
          ? `${listing.description.substring(0, 160)}...` 
          : `${listing.title} en ${listing.condition} sur GameMarket. ${listing.category} - ${listing.platform || ''}`)
        }
        image={seoData?.image || listing.images?.[0]?.url || '/og-image.jpg'}
        url={`/listing/${listingId}`}
        type="product"
        jsonLd={seoData?.jsonLd || {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: listing.title,
          description: listing.description || '',
          image: listing.images?.[0]?.url || '',
          offers: {
            '@type': 'Offer',
            price: listing.price,
            priceCurrency: 'TND',
            availability: listing.status === 'ACTIVE' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
            seller: {
              '@type': 'Person',
              name: listing.user?.username || 'Vendeur',
            },
          },
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2 flex-wrap">
          <Link href="/" className="hover:text-gray-700">Accueil</Link>
          <span>/</span>
          <Link href={`/search?category=${listing.category}`} className="hover:text-gray-700">
            {listing.category}
          </Link>
          <span>/</span>
          <span className="text-gray-900 line-clamp-1">{listing.title}</span>
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
                    alt={`${listing.title} - Image ${currentImageIndex + 1}`}
                    className="w-full h-full object-contain"
                    onClick={() => setIsFullscreen(true)}
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
                      aria-label="Image précédente"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleNextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md transition-colors"
                      aria-label="Image suivante"
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
                {isSold && (
                  <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg font-bold">
                    VENDU
                  </div>
                )}
                {isReserved && !isSold && (
                  <div className="absolute top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg font-bold">
                    RÉSERVÉ
                  </div>
                )}

                {/* Fullscreen overlay */}
                {isFullscreen && (
                  <div 
                    className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                    onClick={() => setIsFullscreen(false)}
                  >
                    <button
                      onClick={() => setIsFullscreen(false)}
                      className="absolute top-4 right-4 text-white hover:text-gray-300"
                    >
                      <X className="w-8 h-8" />
                    </button>
                    <img
                      src={images[currentImageIndex]?.url}
                      alt={listing.title}
                      className="max-w-[90vw] max-h-[90vh] object-contain"
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 hover:bg-white/30 rounded-full text-white"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/20 hover:bg-white/30 rounded-full text-white"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </>
                    )}
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 sticky top-8">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {listing.title}
                  </h1>
                  <WishlistButton listingId={listing.id} size="lg" className="flex-shrink-0" />
                </div>

                {/* Price */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
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
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
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
                  {listing.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {listing.location}
                    </span>
                  )}
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
                  <div className="flex-1 min-w-0">
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
                    {listing.user.reputation?.trustLevel && (
                      <Badge 
                        className={`mt-1 text-xs ${trustLevelColors[listing.user.reputation.trustLevel] || ''}`}
                      >
                        {trustLevelLabels[listing.user.reputation.trustLevel] || listing.user.reputation.trustLevel}
                      </Badge>
                    )}
                  </div>
                </Link>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                {!isSold && !isReserved && !isOwner && (
                  <>
                    <Button
                      onClick={startChat}
                      className="w-full gap-2"
                      size="lg"
                      variant="outline"
                    >
                      <MessageCircle className="w-5 h-5" />
                      Contacter le vendeur
                    </Button>
                    <ReservationButton 
                      listingId={listing.id} 
                      listingStatus={listing.status}
                      sellerId={listing.userId}
                    />
                  </>
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

                {isReserved && !isOwner && (
                  <div className="text-center text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Cette annonce est actuellement réservée
                  </div>
                )}

                {isSold && !isOwner && (
                  <div className="text-center text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                    <Check className="w-4 h-4 inline mr-1" />
                    Cette annonce a été vendue
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleShare}
                  >
                    <Share2 className="w-4 h-4" />
                    Partager
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => setShowReportModal(true)}
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

              {/* Trust Badges */}
              {listing.user.reputation?.badges && listing.user.reputation.badges.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-xs font-medium text-gray-500 mb-2">Badges du vendeur</h4>
                  <div className="flex flex-wrap gap-2">
                    {listing.user.reputation.badges.map((badge: string) => (
                      <Badge key={badge} variant="secondary" className="gap-1">
                        {badge === 'VERIFIED' && '✅ Vérifié'}
                        {badge === 'TRUSTED' && '🤝 Fiable'}
                        {badge === 'TOP_SELLER' && '⭐ Top vendeur'}
                        {badge === 'FAST_RESPONDER' && '⚡ Réponse rapide'}
                        {badge === 'EXPERIENCED' && '🏆 Expérimenté'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
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
              {similarListings.data.map((similar: any) => (
                <ListingCard key={similar.id} listing={similar} />
              ))}
            </div>
          </div>
        )}

        {/* ==========================================
        REPORT MODAL
        ========================================== */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Signaler l'annonce</h3>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motif *
                  </label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Sélectionner un motif</option>
                    <option value="SPAM">Spam</option>
                    <option value="SCAM">Arnaque</option>
                    <option value="INAPPROPRIATE">Contenu inapproprié</option>
                    <option value="FAKE">Annonce frauduleuse</option>
                    <option value="DUPLICATE">Annonce en double</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={3}
                    placeholder="Décrivez le problème..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowReportModal(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    loading={reportMutation.isPending}
                  >
                    Signaler
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Wrap with Suspense
export default function ListingDetailPage() {
  return (
    <Suspense fallback={<ListingDetailSkeleton />}>
      <ListingDetailContent />
    </Suspense>
  );
}