/**
 * health-check.js — Root health check CLI script.
 */

const port = process.env.PORT || 5000;
const url = `http://localhost:${port}/api/health`;

console.log(`Checking NovaCart API health at ${url}...`);

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  const data = await res.json();
  console.log('\nSystem Health Summary:');
  console.log(JSON.stringify(data, null, 2));

  if (res.ok && data.success) {
    console.log('\nAll core services are operational!');
    process.exit(0);
  } else {
    console.log('\nWarning: Some services reported degraded state.');
    process.exit(1);
  }
} catch (err) {
  console.error('\nFailed to connect to NovaCart server:', err.message);
  console.log('Tip: Ensure the server is running with: npm run dev:server');
  process.exit(1);
}
