export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'main_user' | 'sub_user'
          parent_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role: 'main_user' | 'sub_user'
          parent_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'main_user' | 'sub_user'
          parent_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      links: {
        Row: {
          id: string
          link: string
          link_id: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          link: string
          link_id: string
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          link?: string
          link_id?: string
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      bulk_submissions: {
        Row: {
          id: string
          submitted_by: string
          content: string
          status: 'pending' | 'processing' | 'completed' | 'failed'
          created_at: string
        }
        Insert: {
          id?: string
          submitted_by: string
          content: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          created_at?: string
        }
        Update: {
          id?: string
          submitted_by?: string
          content?: string
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          created_at?: string
        }
      }
    }
  }
}
