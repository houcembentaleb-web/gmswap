'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { toast } from 'react-hot-toast';

interface ReservationButtonProps {
  listingId: string;
  listingStatus: string;
  sellerId: string;
}

export function ReservationButton({ listingId, listingStatus, sellerId }: ReservationButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleReserve = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (user.id === sellerId) {
      toast.error('Vous ne pouvez pas réserver votre propre annonce');
      return;
    }

    if (listingStatus !== 'ACTIVE') {
      toast.error('Cette annonce n\'est plus disponible');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/reservations', {
        listingId,
        message: 'Je souhaite réserver cet article',
      });

      toast.success('Réservation envoyée au vendeur');
      router.push(`/reservations/${response.data.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur lors de la réservation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleReserve}
      loading={loading}
      disabled={listingStatus !== 'ACTIVE' || loading}
      className="w-full gap-2"
    >
      Réserver
    </Button>
  );
}