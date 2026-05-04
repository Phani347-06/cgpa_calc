export default function handler(request, response) {
  // Set security headers to prevent caching
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  
  response.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'jntuh-cgpa-calculator-api',
    version: '1.0.0',
    message: 'API is healthy and reachable'
  });
}
