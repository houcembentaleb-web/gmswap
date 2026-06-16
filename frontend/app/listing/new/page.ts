'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'react-hot-toast';
import { ImagePlus, X, Upload, Loader2 } from 'lucide-react';

const listingSchema = z.object({
  title: z.string().min(3, 'Titre trop court').max(100, 'Titre trop long'),
  description: z.string().optional(),
  category: z.string().min(1, 'Catégorie requise'),
  platform: z.string().optional(),
  condition: z.string().min(1, 'État requis'),
  price: z.number().min(0, 'Prix invalide'),
  isNegotiable: z.boolean().default(true),
  acceptsSwap: z.boolean().default(false),
  location: z.string().optional(),
});

type ListingFormData = z.infer<typeof listingSchema>;

const categories = ['GAME', 'CONSOLE', 'ACCESSORY', 'COLLECTIBLE', 'MERCH'];
const platforms = ['PS5', 'PS4', 'SWITCH', 'XBOX', 'PC', 'MOBILE', 'RETRO'];
const conditions = ['NEW', 'LIKE_NEW', 'GOOD', 'USED', 'FAIR', 'REFURBISHED'];

export default function CreateListingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      isNegotiable: true,
      acceptsSwap: false,
    },
  });

  const isNegotiable = watch('isNegotiable');
  const acceptsSwap = watch('acceptsSwap');

  // ==========================================
  // IMAGE HANDLING
  // ==========================================

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(
      (file) => file.size <= 10 * 1024 * 1024 && file.type.startsWith('image/')
    );

    if (validFiles.length + images.length > 10) {
      toast.error('Maximum 10 images');
      return;
    }

    setImages((prev) => [...prev, ...validFiles]);

    const previews = validFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews((prev) => [...prev, ...previews]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ==========================================
  // SUBMIT
  // ==========================================

  const onSubmit = async (data: ListingFormData) => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (images.length === 0) {
      toast.error('Ajoutez au moins une image');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Create listing
      const listingResponse = await api.post('/listings', data);
      const listingId = listingResponse.data.id;

      // 2. Upload images
      if (images.length > 0) {
        const formData = new FormData();
        images.forEach((image) => {
          formData.append('images', image);
        });

        await api.post(`/listings/${listingId}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      // 3. Publish
      await api.post(`/listings/${listingId}/publish`);

      toast.success('Annonce créée avec succès !');
      router.push(`/listing/${listingId}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        Mettre en vente
      </h1>
      <p className="text-gray-500 mb-8">
        Remplissez les informations de votre annonce
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Title */}
        <div>
          <Input
            label="Titre de l'annonce"
            placeholder="Ex: FIFA 25 - PS5 (Neuf)"
            {...register('title')}
            error={errors.title?.message}
          />
        </div>

        {/* Category & Platform */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Catégorie
            </label>
            <select
              {...register('category')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Sélectionner</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="text-sm text-red-500 mt-1">{errors.category.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plateforme
            </label>
            <select
              {...register('platform')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Sélectionner</option>
              {platforms.map((plat) => (
                <option key={plat} value={plat}>
                  {plat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Condition & Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              État
            </label>
            <select
              {...register('condition')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Sélectionner</option>
              {conditions.map((cond) => (
                <option key={cond} value={cond}>
                  {cond}
                </option>
              ))}
            </select>
            {errors.condition && (
              <p className="text-sm text-red-500 mt-1">{errors.condition.message}</p>
            )}
          </div>

          <div>
            <Input
              label="Prix (DT)"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('price', { valueAsNumber: true })}
              error={errors.price?.message}
            />
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('isNegotiable')}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">Prix négociable</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('acceptsSwap')}
              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">Troc possible</span>
          </label>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            {...register('description')}
            rows={5}
            placeholder="Décrivez votre jeu, son état, son histoire..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Location */}
        <div>
          <Input
            label="Localisation"
            placeholder="Tunis, Sousse, ..."
            {...register('location')}
          />
        </div>

        {/* Images */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Images (max 10)
          </label>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-500 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <ImagePlus className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">
              Cliquez ou déposez vos images ici
            </p>
            <p className="text-sm text-gray-400">
              JPG, PNG, WEBP (max 10MB)
            </p>
          </div>

          {/* Image previews */}
          {imagePreviews.length > 0 && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={submitting || uploading}
          >
            {submitting ? 'Publication...' : 'Publier l\'annonce'}
          </Button>
        </div>
      </form>
    </div>
  );
}