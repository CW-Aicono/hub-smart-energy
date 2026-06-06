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
          is_archived: boolean
          name: string
          sell_above_eur_mwh: number
          source: string
          storage_id: string
          tenant_id: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          buy_below_eur_mwh?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name: string
          sell_above_eur_mwh?: number
          source?: string
          storage_id: string
          tenant_id: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          buy_below_eur_mwh?: number
          created_at?: string
          id?: string
          is_active?: boolean
          is_archived?: boolean
          name?: string
          sell_above_eur_mwh?: number
          source?: string
          storage_id?: string
          tenant_id?: string
          updated_at?: string
          valid_until?: string | null
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
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          partner_id: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          partner_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          partner_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      automation_execution_log: {
        Row: {
          actions_executed: Json | null
          automation_id: string
          created_at: string
          duration_ms: number | null
          error_message: string | null
          executed_at: string
          execution_source: string
          id: string
          status: string
          tenant_id: string
          trigger_type: string
        }
        Insert: {
          actions_executed?: Json | null
          automation_id: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          execution_source?: string
          id?: string
          status?: string
          tenant_id: string
          trigger_type?: string
        }
        Update: {
          actions_executed?: Json | null
          automation_id?: string
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          execution_source?: string
          id?: string
          status?: string
          tenant_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_execution_log_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "location_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_scenes: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_template: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_template?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_template?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_scenes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_snapshots: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          data: Json | null
          error_message: string | null
          expires_at: string
          id: string
          rows_count: number
          size_bytes: number
          status: string
          tables_count: number
          tenant_id: string
        }
        Insert: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          error_message?: string | null
          expires_at?: string
          id?: string
          rows_count?: number
          size_bytes?: number
          status?: string
          tables_count?: number
          tenant_id: string
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          error_message?: string | null
          expires_at?: string
          id?: string
          rows_count?: number
          size_bytes?: number
          status?: string
          tables_count?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_snapshots_tenant_id_fkey"
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
      charge_point_active_profile: {
        Row: {
          applied_at: string
          charge_point_id: string
          connector_id: number
          current_limit_a: number | null
          current_limit_w: number | null
          expires_at: string | null
          id: string
          metadata: Json | null
          profile_purpose: string
          source: string
        }
        Insert: {
          applied_at?: string
          charge_point_id: string
          connector_id?: number
          current_limit_a?: number | null
          current_limit_w?: number | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          profile_purpose?: string
          source: string
        }
        Update: {
          applied_at?: string
          charge_point_id?: string
          connector_id?: number
          current_limit_a?: number | null
          current_limit_w?: number | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          profile_purpose?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_active_profile_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
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
      charge_point_capabilities: {
        Row: {
          charge_point_id: string
          created_at: string
          last_probed_at: string
          max_sample_length: number | null
          min_sample_interval: number | null
          raw_config: Json
          supported_measurands: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          charge_point_id: string
          created_at?: string
          last_probed_at?: string
          max_sample_length?: number | null
          min_sample_interval?: number | null
          raw_config?: Json
          supported_measurands?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string
          created_at?: string
          last_probed_at?: string
          max_sample_length?: number | null
          min_sample_interval?: number | null
          raw_config?: Json
          supported_measurands?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_capabilities_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: true
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_connectors: {
        Row: {
          charge_point_id: string
          charging_mode: string
          connector_id: number
          connector_type: string
          created_at: string
          display_order: number
          id: string
          last_status_at: string | null
          max_power_kw: number
          name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          charge_point_id: string
          charging_mode?: string
          connector_id: number
          connector_type?: string
          created_at?: string
          display_order?: number
          id?: string
          last_status_at?: string | null
          max_power_kw?: number
          name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string
          charging_mode?: string
          connector_id?: number
          connector_type?: string
          created_at?: string
          display_order?: number
          id?: string
          last_status_at?: string | null
          max_power_kw?: number
          name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_connectors_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_economics: {
        Row: {
          capex_cents: number
          charge_point_id: string
          commissioned_on: string | null
          created_at: string
          electricity_cost_eur_per_kwh: number
          notes: string | null
          opex_monthly_cents: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capex_cents?: number
          charge_point_id: string
          commissioned_on?: string | null
          created_at?: string
          electricity_cost_eur_per_kwh?: number
          notes?: string | null
          opex_monthly_cents?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capex_cents?: number
          charge_point_id?: string
          commissioned_on?: string | null
          created_at?: string
          electricity_cost_eur_per_kwh?: number
          notes?: string | null
          opex_monthly_cents?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_economics_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: true
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_point_economics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          location_id: string | null
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
          location_id?: string | null
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
          location_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_point_uptime_snapshots: {
        Row: {
          charge_point_id: string
          id: number
          is_online: boolean
          recorded_at: string
        }
        Insert: {
          charge_point_id: string
          id?: number
          is_online: boolean
          recorded_at?: string
        }
        Update: {
          charge_point_id?: string
          id?: number
          is_online?: boolean
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_point_uptime_snapshots_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_points: {
        Row: {
          access_settings: Json
          address: string | null
          auth_required: boolean
          auto_reboot_enabled: boolean
          auto_reboot_last_run_at: string | null
          auto_reboot_skip_if_charging: boolean
          auto_reboot_time: string
          auto_reboot_type: string
          certificate_required: boolean
          certificate_type: string | null
          cheap_charging_schedule: Json | null
          connection_protocol: string
          connector_count: number
          connector_type: string
          created_at: string
          energy_settings: Json
          firmware_version: string | null
          group_id: string | null
          id: string
          last_heartbeat: string | null
          latitude: number | null
          linked_meter_id: string | null
          location_id: string | null
          longitude: number | null
          max_power_kw: number
          model: string | null
          name: string
          ocpp_id: string | null
          ocpp_password: string | null
          photo_url: string | null
          power_limit_schedule: Json | null
          rfid_read_mode: string
          status: string
          supports_change_configuration: boolean | null
          supports_charging_profile: boolean | null
          tenant_id: string
          updated_at: string
          vendor: string | null
          ws_connected: boolean
          ws_connected_since: string | null
        }
        Insert: {
          access_settings?: Json
          address?: string | null
          auth_required?: boolean
          auto_reboot_enabled?: boolean
          auto_reboot_last_run_at?: string | null
          auto_reboot_skip_if_charging?: boolean
          auto_reboot_time?: string
          auto_reboot_type?: string
          certificate_required?: boolean
          certificate_type?: string | null
          cheap_charging_schedule?: Json | null
          connection_protocol?: string
          connector_count?: number
          connector_type?: string
          created_at?: string
          energy_settings?: Json
          firmware_version?: string | null
          group_id?: string | null
          id?: string
          last_heartbeat?: string | null
          latitude?: number | null
          linked_meter_id?: string | null
          location_id?: string | null
          longitude?: number | null
          max_power_kw?: number
          model?: string | null
          name: string
          ocpp_id?: string | null
          ocpp_password?: string | null
          photo_url?: string | null
          power_limit_schedule?: Json | null
          rfid_read_mode?: string
          status?: string
          supports_change_configuration?: boolean | null
          supports_charging_profile?: boolean | null
          tenant_id: string
          updated_at?: string
          vendor?: string | null
          ws_connected?: boolean
          ws_connected_since?: string | null
        }
        Update: {
          access_settings?: Json
          address?: string | null
          auth_required?: boolean
          auto_reboot_enabled?: boolean
          auto_reboot_last_run_at?: string | null
          auto_reboot_skip_if_charging?: boolean
          auto_reboot_time?: string
          auto_reboot_type?: string
          certificate_required?: boolean
          certificate_type?: string | null
          cheap_charging_schedule?: Json | null
          connection_protocol?: string
          connector_count?: number
          connector_type?: string
          created_at?: string
          energy_settings?: Json
          firmware_version?: string | null
          group_id?: string | null
          id?: string
          last_heartbeat?: string | null
          latitude?: number | null
          linked_meter_id?: string | null
          location_id?: string | null
          longitude?: number | null
          max_power_kw?: number
          model?: string | null
          name?: string
          ocpp_id?: string | null
          ocpp_password?: string | null
          photo_url?: string | null
          power_limit_schedule?: Json | null
          rfid_read_mode?: string
          status?: string
          supports_change_configuration?: boolean | null
          supports_charging_profile?: boolean | null
          tenant_id?: string
          updated_at?: string
          vendor?: string | null
          ws_connected?: boolean
          ws_connected_since?: string | null
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
            foreignKeyName: "charge_points_linked_meter_id_fkey"
            columns: ["linked_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
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
      charging_access_log: {
        Row: {
          charge_point_id: string | null
          charge_point_ocpp_id: string | null
          created_at: string
          id: string
          id_tag: string | null
          metadata: Json | null
          reason: string | null
          result: string
          tenant_id: string
        }
        Insert: {
          charge_point_id?: string | null
          charge_point_ocpp_id?: string | null
          created_at?: string
          id?: string
          id_tag?: string | null
          metadata?: Json | null
          reason?: string | null
          result: string
          tenant_id: string
        }
        Update: {
          charge_point_id?: string | null
          charge_point_ocpp_id?: string | null
          created_at?: string
          id?: string
          id_tag?: string | null
          metadata?: Json | null
          reason?: string | null
          result?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_access_log_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_invoice_counter: {
        Row: {
          last_number: number
          tenant_id: string
          year: number
        }
        Insert: {
          last_number?: number
          tenant_id: string
          year: number
        }
        Update: {
          last_number?: number
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "charging_invoice_counter_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_invoice_sessions: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_invoice_sessions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "charging_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_invoice_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "charging_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_invoice_settings: {
        Row: {
          bank_name: string | null
          bic: string | null
          company_address: string
          company_email: string | null
          company_name: string
          company_phone: string | null
          created_at: string
          footer_text: string | null
          iban: string | null
          id: string
          logo_url: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          company_address?: string
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          created_at?: string
          footer_text?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          company_address?: string
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          created_at?: string
          footer_text?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_invoice_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_invoices: {
        Row: {
          created_at: string
          currency: string
          id: string
          idle_fee_amount: number
          invoice_date: string
          invoice_number: string | null
          issued_at: string | null
          net_amount: number
          pdf_storage_path: string | null
          period_end: string | null
          period_start: string | null
          session_id: string | null
          status: string
          tariff_id: string | null
          tax_amount: number
          tax_rate_percent: number
          tenant_id: string
          total_amount: number
          total_energy_kwh: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          idle_fee_amount?: number
          invoice_date?: string
          invoice_number?: string | null
          issued_at?: string | null
          net_amount?: number
          pdf_storage_path?: string | null
          period_end?: string | null
          period_start?: string | null
          session_id?: string | null
          status?: string
          tariff_id?: string | null
          tax_amount?: number
          tax_rate_percent?: number
          tenant_id: string
          total_amount?: number
          total_energy_kwh?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          idle_fee_amount?: number
          invoice_date?: string
          invoice_number?: string | null
          issued_at?: string | null
          net_amount?: number
          pdf_storage_path?: string | null
          period_end?: string | null
          period_start?: string | null
          session_id?: string | null
          status?: string
          tariff_id?: string | null
          tax_amount?: number
          tax_rate_percent?: number
          tenant_id?: string
          total_amount?: number
          total_energy_kwh?: number
          user_id?: string | null
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
          {
            foreignKeyName: "charging_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "charging_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "charging_users_public"
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
          is_default: boolean
          name: string
          price_includes_vat: boolean | null
          price_per_kwh: number
          tax_rate_percent: number
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
          is_default?: boolean
          name: string
          price_includes_vat?: boolean | null
          price_per_kwh?: number
          tax_rate_percent?: number
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
          is_default?: boolean
          name?: string
          price_includes_vat?: boolean | null
          price_per_kwh?: number
          tax_rate_percent?: number
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
          tariff_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_app_user?: boolean
          name: string
          tariff_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_app_user?: boolean
          name?: string
          tariff_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_user_groups_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "charging_tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_user_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_user_rfid_tags: {
        Row: {
          created_at: string
          id: string
          label: string | null
          tag: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          tag: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          tag?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_user_rfid_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_user_rfid_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "charging_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_user_rfid_tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "charging_users_public"
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
          rfid_label: string | null
          rfid_tag: string | null
          status: string
          tariff_id: string | null
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
          rfid_label?: string | null
          rfid_tag?: string | null
          status?: string
          tariff_id?: string | null
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
          rfid_label?: string | null
          rfid_tag?: string | null
          status?: string
          tariff_id?: string | null
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
            foreignKeyName: "charging_users_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "charging_tariffs"
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
      co2_emission_factors: {
        Row: {
          created_at: string
          energy_type: string
          factor_kg_per_kwh: number
          factor_kg_per_m3: number | null
          id: string
          is_default: boolean
          primary_energy_factor: number | null
          source: string | null
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          energy_type: string
          factor_kg_per_kwh?: number
          factor_kg_per_m3?: number | null
          id?: string
          is_default?: boolean
          primary_energy_factor?: number | null
          source?: string | null
          tenant_id: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          energy_type?: string
          factor_kg_per_kwh?: number
          factor_kg_per_m3?: number | null
          id?: string
          is_default?: boolean
          primary_energy_factor?: number | null
          source?: string | null
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "co2_emission_factors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_allocation_runs: {
        Row: {
          community_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          period_end: string
          period_start: string
          started_at: string
          status: string
          strategy: string
          tenant_id: string
          total_allocated_kwh: number | null
          total_generated_kwh: number | null
          total_surplus_kwh: number | null
        }
        Insert: {
          community_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          period_end: string
          period_start: string
          started_at?: string
          status?: string
          strategy?: string
          tenant_id: string
          total_allocated_kwh?: number | null
          total_generated_kwh?: number | null
          total_surplus_kwh?: number | null
        }
        Update: {
          community_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          period_end?: string
          period_start?: string
          started_at?: string
          status?: string
          strategy?: string
          tenant_id?: string
          total_allocated_kwh?: number | null
          total_generated_kwh?: number | null
          total_surplus_kwh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_allocation_runs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_allocations_15min: {
        Row: {
          allocated_kwh: number
          community_id: string
          created_at: string
          id: string
          member_id: string
          run_id: string | null
          strategy: string
          surplus_to_grid_kwh: number
          tenant_id: string
          ts_start: string
        }
        Insert: {
          allocated_kwh?: number
          community_id: string
          created_at?: string
          id?: string
          member_id: string
          run_id?: string | null
          strategy?: string
          surplus_to_grid_kwh?: number
          tenant_id: string
          ts_start: string
        }
        Update: {
          allocated_kwh?: number
          community_id?: string
          created_at?: string
          id?: string
          member_id?: string
          run_id?: string | null
          strategy?: string
          surplus_to_grid_kwh?: number
          tenant_id?: string
          ts_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_allocations_15min_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_allocations_15min_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_allocations_15min_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "community_allocation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      community_assets: {
        Row: {
          asset_type: string
          building_type: string | null
          capacity_kw: number
          community_id: string
          created_at: string
          id: string
          imsys_requested_at: string | null
          imsys_status: string | null
          location_id: string | null
          meter_id: string | null
          not_commercial: boolean | null
          operator_legal_form: string | null
          renewable_confirmed: boolean | null
          renewable_proof_url: string | null
          share_model: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          asset_type?: string
          building_type?: string | null
          capacity_kw?: number
          community_id: string
          created_at?: string
          id?: string
          imsys_requested_at?: string | null
          imsys_status?: string | null
          location_id?: string | null
          meter_id?: string | null
          not_commercial?: boolean | null
          operator_legal_form?: string | null
          renewable_confirmed?: boolean | null
          renewable_proof_url?: string | null
          share_model?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          building_type?: string | null
          capacity_kw?: number
          community_id?: string
          created_at?: string
          id?: string
          imsys_requested_at?: string | null
          imsys_status?: string | null
          location_id?: string | null
          meter_id?: string | null
          not_commercial?: boolean | null
          operator_legal_form?: string | null
          renewable_confirmed?: boolean | null
          renewable_proof_url?: string | null
          share_model?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_assets_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_contract_templates: {
        Row: {
          body_markdown: string
          community_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          placeholders: Json
          template_kind: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          body_markdown: string
          community_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          placeholders?: Json
          template_kind?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_markdown?: string
          community_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          placeholders?: Json
          template_kind?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_contract_templates_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_join_requests: {
        Row: {
          address: string | null
          city: string | null
          community_id: string
          created_at: string
          created_member_id: string | null
          email: string
          id: string
          listing_id: string | null
          message: string | null
          name: string
          phone: string | null
          plz: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_ip: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          community_id: string
          created_at?: string
          created_member_id?: string | null
          email: string
          id?: string
          listing_id?: string | null
          message?: string | null
          name: string
          phone?: string | null
          plz?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ip?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          community_id?: string
          created_at?: string
          created_member_id?: string | null
          email?: string
          id?: string
          listing_id?: string | null
          message?: string | null
          name?: string
          phone?: string | null
          plz?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ip?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_join_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_join_requests_created_member_id_fkey"
            columns: ["created_member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_join_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "community_marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      community_marketplace_listings: {
        Row: {
          community_id: string
          contact_email: string | null
          created_at: string
          feed_in_ct_kwh: number | null
          hero_image_url: string | null
          id: string
          is_public: boolean
          long_description: string | null
          max_members: number | null
          price_ct_kwh: number | null
          region_city: string | null
          region_plz: string | null
          short_description: string | null
          slug: string
          tenant_id: string
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          community_id: string
          contact_email?: string | null
          created_at?: string
          feed_in_ct_kwh?: number | null
          hero_image_url?: string | null
          id?: string
          is_public?: boolean
          long_description?: string | null
          max_members?: number | null
          price_ct_kwh?: number | null
          region_city?: string | null
          region_plz?: string | null
          short_description?: string | null
          slug: string
          tenant_id: string
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          community_id?: string
          contact_email?: string | null
          created_at?: string
          feed_in_ct_kwh?: number | null
          hero_image_url?: string | null
          id?: string
          is_public?: boolean
          long_description?: string | null
          max_members?: number | null
          price_ct_kwh?: number | null
          region_city?: string | null
          region_plz?: string | null
          short_description?: string | null
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_marketplace_listings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_member_invoices: {
        Row: {
          allocated_kwh: number
          community_id: string
          created_at: string
          currency: string
          feed_in_credit_ct: number
          feed_in_kwh: number
          id: string
          internal_amount_ct: number
          invoice_number: string | null
          issued_at: string | null
          line_items: Json
          member_id: string
          paid_at: string | null
          pdf_path: string | null
          period_end: string
          period_start: string
          status: string
          tenant_id: string
          total_ct: number
          updated_at: string
        }
        Insert: {
          allocated_kwh?: number
          community_id: string
          created_at?: string
          currency?: string
          feed_in_credit_ct?: number
          feed_in_kwh?: number
          id?: string
          internal_amount_ct?: number
          invoice_number?: string | null
          issued_at?: string | null
          line_items?: Json
          member_id: string
          paid_at?: string | null
          pdf_path?: string | null
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
          total_ct?: number
          updated_at?: string
        }
        Update: {
          allocated_kwh?: number
          community_id?: string
          created_at?: string
          currency?: string
          feed_in_credit_ct?: number
          feed_in_kwh?: number
          id?: string
          internal_amount_ct?: number
          invoice_number?: string | null
          issued_at?: string | null
          line_items?: Json
          member_id?: string
          paid_at?: string | null
          pdf_path?: string | null
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
          total_ct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_member_invoices_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_invoices_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_member_readings_15min: {
        Row: {
          community_id: string
          created_at: string
          direction: string
          id: string
          import_id: string | null
          kwh: number
          member_id: string
          source: string
          tenant_id: string
          ts_start: string
        }
        Insert: {
          community_id: string
          created_at?: string
          direction: string
          id?: string
          import_id?: string | null
          kwh: number
          member_id: string
          source?: string
          tenant_id: string
          ts_start: string
        }
        Update: {
          community_id?: string
          created_at?: string
          direction?: string
          id?: string
          import_id?: string | null
          kwh?: number
          member_id?: string
          source?: string
          tenant_id?: string
          ts_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_member_readings_15min_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_readings_15min_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "smart_meter_mscons_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_readings_15min_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
        ]
      }
      community_member_signatures: {
        Row: {
          body_hash: string
          community_id: string
          created_at: string
          id: string
          member_id: string
          signed_at: string
          signed_body: string
          signer_ip: string | null
          signer_name: string
          template_id: string
          template_version: number
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          body_hash: string
          community_id: string
          created_at?: string
          id?: string
          member_id: string
          signed_at?: string
          signed_body: string
          signer_ip?: string | null
          signer_name: string
          template_id: string
          template_version: number
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          body_hash?: string
          community_id?: string
          created_at?: string
          id?: string
          member_id?: string
          signed_at?: string
          signed_body?: string
          signer_ip?: string | null
          signer_name?: string
          template_id?: string
          template_version?: number
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_member_signatures_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_signatures_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "community_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "community_contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          activated_at: string | null
          annual_balance_eur: number | null
          annual_revenue_eur: number | null
          community_id: string
          created_at: string
          customer_class: string | null
          display_name: string | null
          email: string | null
          employees: number | null
          id: string
          imsys_installed_at: string | null
          imsys_requested_at: string | null
          imsys_status: string | null
          invited_at: string | null
          joined_at: string | null
          last_invite_sent_at: string | null
          left_at: string | null
          malo_id: string | null
          melo_id: string | null
          member_no: string | null
          metering_type: string | null
          pre_contract_info_sent_at: string | null
          rest_supplier_confirmed_at: string | null
          rest_supplier_contract_no: string | null
          rest_supplier_name: string | null
          role: string
          share_kw: number
          status: string
          suspended_at: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          annual_balance_eur?: number | null
          annual_revenue_eur?: number | null
          community_id: string
          created_at?: string
          customer_class?: string | null
          display_name?: string | null
          email?: string | null
          employees?: number | null
          id?: string
          imsys_installed_at?: string | null
          imsys_requested_at?: string | null
          imsys_status?: string | null
          invited_at?: string | null
          joined_at?: string | null
          last_invite_sent_at?: string | null
          left_at?: string | null
          malo_id?: string | null
          melo_id?: string | null
          member_no?: string | null
          metering_type?: string | null
          pre_contract_info_sent_at?: string | null
          rest_supplier_confirmed_at?: string | null
          rest_supplier_contract_no?: string | null
          rest_supplier_name?: string | null
          role?: string
          share_kw?: number
          status?: string
          suspended_at?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          annual_balance_eur?: number | null
          annual_revenue_eur?: number | null
          community_id?: string
          created_at?: string
          customer_class?: string | null
          display_name?: string | null
          email?: string | null
          employees?: number | null
          id?: string
          imsys_installed_at?: string | null
          imsys_requested_at?: string | null
          imsys_status?: string | null
          invited_at?: string | null
          joined_at?: string | null
          last_invite_sent_at?: string | null
          left_at?: string | null
          malo_id?: string | null
          melo_id?: string | null
          member_no?: string | null
          metering_type?: string | null
          pre_contract_info_sent_at?: string | null
          rest_supplier_confirmed_at?: string | null
          rest_supplier_contract_no?: string | null
          rest_supplier_name?: string | null
          role?: string
          share_kw?: number
          status?: string
          suspended_at?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_tariffs: {
        Row: {
          community_id: string
          created_at: string
          feed_in_ct_kwh: number
          id: string
          price_ct_kwh: number
          price_includes_vat: boolean | null
          tenant_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          community_id: string
          created_at?: string
          feed_in_ct_kwh?: number
          id?: string
          price_ct_kwh?: number
          price_includes_vat?: boolean | null
          tenant_id: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string
          feed_in_ct_kwh?: number
          id?: string
          price_ct_kwh?: number
          price_includes_vat?: boolean | null
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_tariffs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_analyses: {
        Row: {
          analysis_type: string
          best_roi_years: number | null
          created_at: string
          created_by: string | null
          funding_matches: Json | null
          id: string
          input_params: Json | null
          location_id: string | null
          recommendations: Json | null
          roi_scenarios: Json | null
          status: string
          tenant_id: string
          total_funding: number | null
          total_investment: number | null
        }
        Insert: {
          analysis_type?: string
          best_roi_years?: number | null
          created_at?: string
          created_by?: string | null
          funding_matches?: Json | null
          id?: string
          input_params?: Json | null
          location_id?: string | null
          recommendations?: Json | null
          roi_scenarios?: Json | null
          status?: string
          tenant_id: string
          total_funding?: number | null
          total_investment?: number | null
        }
        Update: {
          analysis_type?: string
          best_roi_years?: number | null
          created_at?: string
          created_by?: string | null
          funding_matches?: Json | null
          id?: string
          input_params?: Json | null
          location_id?: string | null
          recommendations?: Json | null
          roi_scenarios?: Json | null
          status?: string
          tenant_id?: string
          total_funding?: number | null
          total_investment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_analyses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_analyses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_projects: {
        Row: {
          analysis_id: string | null
          created_at: string
          estimated_funding: number | null
          estimated_investment: number | null
          estimated_roi_years: number | null
          estimated_savings_year: number | null
          id: string
          location_id: string | null
          notes: string | null
          priority: number | null
          status: string
          target_year: number | null
          technology: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          estimated_funding?: number | null
          estimated_investment?: number | null
          estimated_roi_years?: number | null
          estimated_savings_year?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          priority?: number | null
          status?: string
          target_year?: number | null
          technology?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          estimated_funding?: number | null
          estimated_investment?: number | null
          estimated_roi_years?: number | null
          estimated_savings_year?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          priority?: number | null
          status?: string
          target_year?: number | null
          technology?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_projects_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "copilot_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_projects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_projects_tenant_id_fkey"
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
      custom_widget_definitions: {
        Row: {
          chart_type: string
          color: string | null
          config: Json
          created_at: string | null
          created_by: string
          icon: string | null
          id: string
          is_shared: boolean | null
          name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          chart_type: string
          color?: string | null
          config?: Json
          created_at?: string | null
          created_by: string
          icon?: string | null
          id?: string
          is_shared?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          chart_type?: string
          color?: string | null
          config?: Json
          created_at?: string | null
          created_by?: string
          icon?: string | null
          id?: string
          is_shared?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_widget_definitions_tenant_id_fkey"
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
      device_catalog: {
        Row: {
          benoetigt_klassen: string[]
          beschreibung: string | null
          bild_url: string | null
          created_at: string
          datasheet_url: string | null
          einheit: string
          ek_preis: number
          geraete_klasse: Database["public"]["Enums"]["device_class"]
          hersteller: string
          id: string
          installations_pauschale: number
          is_active: boolean
          kompatibilitaet: Json
          kompatible_klassen: string[]
          modell: string
          owner_scope: string
          partner_id: string | null
          tech_specs: Json
          updated_at: string
          vk_preis: number
        }
        Insert: {
          benoetigt_klassen?: string[]
          beschreibung?: string | null
          bild_url?: string | null
          created_at?: string
          datasheet_url?: string | null
          einheit?: string
          ek_preis?: number
          geraete_klasse?: Database["public"]["Enums"]["device_class"]
          hersteller: string
          id?: string
          installations_pauschale?: number
          is_active?: boolean
          kompatibilitaet?: Json
          kompatible_klassen?: string[]
          modell: string
          owner_scope?: string
          partner_id?: string | null
          tech_specs?: Json
          updated_at?: string
          vk_preis?: number
        }
        Update: {
          benoetigt_klassen?: string[]
          beschreibung?: string | null
          bild_url?: string | null
          created_at?: string
          datasheet_url?: string | null
          einheit?: string
          ek_preis?: number
          geraete_klasse?: Database["public"]["Enums"]["device_class"]
          hersteller?: string
          id?: string
          installations_pauschale?: number
          is_active?: boolean
          kompatibilitaet?: Json
          kompatible_klassen?: string[]
          modell?: string
          owner_scope?: string
          partner_id?: string | null
          tech_specs?: Json
          updated_at?: string
          vk_preis?: number
        }
        Relationships: [
          {
            foreignKeyName: "device_catalog_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      device_catalog_partner_pricing: {
        Row: {
          created_at: string
          device_catalog_id: string
          ek_preis: number | null
          id: string
          installations_pauschale: number | null
          partner_id: string
          updated_at: string
          vk_preis: number | null
        }
        Insert: {
          created_at?: string
          device_catalog_id: string
          ek_preis?: number | null
          id?: string
          installations_pauschale?: number | null
          partner_id: string
          updated_at?: string
          vk_preis?: number | null
        }
        Update: {
          created_at?: string
          device_catalog_id?: string
          ek_preis?: number | null
          id?: string
          installations_pauschale?: number | null
          partner_id?: string
          updated_at?: string
          vk_preis?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_catalog_partner_pricing_device_catalog_id_fkey"
            columns: ["device_catalog_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_catalog_partner_pricing_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      device_compatibility: {
        Row: {
          auto_quantity_formula: string
          created_at: string
          id: string
          notiz: string | null
          owner_scope: string
          partner_id: string | null
          prio: number
          relation_type: string
          source_device_id: string
          target_device_id: string
          updated_at: string
        }
        Insert: {
          auto_quantity_formula?: string
          created_at?: string
          id?: string
          notiz?: string | null
          owner_scope?: string
          partner_id?: string | null
          prio?: number
          relation_type: string
          source_device_id: string
          target_device_id: string
          updated_at?: string
        }
        Update: {
          auto_quantity_formula?: string
          created_at?: string
          id?: string
          notiz?: string | null
          owner_scope?: string
          partner_id?: string | null
          prio?: number
          relation_type?: string
          source_device_id?: string
          target_device_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_compatibility_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_compatibility_source_device_id_fkey"
            columns: ["source_device_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_compatibility_target_device_id_fkey"
            columns: ["target_device_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      device_selection_rules: {
        Row: {
          bedingung: Json
          beschreibung: string | null
          created_at: string
          device_catalog_id: string
          id: string
          is_active: boolean
          name: string
          owner_scope: string
          partner_id: string | null
          prio: number
          updated_at: string
        }
        Insert: {
          bedingung?: Json
          beschreibung?: string | null
          created_at?: string
          device_catalog_id: string
          id?: string
          is_active?: boolean
          name: string
          owner_scope?: string
          partner_id?: string | null
          prio?: number
          updated_at?: string
        }
        Update: {
          bedingung?: Json
          beschreibung?: string | null
          created_at?: string
          device_catalog_id?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_scope?: string
          partner_id?: string | null
          prio?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_selection_rules_device_catalog_id_fkey"
            columns: ["device_catalog_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_selection_rules_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dlm_control_log: {
        Row: {
          applied_profiles: Json
          available_kw: number | null
          executed_at: string
          id: number
          location_id: string
          measured_kw: number | null
          reason: string | null
          tenant_id: string
        }
        Insert: {
          applied_profiles?: Json
          available_kw?: number | null
          executed_at?: string
          id?: number
          location_id: string
          measured_kw?: number | null
          reason?: string | null
          tenant_id: string
        }
        Update: {
          applied_profiles?: Json
          available_kw?: number | null
          executed_at?: string
          id?: number
          location_id?: string
          measured_kw?: number | null
          reason?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      email_send_audit: {
        Row: {
          created_at: string
          error: string | null
          id: string
          metadata: Json
          recipient: string
          resend_message_id: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient: string
          resend_message_id?: string | null
          status: string
          type: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient?: string
          resend_message_id?: string | null
          status?: string
          type?: string
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
      energy_benchmarks: {
        Row: {
          average_value: number
          energy_type: string
          high_value: number
          id: string
          source: string | null
          target_value: number
          unit: string
          usage_type: string
          valid_year: number
        }
        Insert: {
          average_value: number
          energy_type: string
          high_value: number
          id?: string
          source?: string | null
          target_value: number
          unit?: string
          usage_type: string
          valid_year?: number
        }
        Update: {
          average_value?: number
          energy_type?: string
          high_value?: number
          id?: string
          source?: string | null
          target_value?: number
          unit?: string
          usage_type?: string
          valid_year?: number
        }
        Relationships: []
      }
      energy_communities: {
        Row: {
          balancing_zone: string | null
          contract_template_id: string | null
          created_at: string
          data_quality_threshold_pct: number
          grid_operator: string | null
          id: string
          name: string
          pilot_acknowledged_at: string | null
          region_plz: string[]
          settings: Json
          slug: string
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          balancing_zone?: string | null
          contract_template_id?: string | null
          created_at?: string
          data_quality_threshold_pct?: number
          grid_operator?: string | null
          id?: string
          name: string
          pilot_acknowledged_at?: string | null
          region_plz?: string[]
          settings?: Json
          slug: string
          status?: string
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          balancing_zone?: string | null
          contract_template_id?: string | null
          created_at?: string
          data_quality_threshold_pct?: number
          grid_operator?: string | null
          id?: string
          name?: string
          pilot_acknowledged_at?: string | null
          region_plz?: string[]
          settings?: Json
          slug?: string
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      energy_measures: {
        Row: {
          category: string
          created_at: string
          description: string | null
          energy_type: string | null
          estimated_annual_savings_eur: number | null
          estimated_annual_savings_kwh: number | null
          id: string
          implementation_date: string | null
          investment_cost: number | null
          location_id: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          energy_type?: string | null
          estimated_annual_savings_eur?: number | null
          estimated_annual_savings_kwh?: number | null
          id?: string
          implementation_date?: string | null
          investment_cost?: number | null
          location_id: string
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          energy_type?: string | null
          estimated_annual_savings_eur?: number | null
          estimated_annual_savings_kwh?: number | null
          id?: string
          implementation_date?: string | null
          investment_cost?: number | null
          location_id?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_measures_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_measures_tenant_id_fkey"
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
          direction: string
          energy_type: string
          id: string
          is_dynamic: boolean
          location_id: string
          meter_id: string | null
          price_includes_vat: boolean | null
          price_per_unit: number
          spot_markup_per_unit: number
          tenant_id: string
          unit: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          direction?: string
          energy_type?: string
          id?: string
          is_dynamic?: boolean
          location_id: string
          meter_id?: string | null
          price_includes_vat?: boolean | null
          price_per_unit?: number
          spot_markup_per_unit?: number
          tenant_id: string
          unit?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          direction?: string
          energy_type?: string
          id?: string
          is_dynamic?: boolean
          location_id?: string
          meter_id?: string | null
          price_includes_vat?: boolean | null
          price_per_unit?: number
          spot_markup_per_unit?: number
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
            foreignKeyName: "energy_prices_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
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
      energy_report_archive: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          location_ids: string[]
          pdf_storage_path: string | null
          report_config: Json | null
          report_year: number
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          location_ids?: string[]
          pdf_storage_path?: string | null
          report_config?: Json | null
          report_year: number
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          location_ids?: string[]
          pdf_storage_path?: string | null
          report_config?: Json | null
          report_year?: number
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_report_archive_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_report_drafts: {
        Row: {
          created_at: string
          id: string
          profile_code: string | null
          report_year: number
          tenant_id: string
          texts: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          profile_code?: string | null
          report_year: number
          tenant_id: string
          texts?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          profile_code?: string | null
          report_year?: number
          tenant_id?: string
          texts?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_report_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      energy_supplier_invoices: {
        Row: {
          ai_confidence: string | null
          ai_raw_response: Json | null
          consumption_kwh: number | null
          consumption_unit: string | null
          correction_of_id: string | null
          created_at: string
          currency: string | null
          energy_type: string | null
          file_path: string | null
          id: string
          invoice_number: string | null
          location_id: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          status: string | null
          supplier_name: string | null
          tax_amount: number | null
          tenant_id: string
          total_gross: number | null
          total_net: number | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: string | null
          ai_raw_response?: Json | null
          consumption_kwh?: number | null
          consumption_unit?: string | null
          correction_of_id?: string | null
          created_at?: string
          currency?: string | null
          energy_type?: string | null
          file_path?: string | null
          id?: string
          invoice_number?: string | null
          location_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          supplier_name?: string | null
          tax_amount?: number | null
          tenant_id: string
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: string | null
          ai_raw_response?: Json | null
          consumption_kwh?: number | null
          consumption_unit?: string | null
          correction_of_id?: string | null
          created_at?: string
          currency?: string | null
          energy_type?: string | null
          file_path?: string | null
          id?: string
          invoice_number?: string | null
          location_id?: string | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          supplier_name?: string | null
          tax_amount?: number | null
          tenant_id?: string
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_supplier_invoices_correction_of_id_fkey"
            columns: ["correction_of_id"]
            isOneToOne: false
            referencedRelation: "energy_supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_supplier_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_supplier_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      external_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_contacts_tenant_id_fkey"
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
      funding_programs: {
        Row: {
          amount_description: string | null
          created_at: string
          funding_type: string
          id: string
          is_active: boolean
          level: string
          max_amount: number | null
          min_capacity: number | null
          municipality: string | null
          name: string
          notes: string | null
          state: string | null
          technology: string[] | null
          updated_at: string
          url: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          amount_description?: string | null
          created_at?: string
          funding_type?: string
          id?: string
          is_active?: boolean
          level?: string
          max_amount?: number | null
          min_capacity?: number | null
          municipality?: string | null
          name: string
          notes?: string | null
          state?: string | null
          technology?: string[] | null
          updated_at?: string
          url?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          amount_description?: string | null
          created_at?: string
          funding_type?: string
          id?: string
          is_active?: boolean
          level?: string
          max_amount?: number | null
          min_capacity?: number | null
          municipality?: string | null
          name?: string
          notes?: string | null
          state?: string | null
          technology?: string[] | null
          updated_at?: string
          url?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      gateway_commands: {
        Row: {
          acked_at: string | null
          command_type: string
          created_at: string
          created_by: string | null
          error_message: string | null
          expires_at: string
          gateway_device_id: string
          id: string
          payload: Json
          response: Json | null
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          acked_at?: string | null
          command_type: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string
          gateway_device_id: string
          id?: string
          payload?: Json
          response?: Json | null
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          acked_at?: string | null
          command_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string
          gateway_device_id?: string
          id?: string
          payload?: Json
          response?: Json | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_commands_gateway_device_id_fkey"
            columns: ["gateway_device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_commands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_device_config: {
        Row: {
          config: Json
          created_at: string
          gateway_device_id: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          gateway_device_id: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          gateway_device_id?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "gateway_device_config_gateway_device_id_fkey"
            columns: ["gateway_device_id"]
            isOneToOne: true
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_device_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_device_discoveries: {
        Row: {
          created_at: string
          discovered_payload: Json
          discovery_method: string
          expires_at: string
          gateway_device_id: string
          id: string
          is_provisioned: boolean
          tenant_id: string
        }
        Insert: {
          created_at?: string
          discovered_payload?: Json
          discovery_method: string
          expires_at?: string
          gateway_device_id: string
          id?: string
          is_provisioned?: boolean
          tenant_id: string
        }
        Update: {
          created_at?: string
          discovered_payload?: Json
          discovery_method?: string
          expires_at?: string
          gateway_device_id?: string
          id?: string
          is_provisioned?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_device_discoveries_gateway_device_id_fkey"
            columns: ["gateway_device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_device_entities: {
        Row: {
          actuator_uuid: string | null
          config_json: Json
          created_at: string
          created_by: string | null
          discovery_method: string | null
          entity_kind: string
          entity_label: string
          gateway_device_id: string
          ha_entity_id: string | null
          id: string
          integration_type: string
          last_error: string | null
          last_synced_at: string | null
          meter_id: string | null
          provision_status: string
          sensor_uuid: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          actuator_uuid?: string | null
          config_json?: Json
          created_at?: string
          created_by?: string | null
          discovery_method?: string | null
          entity_kind?: string
          entity_label: string
          gateway_device_id: string
          ha_entity_id?: string | null
          id?: string
          integration_type: string
          last_error?: string | null
          last_synced_at?: string | null
          meter_id?: string | null
          provision_status?: string
          sensor_uuid?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          actuator_uuid?: string | null
          config_json?: Json
          created_at?: string
          created_by?: string | null
          discovery_method?: string | null
          entity_kind?: string
          entity_label?: string
          gateway_device_id?: string
          ha_entity_id?: string | null
          id?: string
          integration_type?: string
          last_error?: string | null
          last_synced_at?: string | null
          meter_id?: string | null
          provision_status?: string
          sensor_uuid?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "gateway_device_entities_gateway_device_id_fkey"
            columns: ["gateway_device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_device_entities_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_device_inventory: {
        Row: {
          category: string
          created_at: string
          device_class: string | null
          domain: string
          entity_id: string
          friendly_name: string | null
          gateway_device_id: string
          id: string
          last_seen_at: string
          last_state_at: string | null
          location_integration_id: string | null
          state: string | null
          tenant_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          device_class?: string | null
          domain: string
          entity_id: string
          friendly_name?: string | null
          gateway_device_id: string
          id?: string
          last_seen_at?: string
          last_state_at?: string | null
          location_integration_id?: string | null
          state?: string | null
          tenant_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          device_class?: string | null
          domain?: string
          entity_id?: string
          friendly_name?: string | null
          gateway_device_id?: string
          id?: string
          last_seen_at?: string
          last_state_at?: string | null
          location_integration_id?: string | null
          state?: string | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_device_inventory_gateway_device_id_fkey"
            columns: ["gateway_device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_device_inventory_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_device_inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_devices: {
        Row: {
          addon_version: string | null
          auto_update_enabled: boolean
          config: Json
          created_at: string
          device_name: string
          device_type: string
          gateway_password_hash: string | null
          gateway_username: string | null
          ha_version: string | null
          id: string
          last_heartbeat_at: string | null
          last_update_attempt_at: string | null
          last_update_check_at: string | null
          last_update_error: string | null
          last_ws_ping_at: string | null
          latest_available_version: string | null
          local_ip: string | null
          local_time: string | null
          location_id: string | null
          location_integration_id: string | null
          mac_address: string | null
          offline_buffer_count: number
          status: string
          tenant_id: string | null
          update_channel: string
          updated_at: string
          ws_connected_since: string | null
        }
        Insert: {
          addon_version?: string | null
          auto_update_enabled?: boolean
          config?: Json
          created_at?: string
          device_name: string
          device_type?: string
          gateway_password_hash?: string | null
          gateway_username?: string | null
          ha_version?: string | null
          id?: string
          last_heartbeat_at?: string | null
          last_update_attempt_at?: string | null
          last_update_check_at?: string | null
          last_update_error?: string | null
          last_ws_ping_at?: string | null
          latest_available_version?: string | null
          local_ip?: string | null
          local_time?: string | null
          location_id?: string | null
          location_integration_id?: string | null
          mac_address?: string | null
          offline_buffer_count?: number
          status?: string
          tenant_id?: string | null
          update_channel?: string
          updated_at?: string
          ws_connected_since?: string | null
        }
        Update: {
          addon_version?: string | null
          auto_update_enabled?: boolean
          config?: Json
          created_at?: string
          device_name?: string
          device_type?: string
          gateway_password_hash?: string | null
          gateway_username?: string | null
          ha_version?: string | null
          id?: string
          last_heartbeat_at?: string | null
          last_update_attempt_at?: string | null
          last_update_check_at?: string | null
          last_update_error?: string | null
          last_ws_ping_at?: string | null
          latest_available_version?: string | null
          local_ip?: string | null
          local_time?: string | null
          location_id?: string | null
          location_integration_id?: string | null
          mac_address?: string | null
          offline_buffer_count?: number
          status?: string
          tenant_id?: string | null
          update_channel?: string
          updated_at?: string
          ws_connected_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gateway_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_devices_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_pairing_tokens: {
        Row: {
          bound_device_id: string | null
          bound_to_mac: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          label: string | null
          location_id: string | null
          tenant_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          bound_device_id?: string | null
          bound_to_mac?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          location_id?: string | null
          tenant_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          bound_device_id?: string | null
          bound_to_mac?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          location_id?: string | null
          tenant_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gateway_pairing_tokens_bound_device_id_fkey"
            columns: ["bound_device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_pairing_tokens_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_refresh_locks: {
        Row: {
          location_integration_id: string
          locked_at: string
          locked_by: string | null
        }
        Insert: {
          location_integration_id: string
          locked_at?: string
          locked_by?: string | null
        }
        Update: {
          location_integration_id?: string
          locked_at?: string
          locked_by?: string | null
        }
        Relationships: []
      }
      gateway_release_channels: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          image_ref: string
          is_latest: boolean
          release_notes: string | null
          released_at: string
          updated_at: string
          version: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_ref: string
          is_latest?: boolean
          release_notes?: string | null
          released_at?: string
          updated_at?: string
          version: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_ref?: string
          is_latest?: boolean
          release_notes?: string | null
          released_at?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      gateway_sensor_snapshots: {
        Row: {
          created_at: string
          error_message: string | null
          expires_at: string | null
          fetched_at: string
          location_id: string | null
          location_integration_id: string
          sensors: Json
          source: string | null
          status: string
          system_messages: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          fetched_at?: string
          location_id?: string | null
          location_integration_id: string
          sensors?: Json
          source?: string | null
          status?: string
          system_messages?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          expires_at?: string | null
          fetched_at?: string
          location_id?: string | null
          location_integration_id?: string
          sensors?: Json
          source?: string | null
          status?: string
          system_messages?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      gateway_update_jobs: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          dispatched_at: string | null
          error_message: string | null
          finished_at: string | null
          gateway_device_id: string
          id: string
          image_ref: string
          log_excerpt: string | null
          started_at: string | null
          status: string
          target_version: string
          tenant_id: string | null
          triggered_by: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          gateway_device_id: string
          id?: string
          image_ref: string
          log_excerpt?: string | null
          started_at?: string | null
          status?: string
          target_version: string
          tenant_id?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          gateway_device_id?: string
          id?: string
          image_ref?: string
          log_excerpt?: string | null
          started_at?: string | null
          status?: string
          target_version?: string
          tenant_id?: string | null
          triggered_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_update_jobs_gateway_device_id_fkey"
            columns: ["gateway_device_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_update_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_curtailment_events: {
        Row: {
          applied_at: string | null
          applied_result: Json | null
          connection_id: string
          created_at: string
          curtailment_percent: number
          id: string
          payload: Json
          received_at: string
          source: string
          tenant_id: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          applied_at?: string | null
          applied_result?: Json | null
          connection_id: string
          created_at?: string
          curtailment_percent: number
          id?: string
          payload?: Json
          received_at?: string
          source?: string
          tenant_id: string
          valid_from: string
          valid_until: string
        }
        Update: {
          applied_at?: string | null
          applied_result?: Json | null
          connection_id?: string
          created_at?: string
          curtailment_percent?: number
          id?: string
          payload?: Json
          received_at?: string
          source?: string
          tenant_id?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "grid_curtailment_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "grid_operator_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grid_curtailment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_operator_connections: {
        Row: {
          active: boolean
          connection_id: string | null
          created_at: string
          dso_name: string
          id: string
          location_id: string
          module: string
          notes: string | null
          tenant_id: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          active?: boolean
          connection_id?: string | null
          created_at?: string
          dso_name: string
          id?: string
          location_id: string
          module?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          active?: boolean
          connection_id?: string | null
          created_at?: string
          dso_name?: string
          id?: string
          location_id?: string
          module?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "grid_operator_connections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grid_operator_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      infrastructure_metrics: {
        Row: {
          id: string
          metadata: Json | null
          metric_name: string
          metric_type: string
          metric_value: number | null
          recorded_at: string | null
        }
        Insert: {
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_type: string
          metric_value?: number | null
          recorded_at?: string | null
        }
        Update: {
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_type?: string
          metric_value?: number | null
          recorded_at?: string | null
        }
        Relationships: []
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
      integration_errors: {
        Row: {
          created_at: string
          error_message: string
          error_type: string
          id: string
          integration_type: string
          is_ignored: boolean
          is_resolved: boolean
          location_id: string | null
          location_integration_id: string | null
          resolved_at: string | null
          sensor_name: string | null
          sensor_type: string | null
          severity: string
          task_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message: string
          error_type?: string
          id?: string
          integration_type: string
          is_ignored?: boolean
          is_resolved?: boolean
          location_id?: string | null
          location_integration_id?: string | null
          resolved_at?: string | null
          sensor_name?: string | null
          sensor_type?: string | null
          severity?: string
          task_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          integration_type?: string
          is_ignored?: boolean
          is_resolved?: boolean
          location_id?: string | null
          location_integration_id?: string | null
          resolved_at?: string | null
          sensor_name?: string | null
          sensor_type?: string | null
          severity?: string
          task_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_errors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_errors_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_errors_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_errors_tenant_id_fkey"
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
      legal_pages: {
        Row: {
          content_html: string
          id: string
          page_key: string
          tenant_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_html?: string
          id?: string
          page_key: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_html?: string
          id?: string
          page_key?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      location_automations: {
        Row: {
          action_type: string
          action_value: string | null
          actions: Json
          actuator_control_type: string
          actuator_name: string
          actuator_uuid: string
          category: string | null
          color: string | null
          conditions: Json
          created_at: string
          description: string | null
          estimated_savings_kwh: number | null
          id: string
          is_active: boolean
          last_executed_at: string | null
          location_id: string
          location_integration_id: string
          logic_operator: string
          name: string
          notify_email: string | null
          notify_on_error: boolean
          scene_id: string | null
          schedule: Json | null
          scope_floor_id: string | null
          scope_room_id: string | null
          scope_type: string
          tags: string[] | null
          target_location_ids: string[] | null
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
          category?: string | null
          color?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          estimated_savings_kwh?: number | null
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          location_id: string
          location_integration_id: string
          logic_operator?: string
          name: string
          notify_email?: string | null
          notify_on_error?: boolean
          scene_id?: string | null
          schedule?: Json | null
          scope_floor_id?: string | null
          scope_room_id?: string | null
          scope_type?: string
          tags?: string[] | null
          target_location_ids?: string[] | null
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
          category?: string | null
          color?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          estimated_savings_kwh?: number | null
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          location_id?: string
          location_integration_id?: string
          logic_operator?: string
          name?: string
          notify_email?: string | null
          notify_on_error?: boolean
          scene_id?: string | null
          schedule?: Json | null
          scope_floor_id?: string | null
          scope_room_id?: string | null
          scope_type?: string
          tags?: string[] | null
          target_location_ids?: string[] | null
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
          {
            foreignKeyName: "location_automations_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "automation_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_automations_scope_floor_id_fkey"
            columns: ["scope_floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_automations_scope_room_id_fkey"
            columns: ["scope_room_id"]
            isOneToOne: false
            referencedRelation: "floor_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      location_dlm_config: {
        Row: {
          control_interval_s: number
          created_at: string
          fallback_kw_per_cp: number
          grid_limit_kw: number
          id: string
          is_active: boolean
          location_id: string
          min_charge_kw: number
          priority_order: Json
          reference_meter_id: string | null
          safety_buffer_kw: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          control_interval_s?: number
          created_at?: string
          fallback_kw_per_cp?: number
          grid_limit_kw: number
          id?: string
          is_active?: boolean
          location_id: string
          min_charge_kw?: number
          priority_order?: Json
          reference_meter_id?: string | null
          safety_buffer_kw?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          control_interval_s?: number
          created_at?: string
          fallback_kw_per_cp?: number
          grid_limit_kw?: number
          id?: string
          is_active?: boolean
          location_id?: string
          min_charge_kw?: number
          priority_order?: Json
          reference_meter_id?: string | null
          safety_buffer_kw?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_dlm_config_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_dlm_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      location_energy_sources: {
        Row: {
          created_at: string
          custom_name: string
          energy_type: string
          id: string
          location_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name: string
          energy_type?: string
          id?: string
          location_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string
          energy_type?: string
          id?: string
          location_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_energy_sources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_energy_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          construction_year: number | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          energy_sources: string[] | null
          federal_state: string | null
          grid_limit_kw: number | null
          gross_floor_area: number | null
          heating_type: string | null
          id: string
          is_archived: boolean
          is_main_location: boolean
          latitude: number | null
          longitude: number | null
          name: string
          net_floor_area: number | null
          parent_id: string | null
          photo_url: string | null
          postal_code: string | null
          renovation_year: number | null
          show_on_map: boolean
          tenant_id: string
          timezone: string
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
          usage_type: Database["public"]["Enums"]["location_usage_type"] | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          construction_year?: number | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          energy_sources?: string[] | null
          federal_state?: string | null
          grid_limit_kw?: number | null
          gross_floor_area?: number | null
          heating_type?: string | null
          id?: string
          is_archived?: boolean
          is_main_location?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          net_floor_area?: number | null
          parent_id?: string | null
          photo_url?: string | null
          postal_code?: string | null
          renovation_year?: number | null
          show_on_map?: boolean
          tenant_id: string
          timezone?: string
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
          usage_type?: Database["public"]["Enums"]["location_usage_type"] | null
        }
        Update: {
          address?: string | null
          city?: string | null
          construction_year?: number | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          energy_sources?: string[] | null
          federal_state?: string | null
          grid_limit_kw?: number | null
          gross_floor_area?: number | null
          heating_type?: string | null
          id?: string
          is_archived?: boolean
          is_main_location?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          net_floor_area?: number | null
          parent_id?: string | null
          photo_url?: string | null
          postal_code?: string | null
          renovation_year?: number | null
          show_on_map?: boolean
          tenant_id?: string
          timezone?: string
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
      master_recovery_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          ip_address: string | null
          success: boolean
          target_email: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          success: boolean
          target_email: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          target_email?: string
        }
        Relationships: []
      }
      meter_period_totals: {
        Row: {
          created_at: string | null
          energy_type: string
          id: string
          meter_id: string | null
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
          meter_id?: string | null
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
          meter_id?: string | null
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
          meter_id: string | null
          power_value: number
          recorded_at: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          energy_type: string
          id?: string
          meter_id?: string | null
          power_value: number
          recorded_at?: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          energy_type?: string
          id?: string
          meter_id?: string | null
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
          meter_id: string | null
          power_avg: number
          power_max: number
          resolution_minutes: number
          sample_count: number
          source: string | null
          tenant_id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          energy_type: string
          id?: string
          meter_id?: string | null
          power_avg: number
          power_max: number
          resolution_minutes?: number
          sample_count?: number
          source?: string | null
          tenant_id: string
        }
        Update: {
          bucket?: string
          created_at?: string
          energy_type?: string
          id?: string
          meter_id?: string | null
          power_avg?: number
          power_max?: number
          resolution_minutes?: number
          sample_count?: number
          source?: string | null
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
          meter_id: string | null
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
          meter_id?: string | null
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
          meter_id?: string | null
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
          device_type: string
          discovery_confirmed: boolean
          discovery_payload: Json | null
          discovery_source: string | null
          energy_type: string
          floor_id: string | null
          gas_type: string | null
          id: string
          installation_date: string | null
          is_archived: boolean
          is_bidirectional: boolean
          is_main_meter: boolean
          location_id: string
          location_integration_id: string | null
          malo_id: string | null
          medium: string | null
          melo_id: string | null
          meter_function: string
          meter_number: string | null
          meter_offset_kwh: number
          meter_offset_note: string | null
          meter_offset_reason: string | null
          meter_offset_set_at: string | null
          meter_operator: string | null
          name: string
          notes: string | null
          obis_code: string | null
          parent_meter_id: string | null
          photo_url: string | null
          position_3d_x: number | null
          position_3d_y: number | null
          position_3d_z: number | null
          replaces_meter_id: string | null
          room_id: string | null
          sensor_uuid: string | null
          setup_validated_at: string | null
          setup_validated_by: string | null
          setup_validated_by_email: string | null
          smgw_id: string | null
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
          device_type?: string
          discovery_confirmed?: boolean
          discovery_payload?: Json | null
          discovery_source?: string | null
          energy_type?: string
          floor_id?: string | null
          gas_type?: string | null
          id?: string
          installation_date?: string | null
          is_archived?: boolean
          is_bidirectional?: boolean
          is_main_meter?: boolean
          location_id: string
          location_integration_id?: string | null
          malo_id?: string | null
          medium?: string | null
          melo_id?: string | null
          meter_function?: string
          meter_number?: string | null
          meter_offset_kwh?: number
          meter_offset_note?: string | null
          meter_offset_reason?: string | null
          meter_offset_set_at?: string | null
          meter_operator?: string | null
          name: string
          notes?: string | null
          obis_code?: string | null
          parent_meter_id?: string | null
          photo_url?: string | null
          position_3d_x?: number | null
          position_3d_y?: number | null
          position_3d_z?: number | null
          replaces_meter_id?: string | null
          room_id?: string | null
          sensor_uuid?: string | null
          setup_validated_at?: string | null
          setup_validated_by?: string | null
          setup_validated_by_email?: string | null
          smgw_id?: string | null
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
          device_type?: string
          discovery_confirmed?: boolean
          discovery_payload?: Json | null
          discovery_source?: string | null
          energy_type?: string
          floor_id?: string | null
          gas_type?: string | null
          id?: string
          installation_date?: string | null
          is_archived?: boolean
          is_bidirectional?: boolean
          is_main_meter?: boolean
          location_id?: string
          location_integration_id?: string | null
          malo_id?: string | null
          medium?: string | null
          melo_id?: string | null
          meter_function?: string
          meter_number?: string | null
          meter_offset_kwh?: number
          meter_offset_note?: string | null
          meter_offset_reason?: string | null
          meter_offset_set_at?: string | null
          meter_operator?: string | null
          name?: string
          notes?: string | null
          obis_code?: string | null
          parent_meter_id?: string | null
          photo_url?: string | null
          position_3d_x?: number | null
          position_3d_y?: number | null
          position_3d_z?: number | null
          replaces_meter_id?: string | null
          room_id?: string | null
          sensor_uuid?: string | null
          setup_validated_at?: string | null
          setup_validated_by?: string | null
          setup_validated_by_email?: string | null
          smgw_id?: string | null
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
            foreignKeyName: "meters_replaces_meter_id_fkey"
            columns: ["replaces_meter_id"]
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
      module_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          module_code: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          module_code: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          module_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "module_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      module_bundles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      module_prices: {
        Row: {
          created_at: string
          id: string
          industry_price_monthly: number
          industry_standard_price: number
          module_code: string
          partner_industry_price_monthly: number
          partner_price_monthly: number
          price_monthly: number
          standard_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry_price_monthly?: number
          industry_standard_price?: number
          module_code: string
          partner_industry_price_monthly?: number
          partner_price_monthly?: number
          price_monthly?: number
          standard_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          industry_price_monthly?: number
          industry_standard_price?: number
          module_code?: string
          partner_industry_price_monthly?: number
          partner_price_monthly?: number
          price_monthly?: number
          standard_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_alert_rules: {
        Row: {
          comparator: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          metric_category: string
          metric_name: string
          notify_email: string | null
          severity: string
          threshold: number
          updated_at: string
        }
        Insert: {
          comparator: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          metric_category: string
          metric_name: string
          notify_email?: string | null
          severity?: string
          threshold: number
          updated_at?: string
        }
        Update: {
          comparator?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          metric_category?: string
          metric_name?: string
          notify_email?: string | null
          severity?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      mqtt_actuators: {
        Row: {
          actuator_uuid: string
          command_topic: string
          created_at: string
          discovery_confirmed: boolean
          discovery_payload: Json | null
          discovery_source: string | null
          id: string
          location_integration_id: string
          name: string
          payload_off: string
          payload_on: string
          payload_template: string | null
          qos: number
          retain: boolean
          state_topic: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actuator_uuid: string
          command_topic: string
          created_at?: string
          discovery_confirmed?: boolean
          discovery_payload?: Json | null
          discovery_source?: string | null
          id?: string
          location_integration_id: string
          name: string
          payload_off?: string
          payload_on?: string
          payload_template?: string | null
          qos?: number
          retain?: boolean
          state_topic?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actuator_uuid?: string
          command_topic?: string
          created_at?: string
          discovery_confirmed?: boolean
          discovery_payload?: Json | null
          discovery_source?: string | null
          id?: string
          location_integration_id?: string
          name?: string
          payload_off?: string
          payload_on?: string
          payload_template?: string | null
          qos?: number
          retain?: boolean
          state_topic?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mqtt_actuators_location_integration_id_fkey"
            columns: ["location_integration_id"]
            isOneToOne: false
            referencedRelation: "location_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mqtt_actuators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mqtt_credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_rotated_at: string
          password_hash: string
          tenant_id: string
          topic_prefix: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_rotated_at?: string
          password_hash: string
          tenant_id: string
          topic_prefix: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_rotated_at?: string
          password_hash?: string
          tenant_id?: string
          topic_prefix?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "mqtt_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      node_metrics: {
        Row: {
          cpu_percent: number | null
          disk_percent: number | null
          id: string
          load_avg_1m: number | null
          mem_percent: number | null
          metadata: Json
          node_name: string
          recorded_at: string
          uptime_seconds: number | null
        }
        Insert: {
          cpu_percent?: number | null
          disk_percent?: number | null
          id?: string
          load_avg_1m?: number | null
          mem_percent?: number | null
          metadata?: Json
          node_name: string
          recorded_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          cpu_percent?: number | null
          disk_percent?: number | null
          id?: string
          load_avg_1m?: number | null
          mem_percent?: number | null
          metadata?: Json
          node_name?: string
          recorded_at?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      ocpp_integration_guides: {
        Row: {
          charger_model_id: string | null
          content_md: string
          created_at: string
          difficulty: string
          id: string
          model: string
          ocpp_version: string
          updated_at: string
          vendor: string
        }
        Insert: {
          charger_model_id?: string | null
          content_md?: string
          created_at?: string
          difficulty?: string
          id?: string
          model: string
          ocpp_version?: string
          updated_at?: string
          vendor: string
        }
        Update: {
          charger_model_id?: string | null
          content_md?: string
          created_at?: string
          difficulty?: string
          id?: string
          model?: string
          ocpp_version?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocpp_integration_guides_charger_model_id_fkey"
            columns: ["charger_model_id"]
            isOneToOne: false
            referencedRelation: "charger_models"
            referencedColumns: ["id"]
          },
        ]
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
      ocpp_meter_samples: {
        Row: {
          charge_point_id: string
          connector_id: number
          context: string | null
          created_at: string
          id: string
          measurand: string
          phase: string | null
          sampled_at: string
          tenant_id: string
          transaction_id: number | null
          unit: string | null
          value: number
        }
        Insert: {
          charge_point_id: string
          connector_id?: number
          context?: string | null
          created_at?: string
          id?: string
          measurand: string
          phase?: string | null
          sampled_at: string
          tenant_id: string
          transaction_id?: number | null
          unit?: string | null
          value: number
        }
        Update: {
          charge_point_id?: string
          connector_id?: number
          context?: string | null
          created_at?: string
          id?: string
          measurand?: string
          phase?: string | null
          sampled_at?: string
          tenant_id?: string
          transaction_id?: number | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "ocpp_meter_samples_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          can_create_tenant: boolean
          can_manage_sales_catalog: boolean
          can_use_sales_scout: boolean
          can_view_billing: boolean
          created_at: string
          id: string
          partner_id: string
          partner_role: Database["public"]["Enums"]["partner_member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create_tenant?: boolean
          can_manage_sales_catalog?: boolean
          can_use_sales_scout?: boolean
          can_view_billing?: boolean
          created_at?: string
          id?: string
          partner_id: string
          partner_role?: Database["public"]["Enums"]["partner_member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create_tenant?: boolean
          can_manage_sales_catalog?: boolean
          can_use_sales_scout?: boolean
          can_view_billing?: boolean
          created_at?: string
          id?: string
          partner_id?: string
          partner_role?: Database["public"]["Enums"]["partner_member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_module_prices: {
        Row: {
          created_at: string
          id: string
          module_code: string
          partner_id: string
          sale_price_industry_monthly: number | null
          sale_price_monthly: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_code: string
          partner_id: string
          sale_price_industry_monthly?: number | null
          sale_price_monthly?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          module_code?: string
          partner_id?: string
          sale_price_industry_monthly?: number | null
          sale_price_monthly?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_module_prices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          accent_color: string | null
          ai_analysis_mode: string
          billing_address: Json
          billing_mode: string
          brand_display_name: string | null
          commission_pct: number
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          custom_domain: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          notes: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          subdomain: string | null
          support_email: string | null
          updated_at: string
          white_label_enabled: boolean
        }
        Insert: {
          accent_color?: string | null
          ai_analysis_mode?: string
          billing_address?: Json
          billing_mode?: string
          brand_display_name?: string | null
          commission_pct?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          subdomain?: string | null
          support_email?: string | null
          updated_at?: string
          white_label_enabled?: boolean
        }
        Update: {
          accent_color?: string | null
          ai_analysis_mode?: string
          billing_address?: Json
          billing_mode?: string
          brand_display_name?: string | null
          commission_pct?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          custom_domain?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          subdomain?: string | null
          support_email?: string | null
          updated_at?: string
          white_label_enabled?: boolean
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
      platform_metrics: {
        Row: {
          created_at: string
          dimension: string | null
          id: string
          metric_key: string
          metric_value: number
          recorded_at: string
        }
        Insert: {
          created_at?: string
          dimension?: string | null
          id?: string
          metric_key: string
          metric_value: number
          recorded_at?: string
        }
        Update: {
          created_at?: string
          dimension?: string | null
          id?: string
          metric_key?: string
          metric_value?: number
          recorded_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
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
      ppa_consumption_meters: {
        Row: {
          contract_id: string
          created_at: string
          meter_id: string
          role: string
          tenant_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          meter_id: string
          role?: string
          tenant_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          meter_id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_consumption_meters_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppa_consumption_meters_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_contracts: {
        Row: {
          auto_renewal: boolean
          contract_end: string
          contract_start: string
          contracted_volume_kwh_pa: number | null
          created_at: string
          created_by: string | null
          energy_source: string
          goo_registry: string | null
          goo_required: boolean
          id: string
          mieterstrom_settings_id: string | null
          notes: string | null
          notice_period_days: number
          offtaker_market_id: string | null
          offtaker_name: string
          plant_capacity_kw: number | null
          plant_description: string | null
          plant_id: string | null
          ppa_type: string
          price_eur_per_kwh: number | null
          price_formula: Json | null
          price_model: string
          producer_market_id: string | null
          producer_name: string
          reference_number: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_renewal?: boolean
          contract_end: string
          contract_start: string
          contracted_volume_kwh_pa?: number | null
          created_at?: string
          created_by?: string | null
          energy_source?: string
          goo_registry?: string | null
          goo_required?: boolean
          id?: string
          mieterstrom_settings_id?: string | null
          notes?: string | null
          notice_period_days?: number
          offtaker_market_id?: string | null
          offtaker_name: string
          plant_capacity_kw?: number | null
          plant_description?: string | null
          plant_id?: string | null
          ppa_type: string
          price_eur_per_kwh?: number | null
          price_formula?: Json | null
          price_model: string
          producer_market_id?: string | null
          producer_name: string
          reference_number?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_renewal?: boolean
          contract_end?: string
          contract_start?: string
          contracted_volume_kwh_pa?: number | null
          created_at?: string
          created_by?: string | null
          energy_source?: string
          goo_registry?: string | null
          goo_required?: boolean
          id?: string
          mieterstrom_settings_id?: string | null
          notes?: string | null
          notice_period_days?: number
          offtaker_market_id?: string | null
          offtaker_name?: string
          plant_capacity_kw?: number | null
          plant_description?: string | null
          plant_id?: string | null
          ppa_type?: string
          price_eur_per_kwh?: number | null
          price_formula?: Json | null
          price_model?: string
          producer_market_id?: string | null
          producer_name?: string
          reference_number?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_contracts_mieterstrom_settings_id_fkey"
            columns: ["mieterstrom_settings_id"]
            isOneToOne: false
            referencedRelation: "tenant_electricity_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppa_contracts_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppa_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_documents: {
        Row: {
          contract_id: string
          created_at: string
          doc_type: string
          file_hash: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          mime_type: string | null
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          doc_type: string
          file_hash?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          doc_type?: string
          file_hash?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ppa_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_goo_certificates: {
        Row: {
          certificate_number: string
          contract_id: string
          counterparty: string | null
          created_at: string
          energy_source: string
          generation_period_end: string
          generation_period_start: string
          id: string
          issued_at: string | null
          notes: string | null
          redeemed_at: string | null
          registry: string
          status: string
          tenant_id: string
          transferred_at: string | null
          updated_at: string
          volume_kwh: number
        }
        Insert: {
          certificate_number: string
          contract_id: string
          counterparty?: string | null
          created_at?: string
          energy_source?: string
          generation_period_end: string
          generation_period_start: string
          id?: string
          issued_at?: string | null
          notes?: string | null
          redeemed_at?: string | null
          registry?: string
          status?: string
          tenant_id: string
          transferred_at?: string | null
          updated_at?: string
          volume_kwh: number
        }
        Update: {
          certificate_number?: string
          contract_id?: string
          counterparty?: string | null
          created_at?: string
          energy_source?: string
          generation_period_end?: string
          generation_period_start?: string
          id?: string
          issued_at?: string | null
          notes?: string | null
          redeemed_at?: string | null
          registry?: string
          status?: string
          tenant_id?: string
          transferred_at?: string | null
          updated_at?: string
          volume_kwh?: number
        }
        Relationships: [
          {
            foreignKeyName: "ppa_goo_certificates_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_offsite_config: {
        Row: {
          balancing_group_id: string | null
          balancing_responsible_party: string | null
          contract_id: string
          created_at: string
          delivery_type: string
          id: string
          imbalance_responsibility: string
          intermediary_market_id: string | null
          intermediary_name: string | null
          mscons_receiver_id: string | null
          mscons_sender_id: string | null
          plant_grid_level: string | null
          plant_location: string | null
          plant_tso_area: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balancing_group_id?: string | null
          balancing_responsible_party?: string | null
          contract_id: string
          created_at?: string
          delivery_type: string
          id?: string
          imbalance_responsibility?: string
          intermediary_market_id?: string | null
          intermediary_name?: string | null
          mscons_receiver_id?: string | null
          mscons_sender_id?: string | null
          plant_grid_level?: string | null
          plant_location?: string | null
          plant_tso_area?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balancing_group_id?: string | null
          balancing_responsible_party?: string | null
          contract_id?: string
          created_at?: string
          delivery_type?: string
          id?: string
          imbalance_responsibility?: string
          intermediary_market_id?: string | null
          intermediary_name?: string | null
          mscons_receiver_id?: string | null
          mscons_sender_id?: string | null
          plant_grid_level?: string | null
          plant_location?: string | null
          plant_tso_area?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_offsite_config_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_onsite_config: {
        Row: {
          building_id: string | null
          contract_id: string
          created_at: string
          generation_meter_id: string | null
          id: string
          self_consumption_target_pct: number | null
          supply_model: string
          surplus_community_id: string | null
          surplus_handling: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          contract_id: string
          created_at?: string
          generation_meter_id?: string | null
          id?: string
          self_consumption_target_pct?: number | null
          supply_model: string
          surplus_community_id?: string | null
          surplus_handling?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          contract_id?: string
          created_at?: string
          generation_meter_id?: string | null
          id?: string
          self_consumption_target_pct?: number | null
          supply_model?: string
          surplus_community_id?: string | null
          surplus_handling?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_onsite_config_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppa_onsite_config_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppa_onsite_config_generation_meter_id_fkey"
            columns: ["generation_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppa_onsite_config_surplus_community_id_fkey"
            columns: ["surplus_community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_settlement_periods: {
        Row: {
          actual_consumed_kwh: number | null
          actual_produced_kwh: number | null
          applicable_price_eur_per_kwh: number | null
          contract_id: string
          contracted_kwh: number | null
          created_at: string
          data_source: string
          deviation_kwh: number | null
          id: string
          notes: string | null
          period_end: string
          period_start: string
          settlement_amount_eur: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          actual_consumed_kwh?: number | null
          actual_produced_kwh?: number | null
          applicable_price_eur_per_kwh?: number | null
          contract_id: string
          contracted_kwh?: number | null
          created_at?: string
          data_source?: string
          deviation_kwh?: number | null
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          settlement_amount_eur?: number | null
          status?: string
          tenant_id: string
        }
        Update: {
          actual_consumed_kwh?: number | null
          actual_produced_kwh?: number | null
          applicable_price_eur_per_kwh?: number | null
          contract_id?: string
          contracted_kwh?: number | null
          created_at?: string
          data_source?: string
          deviation_kwh?: number | null
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          settlement_amount_eur?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_settlement_periods_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_settlements: {
        Row: {
          applied_avg_price_eur_kwh: number | null
          avg_spot_price_eur_kwh: number | null
          breakdown: Json | null
          computed_at: string
          consumed_kwh: number
          contract_id: string
          created_at: string
          currency: string
          delivered_kwh: number
          error: string | null
          id: string
          period_end: string
          period_start: string
          status: string
          tenant_id: string
          total_amount_eur: number
          updated_at: string
        }
        Insert: {
          applied_avg_price_eur_kwh?: number | null
          avg_spot_price_eur_kwh?: number | null
          breakdown?: Json | null
          computed_at?: string
          consumed_kwh?: number
          contract_id: string
          created_at?: string
          currency?: string
          delivered_kwh?: number
          error?: string | null
          id?: string
          period_end: string
          period_start: string
          status?: string
          tenant_id: string
          total_amount_eur?: number
          updated_at?: string
        }
        Update: {
          applied_avg_price_eur_kwh?: number | null
          avg_spot_price_eur_kwh?: number | null
          breakdown?: Json | null
          computed_at?: string
          consumed_kwh?: number
          contract_id?: string
          created_at?: string
          currency?: string
          delivered_kwh?: number
          error?: string | null
          id?: string
          period_end?: string
          period_start?: string
          status?: string
          tenant_id?: string
          total_amount_eur?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_settlements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ppa_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      ppa_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          contract_id: string
          id: string
          new_status: string
          old_status: string | null
          reason: string | null
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          contract_id: string
          id?: string
          new_status: string
          old_status?: string | null
          reason?: string | null
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          contract_id?: string
          id?: string
          new_status?: string
          old_status?: string | null
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppa_status_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ppa_contracts"
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
      public_charge_status_links: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          tenant_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          tenant_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          tenant_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      pv_actual_hourly: {
        Row: {
          actual_kwh: number
          coverage_minutes: number
          created_at: string
          hour_start: string
          id: string
          location_id: string
          meter_id: string | null
          sample_count: number
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_kwh?: number
          coverage_minutes?: number
          created_at?: string
          hour_start: string
          id?: string
          location_id: string
          meter_id?: string | null
          sample_count?: number
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actual_kwh?: number
          coverage_minutes?: number
          created_at?: string
          hour_start?: string
          id?: string
          location_id?: string
          meter_id?: string | null
          sample_count?: number
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pv_actual_hourly_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_actual_hourly_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_actual_hourly_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pv_forecast_hourly: {
        Row: {
          ai_adjusted_kwh: number | null
          cell_temp_c: number | null
          cloud_cover_pct: number
          corrected_ai_adjusted_kwh: number | null
          corrected_estimated_kwh: number | null
          created_at: string
          dhi_w_m2: number | null
          dni_w_m2: number | null
          estimated_kwh: number
          forecast_date: string
          hour_timestamp: string
          id: string
          legacy_ai_adjusted_kwh: number | null
          legacy_estimated_kwh: number | null
          legacy_poa_w_m2: number | null
          location_id: string
          peak_power_kwp: number
          poa_w_m2: number | null
          radiation_w_m2: number
          temperature_2m: number | null
          tenant_id: string
        }
        Insert: {
          ai_adjusted_kwh?: number | null
          cell_temp_c?: number | null
          cloud_cover_pct?: number
          corrected_ai_adjusted_kwh?: number | null
          corrected_estimated_kwh?: number | null
          created_at?: string
          dhi_w_m2?: number | null
          dni_w_m2?: number | null
          estimated_kwh?: number
          forecast_date: string
          hour_timestamp: string
          id?: string
          legacy_ai_adjusted_kwh?: number | null
          legacy_estimated_kwh?: number | null
          legacy_poa_w_m2?: number | null
          location_id: string
          peak_power_kwp?: number
          poa_w_m2?: number | null
          radiation_w_m2?: number
          temperature_2m?: number | null
          tenant_id: string
        }
        Update: {
          ai_adjusted_kwh?: number | null
          cell_temp_c?: number | null
          cloud_cover_pct?: number
          corrected_ai_adjusted_kwh?: number | null
          corrected_estimated_kwh?: number | null
          created_at?: string
          dhi_w_m2?: number | null
          dni_w_m2?: number | null
          estimated_kwh?: number
          forecast_date?: string
          hour_timestamp?: string
          id?: string
          legacy_ai_adjusted_kwh?: number | null
          legacy_estimated_kwh?: number | null
          legacy_poa_w_m2?: number | null
          location_id?: string
          peak_power_kwp?: number
          poa_w_m2?: number | null
          radiation_w_m2?: number
          temperature_2m?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pv_forecast_hourly_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_forecast_hourly_tenant_id_fkey"
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
          name: string
          peak_power_kwp: number
          performance_ratio: number
          pv_meter_id: string | null
          recalibration_baseline_started_at: string | null
          recalibration_locked: boolean
          recalibration_locked_until: string | null
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
          name?: string
          peak_power_kwp?: number
          performance_ratio?: number
          pv_meter_id?: string | null
          recalibration_baseline_started_at?: string | null
          recalibration_locked?: boolean
          recalibration_locked_until?: string | null
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
          name?: string
          peak_power_kwp?: number
          performance_ratio?: number
          pv_meter_id?: string | null
          recalibration_baseline_started_at?: string | null
          recalibration_locked?: boolean
          recalibration_locked_until?: string | null
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
      roaming_partners: {
        Row: {
          country_code: string | null
          created_at: string
          endpoint_url: string | null
          id: string
          last_sync_at: string | null
          name: string
          notes: string | null
          party_id: string | null
          protocol: string
          role: string
          status: string
          tenant_id: string
          token: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_sync_at?: string | null
          name: string
          notes?: string | null
          party_id?: string | null
          protocol?: string
          role?: string
          status?: string
          tenant_id: string
          token?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_sync_at?: string | null
          name?: string
          notes?: string | null
          party_id?: string | null
          protocol?: string
          role?: string
          status?: string
          tenant_id?: string
          token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roaming_partners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roaming_sessions: {
        Row: {
          charge_point_id: string | null
          cost_amount: number | null
          created_at: string
          currency: string | null
          direction: string
          ended_at: string | null
          energy_kwh: number | null
          external_session_id: string | null
          external_user_ref: string | null
          id: string
          partner_id: string | null
          started_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          charge_point_id?: string | null
          cost_amount?: number | null
          created_at?: string
          currency?: string | null
          direction: string
          ended_at?: string | null
          energy_kwh?: number | null
          external_session_id?: string | null
          external_user_ref?: string | null
          id?: string
          partner_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string | null
          cost_amount?: number | null
          created_at?: string
          currency?: string | null
          direction?: string
          ended_at?: string | null
          energy_kwh?: number | null
          external_session_id?: string | null
          external_user_ref?: string | null
          id?: string
          partner_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roaming_sessions_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roaming_sessions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "roaming_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roaming_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roaming_settings: {
        Row: {
          country_code: string | null
          created_at: string
          default_guest_tariff_id: string | null
          enabled: boolean
          id: string
          notes: string | null
          our_token: string | null
          party_id: string | null
          protocol: string
          role: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          default_guest_tariff_id?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          our_token?: string | null
          party_id?: string | null
          protocol?: string
          role?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          default_guest_tariff_id?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          our_token?: string | null
          party_id?: string | null
          protocol?: string
          role?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roaming_settings_default_guest_tariff_id_fkey"
            columns: ["default_guest_tariff_id"]
            isOneToOne: false
            referencedRelation: "charging_tariffs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roaming_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
      sales_distributions: {
        Row: {
          created_at: string
          foto_url: string | null
          id: string
          ki_analyse: Json | null
          name: string
          notizen: string | null
          parent_id: string | null
          project_id: string
          standort: string | null
          typ: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          foto_url?: string | null
          id?: string
          ki_analyse?: Json | null
          name: string
          notizen?: string | null
          parent_id?: string | null
          project_id: string
          standort?: string | null
          typ?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          foto_url?: string | null
          id?: string
          ki_analyse?: Json | null
          name?: string
          notizen?: string | null
          parent_id?: string | null
          project_id?: string
          standort?: string | null
          typ?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_distributions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "sales_distributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_distributions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "sales_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_measurement_points: {
        Row: {
          anwendungsfall: string | null
          bestand: boolean
          bestand_geraet: string | null
          bezeichnung: string
          created_at: string
          distribution_id: string
          energieart: string
          foto_url: string | null
          hinweise: string | null
          id: string
          montage: string | null
          phasen: number
          spannung_v: number | null
          strombereich_a: number | null
          updated_at: string
        }
        Insert: {
          anwendungsfall?: string | null
          bestand?: boolean
          bestand_geraet?: string | null
          bezeichnung: string
          created_at?: string
          distribution_id: string
          energieart?: string
          foto_url?: string | null
          hinweise?: string | null
          id?: string
          montage?: string | null
          phasen?: number
          spannung_v?: number | null
          strombereich_a?: number | null
          updated_at?: string
        }
        Update: {
          anwendungsfall?: string | null
          bestand?: boolean
          bestand_geraet?: string | null
          bezeichnung?: string
          created_at?: string
          distribution_id?: string
          energieart?: string
          foto_url?: string | null
          hinweise?: string | null
          id?: string
          montage?: string | null
          phasen?: number
          spannung_v?: number | null
          strombereich_a?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_measurement_points_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "sales_distributions"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_project_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          kategorie: string
          notiz: string | null
          partner_id: string
          project_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          kategorie?: string
          notiz?: string | null
          partner_id: string
          project_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          kategorie?: string
          notiz?: string | null
          partner_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_project_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "sales_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_projects: {
        Row: {
          accepted_at: string | null
          adresse: string | null
          converted_tenant_id: string | null
          created_at: string
          id: string
          kontakt_email: string | null
          kontakt_name: string | null
          kontakt_telefon: string | null
          kunde_name: string
          kunde_typ: string
          notizen: string | null
          partner_id: string
          partner_org_id: string | null
          public_token: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          adresse?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_telefon?: string | null
          kunde_name: string
          kunde_typ?: string
          notizen?: string | null
          partner_id: string
          partner_org_id?: string | null
          public_token?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          adresse?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          id?: string
          kontakt_email?: string | null
          kontakt_name?: string | null
          kontakt_telefon?: string | null
          kunde_name?: string
          kunde_typ?: string
          notizen?: string | null
          partner_id?: string
          partner_org_id?: string | null
          public_token?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_projects_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_projects_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          quote_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          quote_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          quote_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_events_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_modules: {
        Row: {
          created_at: string
          id: string
          module_code: string
          preis_monatlich: number
          quote_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_code: string
          preis_monatlich?: number
          quote_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_code?: string
          preis_monatlich?: number
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_modules_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          created_at: string
          geraete_summe: number
          id: string
          installation_summe: number
          modul_summe_monatlich: number
          pdf_storage_path: string | null
          project_id: string
          public_token: string | null
          rejected_at: string | null
          rejection_reason: string | null
          signature_data: Json | null
          signed_at: string | null
          signer_email: string | null
          signer_ip: string | null
          signer_name: string | null
          signer_user_agent: string | null
          status: string
          total_einmalig: number
          updated_at: string
          version: number
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          geraete_summe?: number
          id?: string
          installation_summe?: number
          modul_summe_monatlich?: number
          pdf_storage_path?: string | null
          project_id: string
          public_token?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          signature_data?: Json | null
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          total_einmalig?: number
          updated_at?: string
          version?: number
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          geraete_summe?: number
          id?: string
          installation_summe?: number
          modul_summe_monatlich?: number
          pdf_storage_path?: string | null
          project_id?: string
          public_token?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          signature_data?: Json | null
          signed_at?: string | null
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          total_einmalig?: number
          updated_at?: string
          version?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "sales_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_recommended_devices: {
        Row: {
          begruendung: string | null
          created_at: string
          device_catalog_id: string
          distribution_id: string | null
          geraete_klasse: string | null
          id: string
          ist_alternativ: boolean
          measurement_point_id: string | null
          menge: number
          parent_recommendation_id: string | null
          partner_override: boolean
          scope: string
          source: string
          updated_at: string
        }
        Insert: {
          begruendung?: string | null
          created_at?: string
          device_catalog_id: string
          distribution_id?: string | null
          geraete_klasse?: string | null
          id?: string
          ist_alternativ?: boolean
          measurement_point_id?: string | null
          menge?: number
          parent_recommendation_id?: string | null
          partner_override?: boolean
          scope?: string
          source?: string
          updated_at?: string
        }
        Update: {
          begruendung?: string | null
          created_at?: string
          device_catalog_id?: string
          distribution_id?: string | null
          geraete_klasse?: string | null
          id?: string
          ist_alternativ?: boolean
          measurement_point_id?: string | null
          menge?: number
          parent_recommendation_id?: string | null
          partner_override?: boolean
          scope?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_recommended_devices_device_catalog_id_fkey"
            columns: ["device_catalog_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_recommended_devices_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "sales_distributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_recommended_devices_measurement_point_id_fkey"
            columns: ["measurement_point_id"]
            isOneToOne: false
            referencedRelation: "sales_measurement_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_recommended_devices_parent_recommendation_id_fkey"
            columns: ["parent_recommendation_id"]
            isOneToOne: false
            referencedRelation: "sales_recommended_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      simulator_instances: {
        Row: {
          charge_point_id: string | null
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          id_tag: string | null
          last_error: string | null
          model: string
          ocpp_id: string
          power_kw: number
          protocol: string
          server_host: string
          started_at: string
          status: string
          stopped_at: string | null
          tenant_id: string
          updated_at: string
          vendor: string
        }
        Insert: {
          charge_point_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          id_tag?: string | null
          last_error?: string | null
          model?: string
          ocpp_id: string
          power_kw?: number
          protocol?: string
          server_host?: string
          started_at?: string
          status?: string
          stopped_at?: string | null
          tenant_id: string
          updated_at?: string
          vendor?: string
        }
        Update: {
          charge_point_id?: string | null
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          id_tag?: string | null
          last_error?: string | null
          model?: string
          ocpp_id?: string
          power_kw?: number
          protocol?: string
          server_host?: string
          started_at?: string
          status?: string
          stopped_at?: string | null
          tenant_id?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulator_instances_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulator_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_meter_consents: {
        Row: {
          consent_scope: string
          consent_text_version: string | null
          created_at: string
          granted_at: string
          granted_by: string | null
          granted_by_email: string | null
          id: string
          location_id: string | null
          meta: Json
          meter_id: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consent_scope: string
          consent_text_version?: string | null
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          granted_by_email?: string | null
          id?: string
          location_id?: string | null
          meta?: Json
          meter_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consent_scope?: string
          consent_text_version?: string | null
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          granted_by_email?: string | null
          id?: string
          location_id?: string | null
          meta?: Json
          meter_id?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_meter_consents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_meter_consents_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_meter_consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_meter_mscons_imports: {
        Row: {
          community_id: string | null
          created_at: string
          error_message: string | null
          error_segments: Json
          file_hash: string
          file_name: string
          file_size_bytes: number | null
          id: string
          imported_at: string | null
          location_id: string | null
          meta: Json
          parsed_intervals: number
          parser_version: string | null
          rows_imported: number
          rows_skipped: number
          status: string
          tenant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          community_id?: string | null
          created_at?: string
          error_message?: string | null
          error_segments?: Json
          file_hash: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          imported_at?: string | null
          location_id?: string | null
          meta?: Json
          parsed_intervals?: number
          parser_version?: string | null
          rows_imported?: number
          rows_skipped?: number
          status?: string
          tenant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          community_id?: string | null
          created_at?: string
          error_message?: string | null
          error_segments?: Json
          file_hash?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          imported_at?: string | null
          location_id?: string | null
          meta?: Json
          parsed_intervals?: number
          parser_version?: string | null
          rows_imported?: number
          rows_skipped?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_meter_mscons_imports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "energy_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_meter_mscons_imports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_meter_mscons_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_charging_config: {
        Row: {
          charge_point_id: string | null
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean
          min_charge_power_w: number
          priority_mode: string
          reference_meter_id: string | null
          safety_buffer_w: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          charge_point_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          min_charge_power_w?: number
          priority_mode?: string
          reference_meter_id?: string | null
          safety_buffer_w?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          charge_point_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          min_charge_power_w?: number
          priority_mode?: string
          reference_meter_id?: string | null
          safety_buffer_w?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_charging_config_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_charging_config_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "charge_point_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_charging_config_reference_meter_id_fkey"
            columns: ["reference_meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_charging_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      solar_charging_log: {
        Row: {
          actions_taken: Json | null
          active_connectors: number | null
          allocated_w: number | null
          error_message: string | null
          executed_at: string
          group_id: string | null
          id: string
          status: string
          surplus_w: number | null
          tenant_id: string
        }
        Insert: {
          actions_taken?: Json | null
          active_connectors?: number | null
          allocated_w?: number | null
          error_message?: string | null
          executed_at?: string
          group_id?: string | null
          id?: string
          status?: string
          surplus_w?: number | null
          tenant_id: string
        }
        Update: {
          actions_taken?: Json | null
          active_connectors?: number | null
          allocated_w?: number | null
          error_message?: string | null
          executed_at?: string
          group_id?: string | null
          id?: string
          status?: string
          surplus_w?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solar_charging_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "charge_point_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solar_charging_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      steuve_devices: {
        Row: {
          active: boolean
          connection_id: string
          created_at: string
          device_ref_id: string
          device_type: string
          id: string
          min_power_kw: number
          priority: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          connection_id: string
          created_at?: string
          device_ref_id: string
          device_type?: string
          id?: string
          min_power_kw?: number
          priority?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          connection_id?: string
          created_at?: string
          device_ref_id?: string
          device_type?: string
          id?: string
          min_power_kw?: number
          priority?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "steuve_devices_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "grid_operator_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steuve_devices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          expires_at: string
          id: string
          impersonated_user_id: string | null
          is_manual: boolean
          notes: string | null
          reason: string | null
          started_at: string
          super_admin_user_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          impersonated_user_id?: string | null
          is_manual?: boolean
          notes?: string | null
          reason?: string | null
          started_at?: string
          super_admin_user_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          impersonated_user_id?: string | null
          is_manual?: boolean
          notes?: string | null
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
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          task_id: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          task_id: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          task_id?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_tenant_id_fkey"
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
      tenant_bundles: {
        Row: {
          assigned_at: string
          bundle_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          assigned_at?: string
          bundle_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          assigned_at?: string
          bundle_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_bundles_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "module_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_bundles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          is_mieterstrom: boolean
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
          is_mieterstrom?: boolean
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
          is_mieterstrom?: boolean
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
          lexware_invoice_id: string | null
          line_items: Json | null
          module_total: number
          pdf_url: string | null
          period_end: string
          period_start: string
          status: string
          support_total: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_number: string
          lexware_invoice_id?: string | null
          line_items?: Json | null
          module_total?: number
          pdf_url?: string | null
          period_end: string
          period_start: string
          status?: string
          support_total?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_number?: string
          lexware_invoice_id?: string | null
          line_items?: Json | null
          module_total?: number
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: string
          support_total?: number
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
      tenant_support_users: {
        Row: {
          auth_user_id: string
          created_at: string
          support_email: string
          tenant_id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          support_email: string
          tenant_id: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          support_email?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_support_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          branding: Json
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          deleted_at: string | null
          house_number: string | null
          id: string
          is_aicono_member: boolean
          is_kommune: boolean
          lexware_contact_id: string | null
          logo_url: string | null
          name: string
          onboarding_completed: boolean
          partner_id: string | null
          payment_method: string
          postal_code: string | null
          remote_support_enabled: boolean
          remote_support_enabled_at: string | null
          report_settings: Json | null
          sepa_account_holder: string | null
          sepa_bic: string | null
          sepa_iban: string | null
          sepa_mandate_date: string | null
          sepa_mandate_ref: string | null
          show_manual_meters: boolean
          slug: string
          status: string
          street: string | null
          support_owner: string
          support_price_per_15min: number
          suspended_at: string | null
          suspended_reason: string | null
          tenant_type: string
          updated_at: string
          week_start_day: number
        }
        Insert: {
          address?: string | null
          branding?: Json
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          house_number?: string | null
          id?: string
          is_aicono_member?: boolean
          is_kommune?: boolean
          lexware_contact_id?: string | null
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean
          partner_id?: string | null
          payment_method?: string
          postal_code?: string | null
          remote_support_enabled?: boolean
          remote_support_enabled_at?: string | null
          report_settings?: Json | null
          sepa_account_holder?: string | null
          sepa_bic?: string | null
          sepa_iban?: string | null
          sepa_mandate_date?: string | null
          sepa_mandate_ref?: string | null
          show_manual_meters?: boolean
          slug: string
          status?: string
          street?: string | null
          support_owner?: string
          support_price_per_15min?: number
          suspended_at?: string | null
          suspended_reason?: string | null
          tenant_type?: string
          updated_at?: string
          week_start_day?: number
        }
        Update: {
          address?: string | null
          branding?: Json
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          house_number?: string | null
          id?: string
          is_aicono_member?: boolean
          is_kommune?: boolean
          lexware_contact_id?: string | null
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean
          partner_id?: string | null
          payment_method?: string
          postal_code?: string | null
          remote_support_enabled?: boolean
          remote_support_enabled_at?: string | null
          report_settings?: Json | null
          sepa_account_holder?: string | null
          sepa_bic?: string | null
          sepa_iban?: string | null
          sepa_mandate_date?: string | null
          sepa_mandate_ref?: string | null
          show_manual_meters?: boolean
          slug?: string
          status?: string
          street?: string | null
          support_owner?: string
          support_price_per_15min?: number
          suspended_at?: string | null
          suspended_reason?: string | null
          tenant_type?: string
          updated_at?: string
          week_start_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenants_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
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
      user_role_audit_log: {
        Row: {
          id: string
          new_role: Database["public"]["Enums"]["app_role"] | null
          old_role: Database["public"]["Enums"]["app_role"] | null
          operation: string
          performed_at: string
          performed_by: string | null
          performed_by_email: string | null
          target_user_id: string
        }
        Insert: {
          id?: string
          new_role?: Database["public"]["Enums"]["app_role"] | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          operation: string
          performed_at?: string
          performed_by?: string | null
          performed_by_email?: string | null
          target_user_id: string
        }
        Update: {
          id?: string
          new_role?: Database["public"]["Enums"]["app_role"] | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          operation?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_email?: string | null
          target_user_id?: string
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
          source_all_charge_points: boolean
          source_charge_point_group_id: string | null
          source_charge_point_id: string | null
          source_meter_id: string | null
          virtual_meter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          operator?: string
          sort_order?: number
          source_all_charge_points?: boolean
          source_charge_point_group_id?: string | null
          source_charge_point_id?: string | null
          source_meter_id?: string | null
          virtual_meter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          operator?: string
          sort_order?: number
          source_all_charge_points?: boolean
          source_charge_point_group_id?: string | null
          source_charge_point_id?: string | null
          source_meter_id?: string | null
          virtual_meter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_meter_sources_source_charge_point_group_id_fkey"
            columns: ["source_charge_point_group_id"]
            isOneToOne: false
            referencedRelation: "charge_point_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_meter_sources_source_charge_point_id_fkey"
            columns: ["source_charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
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
      wallbox_modbus_instances: {
        Row: {
          charge_point_id: string | null
          created_at: string
          created_by: string | null
          gateway_id: string | null
          id: string
          label: string | null
          last_error: string | null
          last_seen_at: string | null
          location_id: string | null
          modbus_host: string
          modbus_port: number
          provision_status: string
          template_id: string
          tenant_id: string
          unit_id: number
          updated_at: string
          version: number
        }
        Insert: {
          charge_point_id?: string | null
          created_at?: string
          created_by?: string | null
          gateway_id?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          location_id?: string | null
          modbus_host: string
          modbus_port?: number
          provision_status?: string
          template_id: string
          tenant_id: string
          unit_id?: number
          updated_at?: string
          version?: number
        }
        Update: {
          charge_point_id?: string | null
          created_at?: string
          created_by?: string | null
          gateway_id?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_seen_at?: string | null
          location_id?: string | null
          modbus_host?: string
          modbus_port?: number
          provision_status?: string
          template_id?: string
          tenant_id?: string
          unit_id?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "wallbox_modbus_instances_charge_point_id_fkey"
            columns: ["charge_point_id"]
            isOneToOne: false
            referencedRelation: "charge_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallbox_modbus_instances_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallbox_modbus_instances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallbox_modbus_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "wallbox_modbus_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      wallbox_modbus_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_port: number
          default_unit_id: number
          firmware_max: string | null
          firmware_min: string | null
          id: string
          is_active: boolean
          model: string
          notes: string | null
          poll_intervals: Json
          read_map: Json
          status_map: Json
          updated_at: string
          vendor: string
          version: number
          write_map: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_port?: number
          default_unit_id?: number
          firmware_max?: string | null
          firmware_min?: string | null
          id?: string
          is_active?: boolean
          model: string
          notes?: string | null
          poll_intervals?: Json
          read_map?: Json
          status_map?: Json
          updated_at?: string
          vendor: string
          version?: number
          write_map?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_port?: number
          default_unit_id?: number
          firmware_max?: string | null
          firmware_min?: string | null
          id?: string
          is_active?: boolean
          model?: string
          notes?: string | null
          poll_intervals?: Json
          read_map?: Json
          status_map?: Json
          updated_at?: string
          vendor?: string
          version?: number
          write_map?: Json
        }
        Relationships: []
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
      aggregate_pv_actual_hourly: {
        Args: { p_from?: string; p_to?: string }
        Returns: number
      }
      bootstrap_cron_settings: {
        Args: { p_key: string; p_url: string }
        Returns: undefined
      }
      bootstrap_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      can_access_sales_project: {
        Args: { _project_id: string }
        Returns: boolean
      }
      cleanup_charge_point_uptime_snapshots: { Args: never; Returns: number }
      cleanup_cron_job_history: { Args: never; Returns: number }
      cleanup_expired_backups: { Args: never; Returns: number }
      cleanup_old_audit_logs: { Args: never; Returns: number }
      cleanup_old_infra_metrics: { Args: never; Returns: number }
      cleanup_old_node_metrics: { Args: never; Returns: number }
      cleanup_old_ocpp_logs: { Args: never; Returns: number }
      cleanup_pg_net_responses: { Args: never; Returns: number }
      collect_db_metrics: { Args: never; Returns: Json }
      community_data_quality: {
        Args: { p_community_id: string }
        Returns: {
          active_run_at: string
          assets_total: number
          coverage_pct: number
          last_reading_at: string
          members_total: number
          members_with_recent_data: number
        }[]
      }
      community_marketplace_increment_view: {
        Args: { p_slug: string }
        Returns: undefined
      }
      community_marketplace_public_detail: {
        Args: { p_slug: string }
        Returns: {
          community_id: string
          contact_email: string
          created_at: string
          current_members: number
          feed_in_ct_kwh: number
          hero_image_url: string
          long_description: string
          max_members: number
          price_ct_kwh: number
          region_city: string
          region_plz: string
          short_description: string
          slug: string
          title: string
          total_capacity_kw: number
        }[]
      }
      community_marketplace_public_listings: {
        Args: { p_plz?: string }
        Returns: {
          created_at: string
          current_members: number
          feed_in_ct_kwh: number
          hero_image_url: string
          max_members: number
          price_ct_kwh: number
          region_city: string
          region_plz: string
          short_description: string
          slug: string
          title: string
          total_capacity_kw: number
        }[]
      }
      compact_power_readings_day: {
        Args: { p_day?: string }
        Returns: {
          compacted_buckets: number
          deleted_raw: number
        }[]
      }
      compute_daily_totals_from_5min: {
        Args: { p_day?: string }
        Returns: number
      }
      ensure_at_least_one_admin: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_auth_user_email: { Args: never; Returns: string }
      get_charge_point_uptime_pct: {
        Args: { p_charge_point_id: string; p_days?: number }
        Returns: number
      }
      get_location_main_meter: {
        Args: { p_location_id: string }
        Returns: string
      }
      get_meter_daily_totals: {
        Args: { p_from_date: string; p_meter_ids: string[]; p_to_date: string }
        Returns: {
          day: string
          meter_id: string
          total_value: number
        }[]
      }
      get_meter_daily_totals_split: {
        Args: { p_from_date: string; p_meter_ids: string[]; p_to_date: string }
        Returns: {
          bezug: number
          day: string
          einspeisung: number
          meter_id: string
        }[]
      }
      get_meter_daily_totals_split_with_fallback: {
        Args: { p_from_date: string; p_meter_ids: string[]; p_to_date: string }
        Returns: {
          bezug: number
          day: string
          einspeisung: number
          meter_id: string
        }[]
      }
      get_meter_daily_totals_with_fallback: {
        Args: { p_from_date: string; p_meter_ids: string[]; p_to_date: string }
        Returns: {
          day: string
          meter_id: string
          total_value: number
        }[]
      }
      get_meter_period_sums: {
        Args: { p_from_date: string; p_meter_ids: string[]; p_to_date: string }
        Returns: {
          meter_id: string
          total_value: number
        }[]
      }
      get_meter_period_sums_with_fallback: {
        Args: { p_from_date: string; p_meter_ids: string[]; p_to_date: string }
        Returns: {
          meter_id: string
          total_value: number
        }[]
      }
      get_partner_branding_for_tenant: {
        Args: { _tenant_id: string }
        Returns: Json
      }
      get_power_readings_5min: {
        Args: { p_end: string; p_meter_ids: string[]; p_start: string }
        Returns: {
          bucket: string
          meter_id: string
          power_avg: number
        }[]
      }
      get_pv_actual_daily_sums: {
        Args: { p_from_date: string; p_location_id: string; p_to_date: string }
        Returns: {
          actual_kwh: number
          day: string
        }[]
      }
      get_pv_actual_daily_sums_all: {
        Args: { p_from_date: string; p_tenant_id: string; p_to_date: string }
        Returns: {
          actual_kwh: number
          day: string
        }[]
      }
      get_pv_actual_hourly: {
        Args: { p_from: string; p_location_id: string; p_to: string }
        Returns: {
          actual_kwh: number
          coverage_minutes: number
          hour_start: string
          source: string
        }[]
      }
      get_pv_actual_hourly_all: {
        Args: { p_from: string; p_tenant_id: string; p_to: string }
        Returns: {
          actual_kwh: number
          coverage_minutes: number
          hour_start: string
          source: string
        }[]
      }
      get_pv_forecast_daily_compare: {
        Args: { p_from_date: string; p_location_id: string; p_to_date: string }
        Returns: {
          ai_adjusted_kwh: number
          corrected_ai_adjusted_kwh: number
          corrected_estimated_kwh: number
          day: string
          estimated_kwh: number
          legacy_ai_adjusted_kwh: number
          legacy_estimated_kwh: number
        }[]
      }
      get_pv_forecast_daily_compare_all: {
        Args: { p_from_date: string; p_tenant_id: string; p_to_date: string }
        Returns: {
          ai_adjusted_kwh: number
          corrected_ai_adjusted_kwh: number
          corrected_estimated_kwh: number
          day: string
          estimated_kwh: number
          legacy_ai_adjusted_kwh: number
          legacy_estimated_kwh: number
        }[]
      }
      get_pv_forecast_daily_sums: {
        Args: { p_from_date: string; p_location_id: string; p_to_date: string }
        Returns: {
          ai_adjusted_kwh: number
          day: string
          estimated_kwh: number
        }[]
      }
      get_pv_forecast_daily_sums_all: {
        Args: { p_from_date: string; p_tenant_id: string; p_to_date: string }
        Returns: {
          ai_adjusted_kwh: number
          day: string
          estimated_kwh: number
        }[]
      }
      get_tenant_status: { Args: { _tenant_id: string }; Returns: string }
      get_user_email: { Args: never; Returns: string }
      get_user_partner_id: { Args: never; Returns: string }
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
      is_partner_admin: { Args: { _user_id: string }; Returns: boolean }
      is_partner_member: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      is_support_user: { Args: { _user_id: string }; Returns: boolean }
      next_charging_invoice_number: {
        Args: { p_tenant_id: string; p_year: number }
        Returns: string
      }
      normalize_rfid_tag: {
        Args: { _mode: string; _raw: string }
        Returns: string
      }
      partner_has_tenant_access: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      partner_member_can: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      partner_reporting_growth: {
        Args: { _partner_id: string }
        Returns: {
          month_start: string
          mrr_eur: number
          tenants_total: number
        }[]
      }
      partner_reporting_modules: {
        Args: { _partner_id: string }
        Returns: {
          module_code: string
          tenants_count: number
        }[]
      }
      partner_reporting_overview: {
        Args: { _partner_id: string }
        Returns: Json
      }
      release_gateway_refresh_lock: {
        Args: { p_integration_id: string; p_owner: string }
        Returns: undefined
      }
      resolve_partner_branding_by_host: {
        Args: { _host: string }
        Returns: Json
      }
      snapshot_charge_point_uptime: { Args: never; Returns: number }
      try_acquire_gateway_refresh_lock: {
        Args: {
          p_integration_id: string
          p_owner: string
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "super_admin"
        | "sales_partner"
        | "community_member"
        | "partner_admin"
        | "partner_user"
      device_class:
        | "meter"
        | "gateway"
        | "power_supply"
        | "network_switch"
        | "router"
        | "addon_module"
        | "cable"
        | "accessory"
        | "misc"
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
        | "gewerbe"
        | "privat"
      partner_member_role: "partner_admin" | "partner_user"
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
      app_role: [
        "admin",
        "user",
        "super_admin",
        "sales_partner",
        "community_member",
        "partner_admin",
        "partner_user",
      ],
      device_class: [
        "meter",
        "gateway",
        "power_supply",
        "network_switch",
        "router",
        "addon_module",
        "cable",
        "accessory",
        "misc",
      ],
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
        "gewerbe",
        "privat",
      ],
      partner_member_role: ["partner_admin", "partner_user"],
    },
  },
} as const
