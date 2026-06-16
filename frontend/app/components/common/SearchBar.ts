'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';

interface Suggestion {
  title: string;
  category: string;
  platform: string;
  price: number;
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ==========================================
  // FETCH SUGGESTIONS
  // ==========================================

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const res = await api.get('/search/autocomplete', {
          params: { q: debouncedQuery, limit: 8 },
        });
        setSuggestions(res.data);
        setIsOpen(true);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery]);

  // ==========================================
  // CLOSE ON CLICK OUTSIDE
  // ==========================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    router.push(`/search?q=${encodeURIComponent(suggestion.title)}`);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full">
      <form onSubmit={handleSearch} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.length >= 2) {
              setIsOpen(true);
            } else {
              setIsOpen(false);
            }
          }}
          onFocus={() => {
            if (query.length >= 2 && suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher un jeu, une console..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </form>

      {/* Suggestions Dropdown */}
      {isOpen && (suggestions.length > 0 || loading) && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50"
        >
          {loading ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Recherche en cours...
            </div>
          ) : (
            <div className="py-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {suggestion.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {suggestion.category} · {suggestion.platform || 'Toutes plates-formes'}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-indigo-600">
                    {suggestion.price.toFixed(2)} DT
                  </span>
                </button>
              ))}
              {suggestions.length > 0 && (
                <div className="border-t border-gray-100 mt-2 pt-2 px-4">
                  <button
                    onClick={handleSearch}
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    Voir tous les résultats pour "{query}"
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}