'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';

interface MetaTagsProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  siteName?: string;
  twitterCard?: string;
  jsonLd?: any;
  children?: React.ReactNode;
}

export function MetaTags({
  title = 'GameMarket - Marketplace de jeux vidéo en Tunisie',
  description = 'Achetez, vendez et échangez vos jeux vidéo, consoles et accessoires en Tunisie.',
  image = '/og-image.jpg',
  url,
  type = 'website',
  siteName = 'GameMarket',
  twitterCard = 'summary_large_image',
  jsonLd,
  children,
}: MetaTagsProps) {
  const [isMounted, setIsMounted] = useState(false);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gamemarket.tn';
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;
  const fullImage = image.startsWith('http') ? image : `${baseUrl}${image}`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <Head>
      {/* Basic Meta */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="fr_TN" />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />

      {/* JSON-LD Structured Data */}
      {isMounted && jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
      )}

      {/* Favicon */}
      <link rel="icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

      {/* Additional children */}
      {children}
    </Head>
  );
}