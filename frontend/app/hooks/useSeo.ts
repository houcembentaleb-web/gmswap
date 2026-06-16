'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface SeoData {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
  siteName: string;
  twitterCard: string;
  jsonLd?: any;
}

export function useSeo(path: string, params?: { id?: string; q?: string }) {
  const [seoData, setSeoData] = useState<SeoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSeo = async () => {
      try {
        const res = await api.get('/seo/meta', {
          params: {
            path,
            ...params,
          },
        });
        setSeoData(res.data);
      } catch (error) {
        console.error('Failed to fetch SEO data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSeo();
  }, [path, params?.id, params?.q]);

  return { seoData, loading };
}