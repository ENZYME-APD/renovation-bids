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
      activity_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          change_id: string
          changed_fields: string[] | null
          client_id: string | null
          id: number
          new_row: Json | null
          occurred_at: string
          old_row: Json | null
          organization_id: string
          record_id: string
          source: string
          table_name: string
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          change_id: string
          changed_fields?: string[] | null
          client_id?: string | null
          id?: number
          new_row?: Json | null
          occurred_at?: string
          old_row?: Json | null
          organization_id: string
          record_id: string
          source: string
          table_name: string
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          change_id?: string
          changed_fields?: string[] | null
          client_id?: string | null
          id?: number
          new_row?: Json | null
          occurred_at?: string
          old_row?: Json | null
          organization_id?: string
          record_id?: string
          source?: string
          table_name?: string
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_lines: {
        Row: {
          change_order_id: string
          created_at: string
          description: string
          id: string
          organization_id: string
          partida_id: string | null
          quantity: number
          room: string | null
          total: number | null
          unit: Database["public"]["Enums"]["unit"]
          unit_price: number
        }
        Insert: {
          change_order_id: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          partida_id?: string | null
          quantity: number
          room?: string | null
          total?: never
          unit?: Database["public"]["Enums"]["unit"]
          unit_price?: number
        }
        Update: {
          change_order_id?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          partida_id?: string | null
          quantity?: number
          room?: string | null
          total?: never
          unit?: Database["public"]["Enums"]["unit"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "change_order_lines_change_order_id_organization_id_fkey"
            columns: ["change_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_lines_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          approved_by: string | null
          created_at: string
          decided_on: string | null
          decision_id: string | null
          description: string | null
          id: string
          notes: string | null
          number: number
          organization_id: string
          project_id: string
          reason: Database["public"]["Enums"]["change_reason"]
          sent_on: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          decided_on?: string | null
          decision_id?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          number?: number
          organization_id: string
          project_id: string
          reason?: Database["public"]["Enums"]["change_reason"]
          sent_on?: string | null
          status?: Database["public"]["Enums"]["change_order_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          decided_on?: string | null
          decision_id?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          number?: number
          organization_id?: string
          project_id?: string
          reason?: Database["public"]["Enums"]["change_reason"]
          sent_on?: string | null
          status?: Database["public"]["Enums"]["change_order_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_decision_id_organization_id_fkey"
            columns: ["decision_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
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
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          overridden: boolean
          partida_id: string
          price_id: string | null
          quantity: number
          room: string | null
          source: Database["public"]["Enums"]["line_source"]
          source_ref: string | null
          state: Database["public"]["Enums"]["line_state"]
          template_id: string | null
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
          overridden?: boolean
          partida_id: string
          price_id?: string | null
          quantity?: number
          room?: string | null
          source?: Database["public"]["Enums"]["line_source"]
          source_ref?: string | null
          state?: Database["public"]["Enums"]["line_state"]
          template_id?: string | null
          total?: never
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
          overridden?: boolean
          partida_id?: string
          price_id?: string | null
          quantity?: number
          room?: string | null
          source?: Database["public"]["Enums"]["line_source"]
          source_ref?: string | null
          state?: Database["public"]["Enums"]["line_state"]
          template_id?: string | null
          total?: never
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
          ai_changes: string
          ai_connect: string
          allow_bid_options: boolean
          created_at: string
          currency: string
          default_contingency_pct: number
          default_vat_pct: number
          id: string
          language: string
          name: string
          next_po_number: number
          next_project_number: number
          region_id: string
          updated_at: string
        }
        Insert: {
          ai_changes?: string
          ai_connect?: string
          allow_bid_options?: boolean
          created_at?: string
          currency?: string
          default_contingency_pct?: number
          default_vat_pct?: number
          id?: string
          language?: string
          name: string
          next_po_number?: number
          next_project_number?: number
          region_id: string
          updated_at?: string
        }
        Update: {
          ai_changes?: string
          ai_connect?: string
          allow_bid_options?: boolean
          created_at?: string
          currency?: string
          default_contingency_pct?: number
          default_vat_pct?: number
          id?: string
          language?: string
          name?: string
          next_po_number?: number
          next_project_number?: number
          region_id?: string
          updated_at?: string
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
      payments: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["money_category"]
          concept: string | null
          created_at: string
          direction: Database["public"]["Enums"]["money_direction"]
          id: string
          invoice_id: string | null
          method: string | null
          organization_id: string
          paid_on: string
          project_id: string
          supplier_id: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["money_category"]
          concept?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["money_direction"]
          id?: string
          invoice_id?: string | null
          method?: string | null
          organization_id: string
          paid_on?: string
          project_id: string
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["money_category"]
          concept?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["money_direction"]
          id?: string
          invoice_id?: string | null
          method?: string | null
          organization_id?: string
          paid_on?: string
          project_id?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_organization_id_fkey"
            columns: ["invoice_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "payments_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
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
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          contract_signed_on: string | null
          contract_value: number | null
          contract_version_id: string | null
          created_at: string
          district: string | null
          folder_url: string | null
          go_reason: string | null
          go_score: number | null
          id: string
          name: string
          organization_id: string
          outcome_reason: string | null
          phase: Database["public"]["Enums"]["project_phase"]
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
          contract_signed_on?: string | null
          contract_value?: number | null
          contract_version_id?: string | null
          created_at?: string
          district?: string | null
          folder_url?: string | null
          go_reason?: string | null
          go_score?: number | null
          id?: string
          name: string
          organization_id: string
          outcome_reason?: string | null
          phase?: Database["public"]["Enums"]["project_phase"]
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
          contract_signed_on?: string | null
          contract_value?: number | null
          contract_version_id?: string | null
          created_at?: string
          district?: string | null
          folder_url?: string | null
          go_reason?: string | null
          go_score?: number | null
          id?: string
          name?: string
          organization_id?: string
          outcome_reason?: string | null
          phase?: Database["public"]["Enums"]["project_phase"]
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
            foreignKeyName: "projects_contract_version_id_organization_id_fkey"
            columns: ["contract_version_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "versions"
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
      purchase_order_lines: {
        Row: {
          created_at: string
          description: string
          id: string
          line_item_id: string | null
          organization_id: string
          partida_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number
          total: number | null
          unit: Database["public"]["Enums"]["unit"]
          unit_cost: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_item_id?: string | null
          organization_id: string
          partida_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          total?: never
          unit?: Database["public"]["Enums"]["unit"]
          unit_cost?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_item_id?: string | null
          organization_id?: string
          partida_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          total?: never
          unit?: Database["public"]["Enums"]["unit"]
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_line_item_id_organization_id_fkey"
            columns: ["line_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_organization_id_fkey"
            columns: ["purchase_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          code: string
          created_at: string
          delivered_on: string | null
          expected_on: string | null
          id: string
          notes: string | null
          ordered_on: string | null
          organization_id: string
          project_id: string
          status: Database["public"]["Enums"]["po_status"]
          supplied_by: Database["public"]["Enums"]["supply_by"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string
          created_at?: string
          delivered_on?: string | null
          expected_on?: string | null
          id?: string
          notes?: string | null
          ordered_on?: string | null
          organization_id: string
          project_id: string
          status?: Database["public"]["Enums"]["po_status"]
          supplied_by?: Database["public"]["Enums"]["supply_by"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          delivered_on?: string | null
          expected_on?: string | null
          id?: string
          notes?: string | null
          ordered_on?: string | null
          organization_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["po_status"]
          supplied_by?: Database["public"]["Enums"]["supply_by"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "organization_id"]
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
        Relationships: [
        ]
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
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
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
      room_template_lines: {
        Row: {
          factor: number
          fixed: number
          id: string
          note: string | null
          partida_id: string
          sequence: number
          template_id: string
        }
        Insert: {
          factor?: number
          fixed?: number
          id?: string
          note?: string | null
          partida_id: string
          sequence?: number
          template_id: string
        }
        Update: {
          factor?: number
          fixed?: number
          id?: string
          note?: string | null
          partida_id?: string
          sequence?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_template_lines_partida_id_fkey"
            columns: ["partida_id"]
            isOneToOne: false
            referencedRelation: "partidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_template_lines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "room_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      room_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          match_terms: string[]
          name: string
          organization_id: string | null
          region_id: string
          sequence: number
          size_label: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          match_terms?: string[]
          name: string
          organization_id?: string | null
          region_id: string
          sequence?: number
          size_label?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          match_terms?: string[]
          name?: string
          organization_id?: string | null
          region_id?: string
          sequence?: number
          size_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_templates_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          attachment_path: string | null
          category: Database["public"]["Enums"]["money_category"]
          created_at: string
          due_on: string | null
          id: string
          issued_on: string
          net_amount: number
          notes: string | null
          number: string | null
          organization_id: string
          project_id: string
          purchase_order_id: string | null
          supplier_id: string | null
          total: number | null
          vat_amount: number
        }
        Insert: {
          attachment_path?: string | null
          category?: Database["public"]["Enums"]["money_category"]
          created_at?: string
          due_on?: string | null
          id?: string
          issued_on?: string
          net_amount: number
          notes?: string | null
          number?: string | null
          organization_id: string
          project_id: string
          purchase_order_id?: string | null
          supplier_id?: string | null
          total?: never
          vat_amount?: number
        }
        Update: {
          attachment_path?: string | null
          category?: Database["public"]["Enums"]["money_category"]
          created_at?: string
          due_on?: string | null
          id?: string
          issued_on?: string
          net_amount?: number
          notes?: string | null
          number?: string | null
          organization_id?: string
          project_id?: string
          purchase_order_id?: string | null
          supplier_id?: string | null
          total?: never
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "supplier_invoices_purchase_order_id_organization_id_fkey"
            columns: ["purchase_order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_organization_id_fkey"
            columns: ["supplier_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          active: boolean
          code: string | null
          cype_chapter: string | null
          id: string
          name: string
          organization_id: string | null
          region_id: string
          sequence: number
        }
        Insert: {
          active?: boolean
          code?: string | null
          cype_chapter?: string | null
          id?: string
          name: string
          organization_id?: string | null
          region_id: string
          sequence?: number
        }
        Update: {
          active?: boolean
          code?: string | null
          cype_chapter?: string | null
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
          locked: boolean
          model_file: string | null
          model_option: string | null
          model_synced_at: string | null
          model_tool: string | null
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
          locked?: boolean
          model_file?: string | null
          model_option?: string | null
          model_synced_at?: string | null
          model_tool?: string | null
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
          locked?: boolean
          model_file?: string | null
          model_option?: string | null
          model_synced_at?: string | null
          model_tool?: string | null
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
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      action_items: {
        Row: {
          due_on: string | null
          kind: string | null
          organization_id: string | null
          priority: number | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          ref_id: string | null
          title: string | null
        }
        Relationships: []
      }
      change_order_totals: {
        Row: {
          change_order_id: string | null
          lines: number | null
          number: number | null
          organization_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["change_order_status"] | null
          total: number | null
        }
        Relationships: []
      }
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
        Relationships: []
      }
      invoice_balances: {
        Row: {
          attachment_path: string | null
          category: Database["public"]["Enums"]["money_category"] | null
          created_at: string | null
          due_on: string | null
          id: string | null
          issued_on: string | null
          net_amount: number | null
          notes: string | null
          number: string | null
          organization_id: string | null
          outstanding: number | null
          paid: number | null
          project_id: string | null
          purchase_order_id: string | null
          supplier: string | null
          supplier_id: string | null
          total: number | null
          vat_amount: number | null
        }
        Relationships: []
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
        Relationships: []
      }
      project_budget_summary: {
        Row: {
          approved_changes: number | null
          approved_count: number | null
          contract_budget: number | null
          contract_signed_on: string | null
          contract_value: number | null
          contract_version_id: string | null
          current_budget: number | null
          organization_id: string | null
          pending_changes: number | null
          pending_count: number | null
          phase: Database["public"]["Enums"]["project_phase"] | null
          project_id: string | null
          status: Database["public"]["Enums"]["project_status"] | null
        }
        Relationships: []
      }
      project_cost_by_trade: {
        Row: {
          budget: number | null
          committed: number | null
          organization_id: string | null
          project_id: string | null
          remaining: number | null
          sequence: number | null
          trade: string | null
          trade_code: string | null
          trade_id: string | null
        }
        Relationships: []
      }
      project_main_version: {
        Row: {
          label: string | null
          organization_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["version_status"] | null
          version_id: string | null
        }
        Relationships: []
      }
      project_money: {
        Row: {
          approved_changes: number | null
          budget: number | null
          code: string | null
          committed: number | null
          contract_value: number | null
          current_budget: number | null
          invoiced: number | null
          name: string | null
          organization_id: string | null
          paid_extra: number | null
          paid_labour: number | null
          paid_materials: number | null
          paid_out: number | null
          phase: Database["public"]["Enums"]["project_phase"] | null
          project_id: string | null
          received_fees: number | null
          received_works: number | null
          status: Database["public"]["Enums"]["project_status"] | null
        }
        Relationships: []
      }
      project_stats: {
        Row: {
          actual_cost: number | null
          area_m2: number | null
          bid_hours: number | null
          budget_high: number | null
          budget_low: number | null
          client_budget: number | null
          code: string | null
          contract_value: number | null
          created_at: string | null
          district: string | null
          eur_per_m2: number | null
          lines: number | null
          name: string | null
          organization_id: string | null
          phase: Database["public"]["Enums"]["project_phase"] | null
          priced_lines: number | null
          project_id: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          subtotal: number | null
          updated_at: string | null
          version_id: string | null
          version_label: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      version_totals: {
        Row: {
          budget_high: number | null
          budget_low: number | null
          lines: number | null
          organization_id: string | null
          priced_lines: number | null
          subtotal: number | null
          version_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      apply_room_template: {
        Args: { p_label?: string; p_size: number; p_source?: Database["public"]["Enums"]["line_source"]; p_source_ref?: string; p_template: string; p_version: string }
        Returns: number
      }
      copy_room_template: {
        Args: { p_code?: string; p_name?: string; p_org: string; p_template: string }
        Returns: string
      }
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
      effective_room_templates: {
        Args: { p_org: string }
        Returns: Database["public"]["Tables"]["room_templates"]["Row"][]
        SetofOptions: { from: "*"; to: "room_templates"; isOneToOne: false; isSetofReturn: true }
      }
      get_invitation: {
        Args: { p_token: string }
        Returns: {
          accepted: boolean
          email: string
          expired: boolean
          role: Database["public"]["Enums"]["member_role"]
          studio: string
        }[]
      }
      match_room_template: {
        Args: { p_name: string; p_org: string }
        Returns: string
      }
      record_actual_price: {
        Args: { p_po_line: string }
        Returns: string
      }
      sign_contract: {
        Args: { p_project: string; p_signed_on?: string; p_value?: number; p_version: string }
        Returns: string
      }
      studio_partida: {
        Args: { p_org: string; p_partida: string }
        Returns: string
      }
      undo_change: {
        Args: { p_change_id: string }
        Returns: number
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
      change_order_status: "draft" | "sent" | "approved" | "rejected" | "cancelled"
      change_reason: "client_request" | "design_change" | "site_condition" | "omission" | "other"
      client_type: "private" | "community" | "company"
      confidence: "high" | "medium" | "low"
      contact_source: "own" | "web" | "referral"
      decision_source: "email" | "meeting" | "call" | "site" | "other"
      decision_status: "open" | "applied" | "dropped"
      line_source: "manual" | "template" | "model_zone" | "model_element" | "ai_assumption" | "import"
      line_state: "unpriced" | "priced" | "needs_rfq" | "quoted"
      member_role: "owner" | "admin" | "member" | "viewer"
      money_category: "labour" | "materials" | "extra" | "client_works" | "client_fees"
      money_direction: "out" | "in"
      offer_status: "draft" | "sent" | "accepted" | "rejected" | "superseded"
      po_status: "draft" | "sent" | "confirmed" | "delivered" | "cancelled"
      price_source: "history" | "reference" | "quote" | "manual"
      project_phase: "bid" | "design" | "construction" | "closed"
      project_status: "lead" | "qualifying" | "no_go" | "site_visit" | "design" | "pricing" | "offer_sent" | "won" | "lost" | "on_hold"
      rfq_status: "draft" | "approved" | "sent" | "reminded" | "replied" | "expired" | "cancelled"
      supplier_type: "subcontractor" | "manufacturer" | "distributor" | "professional"
      supply_by: "enzyme" | "contractor" | "owner"
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
      change_order_status: ["draft", "sent", "approved", "rejected", "cancelled"],
      change_reason: ["client_request", "design_change", "site_condition", "omission", "other"],
      client_type: ["private", "community", "company"],
      confidence: ["high", "medium", "low"],
      contact_source: ["own", "web", "referral"],
      decision_source: ["email", "meeting", "call", "site", "other"],
      decision_status: ["open", "applied", "dropped"],
      line_source: ["manual", "template", "model_zone", "model_element", "ai_assumption", "import"],
      line_state: ["unpriced", "priced", "needs_rfq", "quoted"],
      member_role: ["owner", "admin", "member", "viewer"],
      money_category: ["labour", "materials", "extra", "client_works", "client_fees"],
      money_direction: ["out", "in"],
      offer_status: ["draft", "sent", "accepted", "rejected", "superseded"],
      po_status: ["draft", "sent", "confirmed", "delivered", "cancelled"],
      price_source: ["history", "reference", "quote", "manual"],
      project_phase: ["bid", "design", "construction", "closed"],
      project_status: ["lead", "qualifying", "no_go", "site_visit", "design", "pricing", "offer_sent", "won", "lost", "on_hold"],
      rfq_status: ["draft", "approved", "sent", "reminded", "replied", "expired", "cancelled"],
      supplier_type: ["subcontractor", "manufacturer", "distributor", "professional"],
      supply_by: ["enzyme", "contractor", "owner"],
      unit: ["m2", "m", "m3", "ud", "kg", "h", "pa"],
      version_status: ["draft", "presented", "selected", "rejected"],
    },
  },
} as const
