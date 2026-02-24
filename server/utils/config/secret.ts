// server/utils/config/secret.ts
import { serverSupabaseServiceRole } from '#supabase/server';
import { H3Event } from "h3";

let secretCache = new Map<string, any>();
let secretCacheTime = 0;
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000;

let configCache = new Map<string, any>();
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 60 * 1000;

export async function refreshServerSecrets() {
    console.log(`🔄 Refreshing server secrets`);
    secretCache = new Map<string, any>();
}

export async function getKey(event: H3Event, key: string) {
    const now = Date.now();

    if (secretCache.has(key) && now - secretCacheTime < SECRET_CACHE_TTL_MS) {
        return secretCache.get(key);
    }

    const supabase = serverSupabaseServiceRole(event);

    const { data, error } = await supabase.rpc('get_secret', {
        secret_name: key
    })

    if (error) throw new Error(`Key error: ${error.message}`);

    secretCache.set(key, data);
    secretCacheTime = now;

    return data;
}

export async function refreshServerConfig() {
    console.log(`🔄 Refreshing server config`);
    configCache = new Map<string, any>();
}

export async function getServerConfig(event: H3Event, key: string) {
    const now = Date.now();

    if (configCache.has(key) && now - configCacheTime < CONFIG_CACHE_TTL_MS) {
        return configCache.get(key);
    }

    const supabase = serverSupabaseServiceRole(event);

    const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', key)
        .single();

    if (error) throw new Error(`Config read error: ${error.message}`);

    configCache.set(key, data.value);
    configCacheTime = now;

    return data.value;
}

/**
 * Fetch multiple config keys at once and return as a Record<string, unknown>.
 * The system_config.value column is jsonb, so values may be numbers, strings,
 * or objects. Callers should coerce with Number() / String() as appropriate.
 * Keys not found in the DB are omitted (no throw). Use this when you need
 * several config values and want to fall back to defaults for missing ones.
 */
export async function getServerConfigMap(event: H3Event, keys: string[]): Promise<Record<string, unknown>> {
    const now = Date.now();
    const result: Record<string, unknown> = {};
    const missing: string[] = [];

    for (const key of keys) {
        if (configCache.has(key) && now - configCacheTime < CONFIG_CACHE_TTL_MS) {
            result[key] = configCache.get(key);
        } else {
            missing.push(key);
        }
    }

    if (missing.length === 0) return result;

    const supabase = serverSupabaseServiceRole(event);

    const { data, error } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', missing);

    if (error) throw new Error(`Config read error: ${error.message}`);

    for (const row of data ?? []) {
        result[row.key] = row.value;
        configCache.set(row.key, row.value);
    }
    configCacheTime = now;

    return result;
}
