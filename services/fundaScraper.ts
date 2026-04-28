// Dunne client — Serper.dev en ScrapingBee calls lopen via de Supabase Edge Function
// 'funda-scraper'. API keys staan alleen in de Supabase Secrets vault.

import { supabaseFunctions as supabase } from './supabaseClient';

export interface ScrapedIdentification {
  projectId: string | null;
  photoIds: string[];
  description: string;
  htmlContent: string;
  metadata: {
    address: string;
    zipcode: string;
    city: string;
    price: string;
    energyLabel: string;
    yearBuilt: string;
    houseType: string;
  }
}

interface SearchResult {
  found: boolean;
  url?: string;
  title?: string;
  message: string;
}

// ── Hulp: Edge Function aanroepen + logs doorsturen ──────────────────────────

async function invokeFundaScraper<T>(
  action: string,
  payload: Record<string, unknown>,
  onLog?: (msg: string) => void,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('funda-scraper', {
    body: { action, payload },
  });
  if (error) throw error;
  const response = data as { result?: T; error?: string; logs?: string[] };
  response.logs?.forEach(msg => onLog?.(msg));
  if (response.error) throw new Error(response.error);
  return response.result as T;
}

// ── Publieke functies (zelfde signatuur als voorheen) ────────────────────────

/**
 * Zoekt de specifieke Funda-link bij een adres via google.serper.dev (server-side).
 */
export async function findFundaUrl(
  zipcode: string,
  houseNumber: string,
  onLog?: (msg: string) => void,
): Promise<SearchResult> {
  return invokeFundaScraper<SearchResult>('findUrl', { zipcode, houseNumber }, onLog);
}

/**
 * Scrapt de Funda-pagina via ScrapingBee proxy (server-side).
 */
export async function identifyFundaListing(
  url: string,
  onLog?: (msg: string) => void,
): Promise<ScrapedIdentification> {
  return invokeFundaScraper<ScrapedIdentification>('identify', { url }, onLog);
}

/**
 * Download de FML plattegrond. Server-side (geen CORS restricties).
 */
export async function downloadFML(
  projectId: string,
  onLog?: (msg: string) => void,
): Promise<string | null> {
  return invokeFundaScraper<string | null>('fmlDownload', { projectId }, onLog);
}

/**
 * Download een Funda-foto als base64. Rechtstreeks vanuit de browser —
 * de Funda CDN is publiek toegankelijk, geen API key nodig.
 */
export async function downloadPhotoBase64(pid: string): Promise<string | null> {
  const url = `https://cloud.funda.nl/valentina_media/${pid}_480x360.jpg`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
