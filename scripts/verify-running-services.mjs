const baseUrl = process.env.API_URL ?? 'http://localhost:4000/api/v1';

async function verify(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'x-correlation-id': crypto.randomUUID() },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const health = await verify('/health');
const readiness = await verify('/ready');

console.log(
  JSON.stringify(
    {
      health: health.data,
      readiness: readiness.data,
    },
    null,
    2,
  ),
);
