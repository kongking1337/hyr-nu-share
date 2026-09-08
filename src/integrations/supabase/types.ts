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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          base_price: number
          created_at: string
          days: number
          delivery: boolean
          delivery_fee: number
          deposit: number
          end_date: string
          id: string
          insurance_fee: number
          listing_id: string
          message: string | null
          owner_id: string | null
          renter_id: string
          service_fee: number
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          total_price: number
        }
        Insert: {
          base_price?: number
          created_at?: string
          days?: number
          delivery?: boolean
          delivery_fee?: number
          deposit?: number
          end_date: string
          id?: string
          insurance_fee?: number
          listing_id: string
          message?: string | null
          owner_id?: string | null
          renter_id: string
          service_fee?: number
          start_date: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
        }
        Update: {
          base_price?: number
          created_at?: string
          days?: number
          delivery?: boolean
          delivery_fee?: number
          deposit?: number
          end_date?: string
          id?: string
          insurance_fee?: number
          listing_id?: string
          message?: string | null
          owner_id?: string | null
          renter_id?: string
          service_fee?: number
          start_date?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          icon: string
          name: string
          slug: string
          sort: number
          synonyms: string[]
        }
        Insert: {
          icon?: string
          name: string
          slug: string
          sort?: number
          synonyms?: string[]
        }
        Update: {
          icon?: string
          name?: string
          slug?: string
          sort?: number
          synonyms?: string[]
        }
        Relationships: []
      }
      companies: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          org_number: string | null
          owner_id: string | null
          verified: boolean
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          org_number?: string | null
          owner_id?: string | null
          verified?: boolean
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          org_number?: string | null
          owner_id?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      company_admins: {
        Row: {
          company_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_admins_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          listing_id: string | null
          owner_id: string
          renter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string | null
          owner_id: string
          renter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          listing_id?: string | null
          owner_id?: string
          renter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sources: {
        Row: {
          kind: string
          last_sync: string
          name: string
          note: string | null
          requires_agreement: boolean
          slug: string
          status: string
        }
        Insert: {
          kind?: string
          last_sync?: string
          name: string
          note?: string | null
          requires_agreement?: boolean
          slug: string
          status?: string
        }
        Update: {
          kind?: string
          last_sync?: string
          name?: string
          note?: string | null
          requires_agreement?: boolean
          slug?: string
          status?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          area: string | null
          booking_count: number
          category_slug: string
          city: string
          company_id: string | null
          created_at: string
          delivery_available: boolean
          delivery_fee: number
          deposit: number
          description: string
          id: string
          images: string[]
          instant_book: boolean
          insurance_fee: number
          lat: number
          lng: number
          owner_id: string | null
          owner_name: string
          owner_type: Database["public"]["Enums"]["account_type"]
          pickup_available: boolean
          price_day: number
          price_hour: number | null
          price_month: number | null
          price_week: number | null
          rating: number
          review_count: number
          service_fee_pct: number
          status: string
          title: string
        }
        Insert: {
          area?: string | null
          booking_count?: number
          category_slug: string
          city: string
          company_id?: string | null
          created_at?: string
          delivery_available?: boolean
          delivery_fee?: number
          deposit?: number
          description?: string
          id?: string
          images?: string[]
          instant_book?: boolean
          insurance_fee?: number
          lat?: number
          lng?: number
          owner_id?: string | null
          owner_name?: string
          owner_type?: Database["public"]["Enums"]["account_type"]
          pickup_available?: boolean
          price_day: number
          price_hour?: number | null
          price_month?: number | null
          price_week?: number | null
          rating?: number
          review_count?: number
          service_fee_pct?: number
          status?: string
          title: string
        }
        Update: {
          area?: string | null
          booking_count?: number
          category_slug?: string
          city?: string
          company_id?: string | null
          created_at?: string
          delivery_available?: boolean
          delivery_fee?: number
          deposit?: number
          description?: string
          id?: string
          images?: string[]
          instant_book?: boolean
          insurance_fee?: number
          lat?: number
          lng?: number
          owner_id?: string | null
          owner_name?: string
          owner_type?: Database["public"]["Enums"]["account_type"]
          pickup_available?: boolean
          price_day?: number
          price_hour?: number | null
          price_month?: number | null
          price_week?: number | null
          rating?: number
          review_count?: number
          service_fee_pct?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "listings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          image_url: string | null
          kind: string
          sender_id: string | null
        }
        Insert: {
          body?: string
          conversation_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          email_verified: boolean
          full_name: string
          id: string
          id_verified: boolean
          phone: string | null
          phone_verified: boolean
          rating: number
          review_count: number
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          email_verified?: boolean
          full_name?: string
          id: string
          id_verified?: boolean
          phone?: string | null
          phone_verified?: boolean
          rating?: number
          review_count?: number
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          email_verified?: boolean
          full_name?: string
          id?: string
          id_verified?: boolean
          phone?: string | null
          phone_verified?: boolean
          rating?: number
          review_count?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          booking_id: string | null
          created_at: string
          id: string
          listing_id: string | null
          rating: number
          verified: boolean
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          rating?: number
          verified?: boolean
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          listing_id?: string | null
          rating?: number
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          label: string
          notify: boolean
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          label: string
          notify?: boolean
          query?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          label?: string
          notify?: boolean
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      booked_dates: {
        Args: { _listing_id: string }
        Returns: {
          end_date: string
          start_date: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "private" | "company"
      app_role: "admin" | "moderator" | "user"
      booking_status:
        | "requested"
        | "confirmed"
        | "declined"
        | "cancelled"
        | "completed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_type: ["private", "company"],
      app_role: ["admin", "moderator", "user"],
      booking_status: [
        "requested",
        "confirmed",
        "declined",
        "cancelled",
        "completed",
      ],
    },
  },
} as const
