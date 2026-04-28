
import { supabase } from './supabaseClient';
import { CostSettings } from '../types';

export const ADMIN_EMAILS = ['info@verbouwscan.com', 'vandeweijer@gmail.com'];
export const ADMIN_EMAIL = ADMIN_EMAILS[0];
export const isAdminEmail = (email?: string | null) => !!email && ADMIN_EMAILS.includes(email);

export const settingsService = {
  // ── Per-user settings ──────────────────────────────────────────────────────

  async load(): Promise<CostSettings | null> {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .maybeSingle();

    if (error || !data) return null;
    return data.settings as CostSettings;
  },

  async save(settings: CostSettings): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Niet ingelogd');

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userData.user.id,
        settings,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  },

  // ── Global admin defaults (1 row, id = 1) ─────────────────────────────────
  // Table SQL (run once in Supabase dashboard):
  //
  //   CREATE TABLE global_defaults (
  //     id      INTEGER PRIMARY KEY DEFAULT 1,
  //     settings JSONB   NOT NULL,
  //     updated_at TIMESTAMPTZ DEFAULT now(),
  //     CONSTRAINT single_row CHECK (id = 1)
  //   );
  //   ALTER TABLE global_defaults ENABLE ROW LEVEL SECURITY;
  //   CREATE POLICY "Public read"  ON global_defaults FOR SELECT USING (true);
  //   CREATE POLICY "Admin write"  ON global_defaults FOR ALL
  //     USING      ((auth.jwt() ->> 'email') = 'info@verbouwscan.com')
  //     WITH CHECK ((auth.jwt() ->> 'email') = 'info@verbouwscan.com');

  async loadGlobalDefaults(): Promise<CostSettings | null> {
    const { data, error } = await supabase
      .from('global_defaults')
      .select('settings')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return null;
    return data.settings as CostSettings;
  },

  async saveGlobalDefaults(settings: CostSettings): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Niet ingelogd');

    const { error } = await supabase
      .from('global_defaults')
      .upsert(
        { id: 1, settings, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );

    if (error) throw error;
  },
};
