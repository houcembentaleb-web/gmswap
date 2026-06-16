'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from 'react-hot-toast';
import { User, Lock, Bell, LogOut } from 'lucide-react';

const profileSchema = z.object({
  username: z.string().min(3, 'Min 3 caractères'),
  email: z.string().email('Email invalide'),
  bio: z.string().optional(),
  location: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(6, 'Min 6 caractères'),
  newPassword: z.string().min(6, 'Min 6 caractères'),
  confirmPassword: z.string().min(6, 'Min 6 caractères'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'notifications'>('profile');

  // ==========================================
  // PROFILE FORM
  // ==========================================

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<ProfileFormData>({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        username: user?.username || '',
        email: user?.email || '',
        bio: user?.bio || '',
        location: user?.location || '',
      },
    });

  const onSubmitProfile = async (data: ProfileFormData) => {
    try {
      await api.put('/profile/me', data);
      toast.success('Profil mis à jour');
      router.refresh();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // ==========================================
  // PASSWORD FORM
  // ==========================================

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors, isSubmitting: passwordSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmitPassword = async (data: PasswordFormData) => {
    try {
      await api.post('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Mot de passe changé');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erreur');
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = async () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      await logout();
      router.push('/login');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Paramètres</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="md:w-48 space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'profile'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <User className="w-4 h-4" />
            Profil
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'password'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Lock className="w-4 h-4" />
            Sécurité
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'notifications'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Bell className="w-4 h-4" />
            Notifications
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>

        {/* Content */}
        <div className="flex-1">
          {/* Profil */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold mb-4">Informations du profil</h2>
              <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-4">
                <Input
                  label="Nom d'utilisateur"
                  {...register('username')}
                  error={errors.username?.message}
                />
                <Input
                  label="Email"
                  type="email"
                  {...register('email')}
                  error={errors.email?.message}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bio
                  </label>
                  <textarea
                    {...register('bio')}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <Input
                  label="Localisation"
                  {...register('location')}
                />
                <Button type="submit" loading={isSubmitting}>
                  Enregistrer
                </Button>
              </form>
            </div>
          )}

          {/* Sécurité */}
          {activeTab === 'password' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold mb-4">Changer le mot de passe</h2>
              <form onSubmit={handlePasswordSubmit(onSubmitPassword)} className="space-y-4">
                <Input
                  label="Mot de passe actuel"
                  type="password"
                  {...registerPassword('currentPassword')}
                  error={passwordErrors.currentPassword?.message}
                />
                <Input
                  label="Nouveau mot de passe"
                  type="password"
                  {...registerPassword('newPassword')}
                  error={passwordErrors.newPassword?.message}
                />
                <Input
                  label="Confirmer le mot de passe"
                  type="password"
                  {...registerPassword('confirmPassword')}
                  error={passwordErrors.confirmPassword?.message}
                />
                <Button type="submit" loading={passwordSubmitting}>
                  Changer le mot de passe
                </Button>
              </form>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-xl font-bold mb-4">Notifications</h2>
              <p className="text-gray-500">Configuration des notifications à venir</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}