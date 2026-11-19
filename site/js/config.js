// Edit these values to customise the hub.
export const CONFIG = {
  version: '12',
  siteName: 'Orbit Network Hub',
  serverIp: 'Orbitnetwork.net',
  javaPort: 25565,
  bedrockPort: 19132,
  // Paste your Discord invite here, e.g. 'https://discord.gg/abc123'. Leave empty to hide the link.
  discordUrl: 'https://discord.gg/wNrfteNG5',
  // Live status from this site's own server (it pings the Minecraft server on the same VPS);
  // the public service below is only used if that isn't available.
  localStatusApi: '/api/mc/status',
  statusApi: 'https://api.mcsrvstat.us/3/',
  statusRefreshMs: 30000,
};
