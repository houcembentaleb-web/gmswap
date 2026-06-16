'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'react-hot-toast';
import { Lock, Truck, Shield } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const listingId = params.id as string;

  const [shippingAddress, setShippingAddress] = useState({
    street: '',
    city: '',
    postalCode: '',
    country: 'Tunisia',
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // ==========================================
  // FETCH LISTING
  // ==========================================

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const res = await api.get(`/listings/${listingId}`);
      return res.data;
    },
    enabled: !!listingId,
  });

  // ==========================================
  // CREATE ORDER
  // ==========================================

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/orders', {
        listingId,
        buyerMessage: 'Bonjour, je souhaite acheter ce jeu.',
        shippingAddress,
      });
      return res.data;
    },
    onSuccess: async (data) => {
      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      if (!stripe) {
        toast.error('Erreur de paiement');
        return;
      }

      const result = await stripe.confirmPayment({
        clientSecret: data.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/orders/${data.order.id}`,
        },
      });

      if (result.error) {
        toast.error(result.error.message || 'Erreur de paiement');
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erreur lors de la création de la commande');
    },
  });

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      router.push('/login');
      return;
    }

    if (user.id === listing?.userId) {
      toast.error('Vous ne pouvez pas acheter votre propre annonce');
      return;
    }

    if (listing?.status !== 'ACTIVE') {
      toast.error('Cette annonce n\'est plus disponible');
      return;
    }

    createOrderMutation.mutate();
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

  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h2 className="text-2xl font-bold text-gray-900">Annonce introuvable</h2>
        <Button onClick={() => router.push('/')} className="mt-4">
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  const total = listing.price + listing.price * 0.05; // 5% fees

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Finaliser l'achat</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Order Summary */}
        <div className="lg:col-span-2 order-2 lg:order-1">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex gap-4 mb-6">
              <img
                src={listing.images?.[0]?.url || '/placeholder.jpg'}
                alt={listing.title}
                className="w-24 h-24 object-cover rounded-lg"
              />
              <div>
                <h3 className="font-medium text-gray-900">{listing.title}</h3>
                <p className="text-sm text-gray-500">{listing.category}</p>
                <p className="text-lg font-bold text-indigo-600 mt-1">
                  {listing.price.toFixed(2)} DT
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <h4 className="font-medium text-gray-900">Adresse de livraison</h4>
              <Input
                label="Rue"
                value={shippingAddress.street}
                onChange={(e) =>
                  setShippingAddress({ ...shippingAddress, street: e.target.value })
                }
                required
              />
              <Input
                label="Ville"
                value={shippingAddress.city}
                onChange={(e) =>
                  setShippingAddress({ ...shippingAddress, city: e.target.value })
                }
                required
              />
              <Input
                label="Code postal"
                value={shippingAddress.postalCode}
                onChange={(e) =>
                  setShippingAddress({ ...shippingAddress, postalCode: e.target.value })
                }
                required
              />
              <Input
                label="Pays"
                value={shippingAddress.country}
                onChange={(e) =>
                  setShippingAddress({ ...shippingAddress, country: e.target.value })
                }
                required
              />

              <Button
                type="submit"
                className="w-full mt-4"
                loading={createOrderMutation.isPending}
                disabled={createOrderMutation.isPending}
              >
                <Lock className="w-4 h-4 mr-2" />
                Payer {total.toFixed(2)} DT
              </Button>
            </form>
          </div>
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1 order-1 lg:order-2">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 sticky top-8">
            <h3 className="font-medium text-gray-900 mb-4">Récapitulatif</h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Prix</span>
                <span className="font-medium">{listing.price.toFixed(2)} DT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Frais de service (5%)</span>
                <span className="font-medium">{(listing.price * 0.05).toFixed(2)} DT</span>
              </div>
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-indigo-600">{total.toFixed(2)} DT</span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Paiement sécurisé
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Livraison gérée par le vendeur
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}