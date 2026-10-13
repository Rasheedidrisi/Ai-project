export function getCloudConfig() {
  const configuredMode = (process.env.NOTEFORGE_CLOUD_MODE || process.env.CLOUD_MODE || 'local').toLowerCase();
  const explicitCloud = ['cloud', 'enabled', 'true', '1'].includes(configuredMode);
  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL,
  ) && Boolean(
    process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY,
  );
  const envDriven = supabaseConfigured;
  const enabled = explicitCloud || envDriven;

  return {
    enabled,
    mode: enabled ? 'cloud' : 'local',
    provider: supabaseConfigured ? 'supabase' : 'local',
    projectId: supabaseConfigured ? 'configured' : 'not-configured',
    queueName: 'in-memory local job store',
    workerEnabled: false,
    authEnabled: supabaseConfigured,
    storage: {
      privateByDefault: true,
      enabled: false,
      note: 'Document uploads are processed locally; cloud document storage is not configured.',
    },
  };
}

export function isCloudEnabled() {
  return getCloudConfig().enabled;
}
