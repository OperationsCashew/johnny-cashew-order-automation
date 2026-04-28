
// Dunne client — alle Gemini-calls lopen via de Supabase Edge Function 'analyse-gemini'.
// De API key staat alleen nog in de Supabase Secrets vault, nooit in de browser.

import { supabaseFunctions as supabase } from './supabaseClient';
import { CustomRenovationItem } from '../types';

async function invokeGemini<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('analyse-gemini', {
    body: { action, payload },
  });
  if (error) throw error;
  return (data as { result: T }).result;
}

/**
 * Analyseert de tekstuele omschrijving van Funda.
 */
export async function analyzeFundaText(description: string, roomNames: string[]): Promise<any[]> {
  if (!description || description.length < 50) return [];
  try {
    return await invokeGemini<any[]>('fundaText', { description, roomNames });
  } catch (error) {
    console.error('Funda Text Analysis Error:', error);
    return [];
  }
}

/**
 * Analyseert foto's in batches van 10 voor optimale snelheid en context.
 */
export async function analyzeRoomPhotos(base64Images: string[], roomNames: string[]): Promise<any[]> {
  return invokeGemini<any[]>('roomPhotos', { base64Images, roomNames });
}

/**
 * Schat de kosten van een vrij ingevoerde renovatiewerkzaamheid.
 */
export async function estimateCustomRenovationItem(
  userInput: string,
  roomContext: {
    roomName: string;
    floorArea: number;
    wallArea: number;
    ceilingArea: number;
    perimeter: number;
    height: number;
    windowCount: number;
    doorCount: number;
    windowArea: number;
    doorArea: number;
    extWallArea: number;
    intWallArea: number;
    extWindowCount: number;
    extDoorCount: number;
    extWindowArea: number;
    extDoorArea: number;
    yearBuilt?: string;
    qualityDescription?: string;
  }
): Promise<Omit<CustomRenovationItem, 'id' | 'userInput'>> {
  return invokeGemini<Omit<CustomRenovationItem, 'id' | 'userInput'>>('estimateCustomItem', {
    userInput,
    ...roomContext,
  });
}

/**
 * Vat alle observaties samen tot één krachtig renovatieadvies.
 */
export async function synthesizeRoomStatus(descriptions: string[]): Promise<string> {
  if (descriptions.length === 0) return '';
  try {
    return await invokeGemini<string>('synthesize', { descriptions });
  } catch {
    return descriptions[0] || '';
  }
}
