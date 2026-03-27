import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to active narrative_config rows for a pool (plus global rows).
 * Provides helpers to upsert and deactivate config entries.
 *
 * Shape: [{ id, pool_id, config_type, config_key, config_value, active, created_at, updated_at }]
 */
export function useNarrativeConfig(poolId) {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchConfigs = useCallback(async () => {
    if (!poolId) return
    const { data } = await supabase
      .from('narrative_config')
      .select('*')
      .eq('active', true)
      .or(`pool_id.eq.${poolId},pool_id.is.null`)
      .order('created_at', { ascending: false })
    setConfigs(data ?? [])
    setLoading(false)
  }, [poolId])

  useEffect(() => {
    if (!poolId) return
    fetchConfigs()

    const channel = supabase
      .channel(`public:narrative_config:${poolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'narrative_config' },
        () => fetchConfigs()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId, fetchConfigs])

  /**
   * Upsert a config entry. Deactivates any existing active row with the same
   * type + key first, then inserts the new one.
   */
  const upsertConfig = useCallback(async (configType, configKey, configValue, targetPoolId) => {
    const pid = targetPoolId ?? poolId

    // Deactivate any existing active row for this type+key+pool
    const existing = configs.filter(
      (c) => c.config_type === configType && c.config_key === configKey &&
             (c.pool_id === pid || (!c.pool_id && !pid))
    )
    for (const c of existing) {
      await supabase
        .from('narrative_config')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', c.id)
    }

    // Insert new row
    const row = {
      config_type:  configType,
      config_key:   configKey,
      config_value: configValue,
      active:       true,
    }
    if (pid) row.pool_id = pid

    const { error } = await supabase.from('narrative_config').insert(row)
    if (!error) fetchConfigs()
    return { error }
  }, [configs, poolId, fetchConfigs])

  const deactivateConfig = useCallback(async (id) => {
    const { error } = await supabase
      .from('narrative_config')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) fetchConfigs()
    return { error }
  }, [fetchConfigs])

  /** Get the config_value for a specific type+key, or null if not found */
  const getConfig = useCallback((configType, configKey) => {
    const c = configs.find(
      (c) => c.config_type === configType && c.config_key === configKey
    )
    return c ? c.config_value : null
  }, [configs])

  return { configs, loading, upsertConfig, deactivateConfig, getConfig }
}
