
import { supabase } from './supabaseClient';
import { SavedProject, CostSettings, HouseMetadata, RoomAnalysis, WallState } from '../types';

export const projectService = {
async upsertProject(data: {
    id?: string;
    name: string;
    fml_content: string;
    analysis_state: any;
    wall_state?: Record<string, WallState>;
    cost_settings: CostSettings;
    meta: HouseMetadata;
  }): Promise<SavedProject> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('User not authenticated');

    const projectPayload = {
      ...data,
      user_id: userData.user.id,
      updated_at: new Date().toISOString()
    };

    const { data: result, error } = await supabase
      .from('projects')
      .upsert(projectPayload)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async getProjects(): Promise<Partial<SavedProject>[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getProjectById(id: string): Promise<SavedProject> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
