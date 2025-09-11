import { rateLimit } from '@vercel/rate-limit';

export const configureRateLimit = (maxRequests = 10, windowSeconds = 10) => {
  return rateLimit({
    window: `${windowSeconds}s`,
    max: maxRequests,
    message: JSON.stringify({ 
      error: 'För många förfrågningar. Var vänlig vänta.' 
    })
  });
};

// Specifika inställningar per endpoint
export const pdfRateLimit = configureRateLimit(10, 10);
export const actionRateLimit = configureRateLimit(5, 60);
