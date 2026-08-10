export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      book_copies: {
        Row: {
          accession_number: string
          acquired_on: string | null
          book_id: string
          condition: Database["public"]["Enums"]["copy_condition"]
          created_at: string
          id: string
          price: number | null
          rack_no: string | null
          remarks: string | null
          row_no: string | null
          section: string | null
          status: Database["public"]["Enums"]["copy_status"]
          updated_at: string
        }
        Insert: {
          accession_number: string
          acquired_on?: string | null
          book_id: string
          condition?: Database["public"]["Enums"]["copy_condition"]
          created_at?: string
          id?: string
          price?: number | null
          rack_no?: string | null
          remarks?: string | null
          row_no?: string | null
          section?: string | null
          status?: Database["public"]["Enums"]["copy_status"]
          updated_at?: string
        }
        Update: {
          accession_number?: string
          acquired_on?: string | null
          book_id?: string
          condition?: Database["public"]["Enums"]["copy_condition"]
          created_at?: string
          id?: string
          price?: number | null
          rack_no?: string | null
          remarks?: string | null
          row_no?: string | null
          section?: string | null
          status?: Database["public"]["Enums"]["copy_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_copies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_copies_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_books_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string
          category: Database["public"]["Enums"]["material_category"]
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          edition: string | null
          id: string
          isbn: string | null
          language: string
          publisher: string | null
          search_vector: unknown
          title: string
          updated_at: string
          year: number | null
        }
        Insert: {
          author: string
          category?: Database["public"]["Enums"]["material_category"]
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          edition?: string | null
          id?: string
          isbn?: string | null
          language?: string
          publisher?: string | null
          search_vector?: unknown
          title: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          author?: string
          category?: Database["public"]["Enums"]["material_category"]
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          edition?: string | null
          id?: string
          isbn?: string | null
          language?: string
          publisher?: string | null
          search_vector?: unknown
          title?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      fines: {
        Row: {
          amount: number | null
          assessed_at: string | null
          collected_by: string | null
          created_at: string
          fine_type: Database["public"]["Enums"]["fine_type"]
          id: string
          is_paid: boolean
          is_waived: boolean
          loan_id: string
          member_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_note: string | null
          updated_at: string
          waived_at: string | null
          waived_by: string | null
          waiver_reason: string | null
        }
        Insert: {
          amount?: number | null
          assessed_at?: string | null
          collected_by?: string | null
          created_at?: string
          fine_type?: Database["public"]["Enums"]["fine_type"]
          id?: string
          is_paid?: boolean
          is_waived?: boolean
          loan_id: string
          member_id: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_note?: string | null
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Update: {
          amount?: number | null
          assessed_at?: string | null
          collected_by?: string | null
          created_at?: string
          fine_type?: Database["public"]["Enums"]["fine_type"]
          id?: string
          is_paid?: boolean
          is_waived?: boolean
          loan_id?: string
          member_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_note?: string | null
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fines_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loans_with_fine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_events: {
        Row: {
          actor_id: string | null
          copy_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: number
          loan_id: string | null
          member_id: string | null
        }
        Insert: {
          actor_id?: string | null
          copy_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: never
          loan_id?: string | null
          member_id?: string | null
        }
        Update: {
          actor_id?: string | null
          copy_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: never
          loan_id?: string | null
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_events_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "book_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_events_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_events_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loans_with_fine"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          book_id: string
          closed_reason: string | null
          copy_id: string
          created_at: string
          due_date: string
          fine_per_day_at_issue: number
          id: string
          issued_at: string
          issued_by: string
          last_renewed_at: string | null
          last_renewed_by: string | null
          loan_period_days_at_issue: number
          member_id: string
          notes: string | null
          renewal_count: number
          returned_at: string | null
          returned_to: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          closed_reason?: string | null
          copy_id: string
          created_at?: string
          due_date: string
          fine_per_day_at_issue: number
          id?: string
          issued_at?: string
          issued_by: string
          last_renewed_at?: string | null
          last_renewed_by?: string | null
          loan_period_days_at_issue: number
          member_id: string
          notes?: string | null
          renewal_count?: number
          returned_at?: string | null
          returned_to?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          closed_reason?: string | null
          copy_id?: string
          created_at?: string
          due_date?: string
          fine_per_day_at_issue?: number
          id?: string
          issued_at?: string
          issued_by?: string
          last_renewed_at?: string | null
          last_renewed_by?: string | null
          loan_period_days_at_issue?: number
          member_id?: string
          notes?: string | null
          renewal_count?: number
          returned_at?: string | null
          returned_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_books_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "book_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_last_renewed_by_fkey"
            columns: ["last_renewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_returned_to_fkey"
            columns: ["returned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          address: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          declared_member_type:
            | Database["public"]["Enums"]["member_type"]
            | null
          department: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          member_type: Database["public"]["Enums"]["member_type"] | null
          notes: string | null
          phone: string | null
          photo_path: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          role: Database["public"]["Enums"]["user_role"]
          roll_number: string | null
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          declared_member_type?:
            | Database["public"]["Enums"]["member_type"]
            | null
          department?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          member_type?: Database["public"]["Enums"]["member_type"] | null
          notes?: string | null
          phone?: string | null
          photo_path?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          roll_number?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          declared_member_type?:
            | Database["public"]["Enums"]["member_type"]
            | null
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          member_type?: Database["public"]["Enums"]["member_type"] | null
          notes?: string | null
          phone?: string | null
          photo_path?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          roll_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          fine_per_day: number
          id: number
          library_name: string
          loan_period_days: number
          loan_period_days_staff: number
          max_books_staff: number
          max_books_student: number
          max_renewals: number
          public_registration: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          fine_per_day?: number
          id?: number
          library_name?: string
          loan_period_days?: number
          loan_period_days_staff?: number
          max_books_staff?: number
          max_books_student?: number
          max_renewals?: number
          public_registration?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          fine_per_day?: number
          id?: number
          library_name?: string
          loan_period_days?: number
          loan_period_days_staff?: number
          max_books_staff?: number
          max_books_student?: number
          max_renewals?: number
          public_registration?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_books_catalogue: {
        Row: {
          author: string | null
          available_copies: number | null
          category: Database["public"]["Enums"]["material_category"] | null
          department: string | null
          description: string | null
          edition: string | null
          id: string | null
          isbn: string | null
          issued_copies: number | null
          language: string | null
          publisher: string | null
          search_vector: unknown
          title: string | null
          total_copies: number | null
          year: number | null
        }
        Relationships: []
      }
      v_loans_with_fine: {
        Row: {
          accession_number: string | null
          book_author: string | null
          book_id: string | null
          book_title: string | null
          closed_reason: string | null
          copy_id: string | null
          days_overdue: number | null
          due_date: string | null
          fine_amount: number | null
          fine_assessed_at: string | null
          fine_id: string | null
          fine_is_paid: boolean | null
          fine_is_waived: boolean | null
          fine_outstanding: number | null
          fine_per_day_at_issue: number | null
          id: string | null
          is_open: boolean | null
          is_overdue: boolean | null
          issued_at: string | null
          issued_by: string | null
          loan_period_days_at_issue: number | null
          member_id: string | null
          member_name: string | null
          member_roll_number: string | null
          member_type: Database["public"]["Enums"]["member_type"] | null
          renewal_count: number | null
          returned_at: string | null
          returned_to: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "v_books_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "book_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_returned_to_fkey"
            columns: ["returned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_member_dues: {
        Row: {
          books_out: number | null
          books_overdue: number | null
          member_id: string | null
          total_outstanding: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_and_issue: {
        Args: {
          p_accession_number: string
          p_member_type?: Database["public"]["Enums"]["member_type"]
          p_profile_id: string
        }
        Returns: {
          book_title: string
          due_date: string
          loan_id: string
          loans_out: number
          max_loans: number
          member_name: string
        }[]
      }
      approve_member: {
        Args: {
          p_department?: string
          p_member_type?: Database["public"]["Enums"]["member_type"]
          p_profile_id: string
          p_roll_number?: string
        }
        Returns: {
          member_name: string
          member_type: Database["public"]["Enums"]["member_type"]
          profile_id: string
        }[]
      }
      assert_librarian: { Args: never; Returns: string }
      assess_overdue_fine: { Args: { p_loan_id: string }; Returns: string }
      calculate_fine: {
        Args: {
          p_due_date: string
          p_fine_per_day: number
          p_returned_at: string
          p_today: string
        }
        Returns: number
      }
      current_profile: {
        Args: never
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          address: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          declared_member_type:
            | Database["public"]["Enums"]["member_type"]
            | null
          department: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          member_type: Database["public"]["Enums"]["member_type"] | null
          notes: string | null
          phone: string | null
          photo_path: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          role: Database["public"]["Enums"]["user_role"]
          roll_number: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_approved_user: { Args: never; Returns: boolean }
      is_librarian: { Args: never; Returns: boolean }
      issue_book: {
        Args: { p_accession_number: string; p_member_id: string }
        Returns: {
          book_title: string
          due_date: string
          loan_id: string
          loans_out: number
          max_loans: number
          member_name: string
        }[]
      }
      mark_copy_lost: {
        Args: { p_accession_number: string; p_note?: string }
        Returns: {
          book_title: string
          closed_loan: string
          copy_id: string
        }[]
      }
      member_active_loan_count: {
        Args: { p_member_id: string }
        Returns: number
      }
      member_unpaid_fine_total: {
        Args: { p_member_id: string }
        Returns: number
      }
      next_accession_number: { Args: never; Returns: string }
      pay_fine: {
        Args: { p_fine_id: string; p_note?: string }
        Returns: {
          amount_paid: number
          fine_id: string
          member_name: string
        }[]
      }
      register_member: {
        Args: {
          p_declared_member_type: Database["public"]["Enums"]["member_type"]
          p_department: string
          p_full_name: string
          p_phone?: string
          p_roll_number: string
          p_user_id: string
        }
        Returns: {
          profile_id: string
          status: Database["public"]["Enums"]["account_status"]
        }[]
      }
      reject_member: {
        Args: { p_profile_id: string; p_reason?: string }
        Returns: {
          member_name: string
          profile_id: string
        }[]
      }
      renew_loan: {
        Args: { p_loan_id: string }
        Returns: {
          book_title: string
          due_date: string
          loan_id: string
          max_renewals: number
          member_name: string
          renewal_count: number
        }[]
      }
      return_book: {
        Args: { p_loan_id: string }
        Returns: {
          book_title: string
          days_late: number
          fine_amount: number
          fine_id: string
          loan_id: string
          member_name: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      today_ist: { Args: never; Returns: string }
      waive_fine: {
        Args: { p_fine_id: string; p_reason: string }
        Returns: {
          amount_waived: number
          fine_id: string
          member_name: string
        }[]
      }
    }
    Enums: {
      account_status: "pending" | "active" | "rejected"
      copy_condition: "new" | "good" | "fair" | "poor"
      copy_status: "available" | "issued" | "lost" | "damaged"
      fine_type: "overdue" | "lost" | "damage"
      material_category:
        | "book"
        | "non_book_material"
        | "project"
        | "thesis"
        | "proceeding"
        | "magazine"
      member_type: "student" | "staff"
      user_role: "librarian" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["pending", "active", "rejected"],
      copy_condition: ["new", "good", "fair", "poor"],
      copy_status: ["available", "issued", "lost", "damaged"],
      fine_type: ["overdue", "lost", "damage"],
      material_category: [
        "book",
        "non_book_material",
        "project",
        "thesis",
        "proceeding",
        "magazine",
      ],
      member_type: ["student", "staff"],
      user_role: ["librarian", "member"],
    },
  },
} as const
