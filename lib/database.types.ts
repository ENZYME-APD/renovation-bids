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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          client_type: Database["public"]["Enums"]["client_type"]
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          source: string | null
        }
        Insert: {
          client_type?: Database["public"]["Enums"]["client_type"]
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          source?: string | null
        }
        Update: {
          client_type?: Database["public"]["Enums"]["client_type"]
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          decided_on: string
          id: string
          impact: string | null
          organization_id: string
          project_id: string
          request: string
          requested_by: string | null
          source: Database["public"]["Enums"]["decision_source"]
          status: Database["public"]["Enums"]["decision_status"]
          version_id: string | null
        }
        Insert: {
          created_at?: string
          decided_on?: string
          id?: string
          impact?: string | null
          organization_id: string
          project_id: string
          request: string
          requested_by?: string | null
          source?: Database["public"]["Enums"]["decision_source"]
          status?: Database["public"]["Enums"]["decision_status"]
          version_id?: string | null
        }
        Update: {
          created_at?: string
          decided_on?: string
          id?: string
          impact?: string | null
          organization_id?: string
          project_id?: string
          request?: string
          requested_by?: string | null
          source?: Database["public"]["Enums"]["decision_source"]
          status?: Database["public"]["Enums"]["decision_status"]
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "estimate_accuracy"
            referencedColumns: ["project_id", "organization_id"]
          },
          {
            foreignKeyName: "decisions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "decisions_version_id_organization_id_fkey"
            columns: ["version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      line_items: {
        Row: {
          archicad_element_ids: string[]
          confidence: Database["public"]["Enums"]["confidence"] | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          partida_id: string
          price_id: string | null
          quantity: number
          state: Database["public"]["Enums"]["line_state"]
          total: number | null
          unit_price: number | null
          updated_at: string
          version_id: string
        }
        Insert: {
          archicad_element_ids?: string[]
          confidence?: Database["public"]["Enums"]["confidence"] | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          partida_id: string
          price_id?: string | null
          quantity?: number
          state?: Database["public"]["Enums"]["line_state"]
          total?: number | null
          unit_price?: number | null
          updated_at?: string
          version_id: string
        }
        Update: {
          archicad_element_ids?: string[]
          confidence?: Database["public"]["Enums"]["confidence"] | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          partida_id?: string
          price_id?: string | null
          quantity?: number
          state?: Database["public"]["Enums"]["line_state"]
          total?: number | null
          unit_price?: number | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_version_id_organization_id_fkey"
            columns: ["version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          budget_high: number | null
          budget_low: number | null
          contingency_pct: number | null
          created_at: string
          exclusions: string | null
          fee_amount: number | null
          fee_calculator_ref: string | null
          icio_amount: number | null
          id: string
          organization_id: string
          payment_schedule: Json
          pdf_path: string | null
          permit_route: string | null
          project_id: string
          revision: number
          sent_at: string | null
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
          valid_until: string | null
          vat_rate: number | null
          version_id: string
        }
        Insert: {
          budget_high?: number | null
          budget_low?: number | null
          contingency_pct?: number | null
          created_at?: string
          exclusions?: string | null
          fee_amount?: number | null
          fee_calculator_ref?: string | null
          icio_amount?: number | null
          id?: string
          organization_id: string
          payment_schedule?: Json
          pdf_path?: string | null
          permit_route?: string | null
          project_id: string
          revision?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          valid_until?: string | null
          vat_rate?: number | null
          version_id: string
        }
        Update: {
          budget_high?: number | null
          budget_low?: number | null
          contingency_pct?: number | null
          created_at?: string
          exclusions?: string | null
          fee_amount?: number | null
          fee_calculator_ref?: string | null
          icio_amount?: number | null
          id?: string
          organization_id?: string
          payment_schedule?: Json
          pdf_path?: string | null
          permit_route?: string | null
          project_id?: string
          revision?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          valid_until?: string | null
          vat_rate?: number | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "estimate_accuracy"
            referencedColumns: ["project_id", "organization_id"]
          },
          {
            foreignKeyName: "offers_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "offers_version_id_organization_id_fkey"
            columns: ["version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          next_project_number: number
          region_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          next_project_number?: number
          region_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          next_project_number?: number
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      partidas: {
        Row: {
          active: boolean
          archicad_classification: string | null
          archicad_filter: Json
          code: string
          created_at: string
          id: string
          long_description: string | null
          organization_id: string | null
          reference_code: string | null
          region_id: string
          short_description: string
          trade_id: string
          unit: Database["public"]["Enums"]["unit"]
        }
        Insert: {
          active?: boolean
          archicad_classification?: string | null
          archicad_filter?: Json
          code: string
          created_at?: string
          id?: string
          long_description?: string | null
          organization_id?: string | null
          reference_code?: string | null
          region_id: string
          short_description: string
          trade_id: string
          unit: Database["public"]["Enums"]["unit"]
        }
        Update: {
          active?: boolean
          archicad_classification?: string | null
          archicad_filter?: Json
          code?: string
          created_at?: string
          id?: string
          long_description?: string | null
          organization_id?: string | null
          reference_code?: string | null
          region_id?: string
          short_description?: string
          trade_id?: string
          unit?: Database["public"]["Enums"]["unit"]
        }
        Relationships: [
          {
            foreignKeyName: "partidas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidas_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partidas_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          confidence: Database["public"]["Enums"]["confidence"]
          created_at: string
          id: string
          notes: string | null
          organization_id: string | null
          partida_id: string
          priced_on: string
          quote_id: string | null
          region_id: string
          source: Database["public"]["Enums"]["price_source"]
          supplier_id: string | null
          unit_price: number
          valid_until: string | null
        }
        Insert: {
          confidence?: Database["public"]["Enums"]["confidence"]
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          partida_id: string
          priced_on?: string
          quote_id?: string | null
          region_id: string
          source: Database["public"]["Enums"]["price_source"]
          supplier_id?: string | null
          unit_price: number
          valid_until?: string | null
        }
        Update: {
          confidence?: Database["public"]["Enums"]["confidence"]
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string | null
          partida_id?: string
          priced_on?: string
          quote_id?: string | null
          region_id?: string
          source?: Database["public"]["Enums"]["price_source"]
          supplier_id?: string | null
          unit_price?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_quote_id_organization_id_fkey"
            columns: ["quote_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "prices_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_response"
            referencedColumns: ["supplier_id", "organization_id"]
          },
          {
            foreignKeyName: "prices_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_cost: number | null
          address: string | null
          area_m2: number | null
          bid_hours: number
          building_year: number | null
          client_budget: number | null
          client_id: string | null
          code: string
          contract_value: number | null
          created_at: string
          district: string | null
          folder_url: string | null
          go_reason: string | null
          go_score: number | null
          id: string
          name: string
          organization_id: string
          outcome_reason: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          address?: string | null
          area_m2?: number | null
          bid_hours?: number
          building_year?: number | null
          client_budget?: number | null
          client_id?: string | null
          code?: string
          contract_value?: number | null
          created_at?: string
          district?: string | null
          folder_url?: string | null
          go_reason?: string | null
          go_score?: number | null
          id?: string
          name: string
          organization_id: string
          outcome_reason?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          address?: string | null
          area_m2?: number | null
          bid_hours?: number
          building_year?: number | null
          client_budget?: number | null
          client_id?: string | null
          code?: string
          contract_value?: number | null
          created_at?: string
          district?: string | null
          folder_url?: string | null
          go_reason?: string | null
          go_score?: number | null
          id?: string
          name?: string
          organization_id?: string
          outcome_reason?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          attachment_path: string | null
          created_at: string
          exclusions: string | null
          id: string
          organization_id: string
          parsed_by_ai: boolean
          received_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          rfq_id: string
          total: number | null
          valid_until: string | null
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          exclusions?: string | null
          id?: string
          organization_id: string
          parsed_by_ai?: boolean
          received_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rfq_id: string
          total?: number | null
          valid_until?: string | null
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          exclusions?: string | null
          id?: string
          organization_id?: string
          parsed_by_ai?: boolean
          received_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rfq_id?: string
          total?: number | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_organization_id_fkey"
            columns: ["rfq_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_rfq_id_organization_id_fkey"
            columns: ["rfq_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "rfqs_due_reminder"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          settings: Json
        }
        Insert: {
          created_at?: string
          currency?: string
          id: string
          name: string
          settings?: Json
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          settings?: Json
        }
        Relationships: []
      }
      rfq_line_items: {
        Row: {
          line_item_id: string
          organization_id: string
          rfq_id: string
        }
        Insert: {
          line_item_id: string
          organization_id: string
          rfq_id: string
        }
        Update: {
          line_item_id?: string
          organization_id?: string
          rfq_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_line_items_line_item_id_organization_id_fkey"
            columns: ["line_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rfq_line_items_line_item_id_organization_id_fkey"
            columns: ["line_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "lines_needing_price"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rfq_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_line_items_rfq_id_organization_id_fkey"
            columns: ["rfq_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rfq_line_items_rfq_id_organization_id_fkey"
            columns: ["rfq_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "rfqs_due_reminder"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      rfqs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          documents: Json
          gmail_thread_id: string | null
          id: string
          last_reminder_at: string | null
          organization_id: string
          project_id: string
          reminder_count: number
          reply_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["rfq_status"]
          supplier_id: string
          trade_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          documents?: Json
          gmail_thread_id?: string | null
          id?: string
          last_reminder_at?: string | null
          organization_id: string
          project_id: string
          reminder_count?: number
          reply_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          supplier_id: string
          trade_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          documents?: Json
          gmail_thread_id?: string | null
          id?: string
          last_reminder_at?: string | null
          organization_id?: string
          project_id?: string
          reminder_count?: number
          reply_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          supplier_id?: string
          trade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "estimate_accuracy"
            referencedColumns: ["project_id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_response"
            referencedColumns: ["supplier_id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          attendees: string[]
          checklist: Json
          created_at: string
          id: string
          laser_checks: Json
          organization_id: string
          photo_paths: string[]
          project_id: string
          scan_paths: string[]
          visited_on: string
          voice_transcript: string | null
        }
        Insert: {
          attendees?: string[]
          checklist?: Json
          created_at?: string
          id?: string
          laser_checks?: Json
          organization_id: string
          photo_paths?: string[]
          project_id: string
          scan_paths?: string[]
          visited_on?: string
          voice_transcript?: string | null
        }
        Update: {
          attendees?: string[]
          checklist?: Json
          created_at?: string
          id?: string
          laser_checks?: Json
          organization_id?: string
          photo_paths?: string[]
          project_id?: string
          scan_paths?: string[]
          visited_on?: string
          voice_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "estimate_accuracy"
            referencedColumns: ["project_id", "organization_id"]
          },
          {
            foreignKeyName: "site_visits_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      supplier_trades: {
        Row: {
          organization_id: string
          supplier_id: string
          trade_id: string
        }
        Insert: {
          organization_id: string
          supplier_id: string
          trade_id: string
        }
        Update: {
          organization_id?: string
          supplier_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_trades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_trades_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_response"
            referencedColumns: ["supplier_id", "organization_id"]
          },
          {
            foreignKeyName: "supplier_trades_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "supplier_trades_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          area_served: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          opt_out: boolean
          opt_out_at: string | null
          organization_id: string
          phone: string | null
          source: Database["public"]["Enums"]["contact_source"]
          source_note: string | null
          supplier_type: Database["public"]["Enums"]["supplier_type"]
        }
        Insert: {
          area_served?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          opt_out?: boolean
          opt_out_at?: string | null
          organization_id: string
          phone?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          source_note?: string | null
          supplier_type?: Database["public"]["Enums"]["supplier_type"]
        }
        Update: {
          area_served?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          opt_out?: boolean
          opt_out_at?: string | null
          organization_id?: string
          phone?: string | null
          source?: Database["public"]["Enums"]["contact_source"]
          source_note?: string | null
          supplier_type?: Database["public"]["Enums"]["supplier_type"]
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          id: string
          name: string
          organization_id: string | null
          region_id: string
          sequence: number
        }
        Insert: {
          id?: string
          name: string
          organization_id?: string | null
          region_id: string
          sequence?: number
        }
        Update: {
          id?: string
          name?: string
          organization_id?: string | null
          region_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "trades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      versions: {
        Row: {
          archicad_file: string | null
          archicad_option: string | null
          created_at: string
          description: string | null
          id: string
          label: string
          organization_id: string
          project_id: string
          status: Database["public"]["Enums"]["version_status"]
        }
        Insert: {
          archicad_file?: string | null
          archicad_option?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label: string
          organization_id: string
          project_id: string
          status?: Database["public"]["Enums"]["version_status"]
        }
        Update: {
          archicad_file?: string | null
          archicad_option?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          organization_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["version_status"]
        }
        Relationships: [
          {
            foreignKeyName: "versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "estimate_accuracy"
            referencedColumns: ["project_id", "organization_id"]
          },
          {
            foreignKeyName: "versions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      estimate_accuracy: {
        Row: {
          actual_cost: number | null
          budget_high: number | null
          budget_low: number | null
          code: string | null
          error_vs_mid_pct: number | null
          name: string | null
          organization_id: string | null
          project_id: string | null
          within_range: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lines_needing_price: {
        Row: {
          code: string | null
          id: string | null
          organization_id: string | null
          project_id: string | null
          quantity: number | null
          short_description: string | null
          state: Database["public"]["Enums"]["line_state"] | null
          trade_id: string | null
          unit: Database["public"]["Enums"]["unit"] | null
          version_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_version_id_organization_id_fkey"
            columns: ["version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "partidas_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs_due_reminder: {
        Row: {
          email: string | null
          gmail_thread_id: string | null
          id: string | null
          last_reminder_at: string | null
          organization_id: string | null
          project_id: string | null
          reminder_count: number | null
          reply_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["rfq_status"] | null
          supplier: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "estimate_accuracy"
            referencedColumns: ["project_id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_response"
            referencedColumns: ["supplier_id", "organization_id"]
          },
          {
            foreignKeyName: "rfqs_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      supplier_response: {
        Row: {
          avg_days_to_reply: number | null
          name: string | null
          organization_id: string | null
          requests_answered: number | null
          requests_sent: number | null
          response_rate: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_organization: {
        Args: { p_name: string; p_region_id: string }
        Returns: string
      }
      current_prices: {
        Args: { p_org: string }
        Returns: {
          confidence: Database["public"]["Enums"]["confidence"]
          is_own: boolean
          partida_id: string
          price_id: string
          priced_on: string
          source: Database["public"]["Enums"]["price_source"]
          supplier_id: string
          unit_price: number
          valid_until: string
        }[]
      }
      version_budget: {
        Args: { p_version: string }
        Returns: {
          budget_high: number
          budget_low: number
          lines: number
          priced_lines: number
          sequence: number
          subtotal: number
          trade: string
          trade_id: string
        }[]
      }
    }
    Enums: {
      client_type: "private" | "community" | "company"
      confidence: "high" | "medium" | "low"
      contact_source: "own" | "web" | "referral"
      decision_source: "email" | "meeting" | "call" | "site" | "other"
      decision_status: "open" | "applied" | "dropped"
      line_state: "unpriced" | "priced" | "needs_rfq" | "quoted"
      member_role: "owner" | "admin" | "member"
      offer_status: "draft" | "sent" | "accepted" | "rejected" | "superseded"
      price_source: "history" | "reference" | "quote" | "manual"
      project_status:
        | "lead"
        | "qualifying"
        | "no_go"
        | "site_visit"
        | "design"
        | "pricing"
        | "offer_sent"
        | "won"
        | "lost"
        | "on_hold"
      rfq_status:
        | "draft"
        | "approved"
        | "sent"
        | "reminded"
        | "replied"
        | "expired"
        | "cancelled"
      supplier_type:
        | "subcontractor"
        | "manufacturer"
        | "distributor"
        | "professional"
      unit: "m2" | "m" | "m3" | "ud" | "kg" | "h" | "pa"
      version_status: "draft" | "presented" | "selected" | "rejected"
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
      client_type: ["private", "community", "company"],
      confidence: ["high", "medium", "low"],
      contact_source: ["own", "web", "referral"],
      decision_source: ["email", "meeting", "call", "site", "other"],
      decision_status: ["open", "applied", "dropped"],
      line_state: ["unpriced", "priced", "needs_rfq", "quoted"],
      member_role: ["owner", "admin", "member"],
      offer_status: ["draft", "sent", "accepted", "rejected", "superseded"],
      price_source: ["history", "reference", "quote", "manual"],
      project_status: [
        "lead",
        "qualifying",
        "no_go",
        "site_visit",
        "design",
        "pricing",
        "offer_sent",
        "won",
        "lost",
        "on_hold",
      ],
      rfq_status: [
        "draft",
        "approved",
        "sent",
        "reminded",
        "replied",
        "expired",
        "cancelled",
      ],
      supplier_type: [
        "subcontractor",
        "manufacturer",
        "distributor",
        "professional",
      ],
      unit: ["m2", "m", "m3", "ud", "kg", "h", "pa"],
      version_status: ["draft", "presented", "selected", "rejected"],
    },
  },
} as const
