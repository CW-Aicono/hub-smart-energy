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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_rules: {
        Row: {
          created_at: string
          energy_type: string
          id: string
          is_active: boolean
          location_id: string | null
          meter_id: string | null
          name: string
          notification_email: string | null
          tenant_id: string
          threshold_type: string
          threshold_unit: string
          threshold_value: number
          time_unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          energy_type?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          meter_id?: string | null
          name: string
          notification_email?: string | null
          tenant_id: string
          threshold_type?: string
          threshold_unit?: string
          threshold_value: number
          time_unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          energy_type?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          meter_id?: string | null
          name?: string
          notification_email?: string | null
          tenant_id?: string
          threshold_type?: string
          threshold_unit?: string
          threshold_value?: number
          time_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitrage_strategies: {
        Row: {
          buy_below_eur_mwh: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          sell_above_eur_mwh: number
          storage_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          buy_below_eur_mwh?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sell_above_eur_mwh?: number
          storage_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          buy_below_eur_mwh?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sell_above_eur_mwh?: number
          storage_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arbitrage_strategies_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "energy_storages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitrage_strategies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      arbitrage_trades: {
        Row: {
          created_at: string
          energy_kwh: number
          id: string
          price_eur_mwh: number
          revenue_eur: number
          storage_id: string
          strategy_id: string | null
          tenant_id: string
          timestamp: string
          trade_type: string
        }
        Insert: {
          created_at?: string
          energy_kwh?: number
          id?: string
          price_eur_mwh?: number
          revenue_eur?: number
          storage_id: string
          strategy_id?: string | null
          tenant_id: string
          timestamp?: string
          trade_type?: string
        }
        Update: {
          created_at?: string
          energy_kwh?: number
          id?: string
          price_eur_mwh?: number
          revenue_eur?: number
          storage_id?: string
          strategy_id?: string | null
          tenant_id?: string
          timestamp?: string
          trade_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "arbitrage_trades_storage_id_fkey"
            columns: ["storage_id"]
            isOneToOne: false
            referencedRelation: "energy_storages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitrage_trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "arbitrage_strategies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbitrage_trades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      brighthub_settings: {
        Row: {
          api_key: string
          auto_sync_readings: boolean
          created_at: string
          id: string
          is_enabled: boolean
          last_intraday_sync_at: string | null
          last_meter_sync_at: string | null
          last_reading_sync_at: string | null
          location_id: string | null
          tenant_id: string
          updated_at: string
          webhook_secret: string
          webhook_url: string
        }
        Insert: {
          api_key?: string
          auto_sync_readings?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_intraday_sync_at?: string | null
          last_meter_sync_at?: string | null
          last_reading_sync_at?: string | null
          location_id?: string | null
          tenant_id: string
          updated_at?: string
          webhook_secret?: string
          webhook_url?: string
        }
        Update: {
          api_key?: string
          auto_sync_readings?: boolean
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_intraday_sync_at?: string | null
          last_meter_sync_at?: string | null
          last_reading_sync_at?: string | null
          location_id?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "brighthub_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brighthub_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_allowed_user_groups: {
        Row: {
          charge_point_id: string
          created_at: string
          id: string
          user_group_id: string
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          id?: string
          user_group_id: string
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          id?: string
          user_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_allowed_user_groups_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_allowed_user_groups_user_group_id_fkey"
            columns: ["user_group_id"]
            isOneToOne: false
            referencedRelation: "charging_user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_group_allowed_user_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_group_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_group_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_group_allowed_user_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "charge_point_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_group_allowed_user_groups_user_group_id_fkey"
            columns: ["user_group_id"]
            isOneToOne: false
            referencedRelation: "charging_user_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_groups: {
        Row: {
          access_settings: Json
          created_at: string
          description: string | null
          energy_settings: Json
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_settings?: Json
          created_at?: string
          description?: string | null
          energy_settings?: Json
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_settings?: Json
          created_at?: string
          description?: string | null
          energy_settings?: Json
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      charge_points: {
        Row: {
          access_settings: Json
          address: string | null
          connector_count: number
          connector_type: string
          created_at: string
          firmware_version: string | null
          group_id: string | null
          id: string
          last_heartbeat: string | null
          latitude: number | null
          location_id: string | null
          longitude: number | null
          max_power_kw: number
          model: string | null
          name: string
          ocpp_id: string
          photo_url: string | null
          power_limit_schedule: Json | null
          status: string
          tenant_id: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          access_settings?: Json
          address?: string | null
          connector_count?: number
          connector_type?: string
          created_at?: string
          firmware_version?: string | null
          group_id?: string | null
          id?: string
          last_heartbeat?: string | null
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          max_power_kw?: number
          model?: string | null
          name: string
          ocpp_id: string
          photo_url?: string | null
          power_limit_schedule?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          access_settings?: Json
          address?: string | null
          connector_count?: number
          connector_type?: string
          created_at?: string
          firmware_version?: string | null
          group_id?: string | null
          id?: string
          last_heartbeat?: string | null
          latitude?: number | null
          location_id?: string | null
          longitude?: number | null
          max_power_kw?: number
          model?: string | null
          name?: string
          ocpp_id?: string
          photo_url?: string | null
          power_limit_schedule?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_points_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "charge_point_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_points_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_points_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charger_models: {
        Row: {
          charging_type: string
          created_at: string
          id: string
          is_active: boolean
          model: string
          notes: string | null
          power_kw: number | null
          protocol: string
          updated_at: string
          vendor: string
        }
        Insert: {
          charging_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model: string
          notes?: string | null
          power_kw?: number | null
          protocol?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          charging_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string
          notes?: string | null
          power_kw?: number | null
          protocol?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      charging_invoices: {
        Row: {
          created_at: string
          currency: string
          id: string
          idle_fee_amount: number
          invoice_number: string | null
          issued_at: string | null
          session_id: string
          status: string
          tariff_id: string | null
          tenant_id: string
          total_amount: number
          total_energy_kwh: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          idle_fee_amount?: number
          invoice_number?: string | null
          issued_at?: string | null
          session_id: string
          status?: string
          tariff_id?: string | null
          tenant_id: string
          total_amount?: number
          total_energy_kwh?: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          idle_fee_amount?: number
          invoice_number?: string | null
          issued_at?: string | null
          session_id?: string
          status?: string
          tariff_id?: string | null
          tenant_id?: string
          total_amount?: number
          total_energy_kwh?: number
        }
        Relationships: [
          {
            foreignKeyName: "charging_invoices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "charging_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_invoices_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "charging_tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_sessions: {
        Row: {
          charge_point_id: string | null
          connector_id: number
          created_at: string
          energy_kwh: number
          id: string
          id_tag: string | null
          meter_start: number | null
          meter_stop: number | null
          start_time: string
          status: string
          stop_reason: string | null
          stop_time: string | null
          tenant_id: string
          transaction_id: number | null
        }
        Insert: {
          charge_point_id?: string | null
          connector_id?: number
          created_at?: string
          energy_kwh?: number
          id?: string
          id_tag?: string | null
          meter_start?: number | null
          meter_stop?: number | null
          start_time?: string
          status?: string
          stop_reason?: string | null
          stop_time?: string | null
          tenant_id: string
          transaction_id?: number | null
        }
        Update: {
          charge_point_id?: string | null
          connector_id?: number
          created_at?: string
          energy_kwh?: number
          id?: string
          id_tag?: string | null
          meter_start?: number | null
          meter_stop?: number | null
          start_time?: string
          status?: string
          stop_reason?: string | null
          stop_time?: string | null
          tenant_id?: string
          transaction_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_tariffs: {
        Row: {
          base_fee: number
          created_at: string
          currency: string
          id: string
          idle_fee_grace_minutes: number
          idle_fee_per_minute: number
          is_active: boolean
          name: string
          price_per_kwh: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_fee?: number
          created_at?: string
          currency?: string
          id?: string
          idle_fee_grace_minutes?: number
          idle_fee_per_minute?: number
          is_active?: boolean
          name: string
          price_per_kwh?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_fee?: number
          created_at?: string
          currency?: string
          id?: string
          idle_fee_grace_minutes?: number
          idle_fee_per_minute?: number
          is_active?: boolean
          name?: string
          price_per_kwh?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_tariffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_user_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_app_user: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_app_user?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_app_user?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_user_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_users: {
        Row: {
          app_tag: string | null
          auth_user_id: string | null
          created_at: string
          email: string | null
          group_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rfid_tag: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          app_tag?: string | null
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rfid_tag?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          app_tag?: string | null
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rfid_tag?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_users_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "charging_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_role_permissions: {
        Row: {
          created_at: string
          custom_role_id: string
          id: string
          permission_id: string
        }
        Insert: {
          created_at?: string
          custom_role_id: string
          id?: string
          permission_id: string
        }
        Update: {
          created_at?: string
          custom_role_id?: string
          id?: string
          permission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_permissions_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          is_visible: boolean
          position: number
          updated_at: string
          user_id: string
          widget_size: string
          widget_type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          updated_at?: string
          user_id: string
          widget_size?: string
          widget_type: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          updated_at?: string
          user_id?: string
          widget_size?: string
          widget_type?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          subject: string
          template_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject: string
          template_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          template_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_prices: {
        Row: {
          created_at: string
          currency: string
          energy_type: string
          id: string
          location_id: string
          price_per_unit: number
          tenant_id: string
          unit: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          energy_type?: string
          id?: string
          location_id: string
          price_per_unit?: number
          tenant_id: string
          unit?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          energy_type?: string
          id?: string
          location_id?: string
          price_per_unit?: number
          tenant_id?: string
          unit?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_prices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_readings: {
        Row: {
          created_at: string
          energy_type: Database["public"]["Enums"]["energy_type"]
          id: string
          location_id: string
          recorded_at: string
          unit: string
          value: number
        }
        Insert: {
          created_at?: string
          energy_type: Database["public"]["Enums"]["energy_type"]
          id?: string
          location_id: string
          recorded_at: string
          unit?: string
          value: number
        }
        Update: {
          created_at?: string
          energy_type?: Database["public"]["Enums"]["energy_type"]
          id?: string
          location_id?: string
          recorded_at?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "energy_readings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_storages: {
        Row: {
          capacity_kwh: number
          created_at: string
          efficiency_pct: number
          id: string
          location_id: string | null
          max_charge_kw: number
          max_discharge_kw: number
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity_kwh?: number
          created_at?: string
          efficiency_pct?: number
          id?: string
          location_id?: string | null
          max_charge_kw?: number
          max_discharge_kw?: number
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity_kwh?: number
          created_at?: string
          efficiency_pct?: number
          id?: string
          location_id?: string | null
          max_charge_kw?: number
          max_discharge_kw?: number
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_storages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_storages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_rooms: {
        Row: {
          color: string | null
          created_at: string | null
          depth: number
          floor_id: string
          id: string
          name: string
          polygon_points: Json | null
          position_x: number
          position_y: number
          updated_at: string | null
          wall_height: number
          width: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          depth?: number
          floor_id: string
          id?: string
          name: string
          polygon_points?: Json | null
          position_x?: number
          position_y?: number
          updated_at?: string | null
          wall_height?: number
          width?: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          depth?: number
          floor_id?: string
          id?: string
          name?: string
          polygon_points?: Json | null
          position_x?: number
          position_y?: number
          updated_at?: string | null
          wall_height?: number
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "floor_rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_sensor_positions: {
        Row: {
          created_at: string
          floor_id: string
          id: string
          label_scale: number
          label_size: string
          location_integration_id: string
          position_x: number
          position_y: number
          position_z: number | null
          room_id: string | null
          sensor_name: string
          sensor_uuid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_id: string
          id?: string
          label_scale?: number
          label_size?: string
          location_integration_id: string
          position_x: number
          position_y: number
          position_z?: number | null
          room_id?: string | null
          sensor_name: string
          sensor_uuid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_id?: string
          id?: string
          label_scale?: number
          label_size?: string
          location_integration_id?: string
          position_x?: number
          position_y?: number
          position_z?: number | null
          room_id?: string | null
          sensor_name?: string
          sensor_uuid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_sensor_positions_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_sensor_positions_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_sensor_positions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "floor_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          area_sqm: number | null
          created_at: string
          description: string | null
          floor_number: number
          floor_plan_url: string | null
          id: string
          location_id: string
          model_3d_mtl_url: string | null
          model_3d_rotation: number | null
          model_3d_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          area_sqm?: number | null
          created_at?: string
          description?: string | null
          floor_number?: number
          floor_plan_url?: string | null
          id?: string
          location_id: string
          model_3d_mtl_url?: string | null
          model_3d_rotation?: number | null
          model_3d_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          area_sqm?: number | null
          created_at?: string
          description?: string | null
          floor_number?: number
          floor_plan_url?: string | null
          id?: string
          location_id?: string
          model_3d_mtl_url?: string | null
          model_3d_rotation?: number | null
          model_3d_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          category: string
          config: Json | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          category?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          category?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_tokens: {
        Row: {
          action_link: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          action_link: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Update: {
          action_link?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      location_automations: {
        Row: {
          action_type: string
          action_value: string | null
          actions: Json
          actuator_control_type: string
          actuator_name: string
          actuator_uuid: string
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_executed_at: string | null
          location_id: string
          location_integration_id: string
          logic_operator: string
          name: string
          schedule: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          action_value?: string | null
          actions?: Json
          actuator_control_type: string
          actuator_name: string
          actuator_uuid: string
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          location_id: string
          location_integration_id: string
          logic_operator?: string
          name: string
          schedule?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          action_value?: string | null
          actions?: Json
          actuator_control_type?: string
          actuator_name?: string
          actuator_uuid?: string
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          location_id?: string
          location_integration_id?: string
          logic_operator?: string
          name?: string
          schedule?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_automations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_automations_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_integrations: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          integration_id: string
          is_enabled: boolean | null
          last_sync_at: string | null
          location_id: string
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          integration_id: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          location_id: string
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          integration_id?: string
          is_enabled?: boolean | null
          last_sync_at?: string | null
          location_id?: string
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_integrations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_integrations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          energy_sources: string[] | null
          id: string
          is_archived: boolean
          is_main_location: boolean
          latitude: number | null
          longitude: number | null
          name: string
          parent_id: string | null
          postal_code: string | null
          show_on_map: boolean
          tenant_id: string
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
          usage_type: Database["public"]["Enums"]["location_usage_type"] | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          energy_sources?: string[] | null
          id?: string
          is_archived?: boolean
          is_main_location?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          parent_id?: string | null
          postal_code?: string | null
          show_on_map?: boolean
          tenant_id: string
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["location_usage_type"] | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          energy_sources?: string[] | null
          id?: string
          is_archived?: boolean
          is_main_location?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          parent_id?: string | null
          postal_code?: string | null
          show_on_map?: boolean
          tenant_id?: string
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["location_usage_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_period_totals: {
        Row: {
          created_at: string | null
          energy_type: string
          id: string
          meter_id: string
          period_start: string
          period_type: string
          source: string
          tenant_id: string
          total_value: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          energy_type: string
          id?: string
          meter_id: string
          period_start: string
          period_type: string
          source?: string
          tenant_id: string
          total_value: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          energy_type?: string
          id?: string
          meter_id?: string
          period_start?: string
          period_type?: string
          source?: string
          tenant_id?: string
          total_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_period_totals_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_period_totals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_power_readings: {
        Row: {
          created_at: string | null
          energy_type: string
          id: string
          meter_id: string
          power_value: number
          recorded_at: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          energy_type: string
          id?: string
          meter_id: string
          power_value: number
          recorded_at?: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          energy_type?: string
          id?: string
          meter_id?: string
          power_value?: number
          recorded_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_power_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_power_readings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_power_readings_5min: {
        Row: {
          bucket: string
          created_at: string
          energy_type: string
          id: string
          meter_id: string
          power_avg: number
          power_max: number
          sample_count: number
          tenant_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          energy_type: string
          id?: string
          meter_id: string
          power_avg: number
          power_max: number
          sample_count?: number
          tenant_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          energy_type?: string
          id?: string
          meter_id?: string
          power_avg?: number
          power_max?: number
          sample_count?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_power_readings_5min_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_power_readings_5min_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          capture_method: string
          created_at: string
          created_by: string | null
          id: string
          meter_id: string
          notes: string | null
          reading_date: string
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          capture_method?: string
          created_at?: string
          created_by?: string | null
          id?: string
          meter_id: string
          notes?: string | null
          reading_date?: string
          tenant_id: string
          updated_at?: string
          value: number
        }
        Update: {
          capture_method?: string
          created_at?: string
          created_by?: string | null
          id?: string
          meter_id?: string
          notes?: string | null
          reading_date?: string
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_scanners: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_scanners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meters: {
        Row: {
          brennwert: number | null
          capture_type: string
          created_at: string
          energy_type: string
          floor_id: string | null
          gas_type: string | null
          id: string
          installation_date: string | null
          is_archived: boolean
          is_main_meter: boolean
          location_id: string
          location_integration_id: string | null
          medium: string | null
          meter_function: string
          meter_number: string | null
          meter_operator: string | null
          name: string
          notes: string | null
          parent_meter_id: string | null
          photo_url: string | null
          position_3d_x: number | null
          position_3d_y: number | null
          position_3d_z: number | null
          room_id: string | null
          sensor_uuid: string | null
          source_unit_energy: string | null
          source_unit_power: string | null
          tenant_id: string
          unit: string
          updated_at: string
          zustandszahl: number | null
        }
        Insert: {
          brennwert?: number | null
          capture_type?: string
          created_at?: string
          energy_type?: string
          floor_id?: string | null
          gas_type?: string | null
          id?: string
          installation_date?: string | null
          is_archived?: boolean
          is_main_meter?: boolean
          location_id: string
          location_integration_id?: string | null
          medium?: string | null
          meter_function?: string
          meter_number?: string | null
          meter_operator?: string | null
          name: string
          notes?: string | null
          parent_meter_id?: string | null
          photo_url?: string | null
          position_3d_x?: number | null
          position_3d_y?: number | null
          position_3d_z?: number | null
          room_id?: string | null
          sensor_uuid?: string | null
          source_unit_energy?: string | null
          source_unit_power?: string | null
          tenant_id: string
          unit?: string
          updated_at?: string
          zustandszahl?: number | null
        }
        Update: {
          brennwert?: number | null
          capture_type?: string
          created_at?: string
          energy_type?: string
          floor_id?: string | null
          gas_type?: string | null
          id?: string
          installation_date?: string | null
          is_archived?: boolean
          is_main_meter?: boolean
          location_id?: string
          location_integration_id?: string | null
          medium?: string | null
          meter_function?: string
          meter_number?: string | null
          meter_operator?: string | null
          name?: string
          notes?: string | null
          parent_meter_id?: string | null
          photo_url?: string | null
          position_3d_x?: number | null
          position_3d_y?: number | null
          position_3d_z?: number | null
          room_id?: string | null
          sensor_uuid?: string | null
          source_unit_energy?: string | null
          source_unit_power?: string | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          zustandszahl?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meters_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_parent_meter_id_fkey"
            columns: ["parent_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "floor_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      module_prices: {
        Row: {
          created_at: string
          id: string
          module_code: string
          price_monthly: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_code: string
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          module_code?: string
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      ocpp_message_log: {
        Row: {
          charge_point_id: string
          created_at: string
          direction: string
          id: string
          message_type: string | null
          raw_message: Json
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          direction: string
          id?: string
          message_type?: string | null
          raw_message: Json
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          direction?: string
          id?: string
          message_type?: string | null
          raw_message?: Json
        }
        Relationships: []
      }
      pending_ocpp_commands: {
        Row: {
          charge_point_ocpp_id: string
          command: string
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          result: Json | null
          scheduled_at: string | null
          status: string
        }
        Insert: {
          charge_point_ocpp_id: string
          command: string
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          result?: Json | null
          scheduled_at?: string | null
          status?: string
        }
        Update: {
          charge_point_ocpp_id?: string
          command?: string
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          result?: Json | null
          scheduled_at?: string | null
          status?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      platform_statistics: {
        Row: {
          created_at: string
          id: string
          metric_type: string
          recorded_at: string
          tenant_id: string | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          metric_type: string
          recorded_at?: string
          tenant_id?: string | null
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          metric_type?: string
          recorded_at?: string
          tenant_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_statistics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          contact_person: string | null
          created_at: string
          custom_role_id: string | null
          email: string | null
          id: string
          is_blocked: boolean
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          custom_role_id?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          custom_role_id?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pv_forecast_settings: {
        Row: {
          azimuth_deg: number | null
          created_at: string
          id: string
          is_active: boolean | null
          location_id: string
          peak_power_kwp: number
          pv_meter_id: string | null
          tenant_id: string
          tilt_deg: number | null
          updated_at: string
        }
        Insert: {
          azimuth_deg?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          location_id: string
          peak_power_kwp?: number
          pv_meter_id?: string | null
          tenant_id: string
          tilt_deg?: number | null
          updated_at?: string
        }
        Update: {
          azimuth_deg?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          location_id?: string
          peak_power_kwp?: number
          pv_meter_id?: string | null
          tenant_id?: string
          tilt_deg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pv_forecast_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_forecast_settings_pv_meter_id_fkey"
            columns: ["pv_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_forecast_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string
          energy_types: string[]
          format: string
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          location_ids: string[]
          name: string
          next_run_at: string | null
          recipients: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          energy_types?: string[]
          format?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          location_ids?: string[]
          name: string
          next_run_at?: string | null
          recipients?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          energy_types?: string[]
          format?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          location_ids?: string[]
          name?: string
          next_run_at?: string | null
          recipients?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      spot_prices: {
        Row: {
          created_at: string
          id: string
          market_area: string
          price_eur_mwh: number
          price_type: string
          timestamp: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_area?: string
          price_eur_mwh: number
          price_type?: string
          timestamp: string
        }
        Update: {
          created_at?: string
          id?: string
          market_area?: string
          price_eur_mwh?: number
          price_type?: string
          timestamp?: string
        }
        Relationships: []
      }
      support_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          reason: string | null
          started_at: string
          super_admin_user_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          super_admin_user_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          started_at?: string
          super_admin_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          comment: string | null
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          description: string | null
          due_date: string | null
          external_contact_email: string | null
          external_contact_name: string | null
          external_contact_phone: string | null
          id: string
          priority: string
          source_id: string | null
          source_label: string | null
          source_type: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          due_date?: string | null
          external_contact_email?: string | null
          external_contact_name?: string | null
          external_contact_phone?: string | null
          id?: string
          priority?: string
          source_id?: string | null
          source_label?: string | null
          source_type?: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string | null
          due_date?: string | null
          external_contact_email?: string | null
          external_contact_name?: string | null
          external_contact_phone?: string | null
          id?: string
          priority?: string
          source_id?: string | null
          source_label?: string | null
          source_type?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_electricity_invoices: {
        Row: {
          base_fee: number
          created_at: string
          grid_amount: number
          grid_kwh: number
          id: string
          invoice_number: string | null
          issued_at: string | null
          local_amount: number
          local_kwh: number
          period_end: string
          period_start: string
          status: string
          tariff_id: string | null
          tenant_electricity_tenant_id: string
          tenant_id: string
          total_amount: number
          total_kwh: number
        }
        Insert: {
          base_fee?: number
          created_at?: string
          grid_amount?: number
          grid_kwh?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          local_amount?: number
          local_kwh?: number
          period_end: string
          period_start: string
          status?: string
          tariff_id?: string | null
          tenant_electricity_tenant_id: string
          tenant_id: string
          total_amount?: number
          total_kwh?: number
        }
        Update: {
          base_fee?: number
          created_at?: string
          grid_amount?: number
          grid_kwh?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          local_amount?: number
          local_kwh?: number
          period_end?: string
          period_start?: string
          status?: string
          tariff_id?: string | null
          tenant_electricity_tenant_id?: string
          tenant_id?: string
          total_amount?: number
          total_kwh?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_electricity_invoices_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "tenant_electricity_tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_invoices_tenant_electricity_tenant_id_fkey"
            columns: ["tenant_electricity_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_electricity_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_electricity_readings: {
        Row: {
          created_at: string
          id: string
          meter_id: string | null
          reading_date: string
          reading_type: string
          reading_value: number
          tenant_electricity_tenant_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meter_id?: string | null
          reading_date?: string
          reading_type?: string
          reading_value: number
          tenant_electricity_tenant_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meter_id?: string | null
          reading_date?: string
          reading_type?: string
          reading_value?: number
          tenant_electricity_tenant_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_electricity_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_readings_tenant_electricity_tenant_id_fkey"
            columns: ["tenant_electricity_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_electricity_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_readings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_electricity_settings: {
        Row: {
          allocation_method: string
          billing_period: string
          created_at: string
          grid_meter_id: string | null
          id: string
          location_id: string | null
          pv_meter_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allocation_method?: string
          billing_period?: string
          created_at?: string
          grid_meter_id?: string | null
          id?: string
          location_id?: string | null
          pv_meter_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allocation_method?: string
          billing_period?: string
          created_at?: string
          grid_meter_id?: string | null
          id?: string
          location_id?: string | null
          pv_meter_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_electricity_settings_grid_meter_id_fkey"
            columns: ["grid_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_settings_pv_meter_id_fkey"
            columns: ["pv_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_electricity_tariffs: {
        Row: {
          base_fee_monthly: number
          created_at: string
          id: string
          location_id: string
          name: string
          price_per_kwh_grid: number
          price_per_kwh_local: number
          tenant_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          base_fee_monthly?: number
          created_at?: string
          id?: string
          location_id: string
          name: string
          price_per_kwh_grid?: number
          price_per_kwh_local?: number
          tenant_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          base_fee_monthly?: number
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          price_per_kwh_grid?: number
          price_per_kwh_local?: number
          tenant_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_electricity_tariffs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_tariffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_electricity_tenant_meters: {
        Row: {
          created_at: string
          id: string
          meter_id: string
          tenant_electricity_tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meter_id: string
          tenant_electricity_tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meter_id?: string
          tenant_electricity_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_electricity_tenant_met_tenant_electricity_tenant_id_fkey"
            columns: ["tenant_electricity_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_electricity_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_tenant_meters_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_electricity_tenants: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string | null
          id: string
          location_id: string
          meter_id: string | null
          move_in_date: string | null
          move_out_date: string | null
          name: string
          status: string
          tenant_id: string
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          location_id: string
          meter_id?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          name: string
          status?: string
          tenant_id: string
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          location_id?: string
          meter_id?: string | null
          move_in_date?: string | null
          move_out_date?: string | null
          name?: string
          status?: string
          tenant_id?: string
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_electricity_tenants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_tenants_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_electricity_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invoices: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_number: string
          pdf_url: string | null
          period_end: string
          period_start: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_number: string
          pdf_url?: string | null
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_number?: string
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_licenses: {
        Row: {
          billing_cycle: string
          created_at: string
          id: string
          max_locations: number
          max_users: number
          plan_name: string
          price_monthly: number
          price_yearly: number
          status: string
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          id?: string
          max_locations?: number
          max_users?: number
          plan_name?: string
          price_monthly?: number
          price_yearly?: number
          status?: string
          tenant_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          id?: string
          max_locations?: number
          max_users?: number
          plan_name?: string
          price_monthly?: number
          price_yearly?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_licenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          created_at: string
          disabled_at: string | null
          enabled_at: string | null
          id: string
          is_enabled: boolean
          module_code: string
          price_override: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          module_code: string
          price_override?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          enabled_at?: string | null
          id?: string
          is_enabled?: boolean
          module_code?: string
          price_override?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_self_tariffs: {
        Row: {
          base_fee_monthly: number
          created_at: string
          energy_type: string
          id: string
          price_per_kwh: number
          provider_name: string | null
          tenant_electricity_tenant_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          base_fee_monthly?: number
          created_at?: string
          energy_type?: string
          id?: string
          price_per_kwh?: number
          provider_name?: string | null
          tenant_electricity_tenant_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          base_fee_monthly?: number
          created_at?: string
          energy_type?: string
          id?: string
          price_per_kwh?: number
          provider_name?: string | null
          tenant_electricity_tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_self_tariffs_tenant_electricity_tenant_id_fkey"
            columns: ["tenant_electricity_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_electricity_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          branding: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          remote_support_enabled: boolean
          remote_support_enabled_at: string | null
          report_settings: Json | null
          slug: string
          updated_at: string
          week_start_day: number
        }
        Insert: {
          address?: string | null
          branding?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          remote_support_enabled?: boolean
          remote_support_enabled_at?: string | null
          report_settings?: Json | null
          slug: string
          updated_at?: string
          week_start_day?: number
        }
        Update: {
          address?: string | null
          branding?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          remote_support_enabled?: boolean
          remote_support_enabled_at?: string | null
          report_settings?: Json | null
          slug?: string
          updated_at?: string
          week_start_day?: number
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_location_access: {
        Row: {
          created_at: string
          id: string
          location_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_location_access_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          color_scheme: string
          created_at: string
          id: string
          language: string
          onboarding_completed: boolean
          theme_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_scheme?: string
          created_at?: string
          id?: string
          language?: string
          onboarding_completed?: boolean
          theme_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_scheme?: string
          created_at?: string
          id?: string
          language?: string
          onboarding_completed?: boolean
          theme_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      virtual_meter_sources: {
        Row: {
          created_at: string
          id: string
          operator: string
          sort_order: number
          source_meter_id: string
          virtual_meter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          operator?: string
          sort_order?: number
          source_meter_id: string
          virtual_meter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          operator?: string
          sort_order?: number
          source_meter_id?: string
          virtual_meter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_meter_sources_source_meter_id_fkey"
            columns: ["source_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_meter_sources_virtual_meter_id_fkey"
            columns: ["virtual_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_degree_days: {
        Row: {
          avg_temperature: number
          cooling_degree_days: number
          created_at: string
          heating_degree_days: number
          id: string
          location_id: string
          month: string
          reference_temperature: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avg_temperature?: number
          cooling_degree_days?: number
          created_at?: string
          heating_degree_days?: number
          id?: string
          location_id: string
          month: string
          reference_temperature?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avg_temperature?: number
          cooling_degree_days?: number
          created_at?: string
          heating_degree_days?: number
          id?: string
          location_id?: string
          month?: string
          reference_temperature?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_degree_days_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_degree_days_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      charging_users_public: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string | null
          name: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_users_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "charging_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bootstrap_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      ensure_at_least_one_admin: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_auth_user_email: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_location_access: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission_code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_own_profile: { Args: { profile_user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      energy_type: "strom" | "gas" | "waerme" | "wasser"
      location_type: "einzelgebaeude" | "gebaeudekomplex" | "sonstiges"
      location_usage_type:
        | "verwaltungsgebaeude"
        | "universitaet"
        | "schule"
        | "kindertageseinrichtung"
        | "sportstaette"
        | "jugendzentrum"
        | "sonstiges"
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
      app_role: ["admin", "user", "super_admin"],
      energy_type: ["strom", "gas", "waerme", "wasser"],
      location_type: ["einzelgebaeude", "gebaeudekomplex", "sonstiges"],
      location_usage_type: [
        "verwaltungsgebaeude",
        "universitaet",
        "schule",
        "kindertageseinrichtung",
        "sportstaette",
        "jugendzentrum",
        "sonstiges",
      ],
    },
  },
} as const
