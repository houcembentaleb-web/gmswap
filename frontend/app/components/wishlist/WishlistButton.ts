'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Heart } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface WishlistButtonProps {
  listingId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function WishlistButton({
  listingId,
  className,
  size = 'md',
  showLabel = false,
}: WishlistButtonProps) {
  const { user } = useAuth();
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [loading, setLoading] = useState(false);

  // ==========================================
  // CHECK WISHLIST STATUS
  // ==========================================

  useEffect(() => {
    if (!user) return;

    const checkStatus = async () => {
      try {
        const res = await api.get(`/wishlist/check/${listingId}`);
        setIsInWishlist(res.data.isInWishlist);
      } catch (error) {
        // Silent fail
      }
    };

    checkStatus();
  }, [listingId, user]);

  // ==========================================
  // TOGGLE WISHLIST
  // ==========================================

  const toggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast.error('Connectez-vous pour ajouter aux favoris');
      return;
    }

    setLoading(true);

    try {
      if (isInWishlist) {
        await api.delete(`/wishlist/${listingId}`);
        setIsInWishlist(false);
        toast.success('Retiré des favoris');
      } else {
        await api.post('/wishlist', { listingId });
        setIsInWishlist(true);
        toast.success('Ajouté aux favoris');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <button
      onClick={toggleWishlist}
      disabled={loading}
      className={cn(
        'rounded-full transition-all duration-200 hover:scale-110',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
        isInWishlist
          ? 'bg-red-50 text-red-500 hover:bg-red-100'
          : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
        sizeClasses[size],
        className
      )}
      aria-label={isInWishlist ? 'Retirer des favoris' : 'Ajouter aux favoris'}
    >
      <Heart
        className={cn(
          iconSizes[size],
          isInWishlist && 'fill-current'
        )}
      />
      {showLabel && (
        <span className="ml-2 text-sm">
          {isInWishlist ? 'Favori' : 'Ajouter aux favoris'}
        </span>
      )}
    </button>
  );
}